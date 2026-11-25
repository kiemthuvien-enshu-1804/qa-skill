// Helper cho test case bảo mật (rule 05_Security_Checklist) — dùng trong e2e/SEC.run.mjs cùng runner.mjs.
//   const sec = await import(pathToFileURL(path.join(ROOT, 'scripts', 'sec_checks.mjs')).href);
//   tc('TC-SEC-001', 'Header trang HTML', async (t) => {
//     const res = await sec.fetch(t, '/login');
//     await sec.report(t, 'TC-SEC-001 Header trang HTML', sec.checkHeaders(res, ['HDR01','HDR02','HDR04','HDR05','HDR08']), { request: res.summary });
//   });
// Mỗi hàm check trả về rows [{ code, item, expected, actual, ok }]. sec.report() vẽ bảng lên trang (ảnh evidence của runner)
// và gọi t.fail() với danh sách mục NG — nên 1 TC gộp nhiều mục (quy tắc S1–S4) vẫn biết chính xác mục nào lỗi.
//
// An toàn (rule 05 "Phạm vi an toàn"): chỉ chạy khi env nằm trong qa-config security.allowedEnvs (mặc định local, test).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n = 160) => { const v = String(s ?? ''); return v.length > n ? v.slice(0, n) + `…(${v.length} ký tự)` : v; };

/** Chặn chạy ngoài môi trường cho phép. Gọi ở đầu file run (sau defineRun body) hoặc trong từng TC. */
export function guardEnv(t) {
  const allowed = t.cfg.security?.allowedEnvs || ['local', 'test'];
  const name = Object.entries(t.cfg.envs || {}).find(([, v]) => v === t.env)?.[0];
  if (!allowed.includes(name)) throw new Error(`Env "${name}" không nằm trong security.allowedEnvs (${allowed.join(', ')}) — không chạy test bảo mật`);
  if (/prod/i.test(name || '')) throw new Error('Không chạy test bảo mật trên production');
}

/** Gửi request bằng context của TC (dùng chung cookie đã login). path tương đối → ghép env.url (hoặc security.apiBase nếu api:true). */
export async function fetch(t, path, { method = 'GET', headers = {}, data, multipart, api = false, maxRedirects = 0, token } = {}) {
  guardEnv(t);
  const base = api ? (t.cfg.security?.apiBase ? t.cfg.security.apiBase.replace('{url}', t.env.url) : t.env.url) : t.env.url;
  const url = /^https?:/.test(path) ? path : base + path;
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await t.ctx.request.fetch(url, { method, headers: h, data, multipart, maxRedirects, failOnStatusCode: false, timeout: 20000 });
  const arr = r.headersArray();
  let text = '';
  try { text = await r.text(); } catch { /* binary / empty */ }
  return {
    url, method, status: r.status(), headers: r.headers(), setCookies: arr.filter((x) => x.name.toLowerCase() === 'set-cookie').map((x) => x.value), text,
    summary: `${method} ${url.replace(t.env.url, '')} → ${r.status()}`,
  };
}

