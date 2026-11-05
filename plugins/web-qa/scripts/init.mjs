#!/usr/bin/env node
// Tạo / cập nhật thư mục QA của 1 dự án từ templates/project của plugin.
// Chạy tại thư mục QA của dự án (thư mục rỗng hoặc đã có):
//   node "<plugin>/scripts/init.mjs" [--project <tên>] [--base-url <https://...>] [--prefix <ABC>]
// Không ghi đè file dự án. Riêng các file mẫu do plugin quản lý (qa-config.example.json, .env.example, README.md)
// thì luôn được làm mới, để dự án thấy field mới khi plugin cập nhật.
// .claude/settings.json đã có → chỉ thêm marketplace / enabledPlugins / deny còn thiếu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

const args = parseArgs();
const log = (s) => console.log(s);
const TPL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'project');
const MANAGED = new Set(['qa-config.example.json', '.env.example', 'README.md']);

function walk(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = path.join(rel, e.name);
    return e.isDirectory() ? walk(dir, r) : [r];
  });
}

for (const d of ['specs', 'runs', 'flows', 'checklist', 'cms-seed']) fs.mkdirSync(d, { recursive: true });

for (const rel of walk(TPL)) {
  const to = rel === 'gitignore' ? '.gitignore' : rel; // tên không dấu chấm để git của repo plugin không áp dụng nó
  const from = path.join(TPL, rel);
  fs.mkdirSync(path.dirname(to) || '.', { recursive: true });
  if (rel === path.join('.claude', 'settings.json') && fs.existsSync(to)) { mergeSettings(from, to); continue; }
  if (fs.existsSync(to)) {
    if (MANAGED.has(rel) && fs.readFileSync(to, 'utf8') !== fs.readFileSync(from, 'utf8')) {
      fs.copyFileSync(from, to);
      log(`~ ${to} (làm mới từ plugin)`);
    } else log(`= ${to} đã có — giữ nguyên`);
    continue;
  }
  fs.copyFileSync(from, to);
  log(`+ ${to}`);
}

function mergeSettings(from, to) {
  const tpl = JSON.parse(fs.readFileSync(from, 'utf8'));
  const cur = JSON.parse(fs.readFileSync(to, 'utf8'));
  let changed = false;
  for (const k of ['extraKnownMarketplaces', 'enabledPlugins']) {
    cur[k] ||= {};
    for (const [n, v] of Object.entries(tpl[k] || {})) if (!(n in cur[k])) { cur[k][n] = v; changed = true; }
  }
  cur.permissions ||= {};
  cur.permissions.deny ||= [];
  for (const d of tpl.permissions?.deny || []) if (!cur.permissions.deny.includes(d)) { cur.permissions.deny.push(d); changed = true; }
  if (changed) { fs.writeFileSync(to, JSON.stringify(cur, null, 2) + '\n'); log(`~ ${to} (thêm plugin web-qa + chặn đọc .env)`); }
  else log(`= ${to} đã có — giữ nguyên`);
}

if (!fs.existsSync('.env.local')) { fs.copyFileSync('.env.example', '.env.local'); log('+ .env.local (từ .env.example)'); }

if (fs.existsSync('qa-config.json')) {
  log('= qa-config.json đã có — giữ nguyên');
} else {
  const cfg = JSON.parse(fs.readFileSync('qa-config.example.json', 'utf8'));
  if (args.project) cfg.project = args.project;
  if (args['base-url']) cfg.baseUrl = String(args['base-url']).replace(/\/$/, '');
  if (args.prefix) cfg.bugPrefix = String(args.prefix).toUpperCase();
  fs.writeFileSync('qa-config.json', JSON.stringify(cfg, null, 2) + '\n');
  log('+ qa-config.json (từ qa-config.example.json)');
}
if (args.project && fs.existsSync('package.json')) {
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (p.name === 'qa-project') { p.name = `qa-${String(args.project).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`; fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n'); }
}

log(`
Tiếp theo:
  1. npm install && npm run setup   — thư viện Playwright cho script của plugin
  2. Điền qa-config.json  — project, bugPrefix, baseUrl, figma.url, cms (nếu có), pages, checklist, tracker
  3. Điền .env.local      — CMS_API_KEY, FIGMA_TOKEN, QA_BASIC_USER/PASS, QA_TESTER
  4. Đặt checklist .xlsx vào checklist/
  5. Trong Claude Code: "kiểm tra cấu hình QA" (doctor) rồi "QA trang <name>"`);
