# DANH MỤC KIỂM TRA BẢO MẬT WEBAPP (rule 05)

Danh mục chuẩn để sinh bộ test case bảo mật cho mỗi webapp, chạy **trước** đợt chẩn đoán của bên thứ ba
(ví dụ UBsecure Vex). Mục tiêu: tự phát hiện và sửa các lỗi mà bên chẩn đoán chắc chắn sẽ kiểm tra.

- **Nguồn**: `UB#n` = chỉ ra thật trong báo cáo chẩn đoán UBsecure (Shift Management, 11/2026, 25 mục).
  `ASVS Vx` = OWASP ASVS 4.0.3, chương tương ứng (bổ sung các mục bên chẩn đoán thường kiểm nhưng chưa xuất hiện trong báo cáo trên).
  `xlsx XXX-nnn` = case trong `templates/security/WebApp_Security_Test_Cases.xlsx` (checklist 137 case theo OWASP Top 10 / WSTG).
- **Mã mục** (`HDR01`, `CK03`…) được dùng làm **mã rule** trong cột Remarks (`Rule: HDR01, HDR03`), để `tc_csv.mjs check/trace` truy vết được.
- **Mức độ mặc định** theo thang của báo cáo chẩn đoán: Khẩn cấp / Cao / Trung bình / Thấp / Thông tin. Đây là mức của bên chẩn đoán, không phải Priority của TC.
- **Priority TC**: P1 = phân quyền, xác thực, mất/rò dữ liệu; P2 = cookie, session, input, upload; P3 = header mức Thông tin.
- **Tự động**: `HTTP` = gọi request và đọc response (Playwright `request`); `UI` = thao tác trình duyệt; `MAIL` = cần đọc mail (Mailpit/MailHog ở local, nếu không có thì MANUAL); `MANUAL` = tester làm tay.
- **Kết quả mong đợi**: nếu tài liệu đặc tả của dự án có quy định thì dùng giá trị trong đặc tả (ghi `[Spec]`). Nếu không có thì dùng giá trị chuẩn trong cột "Mong đợi" (ghi `[Baseline]`) và tạo câu hỏi Qxx để `specOwner` chốt.
- Mục khách hàng đã quyết định **"theo đặc tả / chấp nhận rủi ro"** khai báo ở `qa-config.json → security.accepted`: vẫn liệt kê ở Phần A nhưng không sinh TC, ghi lý do và người quyết định.

## Phạm vi an toàn (bắt buộc)
1. Chỉ chạy trên môi trường có trong `security.allowedEnvs` (mặc định `local`, `test`). **Không bao giờ chạy trên production.**
2. Chỉ dùng tài khoản test trong `accounts`. Không thử đăng nhập tài khoản người khác, không dò mật khẩu bằng danh sách.
3. Kiểm tra brute force / rate limit: gửi tối đa **ngưỡng + 2** request, không phải tấn công từ chối dịch vụ.
4. Payload chỉ để dò (probe): `<'"xss0"'>`, `'`, `2147483648`… Không dùng payload khai thác thật (reverse shell, đọc file hệ thống, xóa dữ liệu).
5. File upload thử dùng nội dung vô hại (chuỗi text, ảnh 1x1). Xóa file đã upload sau khi test nếu chức năng cho phép.
6. Môi trường dùng chung (`test`/staging): báo trước cho dev các test gây khóa tài khoản hoặc gửi nhiều mail.
7. Gửi đồng thời (race condition, BL05): tối đa 5 request cùng lúc, trên dữ liệu test do QA tạo.
8. SQLi dạng thời gian (`SLEEP(2)`, `pg_sleep(2)`): chỉ ở `local`, tối đa 2 giây. Env dùng chung chỉ dùng dạng boolean (`PAYLOADS.sqliBoolean`).
9. SSRF (SF01): chỉ dùng URL do dự án kiểm soát (Mailpit/mock nội bộ) hoặc địa chỉ không có dịch vụ (`http://127.0.0.1:1/`). Mong đợi là **bị chặn**; không đọc dữ liệu của dịch vụ nội bộ.
10. Mục cần công cụ chuyên dụng hoặc có thể gây hại (archive bomb, file malware mẫu, DNS rebinding, tải nặng/DoS) không sinh TC: ghi ở Phần F.

## Bộ common và TC riêng của dự án
Danh mục chia làm 2 phần:

| Phần | Mã | Cách dùng |
|---|---|---|
| **Bộ common** (cố định, giống nhau ở mọi webapp) | HDR01–HDR13, CK01–CK07, AU03, AU04, AU05, AZ05, RS01, RS06, IN04, EX01–EX04, SS01, SS02 | 21 TC `TC-SEC-COMMON-01…21` trong `templates/security/SEC_Common_TestCase.csv`. Chạy bằng `scripts/sec_common.run.mjs`, chỉ cần điền khối `security` trong `qa-config.json`. **Không thiết kế lại.** TC-16 (khóa tài khoản) luôn chạy cuối. |
| **TC riêng** (phụ thuộc role, endpoint, đặc tả của dự án) | AU01, AU02, AU06–AU10, RS02–RS05, RS07, RS08, RG01, RG02, AZ01–AZ04, AZ06, IN01–IN03, IN05–IN08, UP01–UP06, CS01–CS03, SS03–SS07, AP01–AP08, BL01–BL06, EX05–EX07, CM01–CM06, SF01, PT01 | Skill `app-security-testcase` sinh `SEC_Rieng_TestCase.csv` (thường 15–30 TC). Đây là nhóm có lỗi nặng nhất (phân quyền, IDOR, tenant, logic nghiệp vụ), nên không được bỏ qua. Nhóm không áp dụng (vd không có CMS, không có GraphQL) ghi N/A kèm lý do ở Phần A. |

