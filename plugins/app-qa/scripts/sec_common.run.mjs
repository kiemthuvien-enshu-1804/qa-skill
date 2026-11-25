#!/usr/bin/env node
// BỘ TEST CASE BẢO MẬT COMMON — chạy được cho mọi webapp, chỉ cần khối "security" trong qa-config.json (rule 05_Security_Checklist).
// Chạy tại thư mục QA của dự án:
//   APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node "${CLAUDE_PLUGIN_ROOT}/scripts/sec_common.run.mjs" --env test --out runs/<stamp>-SEC_Common [--only TC-SEC-COMMON-01,...] [--build <ver>]
// Xuất CSV (để import TestRail / lưu vào TESTCASE của dự án):
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/sec_common.run.mjs" --csv <docs.testing>/TESTCASE/SEC_Common_TestCase.csv
// Danh sách TC + Steps/Expected nằm trong CASES bên dưới — CSV và code chạy luôn khớp nhau. Sửa TC thì sửa ở đây.
// TC-SEC-COMMON-16 (khóa tài khoản) cố ý để cuối: nó khóa tài khoản security.lockoutAccount.
import fs from 'node:fs';
import { parseArgs, toCsv, loadConfig } from './lib.mjs';
import * as sec from './sec_checks.mjs';

const MOD = 'SEC - Bảo mật (Common)';
const R = (rules, src, auto = 'HTTP') => `Rule: ${rules} | Nguồn: 05_Security_Checklist (${src}) | Tự động: ${auto} | Bộ: Common`;
const CASES = [
  { id: 'TC-SEC-COMMON-01', name: 'Header bảo mật của trang HTML công khai', f: 'SEC-HDR', p: 'P3', pre: 'security.pages.public đã cấu hình (vd trang login)',
    steps: '1. GET security.pages.public (không đăng nhập), không theo redirect\n2. Đọc response header',
    exp: '1. Status 200 (hoặc 3xx của trang login)\n2. CSP có default-src/script-src, không *, có frame-ancestors none/self; HSTS max-age ≥ 31536000 (env HTTPS); X-Content-Type-Options: nosniff; X-Frame-Options DENY/SAMEORIGIN; không có X-Powered-By, Server không ghi phiên bản; Referrer-Policy no-referrer/same-origin/strict-origin(-when-cross-origin); HTML không nạp tài nguyên http:// (env HTTPS) [Baseline]',
    rm: R('HDR01, HDR02, HDR03, HDR04, HDR05, HDR08, HDR11, HDR13', 'UB#2,3,4,22,24') },
  { id: 'TC-SEC-COMMON-02', name: 'Header bảo mật của trang HTML sau đăng nhập', f: 'SEC-HDR', p: 'P2', pre: 'security.account đăng nhập được; security.pages.authed đã cấu hình',
    steps: '1. Đăng nhập bằng API (security.login) với security.account\n2. GET security.pages.authed\n3. Đọc response header',
    exp: '1. Đăng nhập thành công\n2. Status 200\n3. Như TC-SEC-COMMON-01 và thêm Cache-Control chứa no-store [Baseline]',
    rm: R('HDR01, HDR02, HDR04, HDR05, HDR06, HDR11, HDR13', 'UB#2,3,7,22,24') },
  { id: 'TC-SEC-COMMON-03', name: 'Header của API JSON sau đăng nhập', f: 'SEC-HDR', p: 'P2', pre: 'security.me (API trả thông tin user đang đăng nhập) đã cấu hình',
    steps: '1. Đăng nhập bằng API với security.account\n2. GET security.me\n3. Đọc response header',
    exp: '1. Đăng nhập thành công\n2. Status 200, Content-Type application/json\n3. X-Content-Type-Options: nosniff; Cache-Control chứa no-store; không có X-Powered-By / phiên bản Server [Baseline]',
    rm: R('HDR04, HDR06, HDR08', 'UB#7,22') },
  { id: 'TC-SEC-COMMON-04', name: 'Header của file tải về (export/download)', f: 'SEC-HDR', p: 'P3', pre: 'security.download đã cấu hình (không có chức năng tải file → NA)',
    steps: '1. Đăng nhập bằng API với security.account\n2. GET security.download\n3. Đọc response header',
    exp: '1. Đăng nhập thành công\n2. Status 200\n3. X-Download-Options: noopen; Content-Disposition: attachment [Baseline]',
    rm: R('HDR07', 'UB#23') },
  { id: 'TC-SEC-COMMON-05', name: 'CORS với Origin lạ', f: 'SEC-HDR', p: 'P2', pre: 'security.me đã cấu hình',
    steps: '1. Đăng nhập bằng API với security.account\n2. GET security.me kèm header Origin: https://evil.example\n3. Đọc Access-Control-Allow-Origin / -Credentials',
    exp: '1. Đăng nhập thành công\n2. Có response\n3. Không phản chiếu https://evil.example, không trả * kèm Allow-Credentials: true [Baseline]',
    rm: R('HDR09', 'ASVS V14') },
  { id: 'TC-SEC-COMMON-06', name: 'Chuyển HTTP sang HTTPS', f: 'SEC-HDR', p: 'P3', pre: 'Env dùng HTTPS (env http như local → NA)',
    steps: '1. GET http://<host>/ của env, không theo redirect',
    exp: '1. Redirect 301/308 sang https://<host>/ [Baseline]',
    rm: R('HDR10', 'ASVS V9') },
  { id: 'TC-SEC-COMMON-07', name: 'Thuộc tính cookie phiên sau đăng nhập', f: 'SEC-CK', p: 'P2', pre: 'security.sessionCookies khớp tên cookie phiên của dự án',
    steps: '1. Đăng nhập bằng API với security.account\n2. Đọc Set-Cookie của cookie phiên',
    exp: '1. Đăng nhập thành công\n2. HttpOnly; Secure (env HTTPS); SameSite Lax/Strict; tên có __Host- + Path=/ + không Domain; không có Max-Age/Expires [Baseline]',
    rm: R('CK01, CK02, CK03, CK04, CK05', 'UB#8,11') },
  { id: 'TC-SEC-COMMON-08', name: 'Không lưu thông tin quyền ở nơi JS đọc/sửa được', f: 'SEC-CK', p: 'P2', pre: 'apps.<app>.login + security.account đăng nhập UI được (cần OTP → MANUAL)',
    steps: '1. Đăng nhập bằng màn hình login với security.account\n2. Đọc document.cookie, localStorage, sessionStorage',
    exp: '1. Vào được màn hình sau đăng nhập\n2. Không có role / permission / tenant / isAdmin ở cookie không HttpOnly hoặc storage [Baseline]',
    rm: R('CK06', 'UB#12', 'UI') },
  { id: 'TC-SEC-COMMON-09', name: 'Đăng xuất hủy phiên phía server', f: 'SEC-CK', p: 'P1', pre: 'security.logout, security.me đã cấu hình',
    steps: '1. Đăng nhập bằng API với security.account, lưu cookie phiên / token\n2. GET security.me\n3. Gọi security.logout\n4. Gắn lại cookie / token đã lưu, GET security.me',
    exp: '1. Đăng nhập thành công\n2. Status 200\n3. Đăng xuất thành công (2xx/3xx)\n4. Status 401 (phiên cũ không còn dùng được) [Baseline]',
    rm: R('CK07', 'ASVS V3') },
  { id: 'TC-SEC-COMMON-10', name: 'Thời hạn phiên đăng nhập', f: 'SEC-AU', p: 'P2', pre: 'security.login.tokenPath (JWT) hoặc cookie phiên có Max-Age; security.maxSessionHours (mặc định 24)',
    steps: '1. Đăng nhập bằng API với security.account\n2. Đọc exp - iat của JWT, nếu không có thì Max-Age của cookie phiên',
    exp: '1. Đăng nhập thành công\n2. Thời hạn ≤ security.maxSessionHours giờ (theo đặc tả nếu có) [Baseline]',
    rm: R('AU05', 'UB#11') },
  { id: 'TC-SEC-COMMON-11', name: 'API cần đăng nhập từ chối request không có phiên hợp lệ', f: 'SEC-AZ', p: 'P1', pre: 'security.authApis liệt kê các API cần đăng nhập (GET, không đổi dữ liệu)',
    steps: '1. Không đăng nhập, GET từng API trong security.authApis\n2. GET lại kèm Authorization: Bearer <chuỗi không hợp lệ>',
    exp: '1. Mọi API trả 401 (hoặc 403), không trả dữ liệu, không lộ lỗi nội bộ\n2. Như bước 1 [Baseline]',
    rm: R('AZ05', 'ASVS V4') },
  { id: 'TC-SEC-COMMON-12', name: 'Đăng nhập sai không lộ tài khoản có tồn tại', f: 'SEC-AU', p: 'P2', pre: 'security.login đã cấu hình',
    steps: '1. Đăng nhập với email không tồn tại (qa-nouser-<số ngẫu nhiên>@example.invalid)\n2. Đăng nhập với email của security.account + mật khẩu sai',
    exp: '1. Bị từ chối\n2. Bị từ chối với cùng status và cùng message như bước 1 [Baseline]',
    rm: R('AU04', 'ASVS V2') },
  { id: 'TC-SEC-COMMON-13', name: 'Yêu cầu reset mật khẩu không lộ tài khoản có tồn tại', f: 'SEC-RS', p: 'P2', pre: 'security.reset.path + security.reset.testEmail (email test nhận được mail)',
    steps: '1. Gửi yêu cầu reset với email không tồn tại\n2. Gửi yêu cầu reset với security.reset.testEmail',
    exp: '1. Response trả về bình thường\n2. Cùng status và cùng message như bước 1 [Baseline]',
    rm: R('RS01', 'UB#10, ASVS V2') },
  { id: 'TC-SEC-COMMON-14', name: 'Lỗi không lộ thông tin nội bộ', f: 'SEC-IN', p: 'P2', pre: 'security.login, security.me đã cấu hình',
    steps: '1. POST security.login với body JSON sai cú pháp\n2. GET một API không tồn tại (/api/__qa_not_found__)\n3. Đăng nhập, GET security.me?page=abc&id=2147483648',
    exp: '1. 4xx, không có stack trace / đường dẫn file / câu SQL\n2. 404, như bước 1\n3. 2xx hoặc 4xx (không 5xx), như bước 1 [Baseline]',
    rm: R('IN04', 'ASVS V7') },
  { id: 'TC-SEC-COMMON-15', name: 'Giới hạn số lần gửi mail reset mật khẩu', f: 'SEC-RS', p: 'P2', pre: 'security.reset.mailCap = ngưỡng theo đặc tả (mặc định 5); chạy sau TC-SEC-COMMON-13',
    steps: '1. Gửi yêu cầu reset cho security.reset.testEmail liên tục mailCap + 2 lần',
    exp: '1. Các lần vượt ngưỡng bị từ chối (429 hoặc message giới hạn) [Baseline]',
    rm: R('RS06', 'UB#10') },
  { id: 'TC-SEC-COMMON-16', name: 'Khóa tài khoản khi đăng nhập sai liên tiếp', f: 'SEC-AU', p: 'P1', pre: 'security.lockoutAccount = tài khoản test riêng (sẽ bị khóa); security.lockout.threshold = ngưỡng theo đặc tả (mặc định 5). Chạy cuối cùng',
    steps: '1. Đăng nhập sai mật khẩu threshold lần với security.lockoutAccount\n2. Đăng nhập sai thêm 1 lần\n3. Đăng nhập đúng mật khẩu',
    exp: '1. Bị từ chối\n2. Bị từ chối do khóa (429/423 hoặc message khóa)\n3. Vẫn bị từ chối trong thời gian khóa [Baseline]',
    rm: R('AU03', 'UB#25') },
  // 17–21: bổ sung theo WebApp_Security_Test_Cases.xlsx. Vẫn chạy TRƯỚC TC-SEC-COMMON-16 (16 khóa tài khoản nên luôn chạy cuối).
  { id: 'TC-SEC-COMMON-17', name: 'Không lộ file cấu hình, backup, log, thư mục và công cụ debug qua web', f: 'SEC-EX', p: 'P1', pre: 'Env trong security.allowedEnvs. Đường dẫn riêng của dự án (nếu có) thêm ở security.exposurePaths',
    steps: '1. Không đăng nhập, GET một đường dẫn không tồn tại để lấy trang fallback\n2. GET lần lượt danh sách dò: /.env*, /.git/HEAD, /.git/config, /.DS_Store, file backup (.bak, .sql, .zip), file log, /uploads/ /storage/ /static/…, công cụ debug (Debugbar, Telescope, Horizon, Actuator, server-status, pprof, Nuxt DevTools, Symfony Profiler) trên env.url và security.apiBase\n3. So nội dung với chữ ký của từng loại file',
    exp: '1. Có response\n2. Mọi đường dẫn trả 403/404 hoặc trang fallback, không trả nội dung file\n3. Không đường dẫn nào khớp chữ ký (biến môi trường, repo git, dump SQL, "Index of", trang debug) [Baseline]',
    rm: R('EX01, EX02, EX04', 'xlsx INFO-003,004,005,007,009') },
  { id: 'TC-SEC-COMMON-18', name: 'Không công khai source map của JavaScript', f: 'SEC-EX', p: 'P3', pre: 'security.pages.public đã cấu hình',
    steps: '1. GET security.pages.public, lấy các <script src> cùng origin (tối đa 6)\n2. Với từng file JS: đọc sourceMappingURL, nếu không có thì thử <file>.js.map\n3. GET file map',
    exp: '1. Có script\n2. Không có sourceMappingURL dạng data: nhúng sẵn\n3. 403/404, không trả JSON có "sources"/"mappings" [Baseline]',
    rm: R('EX03', 'xlsx INFO-010') },
  { id: 'TC-SEC-COMMON-19', name: 'Tắt method TRACE / TRACK', f: 'SEC-HDR', p: 'P3', pre: 'security.pages.public đã cấu hình; security.me (tuỳ chọn)',
    steps: '1. Gửi TRACE và TRACK tới security.pages.public\n2. Gửi TRACE tới security.me (env.url và security.apiBase)',
    exp: '1. 405/501/400/403/404, không phản hồi lại nội dung request\n2. Như bước 1 [Baseline]',
    rm: R('HDR12', 'xlsx ADV-009, API-009') },
  { id: 'TC-SEC-COMMON-20', name: 'Đổi session ID khi đăng nhập (chống session fixation)', f: 'SEC-SS', p: 'P2', pre: 'security.sessionCookies, security.pages.public đã cấu hình',
    steps: '1. Xóa cookie, GET security.pages.public (và trang login), ghi lại cookie phiên trước đăng nhập\n2. Đặt cookie phiên bằng giá trị tự chọn (qa-fixed-…)\n3. Đăng nhập bằng API với security.account\n4. Đọc cookie phiên sau đăng nhập',
    exp: '1. Ghi nhận được (không có cookie phiên trước đăng nhập → OK)\n2. Đã đặt\n3. Đăng nhập thành công\n4. Giá trị cookie phiên khác giá trị trước đăng nhập và khác giá trị tự đặt [Baseline]',
    rm: R('SS01', 'xlsx AUTH-010, SES-004') },
  { id: 'TC-SEC-COMMON-21', name: 'Token / cookie phiên bị sửa bị từ chối', f: 'SEC-SS', p: 'P1', pre: 'security.me đã cấu hình; đăng nhập trả JWT (login.tokenPath) hoặc cookie phiên',
    steps: '1. Đăng nhập bằng API với security.account, GET security.me (mốc 200)\n2. JWT: gửi lại security.me với từng biến thể — sửa payload giữ chữ ký, alg: none, chữ ký sai, exp đã qua\n3. Cookie phiên: thay giá trị cookie bằng từng biến thể (JWT như bước 2; giá trị khác: đổi 1 ký tự, cắt nửa, tự đặt) rồi GET security.me',
    exp: '1. Status 200\n2. Mọi biến thể trả 401/403 (hoặc chuyển về login), không trả dữ liệu\n3. Như bước 2 [Baseline]',
    rm: R('SS02, AZ05', 'xlsx API-002,003,004,005, SES-010') },
];

