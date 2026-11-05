#!/usr/bin/env node
// Kiểm tra thư mục QA webapp: qa-config.json, repo docs/RULES, biến môi trường, kết nối TestRail / Backlog / môi trường test.
// Không in giá trị bí mật. Usage: node <plugin>/scripts/doctor.mjs [--offline]   (exit 1 nếu có FAIL)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs, readJson, env, redact, cfgVal, ENV_SOURCE, USER_ENV_FILE } from './lib.mjs';

const args = parseArgs();
const res = [];
const ok = (m) => res.push(['OK  ', m]), warn = (m) => res.push(['WARN', m]), fail = (m) => res.push(['FAIL', m]);
const PH = /<[^>]+>|example\.(com|jp)/i;
const report = () => {
  for (const [s, m] of res) console.log(`${s} ${redact(m)}`);
  const f = res.filter((r) => r[0] === 'FAIL').length, w = res.filter((r) => r[0] === 'WARN').length;
  console.log(`\n${f} FAIL · ${w} WARN`);
  process.exit(f ? 1 : 0);
};
async function get(url, headers = {}) {
  try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) }); return { status: r.status, text: await r.text() }; }
  catch (e) { return { status: 0, error: e.cause?.code || e.message }; }
}

if (!fs.existsSync('qa-config.json')) { fail('Không có qa-config.json — chạy init.mjs của plugin app-qa'); report(); }
let cfg;
try { cfg = readJson('qa-config.json'); } catch (e) { fail(`qa-config.json lỗi JSON: ${e.message}`); report(); }
if (cfg.type !== 'webapp') fail(`type phải là "webapp" (đang: ${cfg.type}) — website dùng plugin web-qa`);
if (!cfg.project || PH.test(cfg.project)) fail('Chưa điền "project"');

try { createRequire(path.resolve('package.json')).resolve('playwright'); ok('playwright đã cài'); }
catch { warn('Chưa cài playwright — npm install && npm run setup (cần cho app-run-test / annotate)'); }

// ---------- env files ----------
for (const ef of cfg.envFiles || []) {
  const p = typeof ef === 'string' ? ef : ef.path;
  if (!p || PH.test(p)) { fail('envFiles còn giá trị mẫu'); continue; }
  if (!fs.existsSync(p)) fail(`envFiles: không thấy ${p}`);
  else if (!(ef.keys || []).length) fail(`envFiles ${p}: thiếu "keys" (whitelist, vd ["TESTRAIL_*","BACKLOG_*"]) — không nạp cả file`);
  else ok(`envFiles: ${p} (chỉ nạp ${ef.keys.join(', ')})`);
  if ((ef.keys || []).some((k) => /^(TESTRAIL|BACKLOG)/i.test(k))) warn(`envFiles ${p}: đang lấy key TestRail/Backlog từ .env của app — nên chuyển sang ${USER_ENV_FILE} và bỏ TESTRAIL_*/BACKLOG_* khỏi "keys"`);
}
// Key cá nhân: ở đâu ra (không in giá trị)
fs.existsSync(USER_ENV_FILE) ? ok(`File key cá nhân: ${USER_ENV_FILE}`) : warn(`Chưa có file key cá nhân ${USER_ENV_FILE} — chạy init (tạo file mẫu) rồi điền TESTRAIL_*/BACKLOG_*`);
const keySrc = ['TESTRAIL_URL', 'TESTRAIL_USER', 'TESTRAIL_KEY', 'BACKLOG_URL', 'BACKLOG_API_KEY'].map((k) => `${k}←${env(k) ? ENV_SOURCE[k] : '(thiếu)'}`);
ok(`Nguồn key: ${keySrc.join(' · ')}`);

