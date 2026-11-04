---
name: qa-verify-regression
description: Sau khi dev fix/feedback — chạy lại toàn bộ phần tự động ở VS Code (spec, responsive, CMS, flow), tự đánh dấu bug tự động Verified/Reopened, phát hiện bug mới phát sinh, cập nhật checklist; bug do tester tạo thì tester verify bằng Claude in Chrome.
---

# Verify fix + regression

## 1. Trạng thái hiện tại
Người dùng bấm **Export JSON** trên Tracker → `tracker-export.json`.
Đọc comment dev ở bug `fixed`/`wontfix` → bàn với người dùng, không tự đóng.

## 2. Chạy lại phần tự động — toàn bộ trang bị ảnh hưởng
```bash
RUN=runs/$(date +%Y%m%d-%H%M)-verify; S=.claude/skills/web-qa/scripts
for vp in sp pc; do for b in chromium msedge webkit; do node $S/measure.mjs --spec specs/<page>.$vp.json --browser $b --out $RUN; done; done
node $S/responsive_sweep.mjs --page <page> --out $RUN
node $S/cms_check.mjs --page <page> --out $RUN                      # nếu trang có CMS
for vp in sp pc; do node flows/<page>.flow.mjs --out $RUN --vp $vp; done   # nếu có flow
python3 $S/make_bugs.py --run $RUN
python3 $S/compare_runs.py --tracker tracker-export.json --rerun $RUN/bugs.json --pages <page>
```
Designer đổi Figma → chạy lại `qa-figma-spec` trước (giữ selector).
`verify.json`: bug tự động `fixed` → verified / reopened; `verified/closed` lỗi lại → reopened; key mới → bug mới. Import `verify.json` + ảnh `upload/` vào Tracker.
`verify_report.md` liệt kê bug tester tạo đang "Đã sửa" → chuyển tester verify.

## 3. Checklist
Chạy lại `qa-checklist-excel` bước 3 trên file checklist tester đã điền: chỉ ghi đè mục tự động (NG → OK khi verified, bug mới → NG). Mục tester điền giữ nguyên.

## 4. Báo tester
Danh sách bug Kiểm bằng = Chrome/Tay đang "Đã sửa" để verify bằng Claude in Chrome (`qa-chrome-verify`), kèm thời điểm/build đã chạy lại.
