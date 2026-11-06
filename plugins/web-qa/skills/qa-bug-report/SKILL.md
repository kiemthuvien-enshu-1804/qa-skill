---
name: qa-bug-report
description: Gom kết quả tự động ở VS Code (pixel, responsive, CMS, flow) và lỗi kiểm tay thành bugs.json có ảnh bug (khung đỏ từng chỗ sai + mong muốn ghi cạnh khung), nhóm Chung/SP/PC/Responsive, rồi đẩy lên Bug Tracker (link chia sẻ để dev đổi status và comment).
---

# Tạo bug & đẩy lên Bug Tracker

## 1. Nguồn bug (tự đọc trong `$RUN`)
| File | Nguồn | `source` |
|---|---|---|
| `measure.*.json`, `responsive.*.json` | pixel / responsive | auto |
| `cms.*.json` | dữ liệu CMS | auto |
| `flow.*.json` (check `fail`) | logic Playwright | auto |
| `manual_bugs.json` | QA tự ghi (Safari thật, nhận xét thẩm mỹ…) | manual |

Bug `auto` được verify lại tự động khi chạy lại VS Code. Bug tester tạo bằng Claude in Chrome đi thẳng lên Tracker ("+ Bug", Kiểm bằng = Claude in Chrome) — không qua file này.
Schema bug tay (`manual_bugs.json`):
```json
{"page": "news", "path": "/news", "group": "sp", "type": "logic", "severity": "high",
 "title": "…", "viewports": [375], "browsers": ["chromium"], "expected": "…", "actual": "…",
 "steps": "1. …\n2. …", "screenshots": ["runs/.../x.png"], "figma": {"fileKey": "…", "nodeId": "…"}}
```
`group`: common | sp | pc | responsive. `type`: layout | typography | color | component | content | cms | logic | figma-comment | responsive | console | tracking.
`env` (tuỳ chọn): chỉ ghi khi bug **chỉ xảy ra ở một môi trường đặc biệt**, xem mục 1c.

## 1b. Severity
Mỗi bug có đúng 1 mức. Không chắc giữa 2 mức thì chọn mức thấp hơn và ghi lý do trong `actual`.
| Mức | Khi nào | Ví dụ |
|---|---|---|
| `high` | Chặn chức năng hoặc luồng chính, sai/thiếu dữ liệu, người dùng không làm tiếp được | Form không gửi được, link nội bộ 404, menu SP không mở, CMS hiện sai bài/sai ngày, scroll ngang toàn trang, ảnh chính không hiển thị, lỗi JS làm hỏng trang |
| `medium` | Sai so với Figma/spec mà người dùng dễ thấy, nhưng vẫn dùng được | Sai font-size/màu/khoảng cách ở heading, nút; text bị cắt; thiếu OGP/description; sai thứ tự hiển thị; validation thiếu thông báo |
| `low` | Lệch nhỏ, thẩm mỹ, tối ưu; khó nhận ra bằng mắt | Lệch 2–4px, vùng chạm nhỏ, ảnh chưa Retina, ảnh nặng, favicon thiếu, link tel: còn bấm được trên PC |

Script tự gán mức ban đầu (pixel theo độ lệch, responsive/CMS/page_checks theo loại lỗi, flow mặc định `medium`). Claude xem lại theo bảng trên khi sửa `bugs.json` ở bước 2: nâng mức nếu lỗi nằm ở khu vực quan trọng (first view, CTA, form), hạ mức nếu chỉ ở chỗ phụ.

## 1c. Môi trường
**Chỉ ghi `env` khi bug chỉ xảy ra ở môi trường đặc biệt** (1 browser, 1 OS, 1 thiết bị thật). Bug xảy ra ở mọi môi trường đã kiểm thì không ghi.
- Bug tự động: `make_bugs.py` tự thêm `env` khi bug chỉ có ở một phần các browser đã chạy, kèm version browser của Playwright và OS (vd `Chỉ lỗi trên WebKit (≈ Safari) 27.2 · Windows 11 (Playwright). Không lỗi trên Chrome (Chromium).`).
- Bug tay / bug Claude in Chrome: tự ghi, gồm browser + version, OS, thiết bị (vd `Safari 18.2 · iPhone 15 (iOS 18.2)`).
- Viewport/width không phải môi trường: đã có ở `viewports`, `group`.

## 2. Sinh bugs.json
```bash
PY=$(python3 -c 1 2>/dev/null && echo python3 || echo python)
$PY "${CLAUDE_PLUGIN_ROOT}/scripts/make_bugs.py" --run $RUN
```
→ `bugs.json`, `upload/*.png`, `summary.md`. Đọc `summary.md` rồi sửa trực tiếp `bugs.json`:
- gộp bug cùng nguyên nhân (vd. CMS ngày lệch ở list và ở chi tiết = 1 bug JST), bỏ lệch `y` kéo theo section phía trên
- bỏ finding không hợp lệ (CMS chưa rebuild đã xác nhận, nội dung CMS khác dữ liệu mẫu Figma, dữ liệu CMS nhập sai nhưng web hiển thị đúng CMS → chỉ ghi chú cho người dùng)
- **bug layout/pixel phải ghi nguyên nhân gốc** (cách tìm: `qa-pixel-check` mục 4):
  - `title`: element gốc + hiện tượng, vd `PC footer: cột 施設一覧 co theo nội dung (529px thay vì 572px) nên cột phải lệch trái 43px`
  - `element`: element gốc (selector/class), không phải element bị kéo theo
  - `actual`: số đo + **vì sao** ra số đo đó (CSS/cấu trúc nào), so với cấu trúc Figma (width cố định, gap, auto-layout), các element bị kéo theo
  - `steps`: cách tái hiện + **đề xuất sửa** (CSS cụ thể) + số đo sau khi thử bản sửa (nếu đã thử)
  - `figma.nodeId`: node/instance của khối chứa element gốc