// ---------- docs ----------
const d = cfg.docs || {};
if (!d.repo || PH.test(d.repo) || !fs.existsSync(d.repo)) fail(`docs.repo không tồn tại: ${d.repo}`);
else {
  ok(`docs.repo: ${d.repo}`);
  const t = path.join(d.repo, d.testing || '');
  if (!fs.existsSync(t)) fail(`docs.testing không tồn tại: ${t}`);
  else {
    const rules = fs.existsSync(path.join(t, 'RULES')) ? fs.readdirSync(path.join(t, 'RULES')) : [];
    for (const [n, label] of [['01', 'Test case'], ['02', 'Run test'], ['03', 'Log bug'], ['04', 'Verify bug']]) {
      const f = rules.find((x) => x.startsWith(n) && x.endsWith('.md'));
      f ? ok(`RULES ${label}: ${f}`) : warn(`RULES thiếu ${n}_* (${label}) — skill dùng rule mặc định của plugin (chạy init để chép sang)`);
    }
    const tpl = rules.find((x) => /template/i.test(x) && x.endsWith('.csv'));
    tpl ? ok(`Template CSV: ${tpl}`) : warn('RULES chưa có CSV template — dùng header mặc định');
  }
  for (const s of d.specDirs || []) if (!fs.existsSync(path.join(d.repo, s))) warn(`docs.specDirs: không thấy ${s} ở nhánh hiện tại`);
  if (d.branch && fs.existsSync(path.join(d.repo, '.git'))) {
    const head = fs.readFileSync(path.join(d.repo, '.git', 'HEAD'), 'utf8').trim().replace('ref: refs/heads/', '');
    head === d.branch ? ok(`docs đang ở nhánh ${head}`) : warn(`docs đang ở nhánh "${head}", config là "${d.branch}" — đặc tả có thể không phải bản mới nhất`);
  }
}
if (!cfg.design?.url || PH.test(cfg.design.url)) warn('design.url chưa điền (link Claude Design)');
for (const l of cfg.design?.local || []) if (d.repo && !fs.existsSync(path.join(d.repo, l))) warn(`design.local: không thấy ${l}`);

// ---------- envs / accounts ----------
const envs = Object.entries(cfg.envs || {});
if (!envs.length) fail('envs trống');
for (const [n, e] of envs) {
  if (!e.url || PH.test(e.url)) { fail(`envs.${n}.url chưa điền`); continue; }
  if (args.offline) continue;
  if (/localhost|127\.0\.0\.1/.test(e.url)) { const r = await get(e.url); r.status ? ok(`env ${n}: ${e.url} → ${r.status}`) : warn(`env ${n}: ${e.url} không chạy (${r.error})`); continue; }
  const r = await get(e.url);
  r.status && r.status < 500 ? ok(`env ${n}: ${e.url} → ${r.status}`) : fail(`env ${n}: ${e.url} → ${r.status || r.error}`);
}
if (cfg.defaultEnv && !cfg.envs?.[cfg.defaultEnv]) fail(`defaultEnv "${cfg.defaultEnv}" không có trong envs`);
for (const [n, a] of Object.entries(cfg.accounts || {})) {
  if (n.startsWith('_')) continue;
  const miss = [a.user ? '' : a.userEnv, a.passEnv].filter((k) => k && !env(k));
  miss.length ? warn(`account ${n}: thiếu env ${miss.join(', ')} (.env.local)`) : ok(`account ${n}: có user/mật khẩu`);
}
for (const [n, a] of Object.entries(cfg.apps || {})) if (!a.login?.path || !a.login?.user || !a.login?.pass) warn(`apps.${n}.login thiếu path/user/pass selector`);

