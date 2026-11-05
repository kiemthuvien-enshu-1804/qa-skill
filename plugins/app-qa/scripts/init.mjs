#!/usr/bin/env node
// Tạo / cập nhật thư mục QA webapp của 1 dự án từ templates/project của plugin app-qa.
//   node "<plugin>/scripts/init.mjs" [--project <tên>] [--docs <repo docs>] [--testing docs/07_Testing] [--env-file <.env của app, lấy DB_*>] [--url <https://test-env>]
// Không ghi đè file dự án. File do plugin quản lý (qa-config.example.json, .env.example, README.md) luôn được làm mới.
// RULES: nếu thư mục testing của dự án chưa có RULES/ → chép bộ rule mặc định của plugin sang (không ghi đè).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, USER_ENV_FILE } from './lib.mjs';

const args = parseArgs();
const log = (s) => console.log(s);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL = path.join(ROOT, 'templates', 'project');
const MANAGED = new Set(['qa-config.example.json', '.env.example', 'README.md']);
const walk = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(dir, path.join(rel, e.name)) : [path.join(rel, e.name)]));

for (const d of ['runs', 'e2e']) fs.mkdirSync(d, { recursive: true });
for (const rel of walk(TPL)) {
  const to = rel === 'gitignore' ? '.gitignore' : rel;
  const from = path.join(TPL, rel);
  fs.mkdirSync(path.dirname(to) || '.', { recursive: true });
  if (rel === path.join('.claude', 'settings.json') && fs.existsSync(to)) { mergeSettings(from, to); continue; }
  if (fs.existsSync(to)) {
    if (MANAGED.has(rel) && fs.readFileSync(to, 'utf8') !== fs.readFileSync(from, 'utf8')) { fs.copyFileSync(from, to); log(`~ ${to} (làm mới từ plugin)`); }
    else log(`= ${to} đã có — giữ nguyên`);
    continue;
  }
  fs.copyFileSync(from, to);
  log(`+ ${to}`);
}

function mergeSettings(from, to, extraDeny = []) {
  const tpl = JSON.parse(fs.readFileSync(from, 'utf8'));
  const cur = JSON.parse(fs.readFileSync(to, 'utf8'));
  let changed = false;
  for (const k of ['extraKnownMarketplaces', 'enabledPlugins']) {
    cur[k] ||= {};
    for (const [n, v] of Object.entries(tpl[k] || {})) if (!(n in cur[k])) { cur[k][n] = v; changed = true; }
  }
  cur.permissions ||= {};
  cur.permissions.deny ||= [];
  for (const d of [...(tpl.permissions?.deny || []), ...extraDeny]) if (!cur.permissions.deny.includes(d)) { cur.permissions.deny.push(d); changed = true; }
  if (changed) { fs.writeFileSync(to, JSON.stringify(cur, null, 2) + '\n'); log(`~ ${to} (thêm plugin app-qa / chặn đọc file .env)`); }
}

if (!fs.existsSync('.env.local')) { fs.copyFileSync('.env.example', '.env.local'); log('+ .env.local (từ .env.example)'); }

// File key cá nhân dùng chung mọi thư mục QA: ~/.app-qa/.env (chỉ tạo file mẫu, không ghi đè)
if (!fs.existsSync(USER_ENV_FILE)) {
  fs.mkdirSync(path.dirname(USER_ENV_FILE), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'templates', 'user', 'app-qa.env.example'), USER_ENV_FILE);
  log(`+ ${USER_ENV_FILE} (mẫu — điền key TestRail/Backlog của bạn)`);
} else log(`= ${USER_ENV_FILE} đã có — giữ nguyên`);

let cfg;
if (fs.existsSync('qa-config.json')) { cfg = JSON.parse(fs.readFileSync('qa-config.json', 'utf8')); log('= qa-config.json đã có — giữ nguyên'); }
else {
  cfg = JSON.parse(fs.readFileSync('qa-config.example.json', 'utf8'));
  if (args.project) cfg.project = String(args.project);
  if (args.docs) cfg.docs.repo = String(args.docs).replace(/\\/g, '/');
  if (args.testing) cfg.docs.testing = String(args.testing).replace(/\\/g, '/');
  if (args['env-file']) cfg.envFiles = [{ path: String(args['env-file']).replace(/\\/g, '/'), keys: ['DB_*'] }];
  else cfg.envFiles = [];
  if (args.url) cfg.envs.test.url = String(args.url).replace(/\/$/, '');
  fs.writeFileSync('qa-config.json', JSON.stringify(cfg, null, 2) + '\n');
  log('+ qa-config.json (từ qa-config.example.json)');
}

// Chặn Claude đọc trực tiếp file .env của dự án (script vẫn đọc được các key whitelisted).
const deny = (cfg.envFiles || []).map((e) => (typeof e === 'string' ? e : e.path)).filter((p) => p && !p.includes('<')).map((p) => `Read(${p.replace(/\\/g, '/')})`);
if (deny.length) mergeSettings(path.join(TPL, '.claude', 'settings.json'), path.join('.claude', 'settings.json'), deny);

// RULES mặc định → thư mục testing của dự án (nếu chưa có).
const testingDir = cfg.docs?.repo && !cfg.docs.repo.includes('<') ? path.join(cfg.docs.repo, cfg.docs.testing || '07_Testing') : '';
if (testingDir && fs.existsSync(cfg.docs.repo)) {
  const rulesDir = path.join(testingDir, 'RULES');
  for (const d of ['RULES', 'TESTCASE', 'TESTDATA', 'BUGREPORT']) fs.mkdirSync(path.join(testingDir, d), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'templates', 'rules'))) {
    const to = path.join(rulesDir, f);
    if (fs.existsSync(to)) continue;
    // Dự án đã có rule cùng số thứ tự (vd 01_TestCase_Rules.md) → không chép bản mặc định
    if (fs.readdirSync(rulesDir).some((x) => x.slice(0, 3) === f.slice(0, 3))) continue;
    fs.copyFileSync(path.join(ROOT, 'templates', 'rules', f), to);
    log(`+ ${to} (rule mặc định của plugin)`);
  }
} else if (testingDir) log(`! Không thấy repo docs ${cfg.docs.repo} — sửa docs.repo trong qa-config.json rồi chạy lại init`);

if (args.project && fs.existsSync('package.json')) {
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (p.name === 'qa-project') { p.name = `qa-${String(args.project).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`; fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n'); }
}

log(`
Tiếp theo:
  1. npm install && npm run setup        — Playwright cho runner
  2. Điền qa-config.json                 — docs, design, envs, apps.login, accounts, backlog.assignees/parentTasks
  3. Điền ${USER_ENV_FILE} — key TestRail/Backlog của bạn (1 lần cho mọi dự án)
  4. Điền .env.local                     — mật khẩu tài khoản test của dự án này
  5. Trong Claude Code: "kiểm tra cấu hình QA" (doctor)`);
