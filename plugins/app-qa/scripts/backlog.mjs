#!/usr/bin/env node
// Backlog API v2 client cho app-qa. Đọc thoải mái; mọi lệnh GHI chỉ chạy khi có --apply (mặc định in kế hoạch).
// Env: BACKLOG_URL (https://<space>.backlog.com), BACKLOG_API_KEY, project key = qa-config.json backlog.projectKey (env BACKLOG_PROJECT_KEY chỉ là dự phòng)
//
//   node backlog.mjs ping | meta                         → project, format mô tả, issue type, priority, status, category, milestone, user
//   node backlog.mjs issues [--keyword ".."] [--status "Open,In Progress"] [--assignee "Tên"|me] [--type Bug] [--parent 66] [--all]
//   node backlog.mjs issue ENTORI_PJ-12 [--comments]
//   node backlog.mjs download ENTORI_PJ-12 --out dir     → tải ảnh đính kèm của issue
//   node backlog.mjs create --from <drafts.json> [--only N01,N02] [--apply]
//   node backlog.mjs comment ENTORI_PJ-12 --body-file c.md [--file a.png ...] [--apply]
//   node backlog.mjs update ENTORI_PJ-12 [--status Closed] [--assignee "Tên"] [--summary ".."] [--body-file c.md] [--file a.png] [--apply]
//
// drafts.json: [{ "ref":"N01", "action":"new"|"comment", "issueKey"?: "ENTORI_PJ-9", "summary", "description" (Markdown;
//   chèn ảnh bằng {{img:TC-FAC-001_FAIL.png}}), "issueType":"Bug", "priority":"Normal", "assignee":"FE"|"BE"|"<tên>",
//   "parent": 66 | "ENTORI_PJ-66", "category":[..], "milestone":[..], "attachments":["evidence/x.png"],
//   "marks": ["bug/TC-FAC-001.mark.json"] }]   ← ảnh bằng chứng (annotate.mjs --spec). Script tự vẽ với mã bug thật
//   (header.bug trống / "{{key}}" / = ref → mã issue) và ĐÍNH KÈM vào đúng issue/comment, không cần bước duyệt ảnh riêng.
//   Mô tả chèn ảnh bằng {{img:<tên file out của mark>}}. Dry-run: vẽ bản xem trước với mã = ref (Nxx).
// Sau khi tạo, script ghi lại issueKey/url/result/marked vào drafts.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, list, loadConfig, env, cfgVal, die, redact, readJson, writeJson } from './lib.mjs';

const args = parseArgs();
const cmd = args._[0];
let cfg = {};
try { cfg = loadConfig(); } catch { /* env-only */ }
const bl = cfg.backlog || {};
// BACKLOG_URL có thể là link project (https://x.backlog.com/projects/KEY) — chỉ lấy origin.
const RAW = env(bl.urlEnv || 'BACKLOG_URL') || bl.url || '';
const BASE = RAW ? new URL(RAW).origin : '';
const KEY = env(bl.apiKeyEnv || 'BACKLOG_API_KEY');
const PKEY = args.project || cfgVal(bl.projectKey) || env(bl.projectKeyEnv || 'BACKLOG_PROJECT_KEY');
const APPLY = !!args.apply;
if (!BASE || !KEY || !PKEY) die('Thiếu BACKLOG_URL / BACKLOG_API_KEY / BACKLOG_PROJECT_KEY');

