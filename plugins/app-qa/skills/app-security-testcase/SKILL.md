---
name: app-security-testcase
description: Kiểm tra bảo mật webapp theo danh mục 05_Security_Checklist (rút từ báo cáo chẩn đoán UBsecure + OWASP ASVS), chia 2 phần — (1) BỘ COMMON cố định 16 TC (header, cookie, logout, thời hạn phiên, API chưa đăng nhập, lộ tài khoản, khóa tài khoản, giới hạn mail reset, lộ lỗi nội bộ) chạy ngay bằng sec_common.run.mjs sau khi điền khối security trong qa-config; (2) TC RIÊNG của dự án (phân quyền/IDOR/tenant, chính sách mật khẩu, reset/mời, upload, input, CSRF) sinh thành SEC_Rieng_TestCase.csv. Dùng khi được yêu cầu "test bảo mật/security", "chuẩn bị trước chẩn đoán bảo mật", "kiểm lại các lỗi UBsecure".
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
- MFA/OTP qua email: runner không tự nhập OTP. Tắt MFA cho tài khoản test trên env test, hoặc đánh MANUAL các TC cần đăng nhập UI (chỉ TC-SEC-COMMON-08).

## Bước 2. Bộ common (không thiết kế lại)
```bash
node "$S/sec_common.run.mjs" --csv "$T/TESTCASE/SEC_Common_TestCase.csv"      # chép CSV 16 TC vào dự án (để import TestRail)
APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node "$S/sec_common.run.mjs" --env <env> --out runs/$(date +%Y%m%d-%H%M)-SEC_Common [--only TC-SEC-COMMON-01,...]
```
- Mục chưa cấu hình → TC đó là NA, kèm lý do `Chưa cấu hình security.xxx`. Mục có trong `accepted` → hiển thị `—`, không tính NG.
- Chạy **TC-SEC-COMMON-16 sau cùng** (thứ tự trong file đã đặt sẵn). Trên env dùng chung, báo dev trước vì `lockoutAccount` bị khóa và có mail reset được gửi.
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
| Input | Cách validation (schema/pipe), giới hạn số nguyên, raw SQL, nơi render HTML từ input |

- **BFF**: test phân quyền và input ở cả 2 lớp. Lớp 1 là route FE dùng cookie. Lớp 2 gọi thẳng BE (`security.apiBase`) bằng access token của role thấp, vì BE phải tự chặn, không dựa vào FE.
- **Cookie phiên đã mã hóa / ký** (h3 `useSession`, iron-session…): AZ01 chỉ còn là "sửa cookie → bị từ chối"; trọng tâm là AZ02–AZ04.
- Phát hiện khi đọc code **không phải kết quả test**. Chỉ dùng để chọn mục và viết Steps; kết quả lấy từ lúc chạy.

### 3.2 Chọn mục (Phần A)
Mỗi mã thuộc nhóm "TC riêng" của danh mục là một dòng: `| Mã | Mô tả | Nguồn (UB#/ASVS + mục đặc tả) | Áp dụng / N/A — lý do / Chấp nhận — lý do | Mong đợi [Spec]/[Baseline] |`. Đặc tả không quy định giá trị thì dùng [Baseline] và tạo Qxx (Phần B) để `specOwner` chốt.

### 3.3 Sinh TC (Phần C)
- `TESTCASE/SEC_Rieng_TestCase.csv`: header **y hệt** template trong `RULES/`, UTF-8 có BOM, ghi bằng `toCsv` của `lib.mjs`.
- `Test Case ID` `TC-SEC-001`…; `Module` `SEC - Bảo mật (Riêng)`; `Feature ID` theo nhóm (`SEC-AZ`, `SEC-AU`, `SEC-RS`, `SEC-IN`, `SEC-UP`, `SEC-CS`).
- Gộp theo S3/S4: 1 TC cho mỗi nhóm API × role × đọc/ghi, liệt kê endpoint trong Steps. Thường 10–20 TC.
- Steps ghi rõ endpoint, method, payload, tài khoản (TD-xx). Expected ghi status / message cụ thể, kèm [Spec] hoặc [Baseline].
- Remarks: `Rule: AZ02, AZ03 | Nguồn: 05_Security_Checklist (ASVS V4) + <mục đặc tả> | Tự động: HTTP | Mức: Cao`.
- Phần F: những gì cần công cụ hoặc bên chuyên môn (`npm audit`, cấu hình TLS, DoS, tấn công tổ hợp). Chỉ ghi lại, không sinh TC.

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
Có sẵn: `apiLogin`, `creds`, `fetch`, `probe` (expect là mảng status hoặc hàm), `checkHeaders`, `checkCors`, `checkCookies`, `checkClientStorage`, `tamperCookie`, `fillBody`, `sameResponse`, `jwtLifetimeHours`, `PAYLOADS`, `report`.

## Log bug
Theo `app-bug-backlog`: **mỗi mã danh mục NG là một bug**. Bug ghi mức độ và biện pháp khắc phục lấy từ danh mục, nguồn UB#/ASVS, và env đã chạy.

## Báo cáo cho người dùng
- Bộ common: bảng PASS / FAIL / NA, danh sách FAIL kèm mã.
- TC riêng: đường dẫn 2 file, số TC, danh sách Qxx cần chốt.
- Các mục cấu hình còn thiếu, và các điểm rủi ro từ khảo sát cần ưu tiên chạy trước.