- rà lại `severity` theo bảng 1b
- viết lại `title` ngắn, dev đọc là hiểu

**Ngôn ngữ: mọi bug viết bằng tiếng Việt** (`title`, `expected`, `actual`, `steps`, comment), vì Tracker là link nội bộ của team người Việt. Chữ trên site (tiếng Nhật) thì giữ nguyên trong 「」, vd `Hiển thị 「お知らせ一覧」`.

## 2b. Ảnh bug (không gửi ảnh gốc)
Ảnh bug website **chỉ gồm**: khung đỏ quanh từng chỗ sai + ghi **mong muốn** ngay cạnh khung (vd `font-size: 16px`, `Hiển thị 「お知らせ一覧」`).
Không thêm tiêu đề, môi trường, "hiện tại", nguồn… (bug trên Tracker đã có các thông tin đó). Chỉ khoanh chỗ chắc chắn là bug.
Bug layout: khoanh **element gốc** (ghi CSS mong muốn, vd `flex: 0 0 572px`) và element bị kéo theo (ghi giá trị Figma), không chỉ khoanh element có số đo lệch.

Ai vẽ:
- **Pixel (`measure.mjs`)**: tự vẽ `shots/*.png` (khung đỏ + giá trị Figma mong muốn; ảnh sạch là `*.raw.png`). Phần tử không hiển thị thì giữ ảnh, không khoanh bừa.
- **CMS / flow / responsive / bug tay**: sau bước 2, với từng bug Claude viết `$RUN/marks/<key>.json`
  (`{ "in": "upload/<ảnh>.png", "out": "upload/<key>_FAIL.png", "marks": [{ "box": [x,y,w,h], "note": "<mong muốn>" }] }`, toạ độ lấy bằng `locator.boundingBox()` hoặc đo trên ảnh),
  chạy `node "${CLAUDE_PLUGIN_ROOT}/scripts/annotate.mjs" --spec $RUN/marks/<key>.json`, rồi thay tên ảnh trong `screenshots` của bug bằng ảnh mới.
- Claude tự mở ảnh xem lại (khung đúng chỗ, nhãn không che chỗ sai). Ảnh **không cần duyệt riêng**: đi cùng bug khi Import (chọn cả thư mục `upload/`).

## 3. Đẩy lên Tracker (`qa-config.json → tracker.url`)
Tracker là một trang claude.ai (Artifact) dùng chung cho team: xem bug, đổi trạng thái, comment, "+ Bug", Import, Export JSON.

### 3a. `tracker.url` trống → tạo Tracker mới
1. Load skill `artifact-capabilities` (bắt buộc trước khi truyền `capabilities`).
2. Copy mẫu vào thư mục QA rồi đặt tên theo dự án:
   ```bash
   mkdir -p tracker && cp "${CLAUDE_PLUGIN_ROOT}/templates/tracker/index.html" tracker/index.html
   ```
   Sửa `<title>` và `<h1>` thành `<project> Bug Tracker`.
3. Publish bằng tool Artifact: `file_path: tracker/index.html`, `icon: "bug"`, `capabilities: {"assets":{"upload":"interact"},"db":{},"downloads":{},"user":{"scopes":["profile"]}}`.
4. Ghi link trả về vào `qa-config.json → tracker.url`.
5. Báo người dùng làm 2 việc trên trang Tracker (Claude không tự làm được):
   - **Share** → chọn **Anyone with the link** (mọi người có link), cho phép tương tác, để dev mở link là comment và đổi trạng thái được.
   - **Copy link** → mở 1 bug bất kỳ, bấm "Copy link", dán link chia sẻ vào ô được hỏi. Tracker dùng link này để tạo link riêng từng bug (`…#ABC-012`).
- Tracker đã có thì không tạo mới. Một Tracker chứa được nhiều dự án (mỗi dự án 1 `bugPrefix`).

### 3b. Đưa bug lên
- Thường dùng: mở Tracker → Import → chọn `bugs.json` cùng toàn bộ ảnh trong `upload/`. Tracker tự gán mã `<bugPrefix>-001…`, bỏ qua bug trùng `key`.
- Session có tool Artifact/ArtifactData: ghi trực tiếp `bugs/{key}` (schema dưới), ảnh upload bằng Artifact `asset: true`.
- Bỏ bug đã đưa lên: bug chưa có comment/đổi trạng thái thì xoá được; bug đã có trao đổi (dev comment, đổi status) thì **không xoá** — chuyển `status: closed` kèm comment lý do (vd "Web hiển thị đúng dữ liệu CMS, không phải bug web").

Schema `bugs/{key}`: `key, code, project, page, path, url, title, group, type, severity (high|medium|low), viewports[], browsers[], env, element, prop, expected, actual, steps, figma{fileKey,nodeId,url}, screenshots[assetId], source (auto|chrome|manual), check, run, status (open|in-progress|fixed|wontfix|reopened|verified|closed), commentCount, createdAt, updatedAt`
Comment: `bugs/{key}/comments/{id}`: `text, by, byName, at, kind (comment|status), from, to`.

4. Báo người dùng số bug theo nhóm, kèm link Tracker. Checklist chỉ ghi NG, không ghi mã bug (`qa-checklist-excel`).
