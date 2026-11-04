#!/usr/bin/env node
// Khởi tạo QA workspace cho 1 dự án mới (sau khi copy kit sang thư mục dự án).
// Không ghi đè file đã có. Usage: npm run init [-- --project <tên> --base-url <https://...> --prefix <ABC>]
import fs from 'node:fs';
import { parseArgs } from './lib.mjs';

const args = parseArgs();
const log = (s) => console.log(s);

for (const d of ['specs', 'runs', 'flows', 'checklist']) fs.mkdirSync(d, { recursive: true });

function copyOnce(from, to) {
  if (fs.existsSync(to)) return log(`= ${to} đã có — giữ nguyên`);
  fs.copyFileSync(from, to);
  log(`+ ${to} (từ ${from})`);
}
copyOnce('.env.example', '.env.local');

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

log(`
Tiếp theo:
  1. Điền qa-config.json  — project, bugPrefix, baseUrl, figma.url, cms (nếu có), pages, checklist, tracker
  2. Điền .env.local      — CMS_API_KEY, FIGMA_TOKEN, QA_BASIC_USER/PASS, QA_TESTER
  3. Đặt checklist .xlsx vào checklist/
  4. npm run doctor       — kiểm tra config + kết nối site / CMS / Figma
  5. Trong Claude Code: "QA trang <name>" hoặc /web-qa`);
