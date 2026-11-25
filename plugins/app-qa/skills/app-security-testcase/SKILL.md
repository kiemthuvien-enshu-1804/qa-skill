---
name: app-security-testcase
description: Thiết kế bộ test case BẢO MẬT cho cả webapp (header, cookie, xác thực/mật khẩu, reset & mời người dùng, phân quyền/IDOR/tenant, input, upload, CSRF) theo danh mục chuẩn 05_Security_Checklist (rút từ báo cáo chẩn đoán UBsecure + OWASP ASVS) — khảo sát bề mặt tấn công từ đặc tả + code, chọn mục áp dụng, gộp theo S1–S5 — xuất SEC_TestDesign.md + SEC_TestCase.csv, rồi (khi được duyệt) import TestRail. Dùng khi được yêu cầu "test case security/bảo mật", "chuẩn bị trước chẩn đoán bảo mật", "kiểm lại các lỗi UBsecure". Chạy bằng app-run-test với helper sec_checks.mjs.
---

# Thiết kế test case bảo mật (rule 05 + rule 01)

**Đọc trước:**
1. `${CLAUDE_PLUGIN_ROOT}/templates/rules/05_Security_Checklist.md` (danh mục, mức độ, phạm vi an toàn, quy tắc gộp S1–S5). Nếu dự án có `<docs.repo>/<docs.testing>/RULES/05_*.md` thì **rule của dự án được ưu tiên**.
2. `RULES/01_*.md` của dự án (hoặc template của plugin): định dạng Phần A–F, priority, giới hạn 6 bước, checklist tự kiểm. Skill này chỉ nêu phần khác so với `app-testcase`.

Bộ này làm **1 lần cho cả webapp** (Module `SEC`), không theo từng chức năng. Khi tài liệu hoặc code thay đổi lớn (thêm role, thêm upload, đổi cách login) thì cập nhật bộ này.

## 1. Thu thập đầu vào (hỏi người dùng những mục còn thiếu, đừng đoán)
- **`qa-config.json → security`** (xem `templates/project/qa-config.example.json`). Thiếu khối này thì đề xuất nội dung cho người dùng điền:
  - `allowedEnvs`: env được phép chạy (mặc định `["local","test"]`). **Không bao giờ có production.**
  - `apiBase`, `sessionCookies` (regex tên cookie phiên), `mail` (Mailpit/MailHog để đọc link reset, nếu có).
  - `accepted`: mục khách hàng đã chốt "theo đặc tả / chấp nhận rủi ro", dạng `{ "RS08": "Theo đặc tả — phía Nhật 2026-11-20" }`.
  - `previousReport`: đường dẫn báo cáo chẩn đoán trước (nếu có) để ưu tiên kiểm lại các mục đã bị chỉ ra.
- **Yêu cầu bảo mật trong đặc tả**: mục yêu cầu phi chức năng, phạm vi truy cập theo quyền, quy ước chung, danh sách message. Ghi version/ngày như `app-testcase`.
- **Tài khoản**: ≥ 1 tài khoản cho mỗi role trong `accounts`. Có multi-tenant thì cần 2 tenant (cho AZ04). Thiếu thì ghi `[CẦN BỔ SUNG]` và đưa vào `app-testdata`.

## 2. Khảo sát bề mặt tấn công (Phần 0 của TestDesign)
Đọc code BE/FE **khi người dùng cho phép** (chỉ đọc, không sửa; không in giá trị trong `.env`). Lập bảng, mỗi dòng ghi nguồn `file:dòng` hoặc mục tài liệu:

| Hạng mục | Cần ghi |
|---|---|
| Cách xác thực | Token/session, lưu ở cookie (tên + thuộc tính) hay storage, thời hạn, logout có hủy phía server không, MFA |
| Thông tin quyền phía client | Cookie/storage nào chứa role/permission/tenant; FE guard có tin vào giá trị đó không |
| Role và tenant | Danh sách role, guard/middleware phía BE, cách cô lập tenant |
| Nhóm API | Nhóm theo guard + role (admin-only, user, public), API theo ID tài nguyên (ứng viên IDOR) |
| Mật khẩu / reset / mời | Rule validation, endpoint, thời hạn token, dùng 1 lần, hủy session |
| Chống brute force | Throttler, khóa tài khoản, CAPTCHA, ngưỡng |
| Header | helmet / nitro routeRules / nginx; giá trị CSP, HSTS… |
| Upload / download / import / export | Endpoint, kiểm tra extension/MIME/kích thước, cách trả file |
| Validation | ValidationPipe/whitelist, parse số nguyên, nơi dùng raw SQL, nơi render HTML từ input (`v-html`, `innerHTML`) |

