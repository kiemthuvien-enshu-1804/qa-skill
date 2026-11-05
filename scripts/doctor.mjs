#!/usr/bin/env node
// Kiểm tra cấu hình QA workspace trước khi chạy: qa-config.json, biến môi trường, kết nối site / CMS / Figma.
// Không in giá trị bí mật. Usage: node <plugin>/scripts/doctor.mjs [--offline] [--config qa-config.json]
// Exit code 1 nếu có FAIL.
import fs from 'node:fs';
import { parseArgs, readJson } from './lib.mjs';

const args = parseArgs();
const cfgPath = args.config || 'qa-config.json';
const res = [];
const ok = (m) => res.push(['OK  ', m]);
const warn = (m) => res.push(['WARN', m]);
const fail = (m) => res.push(['FAIL', m]);
const PLACEHOLDER = /<[^>]+>|example\.(com|jp)|xxxx/i;
const online = !args.offline;

async function fetchStatus(url, headers = {}) {
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.message };
  }
}
const envVars = (s) => [...String(s).matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]);
const fillEnv = (s) => String(s).replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] || '');

// ---------- config ----------
if (!fs.existsSync(cfgPath)) {
  fail(`Không có ${cfgPath} — chạy init của plugin web-qa (nhờ Claude: "tạo thư mục QA cho dự án")`);
  report();
}
let cfg;
try { cfg = readJson(cfgPath); } catch (e) { fail(`${cfgPath} không phải JSON hợp lệ: ${e.message}`); report(); }

