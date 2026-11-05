#!/usr/bin/env node
// Tạo / dọn dữ liệu test trên microCMS (môi trường dev) từ 1 file seed JSON.
// Mỗi bài có nhãn [<PREFIX><số>] (vd [KIM001]) ở đầu field tiêu đề và content ID cố định qa-<prefix><số>,
// nên chạy lại bao nhiêu lần cũng ra đúng bộ dữ liệu đó, và dọn được chính xác.
//
// Usage:
//   node cms_seed.mjs --file cms-seed/news.seed.json            # xem trước (không ghi gì)
//   node cms_seed.mjs --file cms-seed/news.seed.json --apply    # dọn bộ cũ rồi tạo lại
//   node cms_seed.mjs --file cms-seed/news.seed.json --clean --apply   # chỉ dọn
//   [--prefix KIM]  ghi đè cms.seed.prefix
//
// Config: qa-config.json → cms.seed { allowedHosts, headers (API key có quyền ghi), prefix }.
// Chỉ chạy khi host của cms.baseUrl nằm trong cms.seed.allowedHosts (môi trường dev).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, readJson, writeJson } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const APPLY = !!args.apply;
const CLEAN_ONLY = !!args.clean;
if (!args.file) die('Thiếu --file cms-seed/<tên>.seed.json');

const env = (s) => String(s).replace(/\$\{(\w+)\}/g, (_, k) => {
  if (!process.env[k]) die(`Thiếu biến môi trường ${k} (điền trong .env.local)`);
  return process.env[k];
});
function die(msg) { console.error(`[cms-seed] ${msg}`); process.exit(1); }
const short = (s) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t.length > 70 ? t.slice(0, 67) + '…' : t; };

// ---------------- guard: chỉ môi trường dev ----------------
const seedCfg = cfg.cms?.seed;
if (!cfg.cms || !seedCfg) die('Thiếu qa-config.json → cms.seed (xem qa-config.example.json)');
if (cfg.cms.name && !/microcms/i.test(cfg.cms.name)) die(`cms_seed hiện chỉ hỗ trợ microCMS (cms.name = ${cfg.cms.name})`);
const base = env(cfg.cms.baseUrl).replace(/\/$/, '');
const host = new URL(base).host;
const allowed = (seedCfg.allowedHosts || []).filter((h) => h && !/[<>]/.test(h));
if (!allowed.length) die('cms.seed.allowedHosts trống — ghi host microCMS của môi trường DEV (vd my-service-dev.microcms.io)');
if (!allowed.includes(host)) die(`Host ${host} không nằm trong cms.seed.allowedHosts ${JSON.stringify(allowed)} — dừng để không ghi dữ liệu test lên môi trường thật`);
const writeHeaders = Object.fromEntries(Object.entries(seedCfg.headers || {}).map(([k, v]) => [k, env(v)]));
if (!Object.keys(writeHeaders).length) die('Thiếu cms.seed.headers (API key có quyền POST/PUT/DELETE)');

const PREFIX = String(args.prefix || env(seedCfg.prefix || '') || '').trim().toUpperCase();
if (!/^[A-Z0-9]{2,10}$/.test(PREFIX)) die(`prefix "${PREFIX}" không hợp lệ — 2–10 ký tự chữ/số (vd KIM). Đặt cms.seed.prefix hoặc --prefix`);

// ---------------- đọc seed ----------------
const seed = readJson(args.file);
const items = seed.items || [];
if (!items.length) die(`${args.file} không có items`);
const start = Number(seed.numberStart || 1);
const keys = new Set();
const plan = items.map((it, i) => {
  if (!it.key) die(`items[${i}] thiếu "key"`);
  if (keys.has(it.key)) die(`key trùng: ${it.key}`);
  keys.add(it.key);
  const num = String(start + i).padStart(3, '0');
  const endpoint = it.endpoint || seed.endpoint;
  if (!endpoint) die(`items[${i}] (${it.key}) thiếu endpoint`);
  return {
    key: it.key,
    num,
    label: `[${PREFIX}${num}]`,
    id: `qa-${PREFIX.toLowerCase()}${num}`,
    endpoint: endpoint.replace(/^\/+/, ''),
    status: it.status === 'draft' ? 'draft' : 'published',
    prefixField: it.noPrefix ? null : (it.prefixField !== undefined ? it.prefixField : (seed.prefixField ?? 'title')),
    purpose: it.purpose || '',
    raw: it.fields || {},
  };
});
const byKey = Object.fromEntries(plan.map((p) => [p.key, p]));

