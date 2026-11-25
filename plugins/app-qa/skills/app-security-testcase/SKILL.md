---
name: app-security-testcase
description: Kiểm tra bảo mật webapp theo danh mục 05_Security_Checklist (rút từ báo cáo chẩn đoán UBsecure + OWASP ASVS, đã đối chiếu đủ 137 case của WebApp_Security_Test_Cases.xlsx), chia 2 phần — (1) BỘ COMMON cố định 21 TC (header, cookie, logout, thời hạn phiên, API chưa đăng nhập, lộ tài khoản, khóa tài khoản, giới hạn mail reset, lộ lỗi nội bộ, lộ file .env/.git/backup/debug/source map, TRACE, session fixation, token bị sửa) chạy ngay bằng sec_common.run.mjs sau khi điền khối security trong qa-config; (2) TC RIÊNG của dự án (phân quyền/IDOR/tenant, phiên, API, logic nghiệp vụ, CMS, chính sách mật khẩu, reset/mời, upload, input, CSRF, SSRF) sinh thành SEC_Rieng_TestCase.csv. Dùng khi được yêu cầu "test bảo mật/security", "chuẩn bị trước chẩn đoán bảo mật", "kiểm lại các lỗi UBsecure".
---

# Kiểm tra bảo mật (rule 05)

