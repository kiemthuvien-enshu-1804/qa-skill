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
    let ok = expect.includes(res.status);
    const leak = /(\bat\s+\S+\s+\(|\.(ts|js|php|java|py):\d+|SQLSTATE|syntax error|ORA-\d+|Exception\b|Traceback)/i.test(res.text);
    if (c.noLeak !== false && leak) ok = false;
    rows.push({ code: c.code || code, item: `${c.method || 'GET'} ${c.path}${c.label ? ` (${c.label})` : ''}`, expected: expect.join(' | ') + (c.noLeak !== false ? ', không lộ lỗi nội bộ' : ''), actual: `${res.status}${leak ? ' · LỘ LỖI NỘI BỘ' : ''} · ${cut(res.text.replace(/\s+/g, ' '), 90)}`, ok });
  }
  return rows;
}

/** Payload dò chuẩn (rule 05). */
export const PAYLOADS = {
  int: [2147483648, -1, 1.5, 'abc'],
  xss: `<'"xss0"'>`,
  sqli: [`'`, `' OR '1'='1`, `1;--`],
  long: 'a'.repeat(10000),
  csvFormula: '=1+1',
};

/** Vẽ bảng kết quả lên trang để runner chụp làm evidence; NG → t.fail(). ok=null → hiển thị "—" (bỏ qua, ghi note). */
export async function report(t, title, rows, { request = '', note = '' } = {}) {
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