Danh mục đã đối chiếu với `templates/security/WebApp_Security_Test_Cases.xlsx` (137 case, 12 nhóm); bảng đối chiếu ở cuối file.

Sửa TC common: sửa mảng `CASES` trong `sec_common.run.mjs`, rồi chạy `--csv` để sinh lại CSV, để code chạy và CSV luôn khớp nhau.

---

## 1. HDR — Response header (áp dụng cho mọi webapp)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| HDR01 | Content-Security-Policy | GET trang HTML (trang login + 1 trang sau login), đọc header | Có header `Content-Security-Policy`; fetch directive (`default-src`, `script-src`…) không chứa `*` | Thấp | HTTP | UB#3 |
| HDR02 | Chống clickjacking bằng CSP | Như HDR01 | CSP có `frame-ancestors 'none'` hoặc `'self'` hoặc domain chỉ định | Thấp | HTTP | UB#2 |
| HDR03 | Strict-Transport-Security | GET qua HTTPS (bỏ qua ở `local` http) | Có `Strict-Transport-Security`, `max-age` ≥ 31536000 | Thấp | HTTP | UB#4 |
| HDR04 | X-Content-Type-Options | GET trang HTML + 1 API JSON | `X-Content-Type-Options: nosniff` trên cả trang và API | Thông tin | HTTP | UB#22 |
| HDR05 | X-Frame-Options | GET trang HTML | `X-Frame-Options: DENY` hoặc `SAMEORIGIN` | Thông tin | HTTP | UB#24 |
| HDR06 | Cache-Control trên dữ liệu cá nhân | GET trang sau login + API trả thông tin cá nhân | `Cache-Control` chứa `no-store` | Thấp | HTTP | UB#7 |
| HDR07 | X-Download-Options trên file tải về | GET API export/download (CSV, PDF…) | `X-Download-Options: noopen`; có `Content-Disposition: attachment` | Thông tin | HTTP | UB#23 |
| HDR08 | Không lộ phiên bản server/framework | GET trang HTML + API | Không có `X-Powered-By`; `Server` không ghi phiên bản (vd `nginx/1.25.3`) | Thông tin | HTTP | ASVS V14 |
| HDR09 | CORS | Gửi API với `Origin: https://evil.example` | Không trả `Access-Control-Allow-Origin: *` kèm credentials, không phản chiếu nguyên Origin lạ | Trung bình | HTTP | ASVS V14 |
| HDR10 | Chuyển HTTP → HTTPS | GET `http://<host>/` (chỉ env có HTTPS) | Redirect 301/308 sang `https://` | Thấp | HTTP | ASVS V9 |
| HDR11 | Referrer-Policy | GET trang HTML | `no-referrer`, `same-origin`, `strict-origin` hoặc `strict-origin-when-cross-origin` (không `unsafe-url`) | Thông tin | HTTP | xlsx HDR-006 |
| HDR12 | Method TRACE / TRACK | Gửi TRACE, TRACK tới trang HTML và API | 405/501/4xx, không phản hồi lại nội dung request | Thấp | HTTP | xlsx ADV-009 |
| HDR13 | Mixed content | Quét HTML trang HTTPS tìm `src`/`href`/`action` dạng `http://` (bản đầy đủ: xem tab Console/Security ở Claude in Chrome) | Không có | Thấp | HTTP | xlsx HDR-008 |

## 2. CK — Cookie và lưu trữ phía client

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| CK01 | HttpOnly cho cookie phiên | Login, đọc `Set-Cookie` / cookie của context | Cookie chứa token/session có `HttpOnly` | Trung bình | HTTP | ASVS V3 |
| CK02 | Secure | Như CK01 (env HTTPS) | Mọi cookie xác thực có `Secure` | Thấp | HTTP | ASVS V3 |
| CK03 | SameSite | Như CK01 | `SameSite=Lax` hoặc `Strict` (không `None` nếu không cần) | Thấp | HTTP | ASVS V3 |
| CK04 | Prefix `__Host-` | Như CK01 | Tên cookie phiên bắt đầu bằng `__Host-`, `Path=/`, không có `Domain`, có `Secure` | Thấp | HTTP | UB#8 |
| CK05 | Cookie phiên không lưu bền | Như CK01 | Cookie phiên không có `Max-Age`/`Expires` (cookie phiên trình duyệt), hoặc thời hạn theo đặc tả | Thấp | HTTP | UB#11 |
| CK06 | Không đặt thông tin quyền ở chỗ JS đọc/sửa được | Login, liệt kê cookie không HttpOnly + `localStorage`/`sessionStorage` | Không có role, permission, tenantId, user JSON ở cookie/storage mà JS sửa được; nếu có thì xem AZ01 | Thấp | UI | UB#12 |
| CK07 | Logout hủy token phía server | Login → lưu token → logout → gọi API bằng token cũ | API trả 401 | Trung bình | HTTP | ASVS V3 |

