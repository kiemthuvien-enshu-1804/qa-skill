---
name: qa-logic-flow
description: Kiểm logic bằng Playwright (phần VS Code) — bóc quy tắc/luồng từ Figma comment + checklist thành từng nhánh if/else/biên (specs/<page>.logic.json), mỗi nhánh có dữ liệu seed CMS + check, đo độ phủ bằng logic_coverage.py; check chung mọi trang (title/OGP/favicon, GTM, số điện thoại, ảnh Retina/nặng, link, breadcrumb, 404) và flow riêng từng trang (menu, dropdown, slider, filter/search, tab, pagination, accordion, modal, map, form validation không submit thật, anchor, print). Việc không tự động được thì đánh dấu needs-chrome; mục checklist tương ứng để trống cho tester.
---

# Kiểm logic bằng Playwright

## 0. Bóc quy tắc → nhánh (bắt buộc với trang/khối có logic hiển thị, nhất là trang lấy dữ liệu CMS)
Logic và luồng thường nằm trong **Figma comment**: số bài tối đa, sort, khi 0 bài, khi thiếu ảnh/field, NEW trong N ngày, kỳ đăng bài, ẩn/hiện theo toggle, validate…
1. Nguồn để bóc quy tắc:
   - **Figma comment** (`specs/<fileKey>.comments.json`): mỗi thread gồm comment gốc + `replies` và `latest` (nội dung mới nhất). Lọc các thread thuộc frame của trang.
     - Reply thường chốt hoặc đổi quy tắc → **lấy `latest`**. Comment gốc chỉ dùng để hiểu ngữ cảnh.
     - Thread đã `resolved` vẫn đọc (thường là quy tắc đã chốt). Bỏ thread chỉ là trao đổi đã xong và không còn quy tắc.
   - Checklist Excel (sheet của trang: mục logic, CMS).
   - `specs/<page>.notes.md`.
   - Variant trên Figma (0 kết quả, lỗi, trạng thái mở…).
2. Ghi vào `specs/<page>.logic.json`. Mỗi quy tắc tách thành **mọi nhánh**:
   - nhánh if và nhánh else;
   - giá trị **đúng biên** và **2 bên biên** (vd "tối đa 3 bài" → 2, 3, 4 bài; "NEW 7 ngày" → 6, 7, 8 ngày);
   - nhánh rỗng / thiếu (0 bài, field trống);
   - tổ hợp khi 2 điều kiện cùng tác động (vd không ảnh **và** tiêu đề dài).
   ```json
   {"page": "news", "rules": [
     {"id": "R01", "title": "TOP hiện tối đa 3 bài mới nhất",
      "source": {"type": "figma-comment", "commentId": "123", "node": "12:3", "url": "<link node>", "text": "<latest>"},
      "checklist": [{"sheet": "TOP", "row": 25}],
      "branches": [
        {"id": "R01-a", "when": "có 4 bài", "expected": "hiện 3 bài mới nhất, không hiện bài cũ nhất", "seed": ["news-1", "news-2", "news-3", "news-4"]},
        {"id": "R01-b", "when": "có đúng 3 bài (lọc category)", "expected": "hiện 3 bài, không có nút xem thêm", "seed": ["cat-3"]},
        {"id": "R01-c", "when": "0 bài", "expected": "hiện 「現在ご案内できる情報はございません」", "seed": ["cat-empty"]},
        {"id": "R01-d", "when": "sort", "expected": "mới nhất trước", "seed": ["news-1", "news-2"], "check": "cms:cms-order"}]},
     {"id": "R02", "title": "NEW trong 7 ngày", "ask": "Comment không rõ tính theo ngày đăng hay ngày cập nhật",
      "branches": [{"id": "R02-a", "when": "đăng 6 ngày trước", "expected": "có nhãn NEW"}]}]}
   ```
   Giải thích các trường:
   - `seed`: key bài trong `cms-seed/<page>.seed.json`.
     - Nhánh không cần dữ liệu mới (vd dùng bài sẵn có) → `"noSeed": "<lý do>"`.
     - Trang không lấy CMS → luôn `noSeed`.
   - `check`: mặc định là check flow có tên chứa `[<id nhánh>]`. Nhánh đã được `cms_check` kiểm → `"cms:<prop>"`.
   - `manual: "needs-chrome"` + `reason`: nhánh không tự động được, vd preview CMS admin, API dạng object không seed được, hay cần mắt người.
   - `ask`: comment mơ hồ hoặc mâu thuẫn với Figma/checklist → **hỏi designer/khách, không đoán**. Gom các câu hỏi lại, báo người dùng 1 lần.
3. Cho người dùng xem bảng quy tắc → nhánh một lần trước khi seed.
4. Sau khi seed + chạy flow + `cms_check`:
   ```bash
   $PY "${CLAUDE_PLUGIN_ROOT}/scripts/logic_coverage.py" --page <page> --run $RUN
   ```
   Kết quả là `$RUN/logic.<page>.md`, liệt kê từng nhánh theo trạng thái: Lỗi / Thiếu dữ liệu / Thiếu check / Cần hỏi designer / Tester kiểm / Đạt.
   - **Còn nhánh "Thiếu dữ liệu" hoặc "Thiếu check" thì chưa xong bước này:** bổ sung seed (`qa-cms-seed`) hoặc viết thêm check, rồi chạy lại.
   - Nhánh nào không thể phủ thì chuyển sang `manual` và ghi lý do.

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
1. Mỗi nhánh trong `specs/<page>.logic.json` (mục 0) có **ít nhất 1 check**, tên bắt đầu bằng `[<id nhánh>]`, vd `check('[R01-c] 0 bài → hiện thông báo trống', …)`. Ngoài ra kiểm các hành vi UI chung (danh sách bước 3) theo prototype Figma và checklist.
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
5. Bug của nhánh: ghi id nhánh, quy tắc (trích comment Figma + link node) và nhãn bài seed `[<PREFIX>0xx]` để dev tái hiện đúng dữ liệu. `make_bugs.py` tự đổi check `fail` thành bug; check `needs-chrome`/`blocked` được ghi vào prompt tester khi chạy `update_checklist.py --run $RUN`, mục checklist tương ứng để trống. Check `na` → mục checklist đánh `NA`.

Giữ `flows/` trong repo QA để lần verify sau khi dev fix chạy lại y hệt.
