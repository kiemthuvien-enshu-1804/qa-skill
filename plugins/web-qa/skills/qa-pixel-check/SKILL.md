---
name: qa-pixel-check
description: Đo trang web thật so với spec Figma ở SP và PC (layout, typography, màu, component) trên Chrome/Edge/WebKit, chụp ảnh khoanh lỗi và diff toàn trang với PNG Figma. Dùng sau qa-figma-spec.
---

# Pixel check SP / PC

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; RUN=${RUN:-runs/$(date +%Y%m%d-%H%M)}
for vp in sp pc; do
  for b in chromium msedge webkit; do
    node $S/measure.mjs --spec specs/<page>.$vp.json --browser $b --out $RUN
  done
  node $S/visual_diff.mjs --page <page> --vp $vp --figma-png specs/<page>.$vp.png --out $RUN
done
```
- `msedge` dùng Microsoft Edge đã cài trên máy (Playwright không cài Edge). Lỗi launch → Edge chưa cài: báo người dùng, tiếp tục với 2 browser còn lại; bug chỉ của Edge lần này không verify được.
- Ngưỡng (`qa-config.json → tolerance`): `px` cho vị trí/kích thước, `fontPx` cho font-size/line-height/letter-spacing, `colorDelta` = chênh lệch lớn nhất của 1 kênh R/G/B (0–255).
- Thông số đo: x, y, width, height, font-size/weight, line-height, letter-spacing, font-family, color, background, border, radius, padding, gap, opacity, text-align, nội dung text.

## Đọc kết quả
1. `measure.*.json → findings[]`: mỗi dòng là 1 thuộc tính lệch, có `expected/actual/delta` và ảnh `shots/*.png` đã vẽ theo quy tắc ảnh bug (khung đỏ + giá trị Figma mong muốn cạnh khung; ảnh sạch `*.raw.png`).
   - Một lỗi y lệch dọc (mọi element phía dưới đều lệch `y` cùng một khoảng) thường do 1 section phía trên cao/thấp sai → chỉ báo **section gốc**, bỏ các lệch `y` kéo theo (ghi chú "kéo theo" trong bug gốc).
   - Lệch chỉ ở 1 browser → lỗi riêng browser; giống nhau mọi browser → lỗi CSS.
   - Finding có `figmaConflict`: Figma chưa thống nhất giá trị cho thuộc tính đó (`specs/figma-conflicts.md`). Không báo bug cho đến khi tester chọn; `make_bugs.py` tự giữ lại.
   - Element có nội dung từ CMS: bỏ finding `text` (nội dung chỉ so web ↔ CMS ở `qa-cms-data`); vẫn giữ finding font/màu/kích thước/khoảng cách.
   - **Tìm nguyên nhân gốc trước khi báo bug layout** (x, y, width, height, gap, padding): xem mục 4.
2. `visual.*.sbs.png` (Figma | thực tế | diff): XEM ẢNH bằng Read. Các `bands` có mismatch cao là vùng cần soi: ảnh sai, thiếu icon, sai thứ tự, sai màu nền… → những gì spec không bắt được thì ghi vào `$RUN/manual_bugs.json`.
   - `heightDelta` lớn = tổng chiều cao trang lệch → tìm section gây lệch.
3. Không báo bug cho: anti-aliasing chữ, khác biệt ≤ tolerance, nội dung CMS khác dữ liệu mẫu Figma (text, ảnh, link, số dòng của bảng/footer…; trừ khi sai format/độ dài gây vỡ layout).

4. **Nguyên nhân gốc của lệch layout.** Không báo bug kiểu "Figma x=798 / thực tế 754". Với mỗi finding vị trí/kích thước:
   - Đi ngược chuỗi phần tử cha (Playwright `evaluate`): so bbox + computed style (`display`, `flex`, `flex-basis/grow/shrink`, `grid-template-columns`, `gap`, `width`, `max-width`, `padding`, `margin`, `box-sizing`) với cấu trúc frame Figma (`get_metadata` của node/instance: auto-layout, width cố định hay hug/fill, gap, padding).
   - Tìm **element gốc** gây lệch (thường là element anh em hoặc cha, không phải element có số đo lệch) và gộp các element bị kéo theo vào 1 bug.
   - Thử bản sửa bằng `page.addStyleTag` (CSS cụ thể) ở 2–3 width (vd 1280 / 1536 / 1920), đo lại; ghi số đo sau khi sửa vào bug.
   - Ví dụ: nút ở cột phải footer lệch 43px vì cột trái dùng `flex-grow` + `flex-basis: auto` (rộng theo nội dung 529px thay vì 572px; `max-width: 572px` chỉ là giới hạn trên) → đề xuất `flex: 0 0 572px` ở PC; sau khi thử: x=797.5 (Figma 798).

Tiếp theo: `qa-responsive`, rồi `qa-bug-report`.
