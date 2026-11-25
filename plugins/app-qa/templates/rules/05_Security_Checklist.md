# DANH MỤC KIỂM TRA BẢO MẬT WEBAPP (rule 05)

Danh mục chuẩn để sinh bộ test case bảo mật cho mỗi webapp, chạy **trước** đợt chẩn đoán của bên thứ ba
(ví dụ UBsecure Vex). Mục tiêu: tự phát hiện và sửa các lỗi mà bên chẩn đoán chắc chắn sẽ kiểm tra.

- **Nguồn**: `UB#n` = chỉ ra thật trong báo cáo chẩn đoán UBsecure (Shift Management, 11/2026, 25 mục).
  `ASVS Vx` = OWASP ASVS 4.0.3, chương tương ứng (bổ sung các mục bên chẩn đoán thường kiểm nhưng chưa xuất hiện trong báo cáo trên).
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
| AZ01 | Sửa thông tin quyền phía client | Login role thấp → sửa role trong cookie/storage (CK06) thành role cao → mở URL màn hình của role cao | Không vào được màn hình (redirect/403) **và** API của màn hình đó trả 403 | Thấp–Cao (Cao nếu xem/sửa được dữ liệu) | UI | UB#12 |
| AZ02 | Gọi thẳng API của role cao | Dùng token role thấp gọi API chỉ dành cho role cao (GET danh sách, POST/PUT/DELETE) | 403 cho mọi method; không có thay đổi dữ liệu | Cao | HTTP | ASVS V4 |
| AZ03 | IDOR — truy cập tài nguyên của người khác | Dùng token user A gọi API theo ID tài nguyên của user B (xem, sửa, xóa) | 403 hoặc 404; dữ liệu B không bị trả về/thay đổi | Cao | HTTP | ASVS V4 |
| AZ04 | Cô lập tenant | Dùng token tenant X gọi API với ID tài nguyên / tenant của tenant Y | 403 hoặc 404 | Cao | HTTP | ASVS V4 |
| AZ05 | API không đăng nhập | Gọi các API cần login mà không có token / token sai chữ ký / token hết hạn | 401 | Cao | HTTP | ASVS V4 |
| AZ06 | Mass assignment | Gửi thêm `roleId`, `role`, `tenantId`, `isAdmin`… vào API cập nhật hồ sơ của chính mình | Field bị bỏ qua hoặc 400; quyền không đổi | Cao | HTTP | ASVS V5 |

## 6. IN — Kiểm tra input

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| IN01 | Tràn số nguyên | Gửi `2147483648`, `-1`, `1.5`, `"abc"` vào tham số ID/số (path, query, body, mảng ID) | 400/422 với message validation; **không 500** | Thông tin | HTTP | UB#14–21 |
| IN02 | XSS (lưu trữ / phản chiếu) | Nhập `<'"xss0"'>` vào field text → lưu → mở các màn hình hiển thị giá trị đó | Hiển thị đúng chuỗi dưới dạng text (đã escape), không sinh thẻ HTML; API JSON trả `Content-Type: application/json` | Thông tin–Cao (Cao nếu script chạy) | UI | UB#13 |
| IN03 | SQL injection (probe) | Gửi `'`, `' OR '1'='1`, `1;--` vào tham số tìm kiếm/lọc/sắp xếp | Không 500, không trả dữ liệu ngoài phạm vi, không lộ câu SQL | Khẩn cấp nếu lỗi | HTTP | ASVS V5 |
| IN04 | Thông báo lỗi không lộ thông tin nội bộ | Gây lỗi (IN01, IN03, JSON sai cú pháp) | Response không chứa stack trace, đường dẫn file, câu SQL, tên bảng | Thấp | HTTP | ASVS V7 |
| IN05 | Giới hạn độ dài phía server | Gửi chuỗi vượt max length của đặc tả + rất dài (10.000 ký tự) thẳng vào API | 400/422; không 500 | Thấp | HTTP | ASVS V5 |
| IN06 | CSV injection khi export | Lưu giá trị bắt đầu bằng `=`, `+`, `-`, `@` → export CSV | Giá trị được escape (thêm `'` phía trước) hoặc theo đặc tả | Thấp | HTTP | ASVS V5 |
| IN07 | Open redirect | Tham số redirect sau login / logout (`?redirect=`, `?returnUrl=`) đặt `https://evil.example` | Không chuyển sang domain ngoài | Thấp | UI | ASVS V5 |

## 7. UP — Upload file (áp dụng khi có chức năng upload / import)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| UP01 | Whitelist extension | Upload file `.html`, `.svg`, `.exe`, `.php` (nội dung vô hại) vào chỗ chỉ nhận CSV/ảnh/PDF | Bị từ chối | Thấp | HTTP | UB#5–6 |
| UP02 | Giả mạo extension / MIME | File `.csv` nhưng nội dung HTML; file `.png` nhưng nội dung text; đổi `Content-Type` trong request | Bị từ chối (kiểm nội dung / magic bytes), hoặc theo đặc tả | Thấp | HTTP | UB#5–6 |
| UP03 | Giới hạn kích thước | Upload file vượt giới hạn của đặc tả (hoặc 20 MB) | 413/400 với message; không 500 | Thấp | HTTP | ASVS V12 |
| UP04 | File được trả về an toàn | Tải lại file đã upload | `Content-Disposition: attachment` hoặc `Content-Type` đúng loại + `nosniff`; file HTML/SVG không chạy trong domain của app | Trung bình | HTTP | ASVS V12 |
| UP05 | Tên file không dùng để duyệt thư mục | Upload với tên `../../a.csv`, tên có ký tự đặc biệt | Tên được chuẩn hóa / bị từ chối; không ghi đè file khác | Trung bình | HTTP | ASVS V12 |

## 8. CS — CSRF (áp dụng khi xác thực bằng cookie)

| Mã | Kiểm tra | Cách test | Mong đợi [Baseline] | Mức mặc định | Tự động | Nguồn |
|---|---|---|---|---|---|---|
| CS01 | Request thay đổi dữ liệu từ site khác | Gửi POST/PUT/DELETE với cookie phiên nhưng `Origin`/`Referer` là domain lạ, không có CSRF token / custom header | Bị từ chối (403), hoặc cookie `SameSite=Lax/Strict` + API chỉ nhận JSON (ghi rõ cơ chế) | Trung bình | HTTP | ASVS V4 |

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
