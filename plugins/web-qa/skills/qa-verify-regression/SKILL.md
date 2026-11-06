---
name: qa-verify-regression
description: Sau khi dev fix/feedback — chạy lại toàn bộ phần tự động ở VS Code (spec, responsive, CMS, flow), tự đánh dấu bug tự động verified/reopened, phát hiện bug mới phát sinh, cập nhật checklist; bug do tester tạo thì tester verify bằng Claude in Chrome. Dùng khi được yêu cầu "verify bug", "chạy regression", "dev đã fix".
---

# Verify fix + regression

## 1. Trạng thái hiện tại
Người dùng bấm **Export JSON** trên Tracker → `tracker-export.json`.
Đọc comment dev ở bug `fixed`/`wontfix` → bàn với người dùng, không tự đóng.

## 2. Chạy lại phần tự động — toàn bộ trang bị ảnh hưởng
```bash
RUN=runs/$(date +%Y%m%d-%H%M)-verify; S="${CLAUDE_PLUGIN_ROOT}/scripts"; PY=$(python3 -c 1 2>/dev/null && echo python3 || echo python)
for vp in sp pc; do for b in chromium msedge webkit; do node $S/measure.mjs --spec specs/<page>.$vp.json --browser $b --out $RUN; done
  node $S/visual_diff.mjs --page <page> --vp $vp --figma-png specs/<page>.$vp.png --out $RUN; done
node $S/responsive_sweep.mjs --page <page> --out $RUN
node $S/cms_check.mjs --page <page> --out $RUN                      # nếu trang list có CMS
node $S/cms_record_check.mjs --page <page> --out $RUN               # thay dòng trên nếu trang dựng từ 1 bản ghi
for vp in sp pc; do node $S/page_checks.mjs --page <page> --vp $vp --out $RUN; done
for vp in sp pc; do WEBQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node flows/<page>.flow.mjs --out $RUN --vp $vp; done   # nếu có flow
$PY $S/make_bugs.py --run $RUN
$PY $S/compare_runs.py --tracker tracker-export.json --rerun $RUN/bugs.json --pages <page>
```
Designer đổi Figma → chạy lại `qa-figma-spec` trước (giữ selector).
`verify.json`: bug tự động `fixed` → `verified` / `reopened`; `verified`/`closed` lỗi lại → `reopened`; key mới → bug mới. Import `verify.json` + ảnh `upload/` vào Tracker.
Bug chỉ được `verified` khi lần chạy lại **có kiểm lại đúng chỗ đó** (cùng nguồn, trang, viewport, browser; element còn trong spec; check flow `pass`). Không phủ (Edge không mở được, bỏ bước CMS/flow, check bị blocked, element bị xoá khỏi spec…) → giữ `fixed`, liệt kê ở mục **"Chưa verify được"** trong `verify_report.md` kèm lý do. Chạy bổ sung đúng phần thiếu rồi so lại; không tự đổi trạng thái bằng tay.
`verify_report.md` liệt kê bug tester tạo đang `fixed` → chuyển tester verify.

## 3. Checklist
Chạy lại `qa-checklist-excel` bước 3 trên file checklist tester đã điền: chỉ ghi đè mục tự động (NG → OK khi verified, bug mới → NG). Mục tester điền giữ nguyên.

## 4. Báo tester
Danh sách bug Kiểm bằng = Chrome/Tay đang `fixed` để verify bằng Claude in Chrome (`qa-chrome-verify`), kèm thời điểm/build đã chạy lại.
