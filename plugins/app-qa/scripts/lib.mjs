// Shared helpers for the app-qa scripts (webapp QA: test case → TestRail → run → Backlog).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** Parse KEY=VALUE lines. Returns [[key, value], ...]. */
function parseEnv(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out.push([m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]);
  }
  return out;
}
const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

// Thứ tự ưu tiên (nguồn đầu tiên có giá trị thắng; giá trị rỗng bị bỏ qua):
//   biến môi trường của shell → .env.local / .env của thư mục QA → file key cá nhân (USER_ENV_FILE) → envFiles (whitelist)
// ENV_SOURCE[key] = nơi đã nạp key (doctor dùng để báo, không bao giờ in giá trị).
export const USER_ENV_FILE = process.env.APPQA_ENV_FILE || path.join(os.homedir(), '.app-qa', '.env');
export const ENV_SOURCE = {};
const loadEnvFile = (file, label, allow = null) => {
  for (const [k, v] of parseEnv(fs.readFileSync(file, 'utf8'))) {
    if (allow && !allow.some((re) => re.test(k))) continue;
    if (v !== '' && !process.env[k]) { process.env[k] = v; ENV_SOURCE[k] = label; }
  }
};
// 1) .env.local / .env of the QA workspace (all keys) — ghi đè theo dự án (vd dự án dùng Backlog/TestRail khác).
for (const f of ['.env.local', '.env']) if (fs.existsSync(f)) loadEnvFile(f, f);
// 2) File key cá nhân, dùng chung cho mọi thư mục QA trên máy: ~/.app-qa/.env (TESTRAIL_USER/KEY, BACKLOG_API_KEY…).
if (fs.existsSync(USER_ENV_FILE)) loadEnvFile(USER_ENV_FILE, '~/.app-qa/.env');
// 3) qa-config.json "envFiles": [{ path, keys: ["DB_*"] }] — only whitelisted keys are loaded,
//    so a project .env (DB password, JWT secret…) is never pulled in wholesale.
try {
  const cfg = JSON.parse(fs.readFileSync('qa-config.json', 'utf8'));
  for (const ef of cfg.envFiles || []) {
    const p = typeof ef === 'string' ? ef : ef.path;
    const keys = (typeof ef === 'string' ? [] : ef.keys || []).map(globToRe);
    if (!p || !fs.existsSync(p) || !keys.length) continue;
    loadEnvFile(p, `envFiles:${p}`, keys);
  }
} catch { /* no / invalid config — doctor reports it */ }
for (const k of Object.keys(process.env)) if (!(k in ENV_SOURCE)) ENV_SOURCE[k] = 'shell';

export async function projectImport(name) {
  const req = createRequire(path.resolve('package.json'));
  let resolved;
  try { resolved = req.resolve(name); } catch {
    throw new Error(`Không tìm thấy thư viện "${name}" trong thư mục QA này — chạy: npm install && npm run setup (tại thư mục có qa-config.json)`);
  }
  return import(pathToFileURL(resolved).href);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
  }
  return out;
}
export const list = (v) => (v === undefined || v === true ? [] : [].concat(v).flatMap((x) => String(x).split(',')).map((s) => s.trim()).filter(Boolean));

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
export function writeJson(p, data) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}
export function loadConfig(p = 'qa-config.json') {
  if (!fs.existsSync(p)) throw new Error(`Không tìm thấy ${p} — chạy init của plugin app-qa`);
  const cfg = readJson(p);
  if (cfg.type && cfg.type !== 'webapp') throw new Error(`${p} có type="${cfg.type}" — app-qa chỉ dùng cho type "webapp"`);
  return cfg;
}
/** Resolve "${VAR}" placeholders from env. */
export const fillEnv = (s) => String(s ?? '').replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] || '');
export const env = (name) => (name ? process.env[name] || '' : '');
/** Giá trị trong qa-config.json; còn là placeholder "<...>" thì coi như chưa điền. */
export const cfgVal = (v) => (typeof v === 'string' && /<[^>]*>/.test(v) ? '' : v ?? '');

export const today = () => {
  const d = new Date(Date.now() + 9 * 3600e3); // JST
  return d.toISOString().slice(0, 10);
};
export const stamp = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);

/** Next free evidence name: {base}_{STATUS}.png → _r2, _r3… never overwrite. */
export function evidenceName(dir, base, status) {
  let n = `${base}_${status}.png`;
  for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = `${base}_${status}_r${i}.png`;
  return n;
}

/** Minimal RFC4180 CSV parser (quoted fields, "" escapes, CRLF/LF, BOM). */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ''));
  return { head, rows: body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) };
}
const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(head, rows) {
  return '﻿' + [head.map(csvCell).join(','), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(','))].join('\r\n') + '\r\n';
}

/** Hide secrets in anything printed. */
export function redact(s) {
  let out = String(s);
  for (const [k, v] of Object.entries(process.env)) if (/(?<!PROJECT_)KEY|TOKEN|PASS|SECRET/i.test(k) && v && v.length >= 6) out = out.split(v).join('***');
  return out;
}
export function die(msg) { console.error(redact(msg)); process.exit(1); }

/** Launch a Playwright browser by logical name: chromium | msedge | chrome | webkit | firefox */
export async function launch(name = 'chromium', opts = {}) {
  const m = await projectImport('playwright');
  const pw = m.chromium ? m : m.default;
  if (name === 'webkit') return pw.webkit.launch(opts);
  if (name === 'firefox') return pw.firefox.launch(opts);
  if (name === 'msedge' || name === 'chrome') return pw.chromium.launch({ ...opts, channel: name });
  return pw.chromium.launch(opts);
}