for (const k of ['project', 'bugPrefix', 'baseUrl']) {
  if (!cfg[k]) fail(`Thiếu "${k}"`);
  else if (PLACEHOLDER.test(cfg[k])) fail(`"${k}" vẫn là giá trị mẫu: ${cfg[k]}`);
}
if (fs.existsSync('.env.example') && /=(?!\s*$)\S{16,}/m.test(fs.readFileSync('.env.example', 'utf8').replace(/^#.*$/gm, '')))
  warn('.env.example có giá trị trông như key thật — để trống, key thật chỉ ghi trong .env.local');
if (!fs.existsSync('.env.local') && !fs.existsSync('.env')) warn('Chưa có .env.local — chạy init của plugin web-qa');

const authHeaders = {};
if (cfg.basicAuth?.userEnv) {
  if (process.env[cfg.basicAuth.userEnv]) {
    authHeaders.Authorization = 'Basic ' + Buffer.from(`${process.env[cfg.basicAuth.userEnv]}:${process.env[cfg.basicAuth.passEnv] || ''}`).toString('base64');
  }
}

// ---------- pages ----------
const pages = Array.isArray(cfg.pages) ? cfg.pages : [];
if (!pages.length) fail('"pages" trống — thêm ít nhất 1 trang { name, path }');
const seen = new Set();
for (const p of pages) {
  if (!p.name) fail(`Page thiếu "name": ${JSON.stringify(p).slice(0, 60)}`);
  else if (seen.has(p.name)) fail(`Trùng tên page "${p.name}" — script chỉ dùng page đầu tiên`);
  seen.add(p.name);
  if (!p.path) fail(`Page "${p.name}" thiếu "path"`);
  else if (/^https?:/i.test(p.path)) fail(`Page "${p.name}": path phải là đường dẫn tương đối (vd /about), không phải URL đầy đủ — domain đã có ở baseUrl`);
  else if (!p.path.startsWith('/')) warn(`Page "${p.name}": path nên bắt đầu bằng "/"`);
  const f = p.figma;
  if (f) {
    const sp = f.sp || (f.spUrl || '').match(/node-id=([\d-:]+)/)?.[1];
    const pc = f.pc || (f.pcUrl || '').match(/node-id=([\d-:]+)/)?.[1];
    if (sp && pc && sp.replace('-', ':') === pc.replace('-', ':')) warn(`Page "${p.name}": figma SP và PC cùng node ${sp} — thường là link page/section, không phải frame. Có thể xoá pages[].figma để tự tìm frame.`);
  }
}

// ---------- figma ----------
const fg = cfg.figma || {};
const fileKey = fg.fileKey || fg.url?.match(/figma\.com\/(?:design|file)\/([0-9A-Za-z]+)(?:\/branch\/([0-9A-Za-z]+))?/)?.slice(1).reverse().find(Boolean);
if (!fg.url && !fg.fileKey) warn('Chưa có figma.url — bỏ qua bước so Figma (pixel-check)');
else if (!fileKey || PLACEHOLDER.test(fg.url || '')) fail(`figma.url không đọc được fileKey: ${fg.url}`);
else {
  ok(`Figma fileKey ${fileKey}`);
  const mapPath = fg.map || 'specs/figma-map.json';
  const mapped = fs.existsSync(mapPath) ? Object.keys(readJson(mapPath).pages || {}) : [];
  const missing = pages.filter((p) => !p.figma && !mapped.includes(p.name)).map((p) => p.name);
  if (missing.length) ok(`Frame Figma chưa ghép (sẽ tự tìm ở bước qa-figma-spec): ${missing.join(', ')}`);
  if (!process.env.FIGMA_TOKEN) warn('Chưa có FIGMA_TOKEN — qa-figma-spec sẽ dùng Figma MCP (chậm hơn)');
  else if (online) {
    const r = await fetchStatus(`https://api.figma.com/v1/files/${fileKey}?depth=1`, { 'X-Figma-Token': process.env.FIGMA_TOKEN });
    if (r.status === 200) ok(`Figma API: truy cập được file "${JSON.parse(r.text).name}"`);
    else if (r.status === 403) fail('Figma API 403 — token sai/hết hạn hoặc tài khoản không có quyền xem file');
    else if (r.status === 404) fail('Figma API 404 — fileKey sai');
    else warn(`Figma API: ${r.status || r.error}`);
  }
}

// ---------- site ----------
if (online && cfg.baseUrl && !PLACEHOLDER.test(cfg.baseUrl)) {
  const r = await fetchStatus(cfg.baseUrl, authHeaders);
  if (r.status === 200) ok(`Site ${cfg.baseUrl} → 200`);
  else if (r.status === 401) fail(`Site → 401 — cần Basic Auth: điền ${cfg.basicAuth?.userEnv || 'QA_BASIC_USER'}/${cfg.basicAuth?.passEnv || 'QA_BASIC_PASS'} trong .env.local`);
  else if (r.status === 403) warn('Site → 403 — có thể bị chặn IP/Cloudflare; mục bị chặn để tester kiểm');
  else fail(`Site → ${r.status || r.error}`);
  for (const p of pages.filter((p) => p.path?.startsWith('/'))) {
    const pr = await fetchStatus(new URL(p.path, cfg.baseUrl).href, authHeaders);
    if (pr.status !== 200) warn(`Trang "${p.name}" ${p.path} → ${pr.status || pr.error}`);
  }
}

// ---------- cms ----------
const cmsPages = pages.filter((p) => p.cms);
if (cfg.cms && (cmsPages.length || !args.quiet)) {
  const c = cfg.cms;
  const base = String(c.baseUrl || '');
  if (!base || PLACEHOLDER.test(base)) fail(`cms.baseUrl vẫn là giá trị mẫu: ${base || '(trống)'}`);
  else if (/microcms\.io\/apis\//.test(base) || /microcms\.io\/?$/.test(base)) fail(`cms.baseUrl đang là link trang quản trị microCMS — dùng https://<service>.microcms.io/api/v1, endpoint ghi ở pages[].cms.endpoint`);
  else if (/\/wp-admin/.test(base)) fail('cms.baseUrl đang là wp-admin — dùng https://<site>/wp-json/wp/v2');
  const missingEnv = Object.values(c.headers || {}).flatMap(envVars).filter((k) => !process.env[k]);
  if (missingEnv.length) fail(`Thiếu biến môi trường cho CMS: ${missingEnv.join(', ')} (điền trong .env.local)`);
  if (!cmsPages.length) warn('Có "cms" nhưng chưa page nào có pages[].cms — bỏ qua kiểm dữ liệu CMS');
  if (online && base && !PLACEHOLDER.test(base) && !missingEnv.length) {
    const headers = Object.fromEntries(Object.entries(c.headers || {}).map(([k, v]) => [k, fillEnv(v)]));
    for (const p of cmsPages) {
      const ep = p.cms.endpoint || '';
      const u = new URL(base.replace(/\/$/, '') + (ep.startsWith('/') ? ep : '/' + ep));
      const pg = c.pagination || {};
      u.searchParams.set(pg.style === 'page' ? (pg.perPageParam || 'per_page') : (pg.limitParam || 'limit'), '1');
      const r = await fetchStatus(u.href, headers);
      let total = '';
      try { const j = JSON.parse(r.text); const t = (c.totalPath || '').split('.').reduce((o, k) => o?.[k], j); if (t != null) total = ` — ${t} bài`; } catch {}
      if (r.status === 200 && !/json/.test(r.type)) fail(`CMS "${p.name}" ${ep}: trả về HTML, không phải JSON — baseUrl sai (đang trỏ trang web/admin?)`);
      else if (r.status === 200) ok(`CMS "${p.name}" ${ep} → 200${total}`);
      else if (r.status === 401 || r.status === 403) fail(`CMS "${p.name}" ${ep} → ${r.status} — API key sai hoặc thiếu quyền GET`);
      else if (r.status === 404) fail(`CMS "${p.name}" ${ep} → 404 — endpoint sai (xem tên API trong CMS)`);
      else fail(`CMS "${p.name}" ${ep} → ${r.status || r.error}`);
    }
  }
}

// ---------- cms seed ----------
if (cfg.cms?.seed) {
  const s = cfg.cms.seed;
  const allowed = (s.allowedHosts || []).filter((h) => h && !PLACEHOLDER.test(h));
  let host = '';
  try { host = new URL(fillEnv(cfg.cms.baseUrl)).host; } catch {}
  if (!allowed.length) fail('cms.seed.allowedHosts chưa điền — host microCMS của môi trường DEV (hoặc xoá khối cms.seed nếu không seed)');
  else if (host && !allowed.includes(host)) warn(`cms.baseUrl (${host}) không nằm trong cms.seed.allowedHosts — qa-cms-seed sẽ không chạy`);
  else ok(`CMS seed: chỉ ghi lên ${allowed.join(', ')}`);
  const missing = [...Object.values(s.headers || {}), s.prefix || ''].flatMap(envVars).filter((k) => !process.env[k]);
  if (missing.length) warn(`qa-cms-seed thiếu biến môi trường: ${missing.join(', ')} (điền trong .env.local khi cần seed)`);
}

// ---------- checklist / tracker / deps ----------
if (cfg.checklist?.file) {
  if (fs.existsSync(cfg.checklist.file)) ok(`Checklist ${cfg.checklist.file}`);
  else warn(`Chưa có checklist ${cfg.checklist.file} — đặt file .xlsx vào checklist/ (hoặc sửa checklist.file)`);
} else warn('Chưa khai báo checklist.file');
if (!cfg.tracker?.url) warn('Chưa có tracker.url — qa-bug-report sẽ tạo Tracker mới cho dự án');
if (!fs.existsSync('node_modules/playwright')) fail('Chưa cài thư viện — chạy: npm install && npm run setup');

report();

function report() {
  const order = { 'FAIL': 0, 'WARN': 1, 'OK  ': 2 };
  res.sort((a, b) => order[a[0]] - order[b[0]]);
  for (const [lv, m] of res) console.log(`[${lv}] ${m}`);
  const nf = res.filter((r) => r[0] === 'FAIL').length, nw = res.filter((r) => r[0] === 'WARN').length;
  console.log(`\n${nf ? '✗' : '✓'} ${nf} lỗi, ${nw} cảnh báo`);
  process.exit(nf ? 1 : 0);
}
