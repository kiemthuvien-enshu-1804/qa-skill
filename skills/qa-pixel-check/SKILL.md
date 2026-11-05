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
- `msedge` lỗi launch → Edge chưa cài: báo người dùng, tiếp tục với 2 browser còn lại.
- Thông số đo: x, y, width, height, font-size/weight, line-height, letter-spacing, font-family, color, background, border, radius, padding, gap, opacity, text-align, nội dung text.

## Đọc kết quả
1. `measure.*.json → findings[]`: mỗi dòng là 1 thuộc tính lệch, có `expected/actual/delta` và ảnh `shots/*.png` khoanh đỏ.
   - Một lỗi y lệch dọc (mọi element phía dưới đều lệch `y` cùng một khoảng) thường do 1 section phía trên cao/thấp sai → chỉ báo **section gốc**, bỏ các lệch `y` kéo theo (ghi chú "kéo theo" trong bug gốc).
   - Lệch chỉ ở 1 browser → lỗi riêng browser; giống nhau mọi browser → lỗi CSS.
2. `visual.*.sbs.png` (Figma | thực tế | diff): XEM ẢNH bằng Read. Các `bands` có mismatch cao là vùng cần soi: ảnh sai, thiếu icon, sai thứ tự, sai màu nền… → những gì spec không bắt được thì ghi vào `$RUN/manual_bugs.json`.
   - `heightDelta` lớn = tổng chiều cao trang lệch → tìm section gây lệch.
3. Không báo bug cho: anti-aliasing chữ, khác biệt ≤ tolerance, nội dung CMS khác dữ liệu mẫu Figma (trừ khi sai format/độ dài gây vỡ layout).

Tiếp theo: `qa-responsive`, rồi `qa-bug-report`.