const HEADER_RULES = {
  HDR01: { item: 'Content-Security-Policy', expected: 'Có default-src hoặc script-src; fetch directive không chứa *', test: (h) => {
    const v = h['content-security-policy']; if (!v) return [false, '(không có)'];
    const dirs = v.split(';').map((s) => s.trim());
    const hasFetch = dirs.some((d) => /^(default|script)-src\b/.test(d));
    const bad = dirs.filter((d) => /^(default|script|style|img|connect|font|object|media|frame|child|worker)-src\b/.test(d) && /(\s|^)\*(\s|$)/.test(d));
    return [hasFetch && !bad.length, cut(v) + (hasFetch ? '' : ' → thiếu default-src/script-src')]; } },
  HDR02: { item: 'CSP frame-ancestors', expected: "'none' | 'self' | domain chỉ định", test: (h) => {
    const m = /frame-ancestors\s+([^;]+)/i.exec(h['content-security-policy'] || ''); return [!!m && !/(\s|^)\*(\s|$)/.test(m[1]), m ? m[1].trim() : '(không có)']; } },
  HDR03: { item: 'Strict-Transport-Security', expected: 'max-age ≥ 31536000', test: (h, res) => {
    if (!/^https:/.test(res.url)) return [null, 'Bỏ qua: env không dùng HTTPS'];
    const v = h['strict-transport-security']; const m = /max-age=(\d+)/i.exec(v || ''); return [!!m && +m[1] >= 31536000, v || '(không có)']; } },
  HDR04: { item: 'X-Content-Type-Options', expected: 'nosniff', test: (h) => [/^\s*nosniff\s*$/i.test(h['x-content-type-options'] || ''), h['x-content-type-options'] || '(không có)'] },
  HDR05: { item: 'X-Frame-Options', expected: 'DENY | SAMEORIGIN', test: (h) => [/^\s*(deny|sameorigin)\s*$/i.test(h['x-frame-options'] || ''), h['x-frame-options'] || '(không có)'] },
  HDR06: { item: 'Cache-Control', expected: 'chứa no-store', test: (h) => [/no-store/i.test(h['cache-control'] || ''), h['cache-control'] || '(không có)'] },
  HDR07: { item: 'X-Download-Options / Content-Disposition', expected: 'noopen + attachment', test: (h) => [/noopen/i.test(h['x-download-options'] || '') && /attachment/i.test(h['content-disposition'] || ''), `X-Download-Options: ${h['x-download-options'] || '(không có)'} / Content-Disposition: ${cut(h['content-disposition'] || '(không có)', 60)}`] },
  HDR08: { item: 'X-Powered-By / Server', expected: 'Không có X-Powered-By; Server không ghi phiên bản', test: (h) => {
    const xp = h['x-powered-by'], sv = h.server || ''; return [!xp && !/\d+\.\d+/.test(sv), `X-Powered-By: ${xp || '(không có)'} / Server: ${sv || '(không có)'}`]; } },
  HDR11: { item: 'Referrer-Policy', expected: 'no-referrer | same-origin | strict-origin | strict-origin-when-cross-origin', test: (h) => {
    const v = h['referrer-policy']; if (!v) return [false, '(không có)'];
    const last = v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).pop();   // trình duyệt dùng giá trị hợp lệ cuối cùng
    return [['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'].includes(last), v]; } },
  HDR13: { item: 'Mixed content (tài nguyên http:// trên trang https://)', expected: 'Không có', test: (h, res) => {
    if (!/^https:/.test(res.url)) return [null, 'Bỏ qua: env không dùng HTTPS'];
    const re = /<(script|img|iframe|link|source|video|audio|embed|object|form)\b[^>]*?\s(src|href|data|action)\s*=\s*["']?(http:\/\/[^"'\s>]+)/gi;
    const hits = [...String(res.text || '').matchAll(re)].filter((m) => !(m[1].toLowerCase() === 'link' && /rel\s*=\s*["']?(canonical|alternate)/i.test(m[0]))).map((m) => `<${m[1]}> ${m[3]}`);
    return [!hits.length, hits.length ? cut(hits.slice(0, 4).join(' · '), 220) : 'Không có (chỉ quét HTML trả về, chưa gồm tài nguyên JS tải sau)']; } },
};

/** Kiểm header theo mã HDRxx. res = kết quả fetch(). */
export function checkHeaders(res, codes = Object.keys(HEADER_RULES)) {
  return codes.map((code) => {
    const r = HEADER_RULES[code]; if (!r) throw new Error(`Không có rule header ${code}`);
    const [ok, actual] = r.test(res.headers, res);
    return { code, item: r.item, expected: r.expected, actual, ok };
  });
}

/** CORS (HDR09): gửi Origin lạ, kiểm không phản chiếu / không * kèm credentials. */
export async function checkCors(t, path, opts = {}) {
  const evil = 'https://evil.example';
  const res = await fetch(t, path, { ...opts, headers: { ...(opts.headers || {}), Origin: evil } });
  const acao = res.headers['access-control-allow-origin'], acac = res.headers['access-control-allow-credentials'];
  const ok = !(acao === evil || (acao === '*' && /true/i.test(acac || '')));
  return [{ code: 'HDR09', item: `CORS (${res.summary})`, expected: 'Không phản chiếu Origin lạ, không * kèm credentials', actual: `ACAO: ${acao || '(không có)'} / ACAC: ${acac || '(không có)'}`, ok }];
}

/** Phân tích chuỗi Set-Cookie → { name, attrs }. */
export function parseSetCookie(s) {
  const [nv, ...parts] = s.split(';').map((x) => x.trim());
  const i = nv.indexOf('=');
  const attrs = {};
  for (const p of parts) { const j = p.indexOf('='); attrs[(j < 0 ? p : p.slice(0, j)).toLowerCase()] = j < 0 ? true : p.slice(j + 1); }
  return { name: nv.slice(0, i), value: nv.slice(i + 1), attrs };
}

/** CK01–CK05 cho các cookie phiên (tên khớp sessionCookie regex, mặc định security.sessionCookies). setCookies = res.setCookies của response login. */
export function checkCookies(t, setCookies, { codes = ['CK01', 'CK02', 'CK03', 'CK04', 'CK05'], names } = {}) {
  const want = (names || t.cfg.security?.sessionCookies || ['token', 'session', 'sid', 'auth']).map((n) => new RegExp(n, 'i'));
  const https = /^https:/.test(t.env.url);
  const rows = [];
  const list = setCookies.map(parseSetCookie).filter((c) => want.some((re) => re.test(c.name)));
  if (!list.length) return [{ code: codes.join(','), item: 'Cookie phiên', expected: `Có cookie khớp ${want.join(' ')}`, actual: `Không thấy trong Set-Cookie (${setCookies.map((s) => s.split('=')[0]).join(', ') || 'không có Set-Cookie'})`, ok: null }];
  for (const c of list) {
    const a = c.attrs;
    const chk = {
      CK01: ['HttpOnly', 'Có', a.httponly ? 'Có' : 'Không', !!a.httponly],
      CK02: ['Secure', 'Có', a.secure ? 'Có' : 'Không', https ? !!a.secure : null],
      CK03: ['SameSite', 'Lax | Strict', a.samesite || '(không có)', /^(lax|strict)$/i.test(a.samesite || '')],
      CK04: ['Prefix __Host-', '__Host- + Path=/ + không Domain + Secure', `${c.name} / Path=${a.path || '-'} / Domain=${a.domain || '-'}`, c.name.startsWith('__Host-') && a.path === '/' && !a.domain && !!a.secure],
      CK05: ['Max-Age / Expires', 'Không có (cookie phiên)', a['max-age'] ? `Max-Age=${a['max-age']}` : a.expires ? `Expires=${a.expires}` : 'Không có', !a['max-age'] && !a.expires],
    };
    for (const code of codes) { const [item, expected, actual, ok] = chk[code]; rows.push({ code, item: `${c.name}: ${item}`, expected, actual, ok: https || code !== 'CK02' ? ok : null }); }
  }
  return rows;
}

/** CK06: cookie không HttpOnly + localStorage/sessionStorage chứa thông tin quyền. Cần page đã mở trang của app. */
export async function checkClientStorage(t, { pattern = /role|permission|tenant|is_?admin|privilege/i } = {}) {
  const data = await t.page.evaluate(() => ({ cookie: document.cookie, local: { ...localStorage }, session: { ...sessionStorage } }));
  let decoded = data.cookie; try { decoded = decodeURIComponent(data.cookie); } catch { /* keep */ }
  const hits = [];
  for (const part of decoded.split(/;\s*/).filter(Boolean)) if (pattern.test(part)) hits.push(`cookie ${part.split('=')[0]}`);
  for (const [store, obj] of [['localStorage', data.local], ['sessionStorage', data.session]]) for (const [k, v] of Object.entries(obj)) if (pattern.test(k) || pattern.test(v)) hits.push(`${store}.${k}`);
  return [{ code: 'CK06', item: 'Thông tin quyền ở nơi JS đọc/sửa được', expected: 'Không có', actual: hits.length ? hits.join(', ') : 'Không có', ok: !hits.length }];
}

/** Sửa cookie JS-readable (vd user JSON) rồi gán lại vào context. mutate(obj|string) → giá trị mới. Dùng cho AZ01. */
export async function tamperCookie(t, name, mutate) {
  const cookies = await t.ctx.cookies();
  const c = cookies.find((x) => x.name === name);
  if (!c) throw new Error(`Không có cookie ${name}`);
  let raw = c.value, wasEncoded = false;
  try { const d = decodeURIComponent(raw); wasEncoded = d !== raw; raw = d; } catch { /* keep */ }
  let val; try { val = JSON.parse(raw); } catch { val = raw; }
  const next = mutate(val);
  let out = typeof next === 'string' ? next : JSON.stringify(next);
  if (wasEncoded) out = encodeURIComponent(out);
  await t.ctx.addCookies([{ ...c, value: out }]);
  return { before: cut(raw, 120), after: cut(typeof next === 'string' ? next : JSON.stringify(next), 120) };
}

/** Gọi nhiều API, so status với expect (mảng status chấp nhận). Dùng cho AZ02–AZ06, IN01, IN03–IN05. */
export async function probe(t, calls, { code = 'AZ02', api = true } = {}) {
  const rows = [];
  for (const c of calls) {
    const res = await fetch(t, c.path, { method: c.method || 'GET', data: c.data, headers: c.headers, token: c.token, api });
    const expect = c.expect || [401, 403, 404];
    let ok = typeof expect === 'function' ? expect(res.status) : expect.includes(res.status);
    const leak = /(\bat\s+\S+\s+\(|\.(ts|js|php|java|py):\d+|SQLSTATE|syntax error|ORA-\d+|Exception\b|Traceback)/i.test(res.text);
    if (c.noLeak !== false && leak) ok = false;
    rows.push({ code: c.code || code, item: `${c.method || 'GET'} ${c.path}${c.label ? ` (${c.label})` : ''}`, expected: (c.expectLabel || (typeof expect === 'function' ? 'status hợp lệ' : expect.join(' | '))) + (c.noLeak !== false ? ', không lộ lỗi nội bộ' : ''), actual: `${res.status}${leak ? ' · LỘ LỖI NỘI BỘ' : ''} · ${cut(res.text.replace(/\s+/g, ' '), 90)}`, ok });
  }
  return rows;
}

/** Thay {user} {pass} {email} trong mọi giá trị chuỗi của body mẫu (security.login.body, security.reset.body). */
export function fillBody(tpl, vars) {
  const walk = (v) => (typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  return walk(tpl);
}

/** Lấy user/mật khẩu của accounts[key] (mật khẩu từ env, không in ra). */
export function creds(t, key) {
  const a = t.cfg.accounts?.[key];
  if (!a) throw new Error(`Không có accounts.${key} trong qa-config.json`);
  const user = a.user || process.env[a.userEnv] || '', pass = process.env[a.passEnv] || '';
  if (!user || !pass) throw new Error(`Thiếu user/mật khẩu của ${key} (${a.userEnv || 'user'} / ${a.passEnv})`);
  return { user, pass };
}

const pick = (obj, p) => String(p || '').split('.').filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), obj);

/** Login bằng API theo security.login. Trả { res, token, ok }. Cookie phiên được lưu vào context của TC. pass ghi đè để thử sai mật khẩu. */
export async function apiLogin(t, key, { pass, user } = {}) {
  const L = t.cfg.security?.login;
  if (!L?.path) throw new Error('Chưa cấu hình security.login.path');
  const c = key ? creds(t, key) : { user: '', pass: '' };
  const body = fillBody(L.body || { email: '{user}', password: '{pass}' }, { user: user ?? c.user, pass: pass ?? c.pass, email: user ?? c.user });
  const res = await fetch(t, L.path, { method: L.method || 'POST', data: body });
  let json = null; try { json = JSON.parse(res.text); } catch { /* not json */ }
  const token = L.tokenPath && json ? pick(json, L.tokenPath) || '' : '';
  const sessionNames = (t.cfg.security?.sessionCookies || []).map((n) => new RegExp(n, 'i'));
  const gotCookie = res.setCookies.some((s) => sessionNames.some((re) => re.test(s.split('=')[0])));
  return { res, json, token, ok: res.status >= 200 && res.status < 300 && (!!token || gotCookie || !L.tokenPath) };
}

/** Thời hạn JWT (giờ) từ exp - iat. Không phải JWT → null. */
export function jwtLifetimeHours(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  try { const j = JSON.parse(Buffer.from(p[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return j.exp && j.iat ? (j.exp - j.iat) / 3600 : null; } catch { return null; }
}

/** So 2 response xem có lộ "tài khoản tồn tại" không (status + nội dung sau khi bỏ số/thời gian). */
export function sameResponse(a, b) {
  const norm = (s) => String(s || '').replace(/\d+/g, '#').replace(/"(requestId|traceId|timestamp|time)"\s*:\s*"[^"]*"/gi, '');
  return a.status === b.status && norm(a.text) === norm(b.text);
}

/* ---------- EX: lộ file / thư mục / công cụ debug qua web ---------- */
const ENV_SIG = /^\s*(export\s+)?[A-Z][A-Z0-9_]*\s*=/m;
const SQL_SIG = /CREATE TABLE|INSERT INTO|mysqldump|PostgreSQL database dump/i;
const ZIP_SIG = { test: (s) => s.startsWith('PK\u0003\u0004') };
const LIST_SIG = /<title>\s*Index of\b|Directory listing for|\[To Parent Directory\]|<h1>\s*Index of\b/i;
/** Danh sách đường dẫn dò (chỉ GET, đọc chữ ký nội dung — không khai thác). Thêm của dự án: security.exposurePaths [{path, code?, sig?}] */
export const EXPOSURE = [
  ...['/.env', '/.env.local', '/.env.production', '/.env.backup'].map((path) => ({ code: 'EX01', path, sig: ENV_SIG, what: 'biến môi trường' })),
  { code: 'EX01', path: '/.git/HEAD', sig: /^ref:\s*refs\//m, what: 'repo git' },
  { code: 'EX01', path: '/.git/config', sig: /\[core\]/, what: 'repo git' },
  { code: 'EX01', path: '/.svn/wc.db', sig: /SQLite format/, what: 'repo svn' },
  { code: 'EX01', path: '/.DS_Store', sig: /Bud1/, what: 'danh sách file' },
  { code: 'EX01', path: '/docker-compose.yml', sig: /^\s*services:/m, what: 'cấu hình hạ tầng' },
  { code: 'EX01', path: '/web.config', sig: /<configuration/i, what: 'cấu hình server' },
  { code: 'EX01', path: '/phpinfo.php', sig: /PHP Version|phpinfo\(\)/i, what: 'phpinfo' },
  ...['/index.php.bak', '/config.php.bak', '/wp-config.php.bak', '/config.php~'].map((path) => ({ code: 'EX01', path, sig: /<\?php/, what: 'mã nguồn backup' })),
  ...['/backup.sql', '/dump.sql', '/db.sql', '/database.sql'].map((path) => ({ code: 'EX01', path, sig: SQL_SIG, what: 'dump DB' })),
  ...['/backup.zip', '/site.zip', '/www.zip', '/backup.tar.gz'].map((path) => ({ code: 'EX01', path, sig: path.endsWith('.zip') ? ZIP_SIG : { test: (s) => s.startsWith('\u001f\u008b') || s.startsWith('\u001f�') }, what: 'file nén backup' })),
  ...['/uploads/', '/upload/', '/storage/', '/files/', '/images/', '/img/', '/static/', '/assets/', '/backup/', '/logs/'].map((path) => ({ code: 'EX02', path, sig: LIST_SIG, what: 'directory listing' })),
  ...['/storage/logs/laravel.log', '/logs/error.log', '/error.log', '/debug.log'].map((path) => ({ code: 'EX01', path, sig: /\[\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|Stack trace|Exception/i, what: 'file log' })),
  { code: 'EX04', path: '/_debugbar/open', sig: /"__meta"|debugbar/i, what: 'Laravel Debugbar' },
  { code: 'EX04', path: '/telescope/requests', sig: /<title>[^<]*Telescope/i, what: 'Laravel Telescope' },
  { code: 'EX04', path: '/horizon/dashboard', sig: /<title>[^<]*Horizon/i, what: 'Laravel Horizon' },
  { code: 'EX04', path: '/__clockwork/latest', sig: /"controller"|"responseStatus"/, what: 'Clockwork' },
  { code: 'EX04', path: '/actuator', sig: /"_links"\s*:/, what: 'Spring Actuator' },
  { code: 'EX04', path: '/actuator/env', sig: /propertySources|activeProfiles/, what: 'Spring Actuator env' },
  { code: 'EX04', path: '/server-status', sig: /Apache Server Status/i, what: 'Apache server-status' },
  { code: 'EX04', path: '/debug/pprof/', sig: /pprof/i, what: 'Go pprof' },
  { code: 'EX04', path: '/__nuxt_devtools__/client/', sig: /devtools/i, what: 'Nuxt DevTools' },
  { code: 'EX04', path: '/_profiler/latest', sig: /Symfony Profiler/i, what: 'Symfony Profiler' },
];
const normBody = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[0-9a-f]{8,}/gi, '#').slice(0, 4000);

/** Dò EX01/EX02/EX04 trên các origin (env.url + apiBase nếu khác). Lộ = status 2xx + nội dung khớp chữ ký + khác trang fallback của SPA. */
export async function checkExposure(t, { bases, extra = [] } = {}) {
  const list = [...EXPOSURE, ...extra.map((x) => ({ code: x.code || 'EX01', path: x.path, sig: x.sig ? new RegExp(x.sig, 'im') : { test: () => true }, what: x.what || 'đường dẫn của dự án' }))];
  const origins = bases || [...new Set([t.env.url, t.cfg.security?.apiBase ? t.cfg.security.apiBase.replace('{url}', t.env.url) : t.env.url])];
  const rows = [];
  for (const base of origins) {
    const fallback = await fetch(t, `${base}/__qa_not_found_${Date.now()}`);
    const tried = {}, hits = [];
    for (const x of list) {
      const res = await fetch(t, base + x.path);
      (tried[x.code] ||= []).push(x.path);
      const exposed = res.status >= 200 && res.status < 300 && x.sig.test(res.text) && normBody(res.text) !== normBody(fallback.text);
      if (exposed) hits.push({ code: x.code, item: `${base.replace(t.env.url, '') || '(env)'}${x.path} — ${x.what}`, expected: '403 | 404, không trả nội dung', actual: `${res.status} · ${cut(res.text.replace(/\s+/g, ' '), 70)}`, ok: false });
    }
    for (const [code, paths] of Object.entries(tried)) {
      if (!hits.some((h) => h.code === code)) rows.push({ code, item: `${base === t.env.url ? '' : base + ' · '}Đã dò ${paths.length} đường dẫn`, expected: 'Không lộ', actual: `Không lộ (${cut(paths.join(' '), 140)})`, ok: true });
    }
    rows.push(...hits);
  }
  return rows;
}

/** EX03: source map của JS công khai. html = nội dung trang (fetch().text), pageUrl để ghép đường dẫn tương đối. */
export async function checkSourceMaps(t, html, pageUrl, { max = 6 } = {}) {
  const origin = new URL(pageUrl).origin;
  const srcs = [...String(html).matchAll(/<script\b[^>]*\ssrc\s*=\s*["']?([^"'\s>]+)/gi), ...String(html).matchAll(/<link\b[^>]*rel\s*=\s*["']?modulepreload[^>]*href\s*=\s*["']?([^"'\s>]+)/gi)]
    .map((m) => { try { return new URL(m[1], pageUrl).href; } catch { return null; } })
    .filter((u) => u && u.startsWith(origin));
  const uniq = [...new Set(srcs)].slice(0, max);
  if (!uniq.length) return [{ code: 'EX03', item: 'Script cùng origin trên trang', expected: 'Có script để kiểm', actual: 'Không thấy <script src> cùng origin trong HTML', ok: null }];
  const rows = [];
  for (const js of uniq) {
    const r = await fetch(t, js);
    const m = /\/\/[#@]\s*sourceMappingURL\s*=\s*(\S+)\s*$/m.exec(r.text);
    const mapUrl = m && !m[1].startsWith('data:') ? new URL(m[1], js).href : js + '.map';
    const inline = m && m[1].startsWith('data:');
    const mr = inline ? null : await fetch(t, mapUrl);
    const exposed = inline || (mr.status === 200 && /"sources"\s*:/.test(mr.text) && /"mappings"\s*:/.test(mr.text));
    rows.push({ code: 'EX03', item: js.replace(origin, ''), expected: 'Không có source map công khai', actual: inline ? 'Source map nhúng trong file (data:)' : `${mapUrl.replace(origin, '')} → ${mr.status}${exposed ? ' · có "sources" (lộ mã nguồn)' : ''}`, ok: !exposed });
  }
  return rows;
}

/* ---------- SS02: token / cookie phiên bị sửa ---------- */
const b64u = { dec: (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')), enc: (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') };
export const isJwt = (s) => { const p = String(s || '').split('.'); if (p.length !== 3) return false; try { return !!b64u.dec(p[0]).alg; } catch { return false; } };
/** Biến thể của JWT: sửa payload giữ chữ ký, alg none, chữ ký sai. Không cần khóa ký — chỉ kiểm server có xác minh chữ ký hay không. */
export function jwtVariants(token) {
  const [h, p, s] = token.split('.');
  const head = b64u.dec(h), body = b64u.dec(p);
  const now = Math.floor(Date.now() / 1000);
  const changed = { ...body, exp: (body.exp || now) + 365 * 24 * 3600 };
  for (const k of ['role', 'roles', 'isAdmin', 'is_admin']) if (k in body) changed[k] = Array.isArray(body[k]) ? [...body[k], 'admin'] : typeof body[k] === 'boolean' ? true : 'admin';
  const flip = (x) => x.slice(0, -2) + (x.slice(-2) === 'AA' ? 'BB' : 'AA');
  return [
    { label: 'Sửa payload (exp +1 năm, role), giữ chữ ký cũ', value: `${h}.${b64u.enc(changed)}.${s}` },
    { label: 'alg: none, bỏ chữ ký', value: `${b64u.enc({ ...head, alg: 'none' })}.${p}.` },
    { label: 'Chữ ký sai', value: `${h}.${p}.${flip(s)}` },
    { label: 'exp đã qua, giữ chữ ký cũ', value: `${h}.${b64u.enc({ ...body, exp: now - 3600 })}.${s}` },
  ];
}
/** Biến thể của giá trị cookie phiên không phải JWT (giá trị mờ / đã ký). */
export function opaqueVariants(v) {
  const flip = (x) => x.slice(0, -1) + (x.slice(-1) === 'a' ? 'b' : 'a');
  return [{ label: 'Đổi 1 ký tự cuối', value: flip(v) }, { label: 'Cắt còn nửa', value: v.slice(0, Math.max(1, Math.floor(v.length / 2))) }, { label: 'Giá trị tự đặt', value: 'qa-forged-session-0000' }];
}

/** Payload dò chuẩn (rule 05). */
export const PAYLOADS = {
  int: [2147483648, -1, 1.5, 'abc'],
  xss: `<'"xss0"'>`,
  sqli: [`'`, `' OR '1'='1`, `1;--`],
  sqliBoolean: [`' AND '1'='1`, `' AND '1'='2`],          // so 2 response: khác nhau = có dấu hiệu blind SQLi
  xssEncoded: ['%3C%27%22xss0%22%27%3E', '&lt;xss0&gt;', '\\u003cxss0\\u003e'],
  traversal: ['../../etc/passwd', '..%2F..%2Fetc%2Fpasswd', '..%5c..%5cwindows%5cwin.ini', '%2e%2e%2f%2e%2e%2f'],
  long: 'a'.repeat(10000),
  csvFormula: '=1+1',
};

/** Vẽ bảng kết quả lên trang để runner chụp làm evidence; NG → t.fail(). ok=null → hiển thị "—" (bỏ qua, ghi note). */
export async function report(t, title, rows, { request = '', note = '' } = {}) {
  // Mục khách hàng đã chốt "theo đặc tả / chấp nhận rủi ro" (security.accepted) → không tính NG.
  const accepted = t.cfg.security?.accepted || {};
  for (const r of rows) {
    const hit = String(r.code).split(/[,\s]+/).find((c) => typeof accepted[c] === 'string' && !/<[^>]*>/.test(accepted[c]));
    if (hit && r.ok === false) { r.ok = null; r.actual = `${r.actual} → Chấp nhận: ${accepted[hit]}`; }
  }
  const ng = rows.filter((r) => r.ok === false), skip = rows.filter((r) => r.ok === null);
  const tr = rows.map((r) => `<tr class="${r.ok === false ? 'ng' : r.ok === null ? 'na' : 'ok'}"><td>${esc(r.code)}</td><td>${esc(r.item)}</td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td><td>${r.ok === false ? 'NG' : r.ok === null ? '—' : 'OK'}</td></tr>`).join('');
  await t.page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{font:13px/1.45 system-ui,"Segoe UI",sans-serif;margin:16px;color:#1b1b1b}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#555}
    table{border-collapse:collapse;width:100%}td,th{border:1px solid #c8c8c8;padding:5px 7px;vertical-align:top;text-align:left;word-break:break-all}
    th{background:#eef1f5}tr.ng td{background:#fde8e8}tr.ng td:last-child{color:#b00020;font-weight:700}tr.ok td:last-child{color:#0a7d32;font-weight:700}tr.na td{color:#777}
  </style><div id="sec-report" style="display:inline-block;min-width:900px"><h1>${esc(title)}</h1><p>${esc(t.env.url)}${request ? ' · ' + esc(request) : ''} · ${new Date().toISOString()}${note ? ' · ' + esc(note) : ''}</p>
  <table><tr><th>Mã</th><th>Mục kiểm tra</th><th>Mong đợi</th><th>Thực tế</th><th>KQ</th></tr>${tr}</table></div>`);
  t.focus(t.page.locator('#sec-report'));
  if (skip.length) t.note(`Bỏ qua: ${skip.map((r) => `${r.code} ${r.actual}`).join('; ')}`);
  if (ng.length) t.fail(ng.map((r) => `${r.code} ${r.item}: thực tế「${r.actual}」`).join(' / '));
  if (rows.length && skip.length === rows.length) t.na(`Tất cả mục bị bỏ qua: ${skip.map((r) => r.actual).join('; ')}`);
  return `${rows.length - skip.length} mục OK`;
}
