#!/usr/bin/env node
// TestRail API v2 client cho app-qa. Đọc thoải mái; mọi lệnh GHI chỉ chạy khi có --apply (mặc định in kế hoạch).
// Env: TESTRAIL_URL, TESTRAIL_USER, TESTRAIL_KEY, project id = qa-config.json testrail.projectId (env TESTRAIL_PROJECT_ID chỉ là dự phòng)
//
//   node testrail.mjs ping | statuses | priorities | fields | suites | sections [--suite S]
//   node testrail.mjs cases [--suite S] [--section ID] [--grep TC-FAC]
//   node testrail.mjs runs [--open]           | tests --run R [--status Failed]
//   node testrail.mjs find --run R --tc TC-FAC-001          → test id của TC trong run
//   node testrail.mjs import-csv --file X.csv --section ID [--suite S] [--update] [--apply]
//   node testrail.mjs add-run --name "..." [--suite S] (--section ID | --cases 1,2 | --csv X.csv) [--apply]
//   node testrail.mjs result --run R --tc TC-ID|--test T --status PASS|FAIL|BLOCKED|NA [--comment ".."] [--file a.png ...] [--defects K-1] [--apply]
//   node testrail.mjs results --run R --from <run>/results.json [--only FAIL,PASS] [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, list, loadConfig, env, cfgVal, die, redact, parseCsv, readJson } from './lib.mjs';

const args = parseArgs();
const cmd = args._[0];
let cfg = {};
try { cfg = loadConfig(); } catch { /* chạy được không cần config nếu có env */ }
const tr = cfg.testrail || {};
const BASE = (env(tr.urlEnv || 'TESTRAIL_URL') || tr.url || '').replace(/\/$/, '');
const USER = env(tr.userEnv || 'TESTRAIL_USER');
const KEY = env(tr.keyEnv || 'TESTRAIL_KEY');
const PID = Number(args.project || cfgVal(tr.projectId) || env(tr.projectIdEnv || 'TESTRAIL_PROJECT_ID'));
const APPLY = !!args.apply;
if (!BASE || !USER || !KEY) die('Thiếu TESTRAIL_URL / TESTRAIL_USER / TESTRAIL_KEY (xem qa-config.json envFiles hoặc .env.local)');

const auth = 'Basic ' + Buffer.from(`${USER}:${KEY}`).toString('base64');
export async function api(method, endpoint, body) {
  const url = `${BASE}/index.php?/api/v2/${endpoint}`;
  const init = { method, headers: { Authorization: auth }, signal: AbortSignal.timeout(60000) };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(url, init);
  const t = await r.text();
  if (!r.ok) throw new Error(redact(`TestRail ${method} ${endpoint} → ${r.status}: ${t.slice(0, 400)}`));
  return t ? JSON.parse(t) : {};
}
/** Paginated GET (TestRail 6.7+ trả {offset,limit,size,_links,<key>}; bản cũ trả mảng). */
async function getAll(endpoint, key) {
  const out = [];
  for (let offset = 0; ; ) {
    const r = await api('GET', `${endpoint}&limit=250&offset=${offset}`);
    const items = Array.isArray(r) ? r : r[key] || [];
    out.push(...items);
    if (Array.isArray(r) || !r._links?.next || !items.length) break;
    offset += items.length;
  }
  return out;
}
const suiteQ = (s) => (s ? `&suite_id=${s}` : '');
const table = (rows, cols) => { for (const r of rows) console.log(cols.map((c) => String(typeof c === 'function' ? c(r) : r[c] ?? '')).join('\t')); };

/** Lấy TC ID (vd TC-FAC-001, COMMON-01) từ đầu title ("TC-FAC-001 — ..."). refs thường chứa mã requirement (YC-2…), không dùng. */
export const tcIdOf = (c) => {
  const m = String(c.title || '').match(/^\s*\[?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[a-z]?)\]?/);
  return m ? m[1] : '';
};

/** Map trạng thái logic → status_id. Mặc định TestRail: 1 Passed, 2 Blocked, 4 Retest, 5 Failed; NA = custom (テスト不要・不可能). */
async function statusId(s) {
  const map = { PASS: 1, FAIL: 5, BLOCKED: 2, RETEST: 4, ...(tr.statusIds || {}) };
  const k = String(s).toUpperCase();
  if (map[k]) return map[k];
  const all = await api('GET', 'get_statuses');
  const hit = all.find((x) => x.label === s || x.name === s || (k === 'NA' && /不要|不可能|n\/?a/i.test(x.label)));
  if (!hit) die(`Không map được status "${s}" — thêm testrail.statusIds.${k} vào qa-config.json (xem: testrail.mjs statuses)`);
  return hit.id;
}