## 3. AU — Xác thực, mật khẩu, session

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| AU01 | Từ chối mật khẩu = ID / email | Đặt/đổi mật khẩu bằng chính login ID hoặc phần local của email | Bị từ chối với message validation | Trung bình | UI/HTTP | UB#1 |
| AU02 | Độ dài và độ phức tạp mật khẩu | Đặt mật khẩu: 11 ký tự chữ+số; 12 ký tự chỉ chữ; 12 ký tự chữ+số | 2 trường hợp đầu bị từ chối, trường hợp cuối được chấp nhận (PCI DSS v4.0: ≥12 ký tự, có chữ và số) | Trung bình | UI/HTTP | UB#1 |
| AU03 | Chống brute force | Login sai mật khẩu liên tiếp đến ngưỡng (đặc tả hoặc 5–10 lần) + 2 | Từ lần vượt ngưỡng: bị khóa tạm / trả 429 / yêu cầu CAPTCHA; login đúng sau đó vẫn bị chặn trong thời gian khóa | Trung bình | HTTP | UB#25, ASVS V2 |
| AU04 | Không lộ tài khoản tồn tại (login) | Login với email không tồn tại và email tồn tại + sai mật khẩu | Message và status code giống nhau | Thấp | HTTP | ASVS V2 |
| AU05 | Thời hạn session | Đọc thời hạn token (exp của JWT / cấu hình) | Không vượt quá đặc tả; không có đặc tả thì ≤ 24 giờ và tạo Qxx | Thấp | HTTP | UB#11, ASVS V3 |
| AU06 | Đổi mật khẩu phải nhập mật khẩu hiện tại | Gọi API đổi mật khẩu không có / sai mật khẩu hiện tại | Bị từ chối | Trung bình | HTTP | ASVS V2 |
| AU07 | Đổi mật khẩu hủy các session khác | Login 2 context → đổi mật khẩu ở context 1 → context 2 gọi API | Context 2 nhận 401 | Thấp | HTTP | UB#10-4 |
| AU08 | Biện pháp chống credential stuffing | Xác nhận có 2FA / chặn IP / cảnh báo đăng nhập bất thường (theo đặc tả, phỏng vấn dev) | Có ≥ 2 biện pháp phòng vệ | Thông tin | MANUAL | UB#25 |
| AU09 | Tài khoản bị vô hiệu hóa / bị admin khóa | Admin khóa hoặc vô hiệu hóa tài khoản test → đăng nhập bằng tài khoản đó; nếu đang đăng nhập thì gọi API | Không đăng nhập được; phiên đang mở bị từ chối (401); message không lộ lý do chi tiết nếu đặc tả không yêu cầu | Trung bình | HTTP | xlsx AUTH-005, AUTH-006 |
| AU10 | Mật khẩu cũ hết hiệu lực sau khi đổi | Đổi mật khẩu → đăng nhập bằng mật khẩu cũ | Bị từ chối | Trung bình | HTTP | xlsx AUTH-012 |

## 4. RS — Reset mật khẩu, đăng ký / mời người dùng

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| RS01 | Không lộ tài khoản tồn tại (reset) | Gửi yêu cầu reset với email tồn tại và không tồn tại | Cùng message, cùng status code | Thấp | HTTP | ASVS V2 |
| RS02 | Thời hạn link reset | Lấy link reset từ mail; dùng sau thời hạn (đổi giờ hệ thống / chỉnh DB ở local) | Hết hạn sau ≤ 10 phút (hoặc theo đặc tả) → báo link hết hạn | Thấp | MAIL | UB#10-2 |
| RS03 | Link reset dùng một lần | Đặt lại mật khẩu thành công → mở lại link | Báo link không hợp lệ | Thấp | MAIL | UB#10 |
| RS04 | Link cũ mất hiệu lực khi phát link mới | Yêu cầu reset 2 lần → dùng link thứ nhất | Link thứ nhất không hợp lệ | Thấp | MAIL | UB#10-2 |
| RS05 | Reset xong hủy mọi session | Login ở context 2 → reset mật khẩu → context 2 gọi API | Context 2 nhận 401 | Thấp | MAIL | UB#10-4 |
| RS06 | Giới hạn số lần gửi mail reset | Gửi yêu cầu reset liên tục đến ngưỡng + 2 | Bị chặn (429 / message) sau ngưỡng | Thấp | HTTP | UB#10-1 |
| RS07 | Token reset không đoán được | Xem token trong link | ≥ 32 ký tự ngẫu nhiên (≥ 128 bit), không chứa email/ID/thời gian dạng đọc được | Thấp | MAIL | ASVS V2 |
| RS08 | Xác minh người thao tác khi đặt lại mật khẩu | Mở link reset ở trình duyệt khác (không có session lúc yêu cầu reset) | Theo đặc tả: có bước xác minh thêm (mã bí mật / session) hoặc ghi nhận "theo đặc tả" | Thấp | MAIL | UB#10-3 |
| RG01 | Thời hạn link mời / đăng ký | Như RS02 cho mail mời người dùng | ≤ 10 phút hoặc theo đặc tả | Thấp | MAIL | UB#9-1 |
| RG02 | Link mời dùng một lần, link cũ mất hiệu lực | Như RS03, RS04 cho link mời | Không dùng lại được | Thấp | MAIL | UB#9 |

