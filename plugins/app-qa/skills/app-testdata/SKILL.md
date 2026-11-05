---
name: app-testdata
description: Chuẩn bị dữ liệu test cho bộ test case webapp (TD-xx trong TestDesign) — tài khoản theo role/tenant, bản ghi biên, trạng thái, dữ liệu race — dưới dạng script SQL/API có thứ tự chạy, ánh xạ tên TC → dữ liệu thật, cleanup, và danh sách dữ liệu không tạo được với code hiện tại.
---

# Dữ liệu test (TESTDATA)

Mẫu tham khảo: `<docs.repo>/<docs.testing>/TESTDATA/*/README.md` (ví dụ Entoly M2).

## Đầu vào
- Mục **Dữ liệu kiểm thử (TD-xx)** và Pre-Condition của từng TC trong `TESTCASE/<M>_TestDesign.md` / `_TestCase.csv`.
- Schema thật: đọc file schema / migration của BE (vd `be/prisma/schema.prisma`) và API tạo dữ liệu (route, DTO) **ở bản code hiện tại**. Không giả định cột.
- Seed sẵn có của BE (vd `npm run db:seed`) để biết dữ liệu nào đã có.

## Đầu ra: `TESTDATA/<M>_<Ten>/`
1. `README.md` gồm:
   - **Thứ tự chuẩn bị**: bảng `Bước | Việc | Cách làm | TD / TC`. Mỗi bước ghi rõ làm qua UI, API (`POST /api/...`) hay SQL, và các ID / token cần ghi lại.
   - **Ánh xạ tên trong TC → tên dữ liệu thật**: tách dữ liệu riêng khi hai TC dùng chung sẽ làm sai số liệu của nhau.
   - **Không chuẩn bị được với code hiện tại**: dữ liệu, lý do (ràng buộc schema, BE chưa có status…), TC bị ảnh hưởng. Đây là căn cứ để đánh BLOCKED / NA khi chạy.
   - Cảnh báo phạm vi: script viết cho DB nào, đã chạy thử hay chưa.
2. Script đánh số theo thứ tự chạy: `01_*.sql`, `02_*.sql`… Script cho case đặc biệt (race, concurrency) ghi rõ **chạy vào lúc nào trong case**. Cuối cùng là `99_cleanup.sql`.
   - Dữ liệu tạo ra phải nhận ra được (tên có tiền tố `QA ` hoặc mã TD) để cleanup chỉ xoá đúng dữ liệu test.
   - Idempotent nếu được (kiểm tồn tại trước khi insert).
   - Ngày giờ tương đối với ngày chạy (hôm nay, ngày mai, thứ 7 tới) và theo múi giờ của app (`timezone` trong config).

## Quy tắc
- **Không tự chạy** script trên DB hay môi trường dùng chung. Chỉ chạy khi người dùng yêu cầu rõ, đúng môi trường họ chỉ định (thường là local hoặc DB test riêng), và in câu lệnh trước khi chạy.
- Không ghi mật khẩu hay key vào script và README. Tài khoản test ghi tên; mật khẩu nằm ở `.env.local` của thư mục QA (khai báo trong `qa-config.json` `accounts`).
- File ảnh hoặc file upload cần cho test (kích thước biên, định dạng sai) thì liệt kê trong README. Có thể sinh bằng script nếu người dùng muốn.
- Sau khi tạo xong, cập nhật `accounts` trong `qa-config.json` (tên tài khoản = tên trong TD-01) để runner đăng nhập được.
