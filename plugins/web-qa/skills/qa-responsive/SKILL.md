---
name: qa-responsive
description: Quét responsive mọi width từ 360px trở lên trên Chrome, Edge, WebKit(Safari) theo style guide của Figma (page common_StyleGuide) hoặc tiêu chuẩn responsive chung khi không có — phát hiện scroll ngang, element tràn màn hình, text bị cắt, chữ quá nhỏ, ảnh méo/lỗi, khung nội dung và lề sai chuẩn, vùng chạm nhỏ, lỗi console/request — và chụp ảnh từng width.
---

# Responsive sweep

## 0. Style guide trước (bắt buộc)
Tìm page style guide của Figma: xem `specs/figma-map.json → common.styleGuide` (đã tìm ở `qa-figma-spec`). Nếu chưa có, tìm page có tên khớp `figma.commonPages.styleGuide`, mặc định ≈ `common_StyleGuide`.

**Có style guide:**
1. Đọc page đó:
   - có token: `get_metadata` + `get_design_context` / `get_variable_defs`;
   - không token: Figma MCP;
   - nên xem thêm ảnh (`get_screenshot`).
2. Ghi các quy tắc đọc được vào `specs/styleguide.json`. Chỉ ghi những gì style guide **có ghi rõ**, không đoán.
   ```json
   {
     "source": {"fileKey": "<fileKey>", "nodeId": "<node page/frame style guide>", "name": "common_StyleGuide"},
     "rules": {
       "breakpoints": [768, 1024],
       "minFontSize": {"sp": 12, "pc": 14},
       "tapTarget": 44, "tapBelow": 768,
       "containers": [{"selector": ".l-inner", "maxWidth": 1320, "sidePadding": 20}]
     },
     "typography": [{"name": "PC/h2", "fontSize": 32, "lineHeight": 48, "fontWeight": 700}],
     "colors": [{"name": "primary", "value": "#0068b7"}],
     "notes": ["Giữa 768–1023px dùng layout SP, căn giữa max 600px"]
   }
   ```
   - `containers[].selector`: chọn từ DOM trang thật (class khung nội dung).
   - Quy tắc không kiểm tự động được (vd hành vi menu giữa các breakpoint) → ghi vào `notes` và kiểm bằng mắt ở bước Read ảnh.
3. Style guide mâu thuẫn với frame hoặc component, vd style guide ghi h2 PC 32px nhưng frame dùng 28px:
   - thêm vào bảng báo tester như `specs/figma-conflicts.md` (`qa-figma-spec` bước 5) để tester chọn;
   - không tự chọn.

**Không có style guide** (không có page, hoặc page không ghi quy tắc responsive):
- Không tạo `specs/styleguide.json`. Script tự dùng **tiêu chuẩn responsive chung** (bên dưới) và ghi `rules.source = "general"` trong kết quả.
- Ghi rõ trong báo cáo/tin nhắn cho tester: "Figma không có style guide → kiểm theo tiêu chuẩn chung".

| Tiêu chuẩn chung (khi không có style guide) | Script |
|---|---|
| Không scroll ngang, không element tràn màn hình ở mọi width ≥ 360px | `horizontal-scroll`, `overflow-viewport` |
| Text không bị cắt (trừ ellipsis có trong Figma) | `text-clipped`, `text-ellipsis` |
| Chữ ≥ 12px | `font-too-small` |
| Vùng chạm ≥ 24×24px dưới 768px (WCAG 2.2 AA 2.5.8; Apple/Google khuyến nghị 44–48px) | `tap-target` |
| Ảnh không méo (tỉ lệ hiển thị lệch ảnh gốc > 3% khi `object-fit: fill`) và không lỗi | `image-distorted`, `broken-image` |
| Không lỗi console / request khi đổi width | `console-error`, `http-error` |
| Layout giữa SP–PC không vỡ, đọc được, tỉ lệ hợp lý; menu/ảnh/khối không chồng nhau | Read ảnh (bước 2) |

## 1. Chạy
```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"
node $S/responsive_sweep.mjs --page <page> --out $RUN                       # widths trong qa-config + 2 phía mỗi breakpoint của style guide
node $S/responsive_sweep.mjs --page <page> --from 360 --to 1920 --step 20 --browsers chromium --out $RUN   # quét dày tìm điểm vỡ
```
- Có `specs/styleguide.json` thì script tự đọc. Dùng file khác thì truyền `--styleguide <file>`.
- Với mỗi breakpoint, script tự thêm 2 width `bp-1` và `bp`, trừ khi đã truyền `--widths` hoặc `--from`.
- Gợi ý: quét dày bằng chromium trước (nhanh), rồi quét breakpoint chuẩn trên cả 3 browser.

## 2. Đọc kết quả `responsive.<page>.json`
- `rules`: quy tắc đã dùng (`source`: style guide hay `general`).
- `issues[]`: mỗi issue đã gộp theo element, có:
  - `widths`: dải width bị lỗi;
  - `browsers`, `browserSpecific`;
  - ảnh mẫu.

Cách đọc từng loại issue:
- `horizontal-scroll` + `overflow-viewport`: lỗi nặng. Tìm element gốc gây tràn (xem `detail`).
- `text-clipped`: text bị cắt do overflow hidden. `text-ellipsis` chỉ là bug nếu Figma không thiết kế "…".
- `font-too-small`, `tap-target`: mức low.
  - Ngưỡng lấy từ style guide; không có thì lấy tiêu chuẩn chung.
  - Text nhỏ có chủ ý trong Figma (chú thích, copyright) thì đối chiếu Figma trước khi báo.
- `image-distorted`: ảnh bị kéo giãn. Đề xuất `object-fit: cover` hoặc sửa `width`/`height`.
- `container-width`, `side-padding`: khung nội dung rộng quá `maxWidth`, hoặc lề 2 bên nhỏ hơn chuẩn của style guide.

Script **không** tự phát hiện layout xấu giữa 2 breakpoint: khoảng trống quá rộng, chữ xuống dòng xấu, menu chồng nhau, quy tắc trong `styleguide.notes`.
- Cách kiểm: Read các ảnh `responsive/<page>.<browser>.<width>.png` ở 2 phía mỗi breakpoint (vd 767/768, 1023/1024) và ở khoảng giữa SP–PC.
- Lỗi thấy được thì ghi vào `$RUN/manual_bugs.json` với `group: "responsive"`.

Width giữa SP (375) và PC (1536) thường không có thiết kế trên Figma. Tiêu chí ở các width này:
- có style guide: theo `notes`/`breakpoints` của style guide;
- không có: theo tiêu chuẩn chung — "không vỡ, không tràn, đọc được, tỉ lệ hợp lý".