## 5. AZ — Phân quyền (P1)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| AZ01 | Truy cập màn hình role cao bằng URL / sửa thông tin quyền phía client | Login role thấp → (a) mở thẳng URL màn hình của role cao; (b) sửa role trong cookie/storage (CK06) thành role cao rồi mở lại; (c) hiện nút bị ẩn bằng DevTools và bấm | Không vào được màn hình (redirect/403) **và** API của màn hình đó trả 403 | Thấp–Cao (Cao nếu xem/sửa được dữ liệu) | UI | UB#12 |
| AZ02 | Gọi thẳng API của role cao | Dùng token role thấp gọi API chỉ dành cho role cao (GET danh sách, POST/PUT/DELETE) | 403 cho mọi method; không có thay đổi dữ liệu | Cao | HTTP | ASVS V4 |
| AZ03 | IDOR — truy cập tài nguyên của người khác | Dùng token user A gọi API theo ID tài nguyên của user B (xem, sửa, xóa) | 403 hoặc 404; dữ liệu B không bị trả về/thay đổi | Cao | HTTP | ASVS V4 |
| AZ04 | Cô lập tenant | Dùng token tenant X gọi API với ID tài nguyên / tenant của tenant Y | 403 hoặc 404 | Cao | HTTP | ASVS V4 |
| AZ05 | API không đăng nhập | Gọi các API cần login mà không có token / token sai chữ ký / token hết hạn | 401 | Cao | HTTP | ASVS V4 |
| AZ06 | Mass assignment | Gửi thêm `roleId`, `role`, `tenantId`, `isAdmin`… vào API cập nhật hồ sơ của chính mình | Field bị bỏ qua hoặc 400; quyền không đổi | Cao | HTTP | ASVS V5 |

## 6. IN — Kiểm tra input

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| IN01 | Tràn số nguyên | Gửi `2147483648`, `-1`, `1.5`, `"abc"` vào tham số ID/số (path, query, body, mảng ID) | 400/422 với message validation; **không 500** | Thông tin | HTTP | UB#14–21 |
| IN02 | XSS (lưu trữ / phản chiếu) | Nhập `<'"xss0"'>`, `<h1>xss0</h1>` và bản encode (`PAYLOADS.xssEncoded`) vào field text / query → lưu → mở các màn hình hiển thị giá trị đó, **cả màn hình của role khác** (admin nhập → user xem và ngược lại) | Hiển thị đúng chuỗi dưới dạng text (đã escape), không sinh thẻ HTML; API JSON trả `Content-Type: application/json` | Thông tin–Cao (Cao nếu script chạy) | UI | UB#13 |
| IN03 | SQL injection (probe) | Gửi `'`, `' OR '1'='1`, `1;--` vào **form login**, tham số tìm kiếm/lọc/sắp xếp (`sort`, `order`, tên cột); dạng boolean: so response của `' AND '1'='1` với `' AND '1'='2` | Không 500, không trả dữ liệu ngoài phạm vi, không lộ câu SQL; 2 response boolean giống nhau | Khẩn cấp nếu lỗi | HTTP | ASVS V5, xlsx INJ-001–005 |
| IN04 | Thông báo lỗi không lộ thông tin nội bộ | Gây lỗi (IN01, IN03, JSON sai cú pháp) | Response không chứa stack trace, đường dẫn file, câu SQL, tên bảng | Thấp | HTTP | ASVS V7 |
| IN05 | Giới hạn độ dài phía server | Gửi chuỗi vượt max length của đặc tả + rất dài (10.000 ký tự) thẳng vào API | 400/422; không 500 | Thấp | HTTP | ASVS V5 |
| IN06 | CSV injection khi export | Lưu giá trị bắt đầu bằng `=`, `+`, `-`, `@` → export CSV | Giá trị được escape (thêm `'` phía trước) hoặc theo đặc tả | Thấp | HTTP | ASVS V5 |
| IN07 | Open redirect | Tham số redirect sau login / logout (`?redirect=`, `?returnUrl=`) đặt `https://evil.example`, `//evil.example`, `/\evil.example` | Không chuyển sang domain ngoài | Thấp | UI | ASVS V5 |
| IN08 | XSS phía client (DOM) | Đặt `<'"xss0"'>` / `#<img src=x onerror=…>` dạng vô hại (`alert` thay bằng `console.log('xss0')`) vào query, hash, tham số mà JS đọc để render (search, tab, modal) | Không sinh thẻ HTML, không chạy script (không có log `xss0`) | Trung bình–Cao | UI | xlsx XSS-003 |