**Đọc trước:** `${CLAUDE_PLUGIN_ROOT}/templates/rules/05_Security_Checklist.md` (danh mục, phạm vi an toàn, phần Common / TC riêng, quy tắc gộp S1–S5). Nếu dự án có `RULES/05_*.md` thì **rule của dự án được ưu tiên**. Phần TC riêng theo định dạng của `RULES/01_*.md` (Phần A–F, priority, tối đa 6 bước).

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; T="<docs.repo>/<docs.testing>"
```

Làm **1 lần cho cả webapp**. Chạy lại khi có thay đổi lớn (thêm role, đổi cách login, thêm upload) và trước mỗi đợt chẩn đoán.

## Bước 1. Điền khối `security` trong `qa-config.json`
Mẫu ở `templates/project/qa-config.example.json`. Lấy thông tin từ đặc tả, và từ code BE/FE nếu người dùng cho phép (chỉ đọc; không in giá trị trong `.env`). Mục nào không biết thì hỏi người dùng, không đoán.
- `allowedEnvs`: mặc định `["local","test"]`. **Không bao giờ có production.**
- `account`: tài khoản dùng chung cho các TC cần đăng nhập. `lockoutAccount`: **tài khoản riêng**, vì TC-SEC-COMMON-16 sẽ khóa nó.
- `login`, `logout`, `me`, `authApis`, `reset`, `pages`, `download`: các đường dẫn **mà trình duyệt gọi**.
  - Với kiến trúc BFF (FE server route gọi BE, vd Nuxt `server/api/**`), đây là route của FE.
  - `login.tokenPath` chỉ điền khi API trả access token trong JSON.
- `sessionCookies`: regex tên cookie phiên.
- `lockout.threshold`, `reset.mailCap`, `maxSessionHours`: lấy theo đặc tả. Đặc tả không có thì giữ mặc định và ghi câu hỏi Qxx.
- `accepted`: mục khách hàng đã chốt "theo đặc tả / chấp nhận rủi ro". Dạng `"RS08": "lý do — người quyết định, ngày"`.
- `exposurePaths` (tuỳ chọn): đường dẫn nhạy cảm riêng của dự án cho TC-SEC-COMMON-17, dạng `[{ "path": "/admin/export.csv", "sig": "regex chữ ký nội dung", "what": "mô tả" }]`.
- MFA/OTP qua email: runner không tự nhập OTP. Tắt MFA cho tài khoản test trên env test, hoặc đánh MANUAL các TC cần đăng nhập UI (chỉ TC-SEC-COMMON-08).

## Bước 2. Bộ common (không thiết kế lại)
```bash
node "$S/sec_common.run.mjs" --csv "$T/TESTCASE/SEC_Common_TestCase.csv"      # chép CSV 21 TC vào dự án (để import TestRail)
APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node "$S/sec_common.run.mjs" --env <env> --out runs/$(date +%Y%m%d-%H%M)-SEC_Common [--only TC-SEC-COMMON-01,...]
```
- Mục chưa cấu hình → TC đó là NA, kèm lý do `Chưa cấu hình security.xxx`. Mục có trong `accepted` → hiển thị `—`, không tính NG.
- Chạy **TC-SEC-COMMON-16 sau cùng** (runner đã đặt sẵn: 17–21 chạy trước 16). Trên env dùng chung, báo dev trước vì `lockoutAccount` bị khóa và có mail reset được gửi.
- Dự án đã chép CSV 16 TC cũ: chạy lại `--csv` để có thêm TC 17–21 rồi import TestRail (TC 01–16 giữ nguyên mã).
- TC-17/18 trên env dev có thể báo source map / DevTools là cố ý: hỏi dev, nếu env public không có thì ghi `accepted` (`EX03`, `EX04`) kèm lý do, và kiểm lại ở env gần production nhất trong `allowedEnvs`.
- Mở xem ảnh của mọi case FAIL. Ảnh là bảng "Mã – Mục – Mong đợi – Thực tế – OK/NG". Nếu FAIL do cấu hình sai (vd `me` trả 404) thì sửa config rồi chạy lại case đó, không sửa kết quả.
- Ghi TestRail và log bug như mọi module (`app-run-test` mục 4, `app-bug-backlog`).

## Bước 3. TC riêng của dự án
### 3.1 Khảo sát (Phần 0 của `SEC_Rieng_TestDesign.md`)
Lập bảng, mỗi dòng ghi nguồn `file:dòng` hoặc mục tài liệu:

| Hạng mục | Cần ghi |
|---|---|
| Role và tenant | Danh sách role, guard/middleware phía BE, cách cô lập tenant |
| Nhóm API | Nhóm theo guard + role (admin-only, user, public); API theo ID tài nguyên (ứng viên IDOR) |
| Thông tin quyền phía client | Cookie/storage chứa role; FE guard có tin vào giá trị đó không |
| Mật khẩu, reset, mời | Rule validation, endpoint, thời hạn token, dùng 1 lần, hủy session |
| Upload / import / export | Endpoint, kiểm tra extension/MIME/kích thước, cách trả file |
| Input | Cách validation (schema/pipe), giới hạn số nguyên, raw SQL, nơi render HTML từ input (kể cả `v-html`/`innerHTML` đọc từ query/hash → IN08) |
| Phiên | Cơ chế phiên (JWT / cookie mờ / BFF), refresh token, idle timeout, chính sách đăng nhập nhiều nơi, cách thu hồi khi đổi role / vô hiệu hóa |
| API | Response của từng API có field nào FE không dùng (AP01), max page size, rate limit ngoài login, version cũ, Swagger, GraphQL |
| Luồng nghiệp vụ | Luồng nhiều bước, trạng thái (pending/approved…), giá/số lượng/quyền lợi có giới hạn, chỗ có thể chạy đồng thời → BL01–BL06 |
| Nội dung (CMS) | Bài nháp / hẹn giờ / preview / xóa, rich text, audit log → CM01–CM06 |
| URL / file phía server | Chức năng nhận URL (SSRF), tham số tên file khi đọc/tải (PT01), file riêng tư và URL ký (UP06) |

- **BFF**: test phân quyền và input ở cả 2 lớp. Lớp 1 là route FE dùng cookie. Lớp 2 gọi thẳng BE (`security.apiBase`) bằng access token của role thấp, vì BE phải tự chặn, không dựa vào FE.
- **Cookie phiên đã mã hóa / ký** (h3 `useSession`, iron-session…): AZ01 chỉ còn là "sửa cookie → bị từ chối"; trọng tâm là AZ02–AZ04.
- Phát hiện khi đọc code **không phải kết quả test**. Chỉ dùng để chọn mục và viết Steps; kết quả lấy từ lúc chạy.

### 3.2 Chọn mục (Phần A)
Mỗi mã thuộc nhóm "TC riêng" của danh mục là một dòng: `| Mã | Mô tả | Nguồn (UB#/ASVS + mục đặc tả) | Áp dụng / N/A — lý do / Chấp nhận — lý do | Mong đợi [Spec]/[Baseline] |`. Đặc tả không quy định giá trị thì dùng [Baseline] và tạo Qxx (Phần B) để `specOwner` chốt.

### 3.3 Sinh TC (Phần C)
- `TESTCASE/SEC_Rieng_TestCase.csv`: header **y hệt** template trong `RULES/`, UTF-8 có BOM, ghi bằng `toCsv` của `lib.mjs`.
- `Test Case ID` `TC-SEC-001`…; `Module` `SEC - Bảo mật (Riêng)`; `Feature ID` theo nhóm (`SEC-AZ`, `SEC-AU`, `SEC-RS`, `SEC-IN`, `SEC-UP`, `SEC-CS`).
- Gộp theo S3/S4/S6: 1 TC cho mỗi nhóm API × role × đọc/ghi, mỗi luồng nghiệp vụ, mỗi loại nội dung; liệt kê endpoint/thử nghiệm trong Steps. Thường 15–30 TC.
- `Feature ID` thêm: `SEC-SS` (phiên), `SEC-AP` (API), `SEC-BL` (logic nghiệp vụ), `SEC-EX` (lộ thông tin), `SEC-CM` (CMS), `SEC-SF` (SSRF / path traversal).
- Mục chính sách chưa có trong đặc tả (SS03 idle timeout, SS04 đăng nhập đồng thời, AP06 rate limit): Expected [Baseline] + Qxx, không tự quyết.
- Steps ghi rõ endpoint, method, payload, tài khoản (TD-xx). Expected ghi status / message cụ thể, kèm [Spec] hoặc [Baseline].
- Remarks: `Rule: AZ02, AZ03 | Nguồn: 05_Security_Checklist (ASVS V4) + <mục đặc tả> | Tự động: HTTP | Mức: Cao`.
- Phần F: những gì cần công cụ hoặc bên chuyên môn, theo bảng "Phần F" của danh mục (TLS/chứng chỉ, `npm audit`, archive bomb, malware mẫu, DNS rebinding, SQLi dạng thời gian trên env dùng chung, DoS). Chỉ ghi lại, không sinh TC.
- Khách hàng / PM gửi checklist `WebApp_Security_Test_Cases.xlsx` (mẫu ở `templates/security/`): điền theo bảng đối chiếu cuối danh mục (mỗi case xlsx → mã → TC đã chạy). Không tạo TC trùng cho từng dòng xlsx.

### 3.4 Tự kiểm
```bash
node "$S/tc_csv.mjs" check "$T/TESTCASE/SEC_Rieng_TestCase.csv" --template "$T/RULES/<template>.csv" --rules <mọi mã "Áp dụng" ở Phần A>
node "$S/tc_csv.mjs" trace "$T/TESTCASE/SEC_Rieng_TestCase.csv"
node "$S/tc_csv.mjs" stats "$T/TESTCASE/SEC_Rieng_TestCase.csv"
```
Thêm vào checklist của rule 01:
- Mã "TC riêng" nào chưa có dòng ở Phần A?
- Có TC nào vượt phạm vi an toàn không?
- Có Expected nào rút ra từ đọc code thay vì quan sát được khi chạy không?

### 3.5 Chạy TC riêng
File `e2e/SEC_Rieng.run.mjs` (copy `run_template.mjs`) dùng helper `sec_checks.mjs`:
```js
const sec = await import(pathToFileURL(path.join(ROOT, 'scripts', 'sec_checks.mjs')).href);
tc('TC-SEC-003', 'Staff gọi thẳng API chỉ dành cho admin', async (t) => {
  const { token } = await sec.apiLogin(t, 'staff_a');
  const rows = await sec.probe(t, [
    { method: 'GET', path: '/api/users', token },
    { method: 'DELETE', path: '/api/users/1', token },
  ], { code: 'AZ02' });                                   // api:true → security.apiBase (gọi thẳng BE)
  return sec.report(t, 'TC-SEC-003 Staff gọi thẳng API admin', rows);
});
```
Có sẵn: `apiLogin`, `creds`, `fetch`, `probe` (expect là mảng status hoặc hàm), `checkHeaders`, `checkCors`, `checkCookies`, `checkClientStorage`, `tamperCookie`, `fillBody`, `sameResponse`, `jwtLifetimeHours`, `isJwt`, `jwtVariants`, `opaqueVariants`, `checkExposure`, `checkSourceMaps`, `PAYLOADS` (`int`, `xss`, `xssEncoded`, `sqli`, `sqliBoolean`, `traversal`, `long`, `csvFormula`), `report`.
- BL05 race: `await Promise.all([...Array(3)].map(() => sec.fetch(t, path, { method: 'POST', token, data })))` rồi đếm số request 2xx (mong đợi 1).
- SS05 / AU07: mở context thứ 2 bằng `t.ctx.browser().newContext()` để giữ phiên của user kia.

## Log bug
Theo `app-bug-backlog`: **mỗi mã danh mục NG là một bug**. Bug ghi mức độ và biện pháp khắc phục lấy từ danh mục, nguồn UB#/ASVS, và env đã chạy.

## Báo cáo cho người dùng
- Bộ common: bảng PASS / FAIL / NA, danh sách FAIL kèm mã.
- TC riêng: đường dẫn 2 file, số TC, danh sách Qxx cần chốt.
- Các mục cấu hình còn thiếu, và các điểm rủi ro từ khảo sát cần ưu tiên chạy trước.
