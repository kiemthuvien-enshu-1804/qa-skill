---
name: qa-cms-data
description: Kiểm dữ liệu CMS qua API (microCMS, WordPress REST, Laravel API… có API key) so với trang đã render — số bài, thứ tự, tiêu đề, ngày (múi giờ, format), category, thumbnail/no-image, link chi tiết, pagination, filter, trang chi tiết. Chạy trong VS Code.
---

# Kiểm dữ liệu CMS ↔ trang

Trước bước này nên chạy `qa-cms-seed` để trang có bộ dữ liệu test đã biết trước (ca biên, bài nháp). Bug liên quan bài seed: ghi nhãn `[<PREFIX>0xx]` + purpose (xem `cms-seed/<page>.applied.json`).

## 1. Cấu hình (1 lần mỗi dự án)
`qa-config.json → cms`: kết nối (baseUrl, headers dùng `${BIẾN_MÔI_TRƯỜNG}`, kiểu phân trang, `listPath`, `totalPath`). Mẫu microCMS / WordPress / Laravel API có trong `qa-config.example.json → cms._examples`.
`pages[].cms`: mapping cho từng trang list:
- `endpoint`, `query` (sort/filter giống trang đang hiển thị), `fields` (đường dẫn field: `category.name`, `thumbnail.url`)
- `excludeIf` (field đánh dấu ẩn, vd `hidden`), `dateFormat` (`YYYY.MM.DD`, `YYYY年M月D日`, `M/D(ddd)`), `timezone`
- `pageSize`, `pageUrl` (`{path}?page={n}` hoặc `{path}page/{n}/`), `maxPages`
- `list`: selector item / title / date / category / link / image / pagerLast
- `detail`: `urlTemplate` (`/news/{id}` hoặc `{slug}`), selector title/date/body, `sample`
- `filters`: mỗi filter = URL trên site + query API tương ứng
- `categoryMap` khi label trên site khác giá trị CMS; `noImageFallback` (tên file ảnh no-image)

Chưa rõ field/selector: gọi API 1 lần với `--dump` (ghi `$RUN/cms/<page>.api.json`, không chứa key) và đọc DOM trang để map. **Hỏi người dùng** endpoint/query nếu không suy ra được — không đoán.

## 2. Chạy
```bash
# API key nằm trong .env.local (script tự đọc). Không đọc/in file .env.local, không ghi key vào bug/log.
node "${CLAUDE_PLUGIN_ROOT}/scripts/cms_check.mjs" --page <page> --out $RUN [--vp pc] [--dump]
```
Dữ liệu giống nhau SP/PC nên chạy 1 viewport là đủ; chạy thêm `--vp sp` khi SP hiển thị số bài khác.

## 3. Đọc kết quả `$RUN/cms.<page>.json`
| prop | Ý nghĩa | Nguyên nhân hay gặp |
|---|---|---|
| `cms-count` | Số bài khác | sai `limit`, lọc thiếu, cache build tĩnh (SSG) chưa rebuild |
| `cms-order` | Đúng bài nhưng sai thứ tự | sort theo `createdAt` thay vì `publishedAt` |
| `cms-title` | Tiêu đề khác | dữ liệu cũ do cache, sai field, cắt chuỗi |
| `cms-date` | Ngày lệch (thường gộp "N chỗ") | lệch 1 ngày = quên đổi UTC→JST |
| `cms-category`, `cms-image`, `cms-link` | Sai label / ảnh / link chi tiết | |
| `cms-pagination` | Tổng số trang sai, trang vượt quá vẫn có bài | |
| `cms-detail` | Chi tiết 404 / sai tiêu đề / trống nội dung | slug khác id, bài cũ chưa build |
- Site build tĩnh (Nuxt generate): lệch dữ liệu có thể do chưa rebuild — ghi rõ trong bug "kiểm thời điểm build" thay vì kết luận code sai.
- Xem ảnh `$RUN/cms/*.png` cho finding nghi ngờ trước khi báo bug.
- Dữ liệu nháp/lên lịch, preview CMS admin, cache → không làm ở đây, mục checklist tương ứng để trống cho tester kiểm bằng Claude in Chrome.
- Dữ liệu > 100 bài (checklist Pagination): script tự phân trang API theo `cms.pagination.pageSize`; tăng `pages[].cms.maxPages` để đi hết các trang của site.