## 7. UP — Upload file (áp dụng khi có chức năng upload / import)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| UP01 | Whitelist extension | Upload file `.html`, `.svg`, `.exe`, `.php` (nội dung vô hại) vào chỗ chỉ nhận CSV/ảnh/PDF | Bị từ chối | Thấp | HTTP | UB#5–6 |
| UP02 | Giả mạo extension / MIME | File `.csv` nhưng nội dung HTML; file `.png` nhưng nội dung text; đổi `Content-Type` trong request; đuôi kép `a.php.jpg`, `a.jpg.html`, chữ hoa `a.PHP` | Bị từ chối (kiểm nội dung / magic bytes), hoặc theo đặc tả | Thấp | HTTP | UB#5–6 |
| UP03 | Giới hạn kích thước | Upload file vượt giới hạn của đặc tả (hoặc 20 MB) | 413/400 với message; không 500 | Thấp | HTTP | ASVS V12 |
| UP04 | File được trả về an toàn | Tải lại file đã upload | `Content-Disposition: attachment` hoặc `Content-Type` đúng loại + `nosniff`; file HTML/SVG không chạy trong domain của app | Trung bình | HTTP | ASVS V12 |
| UP05 | Tên file không dùng để duyệt thư mục | Upload với tên `../../a.csv`, tên có ký tự đặc biệt; upload trùng tên file đã có | Tên được chuẩn hóa / bị từ chối; không ghi đè file khác | Trung bình | HTTP | ASVS V12 |
| UP06 | File riêng tư không tải được khi không có quyền | Lấy URL file của user A → mở khi chưa đăng nhập, bằng user B, sau khi file bị xóa; URL ký (signed URL) sau khi hết hạn | 401/403/404; URL ký có thời hạn ngắn | Cao | HTTP | xlsx FILE-009, FILE-010 |

## 8. CS — CSRF (áp dụng khi xác thực bằng cookie)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| CS01 | Request thay đổi dữ liệu từ site khác | Gửi POST/PUT/DELETE với cookie phiên nhưng `Origin`/`Referer` là domain lạ, không có CSRF token / custom header. **Bắt buộc thử** ở: đổi mật khẩu, đổi email, xóa, cập nhật quyền/role; các chức năng ghi khác gộp theo S3 | Bị từ chối (403), hoặc cookie `SameSite=Lax/Strict` + API chỉ nhận JSON (ghi rõ cơ chế) | Trung bình | HTTP | ASVS V4, xlsx CSRF-001,004–006 |
| CS02 | CSRF token sai / dùng lại (khi app dùng CSRF token) | Thay token bằng chuỗi ngẫu nhiên; dùng token của phiên khác; dùng lại token đã dùng (nếu đặc tả quy định dùng 1 lần) | Bị từ chối | Trung bình | HTTP | xlsx CSRF-002, CSRF-003 |
| CS03 | GET không thay đổi dữ liệu | Gọi bằng GET các hành động ghi (xóa, duyệt, đăng xuất…), kể cả qua link `<img src>` | 404/405, dữ liệu không đổi | Trung bình | HTTP | xlsx CSRF-008 |

## 9. SS — Phiên đăng nhập

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| SS01 | Đổi session ID khi đăng nhập (session fixation) | Ghi cookie phiên trước đăng nhập, đặt thử giá trị tự chọn → đăng nhập → so cookie | Giá trị sau đăng nhập khác cả giá trị cũ và giá trị tự đặt | Trung bình | HTTP | xlsx AUTH-010, SES-004 |
| SS02 | Token / cookie phiên bị sửa | JWT: sửa payload giữ chữ ký, `alg: none`, chữ ký sai, `exp` đã qua; cookie mờ: đổi ký tự, cắt, tự đặt → gọi API | 401/403 cho mọi biến thể | Cao | HTTP | xlsx API-002–005, SES-010 |
| SS03 | Hết phiên khi không thao tác (idle timeout) | Đăng nhập → không thao tác quá thời gian đặc tả (local: chỉnh cấu hình ngắn) → thao tác lại | Bị đăng xuất / 401. Đặc tả không quy định → Qxx | Thấp | UI/MANUAL | xlsx SES-005 |
| SS04 | Chính sách đăng nhập đồng thời | Đăng nhập cùng tài khoản ở 2 context | Theo đặc tả (cho phép / đăng xuất phiên cũ / chặn phiên mới). Không có đặc tả → Qxx, không tính NG | Thông tin | HTTP | xlsx AUTH-011, SES-007 |
| SS05 | Thu hồi quyền khi user đang đăng nhập | User đăng nhập ở context 2 → admin hạ role / gỡ quyền / vô hiệu hóa ở context 1 → context 2 gọi lại API của quyền cũ | 403/401 ngay (hoặc trong thời gian đặc tả cho phép, ghi rõ) | Cao | HTTP | xlsx AUTHZ-010 |
| SS06 | Back sau khi đăng xuất | Đăng xuất → bấm Back / tải lại trang có dữ liệu cá nhân | Không hiện dữ liệu (chuyển về login); phụ thuộc HDR06 `no-store` | Thấp | UI | xlsx SES-009 |
| SS07 | Token hết hạn thật bị từ chối | Dùng token sau khi hết hạn (local: cấu hình thời hạn ngắn; refresh token đã thu hồi) | 401; refresh token cũ không dùng lại được | Trung bình | HTTP | xlsx API-003 |

