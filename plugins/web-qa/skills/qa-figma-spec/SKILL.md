---
name: qa-figma-spec
description: Trích thông số thiết kế từ Figma (vị trí, kích thước, font, màu, radius, padding/gap) của frame SP và PC thành file spec JSON để đo tự động, kèm ảnh PNG frame và Figma comments; đối chiếu cùng 1 component giữa page common_component, các màn khác và SP ↔ PC — chỗ Figma không thống nhất thì đưa tester chọn. Dùng trước khi pixel-check một trang.
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
4. Figma comments thuộc frame (lọc theo node id con của frame) → ghi danh sách yêu cầu vào `specs/<page>.notes.md`.
   - `comments.json` gồm các thread: comment gốc + `replies` + `latest` (nội dung mới nhất) + `resolved`. Quy tắc lấy theo `latest`.
   - Không có token (MCP) thì đọc comment trên Figma hoặc nhờ người dùng export, và ghi theo cùng cấu trúc.
   - Comment về logic/luồng hiển thị (số bài, sort, rỗng, thiếu field, NEW, kỳ đăng, ẩn/hiện, validate) → tách thành quy tắc và nhánh trong `specs/<page>.logic.json` (`qa-logic-flow` mục 0).

## Đối chiếu thông số giữa các nguồn Figma (bắt buộc, trước `qa-pixel-check`)
Figma hay không thống nhất: cùng 1 component nhưng component gốc, các màn khác nhau, SP và PC lại có thông số khác nhau. Vì vậy trước khi đo, phải so thông số của component trên trang đang test với 3 nguồn. Chỗ nào Figma khác nhau thì **đưa tester chọn**, không tự quyết.

1. **Tìm page dùng chung.** `$PY $S/figma_api.py pages --file <fileKey> --out specs/figma-pages.json`. Không có token thì gọi `get_metadata` không truyền nodeId.
   - Tìm page theo `qa-config.json → figma.commonPages` (mặc định `components` ≈ `common_component`, `styleGuide` ≈ `common_StyleGuide`).
   - Ghi node id vào `specs/figma-map.json → common: {components, styleGuide}`. Không tìm thấy thì ghi `null`.
2. **Thu thông số của component trên trang đang test.**
   - Cách A: `spec` tự ghi `component` cho mọi element nằm trong instance (`family` = tên component bỏ đoạn SP/PC; `part` = node con trong component). Khi làm gọn spec phải giữ nguyên `component`.
   - Cách B: tự thêm `"component": {"family": "<tên instance bỏ SP/PC, vd Common/h2>", "part": "<tên node con, rỗng nếu là chính instance>"}` cho element nằm trong `<instance>` của `get_metadata`.
3. **Lấy thông số từ 3 nguồn.**
   - **Component gốc** (page common_component):
     - Cách A: script tự lấy qua REST và lưu vào `specs/figma-common-components.json`.
     - Cách B: dùng `get_design_context` cho component gốc, rồi ghi file đó theo cùng schema (`page: "common"`, element có `component`).
     - Component từ library ngoài file thì bỏ qua và ghi chú lại.
   - **Màn khác dùng cùng component:**
     - Chọn 1–2 frame khác trong `specs/figma-frames.json` (hoặc trang khác trong `figma-map.json`) có instance cùng `family`.
     - Cách A: `spec` của các frame đó ghi vào `specs/_index/<page>.<vp>.json` (spec nháp để so, không làm gọn).
     - Cách B: dùng `get_design_context` cho instance đó rồi ghi vào cùng chỗ.
   - **SP ↔ PC:** spec SP và PC của trang.
4. **Chạy so sánh** (Cách B không cần `--file`, vì chỉ so các file đã có):
   ```bash
   $PY $S/figma_api.py consistency --file <fileKey> --specs "specs/<page>.sp.json" "specs/<page>.pc.json" --index "specs/_index/*.json" --out specs/figma-conflicts.json
   ```
   Kết quả là `specs/figma-conflicts.md`, chia 3 nhóm:
   - **khác component gốc;**
   - **khác giữa các màn cùng viewport;**
   - **SP ≠ PC.**

   Mỗi dòng có các giá trị, nơi dùng từng giá trị (`page.vp nodeId`) và giá trị đề xuất. Thứ tự đề xuất:
   1. giá trị của component gốc;
   2. nếu không có component gốc thì lấy giá trị dùng ở nhiều chỗ nhất;
   3. hoà nhau thì để `?`.
5. **Báo tester 1 bảng** (lấy từ `figma-conflicts.md`, kèm link node Figma) để tester chọn giá trị đúng. Không tự chọn.
   - Trong lúc chờ, vẫn chạy tiếp các bước khác. Finding pixel của thuộc tính đang tranh chấp sẽ bị giữ lại: `measure` gắn `figmaConflict`, còn `make_bugs` đưa finding đó vào mục "Chờ tester chọn thông số Figma" và không đẩy lên Tracker.
   - Nhóm SP ≠ PC mặc định là `per-frame` (mỗi viewport giữ giá trị riêng, thường là thiết kế có chủ ý). Nhóm này không bị giữ bug, chỉ cần tester xác nhận.
6. **Tester chọn xong** → ghi vào `specs/figma-decisions.json`, dạng `{"<key>": {"value": 24, "by": "<tester>", "note": "…"}}`.
   - `"value": "per-frame"` = giữ giá trị riêng của từng frame.
   - Chạy lại lệnh `consistency`: script ghi giá trị đã chọn vào `expect` của spec và bỏ đánh dấu.
   - Chạy lại `measure` cho trang đó.
   - Nên báo designer sửa Figma cho thống nhất.

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
Các trường script tự thêm:
- `component`: danh sách `{family, id, variant, part, partName}`, xếp từ instance ngoài cùng vào trong.
- `styles`: tên text style / color style trong Figma.
- `conflicts`: `{prop: key}`, chỉ do `consistency` ghi.

Không sửa tay các trường này.
