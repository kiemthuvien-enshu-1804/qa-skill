---
name: app-verify-bug
description: Verify / re-test bug webapp sau khi dev fix — lọc bug trên Backlog, xác nhận bản fix đã deploy, chạy lại bước tái hiện + TC liên quan + hồi quy giới hạn, chụp evidence, soạn comment PASS/FAIL/BLOCKED → DỪNG chờ duyệt → đóng/reopen trên Backlog và cập nhật TestRail, kiểm đồng bộ.
---

# Verify bug (rule 04)

**Đọc trước:** `RULES/04_*.md` của dự án (nếu không có thì `${CLAUDE_PLUGIN_ROOT}/templates/rules/04_VerifyBug_Rules.md`). Nguyên tắc 1–5, mẫu comment và output Phần A–E đều theo rule đó.

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"
```

## Giai đoạn 1: verify và tổng hợp (KHÔNG ghi gì lên Backlog hay TestRail)
1. **Lọc bug** theo `backlog.verifyFilter`:
   `node "$S/backlog.mjs" issues --type Bug --assignee me --status "In Progress,Resolved"` (thay theo config).
2. Với mỗi bug: `node "$S/backlog.mjs" issue <KEY> --comments`, đọc bước tái hiện, TC liên quan và comment fix của dev (sửa gì, build/commit/PR nào).
   Dev ghi "không tái hiện được", "đúng spec" hoặc "không sửa", hoặc bug đã reopen từ lần thứ 3 trở lên → đưa vào **Phần E (cần quyết định)**, không verify.
   Comment cho biết chỉ cần sửa tài liệu/mockup → đề xuất đổi tiêu đề thành `[Lỗi spec/mockup]…`.
3. **Kiểm build** trên môi trường test (theo `envs.<env>.build`: footer, API, hoặc hỏi người dùng) và so với bản fix. Không xác định được, hoặc build cũ hơn bản fix → **CHƯA DEPLOY**, không verify.
4. **Retest bước tái hiện**: viết đúng các bước tái hiện của bug thành `tc('<BUG_KEY>', ...)` trong `e2e/retest_<YYYYMMDD>.run.mjs` (copy từ `run_template.mjs`). Không đổi bước hay dữ liệu.
   Ảnh gốc của bug để so sánh: `node "$S/backlog.mjs" download <KEY> --out runs/retest_<YYYYMMDD>/orig/<KEY>`.
5. **Chạy lại mọi TC liên quan**, cộng thêm **hồi quy giới hạn**: tối đa `review.regressionLimit` (5) TC cùng màn hình/chức năng với phần dev sửa, ưu tiên P1. Ghi rõ đã chạy những TC nào. Dùng `--suffix retest` để ảnh có tên `{BUG_KEY|TC_ID}_retest_{PASS|FAIL|BLOCKED}.png`:
   ```bash
   R=runs/retest_<YYYYMMDD>
   APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node e2e/retest_<YYYYMMDD>.run.mjs --env test --out $R --suffix retest --build <build>
   APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node e2e/<M>.run.mjs --env test --out $R --suffix retest --only <TC liên quan + hồi quy> --build <build>
   ```
6. **Mở xem ảnh**, kết luận theo nguyên tắc 3: lỗi gốc còn → FAIL; lỗi gốc hết nhưng có lỗi khác → PASS bug gốc, kèm bug mới; không làm được → BLOCKED. Vẽ ảnh bằng chứng như mục *Ảnh bằng chứng* của `app-bug-backlog` (`annotate.mjs --spec`). Bug còn lỗi: `"status": "FAIL"`, tên `<KEY>_retest_<mô tả>_FAIL.png`. Đã hết lỗi: `"status": "PASS"` (khung xanh quanh chỗ đã đúng), tên `<KEY>_retest_<mô tả>_PASS.png`. Mở ảnh xem lại trước khi đưa vào nháp.
7. Soạn **Phần A–E** theo rule vào `BUGREPORT/Verify_<YYYYMMDD>.md`, kèm nháp comment theo mẫu 【Re-test: PASS / FAIL / Chưa thể verify】. Bug mới phát sinh thì soạn theo mẫu của `app-bug-backlog`, ghi "phát sinh khi verify <KEY>".
8. **DỪNG**, chờ "Duyệt", "Duyệt trừ <KEY>" hoặc yêu cầu sửa. Chỉ bỏ qua bước chờ khi `review.verifyMode = "auto"` và bug là Minor/Trivial PASS.

## Giai đoạn 2: cập nhật (chỉ phần đã duyệt)
Ghi comment ra file `runs/retest_<YYYYMMDD>/<KEY>.md`, chạy dry-run trước rồi thêm `--apply`:
```bash
# PASS → Closed
node "$S/backlog.mjs" update <KEY> --status "<statusOnVerify.PASS>" --body-file <KEY>.md --file <ảnh bằng chứng .png> --apply
# FAIL → In Progress, gán lại cho dev đã fix (người xử lý trước, xem lịch sử comment)
node "$S/backlog.mjs" update <KEY> --status "<statusOnVerify.FAIL>" --assignee "<dev>" --body-file <KEY>.md --file <ảnh bằng chứng .png> --apply
# BLOCKED / CHƯA DEPLOY → chỉ comment, giữ trạng thái và người xử lý
node "$S/backlog.mjs" comment <KEY> --body-file <KEY>.md --apply
# Bug mới → app-bug-backlog (create), description ghi liên kết bug gốc
# Lỗi spec/mockup → update <KEY> --summary "[Lỗi spec/mockup]..." --apply
```
TestRail (đúng Test Run đã chỉ định):
- Verify **PASS** và TC không còn bug nào khác → `node "$S/testrail.mjs" result --run <R> --tc <TC> --status PASS --comment "Re-test <KEY> PASS" --file <ảnh bằng chứng .png> --apply`.
- Verify FAIL mà không có bug mới → **không** cập nhật TestRail.

## Output cuối
Bảng `Bug | Trạng thái mới | Người xử lý | Comment | Ảnh | TestRail đã cập nhật | Lỗi`, thống kê Closed / Reopen / Blocked / Chưa deploy / bug mới. **Kiểm đồng bộ**: so trạng thái bug trên Backlog với test trên TestRail (`testrail.mjs tests --run <R>`), liệt kê chỗ không khớp (vd bug Closed nhưng TC còn Failed). Cuối cùng là danh sách việc người dùng phải làm tay.