## 10. AP — API

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| AP01 | Response không trả thừa dữ liệu | Gọi API chi tiết / danh sách / hồ sơ của từng role, đọc **toàn bộ** JSON (kể cả field FE không hiển thị) | Không có hash mật khẩu, token, secret, thông tin cá nhân của người khác, field nội bộ (`deleted_at`, ghi chú admin…) ngoài đặc tả | Cao | HTTP | xlsx API-011 |
| AP02 | Method không được hỗ trợ | Gọi GET/POST/PUT/PATCH/DELETE lên endpoint chỉ hỗ trợ một số method | 405 (hoặc 404), không thực hiện thao tác | Thấp | HTTP | xlsx API-009 |
| AP03 | Content-Type / cấu trúc body sai | Body JSON nhưng `Content-Type: text/plain`, form-urlencoded, XML; field sai kiểu (mảng thay chuỗi, object thay số) | 400/415, không 500, không xử lý sai | Thấp | HTTP | xlsx API-010 |
| AP04 | Thiếu / thừa tham số | Bỏ từng field bắt buộc; thêm field không có trong đặc tả | Thiếu → 400 có message; thừa → bị bỏ qua (xem AZ06 cho field quyền) | Thấp | HTTP | xlsx API-006, API-007 |
| AP05 | Phân trang bất thường | `limit`/`per_page` = 100000, 0, -1, `abc`; `page` âm / rất lớn | Bị giới hạn ở max của đặc tả (hoặc 400); không 500, không trả toàn bộ bảng | Trung bình | HTTP | xlsx API-012 |
| AP06 | Rate limit API nhạy cảm (ngoài login/reset) | Gửi OTP, gửi mail/thông báo, export, tìm kiếm nặng: ngưỡng + 2 lần | Bị chặn (429) sau ngưỡng đặc tả; không có đặc tả → Qxx | Thấp | HTTP | xlsx API-013 |
| AP07 | API version cũ / tài liệu API công khai | Thử `/api/v1/…` khi đang dùng v2, endpoint deprecated; `/swagger`, `/api-docs`, `/openapi.json` trên env sẽ public | Version cũ đã tắt hoặc có cùng kiểm tra quyền; tài liệu API không công khai ở production | Thấp | HTTP | xlsx API-015 |
| AP08 | GraphQL (chỉ khi dùng GraphQL) | Gửi query introspection `__schema`; query lồng sâu (10 cấp), alias lặp nhiều lần | Introspection tắt ở env public; query vượt depth/complexity bị từ chối | Trung bình | HTTP | xlsx API-016, API-017 |

## 11. BL — Logic nghiệp vụ

Chọn mục theo luồng nghiệp vụ trong đặc tả (đặt hàng, duyệt, đăng ký, quyền lợi…). Không có luồng tương ứng → N/A kèm lý do.

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| BL01 | Bỏ qua bước của luồng | Gọi thẳng API bước sau (xác nhận, hoàn tất, duyệt) khi chưa qua bước trước | 400/409, trạng thái không đổi | Cao | HTTP | xlsx BIZ-001 |
| BL02 | Gửi trùng / retry | Bấm submit 2 lần nhanh, gửi lại cùng request, refresh sau submit | Không tạo bản ghi / giao dịch trùng (idempotency) | Trung bình | HTTP/UI | xlsx BIZ-002 |
| BL03 | Sửa giá trị nghiệp vụ trong request | Sửa giá, số tiền, số lượng (0, âm, vượt giới hạn, số lẻ), trạng thái (`pending` → `approved`), người duyệt trong body | Server tự tính / kiểm tra lại, bị từ chối (400/403) | Cao | HTTP | xlsx BIZ-003–005, BIZ-009 |
| BL04 | Thao tác trên đối tượng đã hết hạn / đóng / xóa | Sửa, duyệt, hủy đơn/yêu cầu đã hết hạn, đã đóng, đã xóa | 400/404/409 | Trung bình | HTTP | xlsx BIZ-007 |
| BL05 | Race condition | Gửi đồng thời (≤ 5 request) cùng thao tác: duyệt cùng 1 yêu cầu, dùng cùng quyền lợi, trừ cùng tồn kho/số dư | Chỉ 1 request thành công; dữ liệu nhất quán | Cao | HTTP | xlsx BIZ-008, BIZ-012 |
| BL06 | Giới hạn số lần dùng quyền lợi | Dùng coupon / lượt đăng ký / ưu đãi vượt số lần cho phép (tuần tự) | Bị từ chối sau giới hạn | Trung bình | HTTP | xlsx BIZ-010 |

## 12. EX — Lộ thông tin và cấu hình

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| EX01 | File cấu hình / VCS / backup / log qua web | GET `/.env*`, `/.git/HEAD`, `/.git/config`, `.DS_Store`, `*.bak`, `*.sql`, `*.zip`, file log… (`sec.EXPOSURE` + `security.exposurePaths`) | 403/404 hoặc trang fallback; không trả nội dung | Cao | HTTP | xlsx INFO-003, 007, 009 |
| EX02 | Directory listing | GET `/uploads/`, `/storage/`, `/static/`… | Không hiển thị danh sách file | Trung bình | HTTP | xlsx INFO-004 |
| EX03 | Source map công khai | Đọc `sourceMappingURL` của JS, GET `*.js.map` | 403/404 trên env sẽ public (env dev được phép thì ghi `accepted`) | Thấp | HTTP | xlsx INFO-010 |
| EX04 | Công cụ debug / trang quản trị framework | Debugbar, Telescope, Horizon, Actuator, server-status, pprof, Nuxt DevTools, Symfony Profiler; trang lỗi debug (Whoops, Ignition) | Không truy cập được | Cao | HTTP | xlsx INFO-005, ADV-008 |
| EX05 | Tài khoản mặc định | Hỏi dev / đọc seeder, migration, tài liệu triển khai: tài khoản `admin/admin`, tài khoản demo còn tồn tại không. **Không dò mật khẩu bằng danh sách** | Không có tài khoản mặc định ở env sẽ public | Cao | MANUAL | xlsx ADV-007 |
| EX06 | Dữ liệu nhạy cảm trên URL | Xem URL sau login, reset, thanh toán, export (thanh địa chỉ, lịch sử, header Referer) | Không có token phiên, mật khẩu, thông tin cá nhân trong query (token reset 1 lần trong link mail thì được) | Trung bình | UI | xlsx INFO-006 |
| EX07 | Dữ liệu nhạy cảm trong log | Nhờ dev cho xem log sau khi login/đổi mật khẩu/reset (theo quyền được cấp) | Không ghi mật khẩu, token, số thẻ | Trung bình | MANUAL | xlsx INFO-007 |