Lưu ý theo kiến trúc:
- **BFF / proxy** (FE server route gọi BE bằng Bearer, ví dụ Nuxt `server/api/**`): test phân quyền và input ở **cả 2 lớp**. Lớp 1 qua route của FE bằng cookie của trình duyệt. Lớp 2 gọi thẳng BE (`security.apiBase`) bằng access token của role thấp, vì BE phải tự chặn, không dựa vào FE. Header phải kiểm trên response của FE (là thứ trình duyệt nhận); header của BE chỉ kiểm khi BE công khai ra internet.
- **Cookie phiên được mã hóa / ký** (h3 `useSession`, iron-session…): không sửa được nội dung, nên AZ01 chuyển thành "sửa giá trị cookie → bị từ chối / 401". Thông tin quyền khi đó nằm trong token phía server, nên trọng tâm là AZ02–AZ04.
- **MFA / OTP qua email**: runner không tự nhập OTP. Cách xử lý: tắt MFA trên env test cho tài khoản test (ghi rõ trong Phạm vi), hoặc đọc OTP từ `security.mail` (Mailpit), hoặc đánh MANUAL. Khi đã tắt MFA thì vẫn phải có TC riêng kiểm cơ chế OTP (thời hạn, số lần sai, dùng 1 lần) trên tài khoản bật MFA.
- **Khóa tài khoản theo email** (AU03): dùng tài khoản test riêng cho TC này và chạy cuối cùng, để không khóa tài khoản các TC khác đang dùng.

Phát hiện từ code (vd `secure` chỉ bật ở production, cookie user JSON không HttpOnly) **không phải kết quả test**. Chỉ ghi ở Phần 0 để chọn mục và viết Steps; kết quả thật phải lấy từ lúc chạy trên env.

## 3. Chọn mục và viết Phần A
- Duyệt **toàn bộ** danh mục. Mỗi mục là một dòng ở Phần A: `| Mã | Mô tả | Nguồn (UB#/ASVS + mục đặc tả) | Áp dụng? | Mong đợi ([Spec] / [Baseline]) |`.
- Không áp dụng (vd không có upload → UP*; xác thực bằng header Bearer không dùng cookie → CS01) thì ghi `N/A — <lý do>`.
- Mục có trong `security.accepted` thì ghi `Chấp nhận — <lý do, người quyết định>`, không sinh TC.
- Đặc tả không quy định giá trị (thời hạn link, ngưỡng khóa, độ dài mật khẩu) thì dùng [Baseline] của danh mục và tạo `Qxx` ở Phần B để `specOwner` chốt. Không tự đặt giá trị khác.

## 4. Sinh TC (Phần C)
- File `TESTCASE/SEC_Bao-mat_TestCase.csv`: header **y hệt** template CSV trong `RULES/`, UTF-8 có BOM, ghi bằng `toCsv` của `${CLAUDE_PLUGIN_ROOT}/scripts/lib.mjs`.
- `Test Case ID`: `TC-SEC-001`…; `Module`: `SEC`; `Feature ID/Name`: nhóm (`SEC-HDR` Header, `SEC-CK` Cookie, `SEC-AU` Xác thực, `SEC-RS` Reset/Mời, `SEC-AZ` Phân quyền, `SEC-IN` Input, `SEC-UP` Upload, `SEC-CS` CSRF).
- **Gộp theo S1–S5** của danh mục, ví dụ 1 TC cho header trang HTML, 1 TC cho header API JSON, 1 TC cho cookie phiên, mỗi nhóm API × role × đọc/ghi 1 TC. Mục tiêu khoảng 25–45 TC cho một webapp cỡ vừa.
- Steps ghi rõ **endpoint, method, payload, tài khoản (TD-xx)**. Expected ghi **status code / giá trị header / message cụ thể**, kèm `[Spec]` hoặc `[Baseline]`. Tối đa 6 bước; nhiều endpoint thì liệt kê trong 1 bước.
- Remarks: `Rule: HDR01, HDR02 | Nguồn: 05_Security_Checklist (UB#2,3) + <mục đặc tả> | Tự động: HTTP | Env: local,test`.
  - Cột `Tự động` lấy từ danh mục: `MAIL` khi không có `security.mail` thì đổi thành `MANUAL`.
  - Mức độ của danh mục ghi thêm `| Mức: Thấp` để dùng khi log bug.