const args = parseArgs();
if (args.csv) {
  const head = ['Test Case ID', 'Test Case Name', 'Feature ID', 'Feature Name', 'Module', 'Priority', 'Pre-Condition', 'Steps', 'Expected Result', 'Actual Result', 'Status', 'Date Tested', 'Tested By', 'Remarks'];
  const FN = { 'SEC-HDR': 'Response header', 'SEC-CK': 'Cookie và phiên', 'SEC-AU': 'Xác thực', 'SEC-RS': 'Reset mật khẩu', 'SEC-AZ': 'Phân quyền', 'SEC-IN': 'Kiểm tra input', 'SEC-EX': 'Lộ thông tin', 'SEC-SS': 'Phiên đăng nhập' };
  const rows = CASES.map((c) => ({ 'Test Case ID': c.id, 'Test Case Name': c.name, 'Feature ID': c.f, 'Feature Name': FN[c.f], Module: MOD, Priority: c.p, 'Pre-Condition': c.pre, Steps: c.steps, 'Expected Result': c.exp, Remarks: c.rm }));
  fs.writeFileSync(args.csv, toCsv(head, rows));
  console.log(`Đã ghi ${rows.length} TC → ${args.csv}`);
  process.exit(0);
}

const { defineRun } = await import('./runner.mjs');
const NAME = Object.fromEntries(CASES.map((c) => [c.id, c.name]));

