---
name: qa-logic-flow
description: Viết và chạy kiểm thử logic bằng Playwright (phần VS Code) — filter, tab, pagination, accordion, modal, menu SP, form validation (không submit thật), link nội bộ, 404, anchor. Việc không tự động được thì đánh dấu needs-chrome; mục checklist tương ứng để trống cho tester.
---

# Kiểm logic bằng Playwright

1. Liệt kê hành vi cần kiểm từ: Figma (prototype, comment, các variant 0 kết quả / lỗi), spec dự án, checklist Excel, `specs/<page>.notes.md`.
2. Copy mẫu và viết check:
   ```bash
   mkdir -p flows && cp .claude/skills/web-qa/scripts/flow_template.mjs flows/<page>.flow.mjs
   for vp in sp pc; do node flows/<page>.flow.mjs --out $RUN --vp $vp; done
   ```
   Mỗi `check(name, {steps, expected, severity, group}, fn)` trả `{ok, actual}`.
3. Nên kiểm tự động:
   - filter/tab/category: kết quả đúng, URL param, trạng thái active, 0 kết quả (so với variant Figma)
   - pagination: next/prev, trang đầu/cuối, giữ filter khi chuyển trang
   - form validation: bắt buộc, email/tel/郵便番号, 全角/半角, độ dài tối đa, thông báo lỗi đúng chữ/vị trí, màn hình xác nhận → **dừng trước nút gửi thật**
   - menu SP (hamburger mở/đóng, khoá scroll), accordion, modal (ESC, click ngoài), anchor link, nút TOP
   - mọi link nội bộ trả 200, link ngoài `target="_blank"`, trang 404
4. Đánh dấu `{status: 'needs-chrome', reason}` cho: submit thật + email, login/2FA, CAPTCHA, CMS admin, tracking, đánh giá animation bằng mắt.
   Bị chặn khi chạy (CAPTCHA, 403) → `{status: 'blocked', reason}`.
5. `make_bugs.py` tự đổi check `fail` thành bug; check `needs-chrome`/`blocked` được ghi vào prompt tester khi chạy `update_checklist.py --run $RUN`, mục checklist tương ứng để trống.
Giữ `flows/` trong repo QA để lần verify sau khi dev fix chạy lại y hệt.