// ---------- TestRail ----------
const tr = cfg.testrail || {};
const TR = { url: env(tr.urlEnv || 'TESTRAIL_URL') || tr.url, user: env(tr.userEnv || 'TESTRAIL_USER'), key: env(tr.keyEnv || 'TESTRAIL_KEY'), pid: cfgVal(tr.projectId) || env(tr.projectIdEnv || 'TESTRAIL_PROJECT_ID') };
if (!TR.url || !TR.user || !TR.key || !TR.pid) fail(`TestRail: thiếu ${['url', 'user', 'key', 'pid'].filter((k) => !TR[k]).join(', ')} (TESTRAIL_URL/USER/KEY/PROJECT_ID)`);
else if (!args.offline) {
  const h = { Authorization: 'Basic ' + Buffer.from(`${TR.user}:${TR.key}`).toString('base64') };
  const base = TR.url.replace(/\/$/, '') + '/index.php?/api/v2/';
  const p = await get(base + `get_project/${TR.pid}`, h);
  if (p.status !== 200) fail(`TestRail get_project/${TR.pid} → ${p.status || p.error}`);
  else {
    ok(`TestRail: ${JSON.parse(p.text).name} (project ${TR.pid})`);
    const st = await get(base + 'get_statuses', h);
    if (st.status === 200) {
      const all = JSON.parse(st.text);
      for (const [k, id] of Object.entries(tr.statusIds || {})) {
        const s = all.find((x) => x.id === id);
        s ? ok(`TestRail status ${k} → ${id} 「${s.label}」`) : fail(`TestRail statusIds.${k}=${id} không tồn tại`);
      }
    }
  }
}

// ---------- Backlog ----------
const bl = cfg.backlog || {};
const raw = env(bl.urlEnv || 'BACKLOG_URL') || bl.url, bkey = env(bl.apiKeyEnv || 'BACKLOG_API_KEY'), pkey = cfgVal(bl.projectKey) || env(bl.projectKeyEnv || 'BACKLOG_PROJECT_KEY');
if (!raw || !bkey || !pkey) fail('Backlog: thiếu BACKLOG_URL / BACKLOG_API_KEY / BACKLOG_PROJECT_KEY');
else if (!args.offline) {
  const origin = new URL(raw).origin;
  const q = `?apiKey=${encodeURIComponent(bkey)}`;
  const p = await get(`${origin}/api/v2/projects/${pkey}${q}`);
  if (p.status !== 200) fail(`Backlog project ${pkey} → ${p.status || p.error}`);
  else {
    const proj = JSON.parse(p.text);
    ok(`Backlog: ${proj.projectKey} ${proj.name} (format ${proj.textFormattingRule})`);
    const users = await get(`${origin}/api/v2/projects/${pkey}/users${q}`);
    const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_\-・]/g, '');
    if (users.status === 200) {
      const us = JSON.parse(users.text);
      for (const [role, name] of Object.entries(bl.assignees || {})) {
        if (PH.test(name)) { warn(`backlog.assignees.${role} chưa điền`); continue; }
        const hit = us.filter((u) => norm(u.name).includes(norm(name)));
        hit.length === 1 ? ok(`Backlog assignee ${role} → ${hit[0].name}`) : fail(`Backlog assignee ${role} "${name}": ${hit.length} user khớp`);
      }
    }
    const types = await get(`${origin}/api/v2/projects/${pkey}/issueTypes${q}`);
    if (types.status === 200) {
      const want = bl.defaults?.issueType || 'Bug';
      const hit = JSON.parse(types.text).filter((t) => norm(t.name).includes(norm(want)));
      hit.length === 1 ? ok(`Backlog loại issue mặc định → ${hit[0].name}`) : fail(`Backlog issueType "${want}": ${hit.length} khớp`);
    }
    for (const [m, k] of Object.entries(bl.parentTasks || {})) {
      if (m.startsWith('_')) continue;
      const key = /^\d+$/.test(String(k)) ? `${pkey}-${k}` : k;
      const i = await get(`${origin}/api/v2/issues/${key}${q}`);
      i.status === 200 ? ok(`Parent task ${m} → ${key}: ${JSON.parse(i.text).summary.slice(0, 50)}`) : fail(`Parent task ${m} → ${key} không tồn tại (${i.status})`);
    }
  }
}
report();
