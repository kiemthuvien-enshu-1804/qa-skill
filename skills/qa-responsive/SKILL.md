---
name: qa-responsive
description: Quét responsive mọi width từ 360px trở lên trên Chrome, Edge, WebKit(Safari) — phát hiện scroll ngang, element tràn màn hình, text bị cắt, ảnh lỗi, vùng chạm nhỏ, lỗi console/request — và chụp ảnh từng width.
---

# Responsive sweep

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"
node $S/responsive_sweep.mjs --page <page> --out $RUN                       # widths trong qa-config (breakpoint chuẩn)
node $S/responsive_sweep.mjs --page <page> --from 360 --to 1920 --step 20 --browsers chromium --out $RUN   # quét dày tìm điểm vỡ
```
Gợi ý: quét dày bằng chromium trước (nhanh), rồi quét breakpoint chuẩn trên cả 3 browser.

## Đọc kết quả `responsive.<page>.json → issues[]`
Mỗi issue đã gộp theo element, có `widths` (dải width bị lỗi), `browsers`, `browserSpecific`, ảnh mẫu.
- `horizontal-scroll` + `overflow-viewport`: lỗi nặng — tìm element gốc gây tràn (`detail`).
- `text-clipped`: text bị cắt do overflow hidden; `text-ellipsis` chỉ là bug nếu Figma không thiết kế "…".
- `tap-target`: chỉ áp dụng < 768px, mức low.
- Script KHÔNG tự phát hiện: layout xấu giữa 2 breakpoint (khoảng trống quá rộng, chữ xuống dòng xấu, ảnh méo, menu chồng nhau). → Read các ảnh `responsive/<page>.<browser>.<width>.png` ở các width chuyển tiếp (ví dụ 767/768, 1023/1024, 1279/1280) và khoảng giữa SP–PC; lỗi thấy được ghi vào `$RUN/manual_bugs.json` với `group: "responsive"`.
- Lưu ý width giữa SP (375) và PC (1536): Figma thường không có thiết kế → tiêu chí là "không vỡ, không tràn, đọc được, tỉ lệ hợp lý".
