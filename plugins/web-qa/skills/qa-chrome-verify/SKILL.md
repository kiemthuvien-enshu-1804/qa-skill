---
name: qa-chrome-verify
description: Phần của tester — dùng Claude in Chrome để kiểm nốt các mục checklist còn trống sau bước tự động ở VS Code (gửi form thật + mail, login, CAPTCHA, CMS admin, animation, GA4, embed, zoom), tạo bug trên Tracker và điền kết quả vào checklist. Cũng dùng để tester verify lại bug do mình tạo sau khi dev fix.
---

# Tester + Claude in Chrome

## Chuẩn bị (tester)
- Extension Claude in Chrome đã đăng nhập.
- Tracker: được share quyền **Contributor** trở lên (tạo bug, đính kèm ảnh/GIF, đổi trạng thái, comment).
- Trong Chrome đã đăng nhập sẵn: Gmail/Outlook của email test, CMS admin (nếu có mục cần), Basic Auth của site test.
- Checklist `_result.xlsx`: tốt nhất mở bằng Excel Online / Google Sheets để Claude điền thẳng; nếu mở trên máy thì Claude trả bảng kết quả để tester dán.

## Kiểm nốt checklist
1. Mở checklist + site test trong Chrome, mở Claude in Chrome.
2. Dán nội dung `<Checklist>_result_tester-prompt.md` (do VS Code sinh) vào Claude.
3. Trả lời câu hỏi đầu tiên của Claude: form nào gửi thật, email test, có được vào CMS admin không.
4. Claude kiểm từng mục trống. Khi Claude dừng ở login/OTP/CAPTCHA → tester tự làm rồi bảo tiếp tục.
5. Mục NG → Claude tạo bug trên Tracker bằng "+ Bug" (Kiểm bằng = Claude in Chrome, ảnh/GIF), viết **tiếng Việt**, chọn mức độ theo bảng Severity trong `qa-bug-report` (high / medium / low). Chỉ điền **Môi trường** khi lỗi riêng 1 môi trường (vd chỉ Safari trên iPhone). Rồi ghi `NG` vào checklist (không ghi mã bug). Mục trang không có → `NA`.
6. Xong: kiểm nhanh các ô đã điền, lưu checklist, báo người chạy VS Code.

Không mở được khung Claude in Chrome: dùng Claude Code CLI trong terminal, chạy `claude --chrome` (extension Claude in Chrome vẫn phải cài và đăng nhập trong Chrome) rồi dán cùng prompt. Claude điều khiển chính tab Chrome đó, các bước giống hệt.

## Verify sau khi dev fix (bug Kiểm bằng = Chrome / Tay)
Trên Tracker lọc Kiểm bằng = Claude in Chrome + trạng thái `fixed`. Với từng bug, nói với Claude:
> Mở bug <mã> trên Tracker, làm lại theo "Cách tái hiện". Nếu đã đúng → đổi trạng thái `verified` + comment kết quả; nếu chưa → `reopened` + comment, ảnh mới.
Sau đó cập nhật dòng checklist tương ứng (NG → OK).

## Giới hạn cần nhớ
- Cửa sổ Chrome không nhỏ dưới ~500px: mục SP 375px phải kiểm bằng DevTools device mode hoặc điện thoại.
- Claude không tự nhập mật khẩu, không giải CAPTCHA, chỉ gửi form/thao tác CMS trong phạm vi tester cho phép.
- Safari thật: kiểm trên Mac/iPhone, ghi bug Kiểm bằng = Kiểm tay.