async function api(method, p, params) {
  const u = new URL(`${BASE}/api/v2${p}`);
  u.searchParams.set('apiKey', KEY);
  const init = { method, signal: AbortSignal.timeout(60000) };
  if (method === 'GET' && params) for (const [k, v] of Object.entries(params)) [].concat(v).forEach((x) => x !== undefined && u.searchParams.append(k, x));
  else if (params instanceof FormData) init.body = params;
  else if (params) {
    const b = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) [].concat(v).forEach((x) => x !== undefined && x !== null && b.append(k, x));
    init.body = b;
  }
  const r = await fetch(u, init);
  if (cmd === 'download' && r.ok && method === 'GET' && p.includes('/attachments/')) return Buffer.from(await r.arrayBuffer());
  const t = await r.text();
  if (!r.ok) throw new Error(redact(`Backlog ${method} ${p} → ${r.status}: ${t.slice(0, 400)}`));
  return t ? JSON.parse(t) : {};
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_\-・]/g, '');
let _meta;
async function meta() {
  if (_meta) return _meta;
  const project = await api('GET', `/projects/${PKEY}`);
  const [issueTypes, priorities, statuses, categories, versions, users] = await Promise.all([
    api('GET', `/projects/${PKEY}/issueTypes`), api('GET', '/priorities'), api('GET', `/projects/${PKEY}/statuses`),
    api('GET', `/projects/${PKEY}/categories`), api('GET', `/projects/${PKEY}/versions`), api('GET', `/projects/${PKEY}/users`),
  ]);
  return (_meta = { project, issueTypes, priorities, statuses, categories, versions, users });
}
function pick(arr, q, what, keys = ['name']) {
  if (q === undefined || q === null || q === '') return undefined;
  if (typeof q === 'number' || /^\d+$/.test(q)) { const byId = arr.find((x) => x.id === Number(q)); if (byId) return byId; }
  const n = norm(q);
  const hits = arr.filter((x) => keys.some((k) => norm(x[k]) === n));
  if (hits.length === 1) return hits[0];
  const part = arr.filter((x) => keys.some((k) => norm(x[k]).includes(n)));
  if (part.length === 1) return part[0];
  die(`Không xác định được ${what} "${q}" (${hits.length || part.length} kết quả). Có: ${arr.map((x) => x[keys[0]]).join(', ')}`);
}
async function user(q) {
  if (!q) return undefined;
  if (q === 'me') return api('GET', '/users/myself');
  const alias = bl.assignees?.[q];
  return pick((await meta()).users, alias || q, 'người dùng', ['name', 'userId', 'mailAddress']);
}
async function issueId(q) {
  if (!q) return undefined;
  const key = /^\d+$/.test(String(q)) ? `${PKEY}-${q}` : String(q);
  return (await api('GET', `/issues/${key}`)).id;
}
/** {{img:file.png}} → cú pháp ảnh đính kèm theo format của project. */
async function renderBody(md) {
  const fmt = (await meta()).project.textFormattingRule; // "markdown" | "backlog"
  return String(md || '').replace(/\{\{img:([^}]+)\}\}/g, (_, f) => (fmt === 'markdown' ? `![${f}][${f}]` : `#image(${f})`));
}
async function upload(files) {
  const ids = [], missing = [];
  for (const f of files) {
    if (!fs.existsSync(f)) { missing.push(path.basename(f)); continue; }
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(f)]), path.basename(f));
    try { ids.push((await api('POST', '/space/attachment', fd)).id); }
    catch (e) { console.log(`  ! upload ${path.basename(f)} lỗi: ${e.message}`); missing.push(path.basename(f)); }
  }
  return { ids, missing };
}
// Vẽ ảnh bằng chứng từ mark spec, thay mã bug vào dòng tiêu đề 1. Trả về danh sách file ảnh đã vẽ (+ lỗi).
const ANNOTATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'annotate.mjs');
function renderMarks(specs, key, ref) {
  const out = [], failed = [];
  for (const sp of specs) {
    if (!fs.existsSync(sp)) { failed.push(`${path.basename(sp)} (không thấy spec)`); continue; }
    const s = readJson(sp);
    const fill = (v) => (!v || v === ref || /\{\{key\}\}/.test(v) ? String(v || '{{key}}').replace(ref, key).replace(/\{\{key\}\}/g, key) : v);
    if (Array.isArray(s.header)) s.header[0] = fill(s.header[0]); else s.header = { ...(s.header || {}), bug: fill(s.header?.bug) };
    const dir = path.dirname(path.resolve(sp));
    const abs = (p) => (p && !path.isAbsolute(p) ? path.join(dir, p) : p);
    s.in = abs(s.in); if (s.out) s.out = abs(s.out);
    const tmp = path.join(dir, `.${path.basename(sp, '.json')}.${key}.json`);
    writeJson(tmp, s);
    const r = spawnSync(process.execPath, [ANNOTATE, '--spec', tmp], { encoding: 'utf8' });
    fs.rmSync(tmp, { force: true });
    const file = (r.stdout.match(/^\+ (.+\.png)\s*$/m) || [])[1];
    for (const l of (r.stdout + r.stderr).split(/\r?\n/)) if (/^(WARN|FAIL)/.test(l)) console.log(`  ${path.basename(sp)}: ${l}`);
    if (r.status === 0 && file) out.push(file.trim()); else failed.push(path.basename(sp));
  }
  return { out, failed };
}
const manualNote = (missing) => (missing.length ? `\n\n${missing.map((m) => `[ẢNH CẦN ĐÍNH KÈM THỦ CÔNG: ${m}]`).join('\n')}` : '');
const issueUrl = (k) => `${BASE}/view/${k}`;
const bodyFrom = (a) => (a['body-file'] ? fs.readFileSync(a['body-file'], 'utf8') : a.body || '');