- Priority theo danh mục: AZ*, AU01–AU03, IN03 → P1; CK*, RS*, RG*, UP*, IN01/02/04/05, CS01, HDR06, HDR09 → P2; các HDR còn lại → P3.
- **Phần F (ngoài phạm vi)**: các nội dung cần công cụ hoặc bên chuyên môn: quét lỗ hổng thư viện (`npm audit`, Dependabot), cấu hình TLS (SSL Labs), DoS, tấn công tổ hợp nhiều bước. Ghi để người dùng quyết định, không sinh TC.

## 5. Tự kiểm bằng script (bắt buộc)
```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; T="<docs.repo>/<docs.testing>"
node "$S/tc_csv.mjs" check "$T/TESTCASE/SEC_Bao-mat_TestCase.csv" --template "$T/RULES/<template>.csv" --rules <mọi mã "Áp dụng" ở Phần A>
node "$S/tc_csv.mjs" trace "$T/TESTCASE/SEC_Bao-mat_TestCase.csv"   # → Phần D
node "$S/tc_csv.mjs" stats "$T/TESTCASE/SEC_Bao-mat_TestCase.csv"   # → Phần E
```
Thêm vào checklist của rule 01:
6. Mục nào trong danh mục chưa có dòng ở Phần A?
7. Có TC nào chạy trên env ngoài `security.allowedEnvs`, hoặc vượt "Phạm vi an toàn" (số request brute force, payload khai thác thật) không?
8. Có Expected nào là kết luận rút ra từ đọc code thay vì quan sát được khi chạy không?

## 6. Đầu ra
- `TESTCASE/SEC_Bao-mat_TestDesign.md`: bảng thông tin, **0. Phạm vi + Bề mặt tấn công**, 1. Dữ liệu TD-xx (tài khoản theo role/tenant, tài nguyên của user khác), Phần A–F, RTM (đối chiếu thêm cột `UB#` nếu có `previousReport`).
- `TESTCASE/SEC_Bao-mat_TestCase.csv`.
- Import TestRail (chỉ khi người dùng yêu cầu): giống mục 5 của `app-testcase`, section `SEC - Bảo mật`.

## 7. Chạy (chuyển sang `app-run-test`)
File chạy `e2e/SEC.run.mjs` dùng runner như mọi module, cộng thêm helper:
```js
const sec = await import(pathToFileURL(path.join(ROOT, 'scripts', 'sec_checks.mjs')).href);
defineRun({ module: 'SEC_Bao-mat', app: 'admin' }, ({ tc }) => {
  tc('TC-SEC-001', 'Header trang HTML', async (t) => {
    const res = await sec.fetch(t, '/login');                                                    // 1. GET trang login
    return sec.report(t, 'TC-SEC-001 Header trang HTML', sec.checkHeaders(res, ['HDR01', 'HDR02', 'HDR03', 'HDR04', 'HDR05', 'HDR08']), { request: res.summary });
  });
  tc('TC-SEC-010', 'Staff gọi API admin', async (t) => {
    const rows = await sec.probe(t, [{ method: 'GET', path: '/api/admin/users' }, { method: 'DELETE', path: '/api/admin/users/1' }], { code: 'AZ02' });
    return sec.report(t, 'TC-SEC-010 Staff gọi API admin', rows);
  }, { account: 'staff_a' });
});
```
- `sec.fetch` / `sec.probe` dùng chung cookie của context đã login; `sec.guardEnv` chặn env ngoài `allowedEnvs`.
- `sec.report` vẽ bảng "Mã – Mục – Mong đợi – Thực tế – OK/NG" để runner chụp làm evidence. Có NG thì TC là FAIL, và kết quả thực tế liệt kê đúng các mã lỗi.
- Có sẵn: `checkHeaders`, `checkCors`, `checkCookies` (từ `res.setCookies` của response login), `checkClientStorage`, `tamperCookie` (AZ01), `probe`, `PAYLOADS`.
- Khi log bug (`app-bug-backlog`): **mỗi mã danh mục là một bug**, kể cả khi nằm chung một TC. Bug ghi mức độ của danh mục, nguồn UB#/ASVS và biện pháp khắc phục trong danh mục. Lỗi header áp dụng toàn site thì gộp 1 bug cho mỗi header, không tách theo từng URL.

## Báo cáo cho người dùng
Đường dẫn 2 file; bảng `Áp dụng / N/A / Chấp nhận` theo nhóm; số TC (AUTO-HTTP / UI / MAIL / MANUAL); danh sách Qxx cần `specOwner` chốt; các điểm rủi ro rút ra khi khảo sát code mà cần ưu tiên chạy trước.
