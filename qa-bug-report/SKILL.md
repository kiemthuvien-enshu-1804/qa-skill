---
name: qa-bug-report
description: Gom kết quả tự động ở VS Code (pixel, responsive, CMS, flow) và lỗi kiểm tay thành bugs.json có ảnh khoanh lỗi, nhóm Chung/SP/PC/Responsive, rồi đẩy lên Bug Tracker (link chia sẻ để dev đổi status và comment).
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

## 2. Sinh bugs.json
```bash
python3 .claude/skills/web-qa/scripts/make_bugs.py --run $RUN
```
→ `bugs.json`, `upload/*.png`, `summary.md`. Đọc `summary.md` rồi sửa trực tiếp `bugs.json`:
- gộp bug cùng nguyên nhân (vd. CMS ngày lệch ở list và ở chi tiết = 1 bug JST), bỏ lệch `y` kéo theo section phía trên
- bỏ finding không hợp lệ (CMS chưa rebuild đã xác nhận, nội dung CMS khác dữ liệu mẫu Figma)
- viết lại `title` ngắn, dev đọc là hiểu (tiếng Việt hoặc tiếng Nhật theo dự án)

## 3. Đẩy lên Tracker (`qa-config.json → tracker.url`)
- Thường dùng: mở Tracker → Import → chọn `bugs.json` cùng toàn bộ ảnh trong `upload/`. Tracker tự gán mã `<bugPrefix>-001…`, bỏ qua bug trùng `key`.
- Session có tool Artifact/ArtifactData: ghi trực tiếp `bugs/{key}` (schema dưới), ảnh upload bằng Artifact `asset: true`.

Schema `bugs/{key}`: `key, code, project, page, path, url, title, group, type, severity, viewports[], browsers[], element, prop, expected, actual, steps, figma{fileKey,nodeId,url}, screenshots[assetId], source (auto|chrome|manual), run, status (open|in-progress|fixed|wontfix|reopened|verified|closed), commentCount, createdAt, updatedAt`
Comment: `bugs/{key}/comments/{id}`: `text, by, byName, at, kind (comment|status), from, to`.

4. Báo người dùng số bug theo nhóm, kèm link Tracker. Sau khi Import, lấy mã bug (<bugPrefix>-xxx) để ghi vào checklist (`qa-checklist-excel`).