## 13. CM — Quản lý nội dung (áp dụng khi app có CMS / bài viết / trang tĩnh do admin soạn)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| CM01 | Bài nháp / chưa công khai | Lấy URL + API của bài nháp, bài hẹn giờ → mở khi chưa đăng nhập / bằng user không có quyền | 404/403, không lộ nội dung | Cao | HTTP | xlsx CMS-004 |
| CM02 | Link preview | Mở URL preview bằng user không có quyền; dùng token preview sau khi hết hạn | Bị từ chối; token preview có hạn | Trung bình | HTTP | xlsx CMS-006 |
| CM03 | Nội dung đã xóa | Xóa bài → mở URL, API, file đính kèm cũ | 404/410 | Trung bình | HTTP | xlsx CMS-005 |
| CM04 | Audit log | User thường gọi API sửa / xóa lịch sử thao tác | 403; log không đổi | Trung bình | HTTP | xlsx CMS-008 |
| CM05 | Sửa đồng thời | 2 admin mở cùng bài → cùng lưu | Có cảnh báo / khóa lạc quan; không mất dữ liệu âm thầm | Thấp | UI | xlsx CMS-010 |
| CM06 | Lọc HTML của rich text | Lưu nội dung có `onerror=`, `javascript:` URL, `<iframe>`, `<style>` → xem trang công khai | Thuộc tính / thẻ nguy hiểm bị loại; thẻ cho phép theo đặc tả | Cao | UI | xlsx CMS-002 |

Publish / sửa nội dung không có quyền: dùng AZ02. Cô lập tenant: AZ04.

## 14. SF / PT — Request phía server và đường dẫn file

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| SF01 | SSRF (khi có chức năng nhận URL: lấy ảnh từ URL, webhook, import, preview link) | Nhập `http://127.0.0.1:1/`, `http://localhost/`, `http://[::1]/`, `file:///etc/hosts`, URL của dự án redirect sang địa chỉ nội bộ | Bị từ chối (chỉ cho phép http/https tới host công khai / allowlist); không theo redirect sang nội bộ | Cao | HTTP | xlsx ADV-001, ADV-002 |
| PT01 | Path traversal ở tham số đọc / tải file | Tham số tên file / đường dẫn: `../../etc/passwd`, bản encode (`PAYLOADS.traversal`) | 400/404; không trả file ngoài thư mục cho phép | Cao | HTTP | xlsx ADV-004, ADV-005 |

---

## Phần F — Ngoài phạm vi TC (ghi nhận, nhờ công cụ / bên chuyên môn)
| Mục | Cách làm đề xuất | Nguồn |
|---|---|---|
| Phiên bản TLS, cipher, chứng chỉ (hostname, thời hạn, chuỗi) | `testssl.sh`, SSL Labs (env public) | xlsx HDR-007, HDR-009 |
| Lỗ hổng thư viện | `npm audit`, `composer audit`, `pip-audit`, Dependabot | xlsx ADV-010 |
| Archive bomb, file malware mẫu (EICAR), luồng quét virus | Môi trường cô lập, có phê duyệt | xlsx FILE-012, FILE-013 |
| SSRF qua DNS rebinding | Lab riêng | xlsx ADV-003 |
| Blind SQLi dạng thời gian trên env dùng chung, tải nặng / DoS | Bên chẩn đoán chuyên môn | xlsx INJ-005, API-013 |

---

## Bảng đối chiếu báo cáo UBsecure → mã danh mục

| UB# | Lỗi trong báo cáo | Mã |
|---|---|---|
| 1 | Cho phép mật khẩu yếu | AU01, AU02 |
| 2 | Thiếu frame-ancestors trong CSP | HDR02 |
| 3 | Thiếu Content-Security-Policy | HDR01 |
| 4 | Thiếu Strict-Transport-Security | HDR03 |
| 5–6 | Không kiểm tra file upload | UP01, UP02 |
| 7 | Response HTTPS có thể bị cache | HDR06 |
| 8 | Cookie thiếu prefix `__Host-` | CK04 |
| 9 | Chức năng đăng ký người dùng có lỗ hổng | RG01, RG02 |
| 10 | Chức năng reset mật khẩu có lỗ hổng | RS01–RS08, AU07 |
| 11 | Cookie có Max-Age | CK05, AU05 |
| 12 | Thao tác được chức năng không có quyền | CK06, AZ01 |
| 13 | XSS đối với tham số | IN02 |
| 14–21 | Tràn số nguyên | IN01 |
| 22 | Thiếu X-Content-Type-Options | HDR04 |
| 23 | Thiếu X-Download-Options | HDR07 |
| 24 | Thiếu X-Frame-Options | HDR05 |
| 25 | List-based account hacking | AU03, AU08 |