async function testOf(run, tc) {
  const tests = await getAll(`get_tests/${run}`, 'tests');
  const hits = tests.filter((t) => tcIdOf(t) === tc);
  if (hits.length !== 1) die(`Run ${run}: tìm thấy ${hits.length} test cho ${tc}${hits.length ? ' — ' + hits.map((h) => 'T' + h.id).join(',') : ''}`);
  return hits[0];
}

async function postResult(test, status, comment, files, defects) {
  const body = { status_id: await statusId(status), comment: comment || '' };
  if (defects) body.defects = defects;
  if (!APPLY) { console.log(`[dry-run] T${test.id} ${tcIdOf(test)} → ${status}${files.length ? ' + ' + files.map((f) => path.basename(f)).join(', ') : ''}`); return; }
  const r = await api('POST', `add_result/${test.id}`, body);
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log(`  ! không có file ${f} — [ẢNH CẦN ĐÍNH KÈM THỦ CÔNG: ${path.basename(f)}]`); continue; }
    const fd = new FormData();
    fd.append('attachment', new Blob([fs.readFileSync(f)]), path.basename(f));
    try { await api('POST', `add_attachment_to_result/${r.id}`, fd); }
    catch (e) { console.log(`  ! upload ${path.basename(f)} lỗi: ${e.message} — [ẢNH CẦN ĐÍNH KÈM THỦ CÔNG: ${path.basename(f)}]`); }
  }
  console.log(`✓ T${test.id} ${tcIdOf(test)} → ${status} (result ${r.id})`);
}

// ---------- CSV → case fields ----------
const DEFAULT_FIELDS = {
  title: '{Test Case ID} — {Test Case Name}',
  custom_preconds: '{Pre-Condition}',
  custom_steps: '{Steps}',
  custom_expected: '{Expected Result}',
};
const PRIO = { P1: 4, P2: 3, P3: 2, P4: 1, ...(tr.priorityIds || {}) }; // TestRail mặc định: 4 Critical, 3 High, 2 Medium, 1 Low
function caseBody(row) {
  const fields = { ...DEFAULT_FIELDS, ...(tr.caseFields || {}) };
  const body = {};
  for (const [k, tpl] of Object.entries(fields)) if (tpl) body[k] = String(tpl).replace(/\{([^}]+)\}/g, (_, c) => row[c] ?? '').trim();
  if (row.Priority && PRIO[row.Priority]) body.priority_id = PRIO[row.Priority];
  if (body.title?.length > 250) body.title = body.title.slice(0, 247) + '...';
  return body;
}