const main = {
  async ping() {
    const [me, p] = await Promise.all([api('GET', '/users/myself'), api('GET', `/projects/${PKEY}`)]);
    console.log(`OK Backlog ${BASE} — user ${me.name} — project ${p.projectKey} (${p.name}), format mô tả: ${p.textFormattingRule}`);
  },
  async meta() {
    const m = await meta();
    console.log(`project ${m.project.id} ${m.project.projectKey} format=${m.project.textFormattingRule}`);
    for (const [k, arr, f] of [['issueTypes', m.issueTypes], ['priorities', m.priorities], ['statuses', m.statuses], ['categories', m.categories], ['milestones', m.versions], ['users', m.users, (u) => `${u.id}\t${u.name}\t${u.userId || ''}`]])
      console.log(`\n## ${k}\n` + arr.map(f || ((x) => `${x.id}\t${x.name}`)).join('\n'));
  },
  async issues() {
    const m = await meta();
    const q = { 'projectId[]': m.project.id, count: 100, order: 'desc', sort: 'updated' };
    if (args.keyword) q.keyword = args.keyword;
    const st = list(args.status);
    if (st.length) q['statusId[]'] = st.map((s) => pick(m.statuses, s, 'trạng thái').id);
    else if (!args.all) q['statusId[]'] = m.statuses.filter((s) => !/closed|完了/i.test(s.name)).map((s) => s.id);
    if (args.assignee) q['assigneeId[]'] = (await user(args.assignee)).id;
    if (args.type) q['issueTypeId[]'] = pick(m.issueTypes, args.type, 'loại issue').id;
    if (args.parent) q['parentIssueId[]'] = await issueId(args.parent);
    const out = [];
    for (let offset = 0; ; offset += 100) {
      const r = await api('GET', '/issues', { ...q, offset });
      out.push(...r);
      if (r.length < 100) break;
    }
    for (const i of out) console.log(`${i.issueKey}\t${i.status?.name}\t${i.assignee?.name || '-'}\t${i.issueType?.name}\t${i.summary}`);
    console.log(`# ${out.length} issue`);
  },
  async issue() {
    const k = args._[1] || die('issue <KEY>');
    const i = await api('GET', `/issues/${k}`);
    console.log(`${i.issueKey} [${i.status.name}] ${i.summary}\nLoại: ${i.issueType.name} · Ưu tiên: ${i.priority?.name} · Xử lý: ${i.assignee?.name || '-'} · Parent: ${i.parentIssueId || '-'}\nCập nhật: ${i.updated} · ${issueUrl(i.issueKey)}\nĐính kèm: ${(i.attachments || []).map((a) => `${a.id}:${a.name}`).join(', ') || '-'}\n\n${i.description}`);
    if (args.comments) {
      const cs = await api('GET', `/issues/${k}/comments`, { order: 'asc', count: 100 });
      for (const c of cs) {
        const ch = (c.changeLog || []).map((x) => `${x.field}: ${x.originalValue ?? ''} → ${x.newValue ?? ''}`).join('; ');
        if (c.content || ch) console.log(`\n--- #${c.id} ${c.createdUser?.name} ${c.created}${ch ? `\n[${ch}]` : ''}\n${c.content || ''}`);
      }
    }
  },
  async download() {
    const k = args._[1] || die('download <KEY> --out dir');
    const out = args.out || `evidence/${k}`;
    fs.mkdirSync(out, { recursive: true });
    const i = await api('GET', `/issues/${k}`);
    for (const a of i.attachments || []) {
      fs.writeFileSync(path.join(out, a.name), await api('GET', `/issues/${k}/attachments/${a.id}`));
      console.log(`+ ${path.join(out, a.name)}`);
    }
  },
  async create() {
    if (!args.from) die('--from drafts.json');
    const drafts = readJson(args.from);
    const only = new Set(list(args.only));
    const m = await meta();
    const dir = path.dirname(path.resolve(args.from));
    const resolveFile = (f) => (path.isAbsolute(f) || fs.existsSync(f) ? f : path.join(dir, f));
    for (const d of drafts) {
      if (only.size && !only.has(d.ref)) continue;
      if (d.issueKey && d.result) { console.log(`= ${d.ref} đã xử lý: ${d.issueKey}`); continue; }
      const files = (d.attachments || []).map(resolveFile);
      const specs = (d.marks || []).map(resolveFile);
      if (!APPLY && specs.length) {
        const pv = renderMarks(specs, d.issueKey || d.ref, d.ref);
        console.log(`  ${d.ref} ảnh bằng chứng (xem trước, mã ${d.issueKey || d.ref}): ${pv.out.map((f) => path.basename(f)).join(', ') || '-'}${pv.failed.length ? ` — LỖI: ${pv.failed.join(', ')}` : ''}`);
      }
      if (d.action === 'comment') {
        if (!d.issueKey) die(`${d.ref}: action comment cần issueKey`);
        if (!APPLY) { console.log(`[dry-run] ${d.ref} comment → ${d.issueKey} + ${files.length} ảnh + ${specs.length} ảnh bằng chứng`); continue; }
        const mk = renderMarks(specs, d.issueKey, d.ref);
        const { ids, missing } = await upload([...files, ...mk.out]);
        missing.push(...mk.failed);
        d.marked = mk.out.map((f) => path.basename(f));
        await api('POST', `/issues/${d.issueKey}/comments`, { content: (await renderBody(d.description)) + manualNote(missing), 'attachmentId[]': ids });
        Object.assign(d, { result: 'commented', url: issueUrl(d.issueKey), missing });
        console.log(`✓ ${d.ref} comment ${d.issueKey}`);
      } else {
        const type = pick(m.issueTypes, d.issueType || bl.defaults?.issueType || 'Bug', 'loại issue');
        const prio = pick(m.priorities, d.priority || bl.defaults?.priority || 'Normal', 'ưu tiên');
        const asg = await user(d.assignee);
        const parent = d.parent ?? bl.parentTasks?.[d.module];
        const cats = list(d.category).map((c) => pick(m.categories, c, 'category').id);
        const mss = list(d.milestone ?? bl.defaults?.milestone).map((c) => pick(m.versions, c, 'milestone').id);
        if (!APPLY) { console.log(`[dry-run] ${d.ref} new [${type.name}/${prio.name}] → ${asg?.name || '-'} parent=${parent ?? '-'} ảnh=${files.length} + ${specs.length} ảnh bằng chứng: ${d.summary}`); continue; }
        const { ids, missing } = await upload(files);
        const body = {
          projectId: m.project.id, summary: d.summary, issueTypeId: type.id, priorityId: prio.id,
          description: (await renderBody(d.description)) + manualNote(missing), 'attachmentId[]': ids,
          assigneeId: asg?.id, parentIssueId: parent ? await issueId(parent) : undefined, 'categoryId[]': cats, 'milestoneId[]': mss,
        };
        try {
          const r = await api('POST', '/issues', body);
          Object.assign(d, { issueKey: r.issueKey, url: issueUrl(r.issueKey), result: 'created', missing });
          console.log(`✓ ${d.ref} → ${r.issueKey} ${issueUrl(r.issueKey)}`);
          if (specs.length) {
            // Có mã thật rồi mới vẽ ảnh bằng chứng → đính kèm vào chính issue này (mô tả tham chiếu ảnh theo tên file).
            const mk = renderMarks(specs, r.issueKey, d.ref);
            const up = await upload(mk.out);
            const miss = [...missing, ...up.missing, ...mk.failed];
            await api('PATCH', `/issues/${r.issueKey}`, { 'attachmentId[]': up.ids, description: (await renderBody(d.description)) + manualNote(miss) });
            Object.assign(d, { marked: mk.out.map((f) => path.basename(f)), missing: miss });
            console.log(`  + đính kèm ${up.ids.length} ảnh bằng chứng vào ${r.issueKey}${miss.length ? ` — cần đính kèm tay: ${miss.join(', ')}` : ''}`);
          }
        } catch (e) { d.result = 'error'; d.error = e.message; console.log(`✗ ${d.ref}: ${e.message}`); }
      }
      writeJson(args.from, drafts);
    }
  },
  async comment() {
    const k = args._[1] || die('comment <KEY> --body-file c.md');
    const files = list(args.file);
    if (!APPLY) return console.log(`[dry-run] comment ${k} (${bodyFrom(args).length} ký tự) + ${files.length} ảnh`);
    const { ids, missing } = await upload(files);
    await api('POST', `/issues/${k}/comments`, { content: (await renderBody(bodyFrom(args))) + manualNote(missing), 'attachmentId[]': ids });
    console.log(`✓ comment ${k}${missing.length ? ` — cần đính kèm tay: ${missing.join(', ')}` : ''}`);
  },
  async update() {
    const k = args._[1] || die('update <KEY> ...');
    const m = await meta();
    const body = {};
    if (args.status) body.statusId = pick(m.statuses, args.status, 'trạng thái').id;
    if (args.assignee) body.assigneeId = (await user(args.assignee)).id;
    if (args.summary) body.summary = args.summary;
    const files = list(args.file);
    if (!APPLY) return console.log(`[dry-run] update ${k} ${JSON.stringify({ status: args.status, assignee: args.assignee, summary: args.summary })} + comment ${bodyFrom(args).length} ký tự + ${files.length} ảnh`);
    const { ids, missing } = await upload(files);
    if (bodyFrom(args) || missing.length) body.comment = (await renderBody(bodyFrom(args))) + manualNote(missing);
    if (ids.length) body['attachmentId[]'] = ids;
    const r = await api('PATCH', `/issues/${k}`, body);
    console.log(`✓ ${r.issueKey} → [${r.status.name}] ${r.assignee?.name || '-'}`);
  },
};

if (!main[cmd]) die(`Lệnh: ${Object.keys(main).join(' | ')}`);
main[cmd]().catch((e) => die(e.stack || e.message));
