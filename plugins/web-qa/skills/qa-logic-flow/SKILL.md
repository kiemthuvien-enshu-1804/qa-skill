---
name: qa-logic-flow
description: Kiểm logic bằng Playwright (phần VS Code) — check chung mọi trang (title/OGP/favicon, GTM, số điện thoại, ảnh Retina/nặng, link, breadcrumb, 404) và flow riêng từng trang (menu, dropdown, slider, filter/search, tab, pagination, accordion, modal, map, form validation không submit thật, anchor, print). Việc không tự động được thì đánh dấu needs-chrome; mục checklist tương ứng để trống cho tester.
---

# Kiểm logic bằng Playwright

## 1. Check chung — chạy cho MỌI trang (không cần viết code)
```bash
for vp in sp pc; do node "${CLAUDE_PLUGIN_ROOT}/scripts/page_checks.mjs" --page <page> --vp $vp --out $RUN; done
```
Ghi `$RUN/flow.<page>.common.<vp>.chromium.json` (cùng format flow). Gồm:
| Check | Checklist Excel |
|---|---|
| `<title>`, meta description, OGP (og:title/description/image, og:image trả 200), favicon | Favicon, OGP, title, description |
| GTM có dạng `GTM-XXXXXXX` (không thấy GTM → `needs-chrome`; bắn tag thì tester kiểm GTM Preview) | GTM |
| SP: số điện thoại là link `tel:`; PC: link `tel:` không bấm được | Số điện thoại |
| Ảnh Retina (ảnh ≥ 2× kích thước hiển thị), ảnh ≤ 500KB (`--img-max-kb`) | Images: x2, load nhanh |
| Link ngoài mở tab mới, link nội bộ không 4xx/5xx (`--link-limit`, mặc định 60) | Link: click (cùng tab / tab mới) |
| Breadcrumb: mục cuối không bấm được, link không lỗi | Breadcrumb |
| URL không tồn tại → HTTP 404 + tiếng Nhật (chỉ chạy ở trang đầu tiên trong `pages[]`) | 404: route không tồn tại |

Check trả `na` = trang không có thứ đó (không có số điện thoại, breadcrumb, ảnh…) → mục checklist tương ứng đánh `NA`.

## 2. Flow riêng của trang
1. Liệt kê hành vi cần kiểm từ: Figma (prototype, comment, các variant 0 kết quả / lỗi), spec dự án, **checklist Excel** (sheet của trang), `specs/<page>.notes.md`.
2. Copy mẫu và viết check:
   ```bash
   mkdir -p flows && cp "${CLAUDE_PLUGIN_ROOT}/scripts/flow_template.mjs" flows/<page>.flow.mjs
   for vp in sp pc; do WEBQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node flows/<page>.flow.mjs --out $RUN --vp $vp; done
   ```
   Mỗi `check(name, {steps, expected, severity, group}, fn)` trả `{ok, actual}`, hoặc `{status: 'na' | 'needs-chrome' | 'blocked', reason}`. `severity` mặc định `medium`, chọn theo bảng Severity trong `qa-bug-report`. `name`, `expected`, `steps` viết tiếng Việt.
3. Nên kiểm tự động (theo checklist Excel):
   - **Menu**: hiển thị đủ mục, link đúng (cùng tab / tab mới), trạng thái active của trang hiện tại; dropdown bấm 1 lần mở, 2 lần đóng; nav bar cuộn xuống ẩn, cuộn lên hiện (`page.mouse.wheel` rồi đọc `getBoundingClientRect().top`); hamburger SP mở/đóng, khoá scroll.
   - **Slider**: số item và số chấm (dot) khớp nhau; nút ‹ › đổi slide active; bấm dot/thumbnail đổi đúng slide; autoplay (chờ vài giây xem slide active có đổi không, so với spec); SP vuốt được (`page.touchscreen` / drag), không nháy khi vuốt → nếu cần mắt người thì `needs-chrome`.
   - **Search / filter / tab / category**: nhiều điều kiện, 1 điều kiện, không chọn điều kiện nào; kết quả đúng, URL param, trạng thái active; 0 kết quả hiển thị đúng như Figma.
   - **Show/hide (accordion)**: bấm 1 lần mở, 2 lần đóng; **modal**: nội dung đúng, nút × đóng, ESC, click ngoài.
   - **Pagination**: next/prev, trang đầu/cuối không có nút (hoặc disable), chuyển trang tự cuộn lên đầu (`scrollY` ≈ 0), giữ filter khi chuyển trang; dữ liệu > 100 bài hiển thị đủ (kèm `qa-cms-data`).
   - **Form**: bấm nút vào màn nhập; validation (bắt buộc, email/tel/郵便番号, 全角/半角, độ dài tối đa, loại ký tự, thông báo lỗi đúng chữ/vị trí); radio/checkbox có giá trị mặc định, chọn được, checkbox chọn nhiều; dropdown giá trị mặc định, danh sách đúng thứ tự; màn confirm hiển thị đúng nội dung đã nhập → **dừng trước nút gửi thật**.
   - **Map (Google Maps embed)**: `iframe` có `hl=ja` (hiển thị tiếng Nhật) và địa chỉ/toạ độ đúng spec; link "mở Google Maps" trỏ đúng vị trí.
   - **Anchor link** cuộn đến đúng section, nút TOP.
   - **Trang chi tiết không tồn tại** (vd `/news/<id-giả>`) → 404 tiếng Nhật.
   - **Print**: `await page.emulateMedia({ media: 'print' })` rồi chụp ảnh / `page.pdf()`; Claude xem ảnh (logo, text, vừa khổ giấy) và ghi bug vào `manual_bugs.json` nếu vỡ.
4. Đánh dấu `{status: 'needs-chrome', reason}` cho: submit thật + email, chuyển tiếp mail trên Garoon, login/2FA, CAPTCHA, CMS admin / preview, GTM Preview, hover có transition và animation khi cuộn (script tắt animation để đo nên không đánh giá được), đánh giá bằng mắt.
   Bị chặn khi chạy (CAPTCHA, 403) → `{status: 'blocked', reason}`.
   Core Web Vitals: checklist đang ghi "tạm thời pending" → để trống, chỉ chạy Lighthouse khi dự án yêu cầu.
5. `make_bugs.py` tự đổi check `fail` thành bug; check `needs-chrome`/`blocked` được ghi vào prompt tester khi chạy `update_checklist.py --run $RUN`, mục checklist tương ứng để trống. Check `na` → mục checklist đánh `NA`.

Giữ `flows/` trong repo QA để lần verify sau khi dev fix chạy lại y hệt.