const main = {
  async ping() {
    const p = await api('GET', `get_project/${PID}`);
    console.log(`OK TestRail project ${p.id}: ${p.name} (suite_mode ${p.suite_mode})`);
  },
  async statuses() { table(await api('GET', 'get_statuses'), ['id', 'name', 'label']); },
  async priorities() { table(await api('GET', 'get_priorities'), ['id', 'short_name', 'name']); },
  async fields() { table(await api('GET', 'get_case_fields'), ['system_name', 'label', (f) => ['', 'String', 'Integer', 'Text', 'URL', 'Checkbox', 'Dropdown', 'User', 'Date', 'Milestone', 'Steps', 'StepResults', 'Multi-select'][f.type_id] || f.type_id]); },
  async suites() { const r = await api('GET', `get_suites/${PID}`); table(Array.isArray(r) ? r : r.suites || [r], ['id', 'name']); },
  async sections() { table(await getAll(`get_sections/${PID}${suiteQ(args.suite)}`, 'sections'), ['id', 'parent_id', 'depth', 'name']); },
  async cases() {
    let cs = await getAll(`get_cases/${PID}${suiteQ(args.suite)}${args.section ? `&section_id=${args.section}` : ''}`, 'cases');
    if (args.grep) cs = cs.filter((c) => (c.title + ' ' + (c.refs || '')).includes(args.grep));
    table(cs, [(c) => 'C' + c.id, (c) => c.section_id, tcIdOf, 'title']);
    console.log(`# ${cs.length} case`);
  },
  async runs() {
    let rs = await getAll(`get_runs/${PID}${args.open ? '&is_completed=0' : ''}`, 'runs');
    table(rs, [(r) => 'R' + r.id, 'name', (r) => `P${r.passed_count}/F${r.failed_count}/B${r.blocked_count}/U${r.untested_count}`, (r) => (r.is_completed ? 'done' : 'open')]);
  },
  async tests() {
    if (!args.run) die('--run R');
    const st = Object.fromEntries((await api('GET', 'get_statuses')).map((s) => [s.id, s.label]));
    let ts = await getAll(`get_tests/${String(args.run).replace(/^R/, '')}`, 'tests');
    if (args.status) ts = ts.filter((t) => st[t.status_id] === args.status);
    table(ts, [(t) => 'T' + t.id, (t) => 'C' + t.case_id, tcIdOf, (t) => st[t.status_id], 'title']);
    console.log(`# ${ts.length} test`);
  },
  async find() {
    const t = await testOf(String(args.run).replace(/^R/, ''), args.tc);
    console.log(`T${t.id}\tC${t.case_id}\t${t.title}\t${BASE}/index.php?/tests/view/${t.id}`);
  },
  async 'import-csv'() {
    if (!args.file || !args.section) die('--file X.csv --section ID');
    const { rows } = parseCsv(fs.readFileSync(args.file, 'utf8'));
    const existing = await getAll(`get_cases/${PID}${suiteQ(args.suite)}&section_id=${args.section}`, 'cases');
    const byTc = new Map(existing.map((c) => [tcIdOf(c), c]));
    let add = 0, upd = 0, skip = 0;
    for (const row of rows) {
      const tc = row['Test Case ID'];
      if (!tc) continue;
      const body = caseBody(row);
      const ex = byTc.get(tc);
      if (ex && !args.update) { skip++; console.log(`= C${ex.id} ${tc} đã có — bỏ qua (dùng --update để ghi đè)`); continue; }
      if (!APPLY) { console.log(`[dry-run] ${ex ? 'update C' + ex.id : 'add'} ${tc} ${body.title}`); ex ? upd++ : add++; continue; }
      const r = ex ? await api('POST', `update_case/${ex.id}`, body) : await api('POST', `add_case/${args.section}`, body);
      console.log(`${ex ? '~' : '+'} C${r.id} ${tc}`); ex ? upd++ : add++;
    }
    console.log(`# ${APPLY ? '' : '[dry-run] '}thêm ${add}, cập nhật ${upd}, bỏ qua ${skip}`);
  },
  async 'add-run'() {
    if (!args.name) die('--name "Test Run_..."');
    let caseIds = list(args.cases).map((x) => Number(String(x).replace(/^C/, '')));
    if (args.csv) {
      const tcs = new Set(parseCsv(fs.readFileSync(args.csv, 'utf8')).rows.map((r) => r['Test Case ID']));
      const cs = await getAll(`get_cases/${PID}${suiteQ(args.suite)}${args.section ? `&section_id=${args.section}` : ''}`, 'cases');
      caseIds = cs.filter((c) => tcs.has(tcIdOf(c))).map((c) => c.id);
    } else if (args.section && !caseIds.length) {
      caseIds = (await getAll(`get_cases/${PID}${suiteQ(args.suite)}&section_id=${args.section}`, 'cases')).map((c) => c.id);
    }
    if (!caseIds.length) die('Không có case nào cho run');
    const body = { name: args.name, include_all: false, case_ids: caseIds, ...(args.suite ? { suite_id: Number(args.suite) } : {}), ...(args.description ? { description: args.description } : {}) };
    if (!APPLY) return console.log(`[dry-run] add_run "${args.name}" với ${caseIds.length} case`);
    const r = await api('POST', `add_run/${PID}`, body);
    console.log(`+ R${r.id} ${r.name} — ${r.url}`);
  },
  async result() {
    if (!args.run || !args.status || !(args.tc || args.test)) die('--run R --tc TC-ID|--test T --status PASS|FAIL|BLOCKED|NA');
    const test = args.test ? await api('GET', `get_test/${String(args.test).replace(/^T/, '')}`) : await testOf(String(args.run).replace(/^R/, ''), args.tc);
    await postResult(test, args.status, args.comment, list(args.file), args.defects);
  },
  async results() {
    if (!args.run || !args.from) die('--run R --from <run>/results.json');
    const res = readJson(args.from);
    const only = new Set(list(args.only).map((s) => s.toUpperCase()));
    const runId = String(args.run).replace(/^R/, '');
    const tests = await getAll(`get_tests/${runId}`, 'tests');
    const byTc = new Map(tests.map((t) => [tcIdOf(t), t]));
    const dir = path.dirname(args.from);
    for (const r of res.results || res) {
      if (!['PASS', 'FAIL', 'BLOCKED', 'NA'].includes(r.status)) { console.log(`- ${r.id}: ${r.status} — không ghi TestRail (cần kiểm tay)`); continue; }
      if (only.size && !only.has(r.status)) continue;
      const t = byTc.get(r.id);
      if (!t) { console.log(`! ${r.id}: không có trong run R${runId}`); continue; }
      const comment = [r.actual && `Thực tế: ${r.actual}`, r.note && `Ghi chú: ${r.note}`, r.evidence && `Evidence: ${r.evidence}`].filter(Boolean).join('\n');
      await postResult(t, r.status, comment, r.evidence ? [path.join(dir, 'evidence', r.evidence)] : [], r.defects);
    }
  },
};

if (!main[cmd]) die(`Lệnh: ${Object.keys(main).join(' | ')}`);
main[cmd]().catch((e) => die(e.stack || e.message));