## Quy tắc gộp riêng cho bảo mật (bổ sung cho G1–G6 của rule 01)
- **S1.** Các mục HDR đọc từ cùng một response → gộp 1 TC cho mỗi loại response (trang HTML / API JSON / file tải về). Ảnh evidence là bảng "header — giá trị thực tế — OK/NG", nên khi fail vẫn biết mục nào lỗi.
- **S2.** Các mục CK01–CK05 của cùng cookie → 1 TC (1 lần login, 1 bảng thuộc tính).
- **S3.** AZ02/AZ03/AZ04/AZ05: 1 TC cho mỗi **nhóm API** (cùng guard, cùng role) và mỗi kiểu truy cập (đọc / ghi). Không sinh 1 TC cho từng endpoint; liệt kê endpoint trong Steps, evidence là bảng "endpoint — method — status".
- **S4.** IN01 / IN03 / IN05: 1 TC cho mỗi nhóm API cùng cách validation (cùng DTO/pipe), liệt kê tham số đã thử trong bảng evidence.
- **S5.** Mục nào áp dụng cho từng chức năng (upload, ID trong URL, màn hình chỉ admin) thì bộ test case của chức năng đó (`app-testcase`) chỉ ghi `Tham chiếu: TC-SEC-xxx`, không test lại.
- **S6.** AP02–AP05: 1 TC cho mỗi nhóm API cùng cách validation (như S4). BL01–BL06: 1 TC cho mỗi luồng nghiệp vụ (vd "Đơn đặt: bỏ bước, sửa giá, gửi trùng, race"), liệt kê từng thử nghiệm trong Steps. CM01–CM03: 1 TC cho mỗi loại nội dung.

## Bảng đối chiếu `WebApp_Security_Test_Cases.xlsx` → mã danh mục
Khi khách hàng / PM gửi checklist Excel này, dùng bảng dưới để điền kết quả theo mã TC đã chạy. `F` = Phần F (ngoài phạm vi TC).

| Nhóm xlsx | Đối chiếu |
|---|---|
| 01 AUTH | 001 AU04 · 002 AU03 · 003 AU04, RS01 · 004 IN03 · 005 AU03, AU09 · 006 AU09 · 007 RS02 · 008 RS03 · 009 RS07 + SS02 (token sửa bị từ chối) · 010 SS01 · 011 SS04 · 012 AU10, AU07 |
| 02 AUTHZ | 001 AZ01 · 002 AZ03 · 003 AZ02 · 004 AZ01(c), AZ02 · 005 AZ06 · 006 AZ03 · 007 AZ02, AZ03 · 008 AZ03 · 009 AZ06 · 010 SS05 |
| 03 INJ / XSS | INJ-001–004 IN03 · INJ-005 IN03 (boolean), F (time-based) · XSS-001, 002, 004, 005, 007, 008 IN02 · XSS-003 IN08 · XSS-006 UP01, UP04 |
| 04 CSRF | 001, 004–006 CS01 · 002, 003 CS02 · 007 CK03 · 008 CS03 |
| 05 API | 001, 002 AZ05 · 003 SS02, SS07 · 004, 005 SS02 · 006, 007 AP04 · 008 AZ06 · 009 AP02, HDR12 · 010 AP03 · 011 AP01 · 012 AP05 · 013 AP06, AU03, RS06 · 014 HDR09 · 015 AP07 · 016, 017 AP08 · 018 IN04 |
| 06 SES | 001–003 CK01–CK03 · 004 SS01 · 005 SS03 · 006 CK07 · 007 SS04 · 008 AU07, RS05 · 009 SS06 · 010 SS02 |
| 07 FILE | 001 (chức năng, `app-testcase`) · 002 UP01 · 003–005 UP02 · 006 UP03 · 007 UP01, UP04 · 008 UP05 · 009, 010 UP06 · 011 UP05 · 012, 013 F · 014 HDR07, UP04 |
| 08 HDR | 001 HDR10 · 002 HDR03 · 003 HDR01 · 004 HDR02, HDR05 · 005 HDR04 · 006 HDR11 · 007 F · 008 HDR13 · 009 F · 010 HDR06 |
| 09 BIZ | 001 BL01 · 002 BL02 · 003–005, 009 BL03 · 006 AZ02 · 007 BL04 · 008, 012 BL05 · 010 BL06 · 011 AZ04 |
| 10 INFO | 001, 002 IN04 · 003, 007, 009 EX01 (007 cả EX07) · 004 EX02 · 005 EX04, IN04 · 006 EX06 · 008 AU04, RS01 · 010 EX03 |
| 11 ADV | 001, 002 SF01 · 003 F · 004, 005 PT01, UP05 · 006 IN07 · 007 EX05 · 008 EX04, AZ02, AZ05 · 009 HDR12, AP02 · 010 F |
| 12 CMS | 001 IN02 · 002 CM06 · 003 AZ02 · 004 CM01 · 005 CM03 · 006 CM02 · 007 AZ04 · 008 CM04 · 009 AZ02 · 010 CM05 |