// ---------------- mở rộng token trong field ----------------
// "$ref:<key>"          → content ID của item đó (field tham chiếu); mảng ["$ref:a","$ref:b"] cho tham chiếu nhiều
// "{label}"             → [KIM001]
// "{jp:120}"            → chuỗi tiếng Nhật 120 ký tự (test tiêu đề/nội dung dài)
// "{days:-3}"           → ISO của (bây giờ − 3 ngày)
// "{days:-3@23:30}"     → ISO của ngày (hôm nay − 3) lúc 23:30 giờ Nhật (test lệch ngày UTC→JST)
const JP = 'これは表示確認用のテスト記事です。改行位置や文字の折り返し、行間、三点リーダーによる省略が正しく行われるかを確認します。日本語の全角文字と半角英数字ABC123、記号「」（）・！？が混在する場合の表示も確認してください。';
const jp = (n) => JP.repeat(Math.ceil(n / JP.length)).slice(0, n);
function daysIso(d, hm) {
  const now = new Date();
  if (!hm) return new Date(now.getTime() + d * 86400000).toISOString();
  // Ngày theo giờ Nhật (UTC+9, không có giờ mùa hè)
  const jst = new Date(now.getTime() + 9 * 3600000 + d * 86400000);
  const [h, m] = hm.split(':').map(Number);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), h - 9, m)).toISOString();
}
function expand(v, p) {
  if (Array.isArray(v)) return v.map((x) => expand(x, p));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x, p)]));
  if (typeof v !== 'string') return v;
  const ref = v.match(/^\$ref:(.+)$/);
  if (ref) {
    if (!byKey[ref[1]]) die(`${p.key}: $ref tới key không có: ${ref[1]}`);
    if (plan.indexOf(byKey[ref[1]]) > plan.indexOf(p)) die(`${p.key}: $ref:${ref[1]} phải khai báo TRƯỚC item tham chiếu nó`);
    return byKey[ref[1]].id;
  }
  const out = v
    .replace(/\{var:(\w+)\}/g, (_, k) => {
      if (seed.vars?.[k] == null) die(`${p.key}: {var:${k}} chưa khai báo trong "vars" của file seed`);
      return String(seed.vars[k]);
    })
    .replace(/\{label\}/g, p.label)
    .replace(/\{jp:(\d+)\}/g, (_, n) => jp(Number(n)))
    .replace(/\{days:(-?\d+)(?:@(\d{1,2}:\d{2}))?\}/g, (_, d, hm) => daysIso(Number(d), hm));
  // Giá trị mẫu dạng <URL ...> / <ảnh ...> (thẻ HTML viết thường nên không bị bắt)
  if (/<(?:[A-Z]|[^\x00-\x7f])[^<>]*>/.test(out)) die(`${p.key}: còn giá trị mẫu "${short(out)}" — điền "vars" trong file seed`);
  return out;
}
for (const p of plan) {
  const f = expand(p.raw, p);
  if (p.prefixField) {
    if (typeof f[p.prefixField] !== 'string') die(`${p.key}: field "${p.prefixField}" (gắn nhãn) không có hoặc không phải chuỗi — đặt prefixField hoặc noPrefix`);
    if (!f[p.prefixField].includes(p.label)) f[p.prefixField] = `${p.label}${f[p.prefixField]}`;
  }
  if (p.status === 'draft' && 'publishedAt' in f) {
    console.warn(`[cms-seed] ${p.label} ${p.key}: bài nháp không được gửi publishedAt (microCMS) — bỏ field này`);
    delete f.publishedAt;
  }
  p.fields = f;
}

// ---------------- API ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, p, body) {
  const u = new URL(`${base}/${p.endpoint}/${p.id}`);
  if (method === 'PUT' && p.status === 'draft') u.searchParams.set('status', 'draft');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(u, {
      method,
      headers: { ...writeHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    await sleep(250); // tránh rate limit API ghi
    return { status: res.status, text: res.ok ? '' : (await res.text()).slice(0, 300) };
  }
  return { status: 429, text: 'rate limit' };
}

console.log(`microCMS ${host} · prefix ${PREFIX} · ${plan.length} bài · ${APPLY ? (CLEAN_ONLY ? 'DỌN' : 'DỌN + TẠO') : 'XEM TRƯỚC (thêm --apply để ghi)'}`);
for (const p of plan) {
  const title = p.prefixField ? p.fields[p.prefixField] : '(không gắn nhãn)';
  console.log(`  ${p.label} ${p.id.padEnd(12)} /${p.endpoint} ${p.status.padEnd(9)} ${short(title)}${p.purpose ? `  — ${p.purpose}` : ''}`);
}
if (!APPLY) process.exit(0);

// Dọn trước (ngược thứ tự để bài tham chiếu bị xoá trước category được tham chiếu)
const problems = [];
for (const p of [...plan].reverse()) {
  const r = await call('DELETE', p);
  if (![200, 202, 204, 404].includes(r.status)) problems.push(`DELETE ${p.label} /${p.endpoint}/${p.id} → ${r.status} ${r.text}`);
}
const results = [];
if (!CLEAN_ONLY) {
  for (const p of plan) {
    const r = await call('PUT', p, p.fields);
    const ok = r.status === 200 || r.status === 201;
    if (!ok) problems.push(`PUT ${p.label} /${p.endpoint}/${p.id} → ${r.status} ${r.text}`);
    results.push({ key: p.key, label: p.label, id: p.id, endpoint: '/' + p.endpoint, status: p.status, purpose: p.purpose, ok, fields: p.fields });
  }
}

const name = path.basename(args.file).replace(/\.seed\.json$|\.json$/, '');
const outFile = path.join(path.dirname(args.file), `${name}.applied.json`);
if (CLEAN_ONLY) { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); }
else writeJson(outFile, { appliedAt: new Date().toISOString(), host, prefix: PREFIX, items: results });

if (problems.length) {
  console.error(`\n${problems.length} lỗi:\n  ` + problems.join('\n  '));
  console.error('401/403: API key thiếu quyền ghi · 400: tên field / kiểu dữ liệu khác schema API (xem lỗi) · ảnh phải là URL trong media của service này');
  process.exit(1);
}
console.log(CLEAN_ONLY ? '\nĐã dọn xong.' : `\nĐã tạo ${results.length} bài → ${outFile}\nSite build tĩnh (SSG)? → rebuild/deploy môi trường dev rồi mới test, ghi lại thời điểm build.`);