defineRun({ module: 'SEC_Common', app: loadConfig().security?.app || 'admin' }, ({ tc, cfg }) => {
  const S = cfg.security || {};
  const need = (t, v, key) => { if (!v || (typeof v === 'string' && /<[^>]*>/.test(v))) t.na(`Chưa cấu hình security.${key}`); return v; };
  const acct = (t) => need(t, S.account, 'account');
  const login = async (t) => { const r = await sec.apiLogin(t, acct(t)); if (!r.ok) t.fail(`Đăng nhập ${S.account} thất bại: ${r.res.summary} ${r.res.text.slice(0, 120)}`); return r; };
  const T = (t, id) => `${id} ${NAME[id]}`;
  const add = (id, fn, opts) => tc(id, NAME[id], async (t) => { sec.guardEnv(t); return fn(t, id); }, opts);

  add('TC-SEC-COMMON-01', async (t, id) => {
    const res = await sec.fetch(t, need(t, S.pages?.public, 'pages.public'));
    return sec.report(t, T(t, id), sec.checkHeaders(res, ['HDR01', 'HDR02', 'HDR03', 'HDR04', 'HDR05', 'HDR08', 'HDR11', 'HDR13']), { request: res.summary });
  });
  add('TC-SEC-COMMON-02', async (t, id) => {
    const page = need(t, S.pages?.authed, 'pages.authed'); const L = await login(t);
    const res = await sec.fetch(t, page, { token: L.token });
    const rows = sec.checkHeaders(res, ['HDR01', 'HDR02', 'HDR04', 'HDR05', 'HDR06', 'HDR11', 'HDR13']);
    if (res.status >= 300) rows.unshift({ code: '-', item: 'Status trang sau đăng nhập', expected: '200', actual: String(res.status), ok: null });
    return sec.report(t, T(t, id), rows, { request: res.summary });
  });
  add('TC-SEC-COMMON-03', async (t, id) => {
    const me = need(t, S.me, 'me'); const L = await login(t);
    const res = await sec.fetch(t, me, { token: L.token });
    if (res.status !== 200) t.fail(`GET ${me} trả ${res.status} sau khi đăng nhập — kiểm security.me`);
    return sec.report(t, T(t, id), sec.checkHeaders(res, ['HDR04', 'HDR06', 'HDR08']), { request: res.summary });
  });
  add('TC-SEC-COMMON-04', async (t, id) => {
    const dl = need(t, S.download, 'download'); const L = await login(t);
    const res = await sec.fetch(t, dl, { token: L.token });
    return sec.report(t, T(t, id), sec.checkHeaders(res, ['HDR07']), { request: res.summary });
  });
  add('TC-SEC-COMMON-05', async (t, id) => {
    const me = need(t, S.me, 'me'); const L = await login(t);
    return sec.report(t, T(t, id), await sec.checkCors(t, me, { token: L.token }));
  });
  add('TC-SEC-COMMON-06', async (t, id) => {
    if (!/^https:/.test(t.env.url)) t.na('Env không dùng HTTPS');
    const res = await sec.fetch(t, t.env.url.replace(/^https:/, 'http:') + '/');
    const loc = res.headers.location || '';
    return sec.report(t, T(t, id), [{ code: 'HDR10', item: 'GET http://', expected: '301 | 308 → https://', actual: `${res.status} ${loc || '(không có Location)'}`, ok: [301, 308].includes(res.status) && /^https:/.test(loc) }], { request: res.summary });
  });
  add('TC-SEC-COMMON-07', async (t, id) => {
    const L = await login(t);
    return sec.report(t, T(t, id), sec.checkCookies(t, L.res.setCookies), { request: L.res.summary });
  });
  add('TC-SEC-COMMON-08', async (t, id) => {
    await t.login(acct(t));
    return sec.report(t, T(t, id), await sec.checkClientStorage(t), { request: t.page.url() });
  });
  add('TC-SEC-COMMON-09', async (t, id) => {
    const me = need(t, S.me, 'me'), out = need(t, S.logout?.path, 'logout.path');
    const L = await login(t);
    const saved = await t.ctx.cookies();
    const before = await sec.fetch(t, me, { token: L.token });
    const lo = await sec.fetch(t, out, { method: S.logout.method || 'POST', token: L.token, data: S.logout.body });
    await t.ctx.clearCookies(); await t.ctx.addCookies(saved);
    const after = await sec.fetch(t, me, { token: L.token });
    return sec.report(t, T(t, id), [
      { code: 'CK07', item: `Trước đăng xuất: ${before.summary}`, expected: '200', actual: String(before.status), ok: before.status === 200 ? true : null },
      { code: 'CK07', item: `Đăng xuất: ${lo.summary}`, expected: '2xx | 3xx', actual: String(lo.status), ok: lo.status < 400 ? true : null },
      { code: 'CK07', item: `Dùng lại phiên cũ: ${after.summary}`, expected: '401 | 403', actual: `${after.status} · ${after.text.slice(0, 80)}`, ok: [401, 403].includes(after.status) },
    ]);
  });
  add('TC-SEC-COMMON-10', async (t, id) => {
    const L = await login(t); const max = S.maxSessionHours || 24;
    let h = sec.jwtLifetimeHours(L.token), src = 'JWT exp - iat';
    if (h == null) {
      const names = (S.sessionCookies || []).map((n) => new RegExp(n, 'i'));
      const c = L.res.setCookies.map(sec.parseSetCookie).find((x) => names.some((re) => re.test(x.name)));
      if (c?.attrs['max-age']) { h = +c.attrs['max-age'] / 3600; src = `Max-Age của ${c.name}`; }
    }
    if (h == null) t.na('Không đọc được thời hạn phiên (token không phải JWT, cookie phiên không có Max-Age) — kiểm theo đặc tả / hỏi dev');
    return sec.report(t, T(t, id), [{ code: 'AU05', item: `Thời hạn phiên (${src})`, expected: `≤ ${max} giờ`, actual: `${+h.toFixed(2)} giờ`, ok: h <= max }]);
  });
  add('TC-SEC-COMMON-11', async (t, id) => {
    const apis = need(t, S.authApis, 'authApis');
    const calls = apis.flatMap((p) => [{ path: p, label: 'không có phiên', expect: [401, 403] }, { path: p, label: 'Bearer không hợp lệ', headers: { Authorization: 'Bearer qa.invalid.token' }, expect: [401, 403] }]);
    return sec.report(t, T(t, id), await sec.probe(t, calls, { code: 'AZ05', api: false }));
  });
  add('TC-SEC-COMMON-12', async (t, id) => {
    const { user } = sec.creds(t, acct(t));
    const a = await sec.apiLogin(t, null, { user: `qa-nouser-${Date.now()}@example.invalid`, pass: 'Wrong-Passw0rd-QA' });
    const b = await sec.apiLogin(t, null, { user, pass: 'Wrong-Passw0rd-QA' });
    return sec.report(t, T(t, id), [{ code: 'AU04', item: 'Email không tồn tại vs email tồn tại + sai mật khẩu', expected: 'Cùng status, cùng message', actual: `${a.res.status} 「${a.res.text.slice(0, 70)}」 vs ${b.res.status} 「${b.res.text.slice(0, 70)}」`, ok: sec.sameResponse(a.res, b.res) && a.res.status >= 400 }]);
  });
  const reset = async (t, email) => sec.fetch(t, need(t, S.reset?.path, 'reset.path'), { method: S.reset.method || 'POST', data: sec.fillBody(S.reset.body || { email: '{email}' }, { email }) });
  add('TC-SEC-COMMON-13', async (t, id) => {
    const mail = need(t, S.reset?.testEmail, 'reset.testEmail');
    const a = await reset(t, `qa-nouser-${Date.now()}@example.invalid`), b = await reset(t, mail);
    return sec.report(t, T(t, id), [{ code: 'RS01', item: 'Email không tồn tại vs email tồn tại', expected: 'Cùng status, cùng message', actual: `${a.status} 「${a.text.slice(0, 70)}」 vs ${b.status} 「${b.text.slice(0, 70)}」`, ok: sec.sameResponse(a, b) }]);
  });
  add('TC-SEC-COMMON-14', async (t, id) => {
    const me = need(t, S.me, 'me'), lp = need(t, S.login?.path, 'login.path');
    const rows = await sec.probe(t, [
      { method: 'POST', path: lp, label: 'JSON sai cú pháp', data: Buffer.from('{"email":'), headers: { 'Content-Type': 'application/json' }, expect: (s) => s >= 400 && s < 500, expectLabel: '4xx' },
      { path: '/api/__qa_not_found__', label: 'API không tồn tại', expect: [404, 401, 403] },
    ], { code: 'IN04', api: false });
    const L = await login(t);
    rows.push(...await sec.probe(t, [{ path: `${me}${me.includes('?') ? '&' : '?'}page=abc&id=2147483648`, label: 'tham số sai kiểu / tràn số', token: L.token, expect: (s) => s < 500, expectLabel: 'không 5xx' }], { code: 'IN04', api: false }));
    return sec.report(t, T(t, id), rows);
  });
  add('TC-SEC-COMMON-15', async (t, id) => {
    const mail = need(t, S.reset?.testEmail, 'reset.testEmail'), cap = S.reset?.mailCap || 5;
    const st = [];
    for (let i = 0; i < cap + 2; i++) st.push((await reset(t, mail)).status);
    const over = st.slice(cap);
    return sec.report(t, T(t, id), [{ code: 'RS06', item: `Gửi ${cap + 2} lần (ngưỡng ${cap})`, expected: 'Các lần vượt ngưỡng bị từ chối (4xx)', actual: st.join(', '), ok: over.every((s) => s >= 400) }]);
  });
  const apiOrigin = (t) => (S.apiBase ? S.apiBase.replace('{url}', t.env.url) : t.env.url);
  const sessRe = () => (S.sessionCookies || []).map((n) => new RegExp(n, 'i'));
  const isSess = (name) => sessRe().some((re) => re.test(name));

  add('TC-SEC-COMMON-17', async (t, id) => {
    const rows = await sec.checkExposure(t, { extra: S.exposurePaths || [] });
    return sec.report(t, T(t, id), rows);
  });
  add('TC-SEC-COMMON-18', async (t, id) => {
    const res = await sec.fetch(t, need(t, S.pages?.public, 'pages.public'));
    return sec.report(t, T(t, id), await sec.checkSourceMaps(t, res.text, res.url), { request: res.summary });
  });
  add('TC-SEC-COMMON-19', async (t, id) => {
    const pub = need(t, S.pages?.public, 'pages.public');
    const targets = [[t.env.url + pub, 'TRACE'], [t.env.url + pub, 'TRACK']];
    if (S.me && !/<[^>]*>/.test(S.me)) for (const o of new Set([t.env.url, apiOrigin(t)])) targets.push([o + S.me, 'TRACE']);
    const rows = [];
    for (const [url, method] of targets) {
      let res;
      try { res = await sec.fetch(t, url, { method, headers: { 'X-QA-Trace': 'qa-trace-probe' } }); }
      catch (e) { rows.push({ code: 'HDR12', item: `${method} ${url.replace(t.env.url, '')}`, expected: '405 | 501 | 4xx', actual: `Kết nối bị từ chối (${String(e.message).split('\n')[0].slice(0, 60)})`, ok: true }); continue; }
      const echo = /qa-trace-probe/i.test(res.text) || /^TRACE\s/m.test(res.text);
      rows.push({ code: 'HDR12', item: `${method} ${url.replace(t.env.url, '')}`, expected: '405 | 501 | 4xx, không phản hồi lại request', actual: `${res.status}${echo ? ' · phản hồi lại header request' : ''}`, ok: !(res.status >= 200 && res.status < 300) && !echo });
    }
    return sec.report(t, T(t, id), rows);
  });
  add('TC-SEC-COMMON-20', async (t, id) => {
    const pub = need(t, S.pages?.public, 'pages.public'); acct(t);
    await t.ctx.clearCookies();
    await sec.fetch(t, pub, { maxRedirects: 5 });
    const loginPage = t.cfg.apps?.[S.app || 'admin']?.login?.path;
    if (loginPage && !loginPage.includes('{')) await sec.fetch(t, loginPage, { maxRedirects: 5 });
    const pre = (await t.ctx.cookies()).filter((c) => isSess(c.name));
    const planted = pre.map((c) => ({ ...c, value: `qa-fixed-${Date.now()}` }));
    if (planted.length) await t.ctx.addCookies(planted);
    const L = await login(t);
    const post = (await t.ctx.cookies()).filter((c) => isSess(c.name));
    if (!pre.length) {
      return sec.report(t, T(t, id), [{ code: 'SS01', item: 'Cookie phiên trước đăng nhập', expected: 'Không có, hoặc đổi giá trị sau đăng nhập', actual: `Không có cookie phiên trước đăng nhập — sau đăng nhập: ${post.map((c) => c.name).join(', ') || (L.token ? 'dùng Bearer token' : 'không có')}`, ok: true }]);
    }
    const rows = pre.map((c, i) => {
      const after = post.find((x) => x.name === c.name);
      const same = after && (after.value === c.value || after.value === planted[i].value);
      return { code: 'SS01', item: `${c.name}: trước / tự đặt / sau đăng nhập`, expected: 'Giá trị sau đăng nhập khác cả 2 giá trị trước', actual: after ? `${same ? 'GIỮ NGUYÊN' : 'Đã đổi'} (${after.value === planted[i].value ? 'nhận giá trị tự đặt' : 'giá trị mới'})` : 'Cookie bị xóa sau đăng nhập (dùng tên khác)', ok: !same };
    });
    return sec.report(t, T(t, id), rows);
  });
  add('TC-SEC-COMMON-21', async (t, id) => {
    const me = need(t, S.me, 'me'); const L = await login(t);
    const saved = await t.ctx.cookies();
    const base = await sec.fetch(t, me, { token: L.token });
    if (base.status !== 200) t.fail(`GET ${me} trả ${base.status} sau khi đăng nhập — kiểm security.me`);
    const rejected = (s) => s === 401 || s === 403 || (s >= 300 && s < 400);
    const rows = [];
    const tryIt = async (label, { token, cookies }) => {
      await t.ctx.clearCookies(); if (cookies) await t.ctx.addCookies(cookies);
      const r = await sec.fetch(t, me, { token });
      rows.push({ code: 'SS02', item: label, expected: '401 | 403 | chuyển về login', actual: `${r.status} · ${r.text.replace(/\s+/g, ' ').slice(0, 70)}`, ok: rejected(r.status) });
    };
    const sessCookies = saved.filter((c) => isSess(c.name));
    if (L.token && sec.isJwt(L.token)) for (const v of sec.jwtVariants(L.token)) await tryIt(`Bearer: ${v.label}`, { token: v.value, cookies: saved.filter((c) => !isSess(c.name)) });
    else if (L.token) await tryIt('Bearer: đổi 1 ký tự cuối', { token: L.token.slice(0, -1) + (L.token.endsWith('a') ? 'b' : 'a'), cookies: saved.filter((c) => !isSess(c.name)) });
    for (const c of sessCookies) {
      const vs = sec.isJwt(c.value) ? sec.jwtVariants(c.value) : sec.opaqueVariants(c.value);
      for (const v of vs) await tryIt(`Cookie ${c.name}: ${v.label}`, { cookies: saved.map((x) => (x.name === c.name ? { ...x, value: v.value } : x)) });
    }
    await t.ctx.clearCookies(); await t.ctx.addCookies(saved);
    if (!rows.length) t.na('Không có JWT trong response đăng nhập và không có cookie khớp security.sessionCookies');
    return sec.report(t, T(t, id), rows, { request: base.summary });
  });

  add('TC-SEC-COMMON-16', async (t, id) => {
    const acc = need(t, S.lockoutAccount, 'lockoutAccount'), n = S.lockout?.threshold || 5;
    const st = [];
    for (let i = 0; i < n + 1; i++) st.push((await sec.apiLogin(t, acc, { pass: `Wrong-Passw0rd-${i}` })).res.status);
    const ok = await sec.apiLogin(t, acc);
    return sec.report(t, T(t, id), [
      { code: 'AU03', item: `Sai mật khẩu ${n + 1} lần (ngưỡng ${n})`, expected: 'Bị từ chối', actual: st.join(', '), ok: st.every((s) => s >= 400) },
      { code: 'AU03', item: 'Đăng nhập đúng mật khẩu sau khi vượt ngưỡng', expected: 'Vẫn bị từ chối (đang khóa)', actual: `${ok.res.status} · ${ok.res.text.slice(0, 80)}`, ok: !ok.ok },
    ], { note: `Tài khoản ${acc} đang bị khóa — chờ hết thời gian khóa hoặc nhờ dev mở` });
  });
});
