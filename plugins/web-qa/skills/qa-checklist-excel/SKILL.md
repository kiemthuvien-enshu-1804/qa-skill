---
name: qa-checklist-excel
description: Điền kết quả kiểm tự động (OK/NG/NA theo browser, ngày; không ghi mã bug) vào checklist Excel, giữ nguyên format; mục chưa kiểm được để trống và sinh prompt để tester cho Claude in Chrome kiểm nốt.
---

# Checklist Excel — điền phần tự động, để trống phần còn lại

## 0. Vị trí file
- Checklist gốc: `checklist/<tên>.xlsx`, mapping: `checklist/checklist-map.json` — khai báo trong `qa-config.json → checklist.file / checklist.mapping` (script tự đọc, không cần truyền `--checklist`).
- Kết quả mỗi lần chạy: `$RUN/<tên>_result.xlsx` + `$RUN/<tên>_result_tester-prompt.md` (file gốc không bị sửa).
- Tester điền xong (trên Excel Online / Google Sheets) → tải về đặt `checklist/<tên>_tester.xlsx`, cập nhật `checklist.file` trỏ vào file này cho lần verify sau.

## 1. Mapping (lần đầu mỗi dự án)
```bash
PY=$(python3 -c 1 2>/dev/null && echo python3 || echo python)
$PY "${CLAUDE_PLUGIN_ROOT}/scripts/update_checklist.py" --inspect
```
Xác định dòng tiêu đề, cột ID, cột nội dung mục, cột ngữ cảnh (màn hình/khu vực), cột kết quả theo browser, cột bug/ghi chú/ngày/người test → `checklist-map.json` (schema trong docstring script). Hỏi người dùng nếu cột không rõ.

## 2. Quyết định từng mục — chỉ dựa trên bằng chứng của run
| Mục | Bằng chứng |
|---|---|
| UI/spec | `measure.*`, `visual.*` + trạng thái bug Tracker |
| Responsive / browser | `responsive.<page>.json` (NG chỉ ở browser lỗi) |
| Dữ liệu CMS | `cms.<page>.json` |
| Logic, chung mọi trang | `flow.*.json` gồm flow riêng và `flow.<page>.common.*` của `page_checks.mjs` (check `pass`/`fail`; `na` → NA) |
| Logic theo Figma comment | `logic.<page>.json`: mục checklist chỉ `OK` khi **mọi nhánh** gắn với mục đó đạt. Còn nhánh thiếu dữ liệu / thiếu check / tester kiểm / cần hỏi → để trống. Script tự bỏ `OK` của các mục trong `checklistBlocked` và đưa nhánh còn thiếu vào prompt tester |

Đối chiếu checklist mẫu (`*Template*.xlsx`) → nguồn bằng chứng:
| Nhóm mục (sheet trang) | Nguồn |
|---|---|
| Logo, Banner, Background, Button, Card, Text, Icon, Images (kích thước, vị trí), Khoảng cách | `measure.*` + `visual.*` (pixel-check) |
| Images: x2, load nhanh · Link: click cùng tab / tab mới · Số điện thoại · Favicon/OGP/title/description · GTM (định dạng) · Breadcrumb · 404 | `flow.<page>.common.*` (`page_checks.mjs`) |
| Menu, Dropdown, Nav bar, Hamburger, Slider, Search, Tab, Show/hide, Input/textarea, Radio/checkbox, Dropdown list, Contact (đến màn confirm), Map, Anchor, Pagination, Modal, Print | `flow.<page>.*` (flow riêng) |
| Check list data (hiển thị, sắp xếp), Pagination > 100 bài | `cms.<page>.json` |
| Hover, Animation (transition, khi cuộn), Contact: mail / màn complete / Garoon, GTM Preview, Core Web Vitals | để trống cho tester (Core Web Vitals: checklist ghi pending) |
| Sheet **CMS** (đủ / thiếu dữ liệu, ảnh, text, không có dữ liệu, date, file, toggle, checkbox, editor) | `cms.<page>.json` + flow theo `purpose` của bài seed (`qa-cms-seed`). Preview, Cache → để trống |

**Sheet Browsers** (iPhone Safari/Chrome, Windows Chrome/Edge, Mac Safari/Chrome): VS Code chỉ điền **Windows Chrome** (`chromium`) và **Windows Edge** (`msedge`). Cột Safari, iPhone, Mac để trống cho tester kiểm thiết bị thật; nếu WebKit báo lỗi thì ghi `note` "WebKit NG, cần xác nhận trên Safari thật" thay vì điền NG.
- Có bằng chứng: `OK`, hoặc `NG`. **Không ghi mã bug vào Excel** (không đưa `bugs` vào results), bug nằm trên Tracker.
- `NA`: trang được test **không có** chức năng/khối của mục đó (vd trang không có form → mục form; trang không có dữ liệu CMS → mục CMS). Xác nhận bằng DOM trang thật / Figma / `pages[]` trước khi đánh, ghi `note` lý do ngắn (vd "Trang không có form").
- **Trang có mục đó nhưng chưa có bằng chứng → không đưa vào results (ô để trống).** Không đoán, không đánh NA cho mục chưa kiểm được.
- Mục kiểm được một phần (vd UI form OK nhưng chưa gửi thật): để trống, ghi `note` "UI OK (tự động); còn gửi thật + mail".

## 3. Ghi
```bash
PY=$(python3 -c 1 2>/dev/null && echo python3 || echo python)
$PY "${CLAUDE_PLUGIN_ROOT}/scripts/update_checklist.py" --results $RUN/checklist-results.json --run $RUN
```
→ `$RUN/<Checklist>_result.xlsx` + `$RUN/<Checklist>_result_tester-prompt.md`: danh sách các ô còn trống + quy tắc cho Claude in Chrome + flow `needs-chrome` của run.
Đọc lại prompt, bổ sung nếu cần (URL trang cụ thể, form được gửi thật, email test).

## 4. Báo người dùng
Số OK / NG / NA / còn trống, dòng không khớp, và tin nhắn báo tester (mẫu trong `web-qa`).

## Sau khi tester làm xong
Tester trả checklist đã điền (hoặc bảng kết quả). Khi verify sau fix, chạy lại bước 3 với results mới — script chỉ ghi đè các dòng có trong results, giữ nguyên kết quả tester đã điền.
