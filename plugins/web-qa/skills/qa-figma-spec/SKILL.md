---
name: qa-figma-spec
description: Trích thông số thiết kế từ Figma (vị trí, kích thước, font, màu, radius, padding/gap) của frame SP và PC thành file spec JSON để đo tự động, kèm ảnh PNG frame và Figma comments. Dùng trước khi pixel-check một trang.
---

# Figma → spec JSON

## 0. Tìm frame SP/PC của trang

Người dùng chỉ cần khai báo **1 link chung** ở `qa-config.json → figma.url`: link file, hoặc link 1 page (canvas) để thu hẹp phạm vi. Frame của từng trang do Claude tự tìm. Thứ tự ưu tiên:
1. `pages[].figma` nếu có (`spUrl`/`pcUrl`, hoặc `fileKey` + `sp`/`pc`) — dùng để ghi đè khi tự tìm sai.
2. `figma.map` (mặc định `specs/figma-map.json`) → `pages.<page>.sp/pc` đã ghép từ trước.
3. Chưa có → tự tìm:
   - Liệt kê frame (`$S`, `$PY` như ở Cách A): có `FIGMA_TOKEN` → `$PY $S/figma_api.py frames --file <fileKey> [--node <pageNode>] --out specs/figma-frames.json`.
     Không token → `get_metadata` (Figma MCP) với node trong `figma.url` (không có node → gọi không nodeId để lấy danh sách page, chọn page thiết kế chính, bỏ qua page cũ/archive), rồi `figma_api.py frames --mcp <file kết quả get_metadata> --file <fileKey> --node <pageNode> --out specs/figma-frames.json`.
   - Script nhóm frame theo section, phân loại SP/PC theo width (`viewports`) hoặc tiền tố tên `SP/`, `PC/`, và chọn `spMain`/`pcMain` = frame có nội dung cao nhất (các frame còn lại thường là trạng thái first view/menu mở/animation).
   - Ghép trang ↔ section theo nghĩa: so `path`, `name`, `<title>`/`h1`/breadcrumb của trang thật với tên section/frame (vd `/` ↔ `01|TOP`, `/news` ↔ `03|お知らせ`, `/contact` ↔ `お問い合わせ`). Trang chi tiết dùng section "汎用"/"詳細". Form có màn xác nhận/hoàn tất → ghi vào `extra`.
   - Ghi kết quả vào `specs/figma-map.json` (`confirmed: false`) và báo người dùng **1 bảng** trang → section → frame SP/PC để xác nhận một lần. Không ghép được chắc chắn (không có section tương ứng, hoặc 2 section đều hợp) → hỏi đúng trang đó, không đoán.

Đọc link: `figma.com/design/<fileKey>/<tên>?node-id=12018-30142` → fileKey = `<fileKey>`, node = `12018:30142` (đổi `-` thành `:`); link có `/branch/<branchKey>/` thì dùng branchKey. Dự án có nhiều file Figma → `pages[].figma.fileKey` riêng cho trang thuộc file khác.

## Cách A — Figma REST (nhanh, đầy đủ nhất; cần `FIGMA_TOKEN`)
```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; PY=$(python3 -c 1 2>/dev/null && echo python3 || echo python)
$PY $S/figma_api.py spec --file <fileKey> --node <spNode> --page <page> --vp sp --out specs/<page>.sp.json
$PY $S/figma_api.py spec --file <fileKey> --node <pcNode> --page <page> --vp pc --out specs/<page>.pc.json
$PY $S/figma_api.py png  --file <fileKey> --node <spNode> --out specs/<page>.sp.png --scale 1
$PY $S/figma_api.py png  --file <fileKey> --node <pcNode> --out specs/<page>.pc.png --scale 1
$PY $S/figma_api.py comments --file <fileKey> --out specs/<fileKey>.comments.json
```

## Cách B — Figma MCP (không có token)
1. `create_session` với fileKey, rồi `get_metadata` node frame → danh sách node con + bounds.
2. `get_design_context` cho từng section (không cả trang một lần nếu frame quá dài) → font, màu, spacing.
3. `get_variable_defs` để biết token màu/typography.
4. Tự viết `specs/<page>.<vp>.json` đúng schema dưới.
5. PNG frame: `download_assets` (Figma MCP) với node frame SP/PC, không truyền `defaultScale` (mặc định 1x). Kết quả có link tạm `export` → tải ngay: `curl -sL "<export url>" -o specs/<page>.<vp>.png`. Kiểm tra width ảnh = `frameWidth` (1x). Không dùng `get_screenshot` cho file này vì ảnh bị thu nhỏ theo `maxDimension`.

## Hoàn thiện spec (bắt buộc)
Spec nháp có hàng trăm element — làm gọn và gắn selector:
1. Mở trang thật (Playwright hoặc đọc source) để lấy selector ổn định (class BEM, `data-*`). Gán `selector` cho text/heading/button/card/section chính. Element không gán selector sẽ được tìm theo `text`.
2. Xoá element trang trí, ảnh nền, node ẩn, text lặp (giữ 1 mẫu cho list/card), dùng `index` nếu selector trùng.
3. Kiểm tra `frameWidth` == viewport của dự án (375 / 1536 / 1600…). Nếu lệch, cập nhật `viewports` trong `qa-config.json`.
4. Figma comments thuộc frame (lọc theo node id con của frame) → ghi danh sách yêu cầu vào `specs/<page>.notes.md` để kiểm tay ở bước bug.

## Schema
```json
{
  "page": "news", "viewportName": "sp", "frameWidth": 375,
  "figma": {"fileKey": "<fileKey>", "nodeId": "12018:30142"},
  "tolerance": {"px": 1},
  "elements": [
    {"id": "news-title", "label": "見出し", "selector": ".p-news__title", "text": "お知らせ", "figmaNodeId": "12018:30200",
     "expect": {"x": 20, "y": 96, "width": 335, "height": 36, "fontSize": 24, "fontWeight": 700, "lineHeight": 36,
                "letterSpacing": 0.96, "fontFamily": "Noto Sans JP", "color": "#333333"}}
  ]
}
```
`x/y` tính từ góc trên trái của frame (= trang). Chỉ ghi thuộc tính cần kiểm.
