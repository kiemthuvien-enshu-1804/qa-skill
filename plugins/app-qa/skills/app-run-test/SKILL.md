---
name: app-run-test
description: Chạy test case webapp theo Test Run trên TestRail — viết file chạy Playwright từ TestCase.csv, thực hiện đúng từng bước, chụp 1 ảnh evidence/TC ({TC_ID}_{PASS|FAIL|BLOCKED}.png), retry/dừng theo rule, rồi (khi được duyệt) ghi kết quả + ảnh lên TestRail. Case không tự động được thì đánh MANUAL để kiểm bằng Claude in Chrome.
---

# Chạy test (rule 02)

**Đọc trước:** `RULES/02_*.md` của dự án (nếu không có thì `${CLAUDE_PLUGIN_ROOT}/templates/rules/02_RunTest_Rules.md`).

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; T="<docs.repo>/<docs.testing>"
```

## 1. Chuẩn bị
- Test Run: lấy từ người dùng hoặc tra bằng `node "$S/testrail.mjs" runs --open`. Danh sách TC: `node "$S/testrail.mjs" tests --run <R>`.
- **Build** của môi trường test (footer, API version hoặc người dùng cung cấp). Không biết thì ghi `[CẦN BỔ SUNG]`.
- Dữ liệu theo `TESTDATA/<M>/README.md` đã sẵn sàng. TC thuộc mục "Không chuẩn bị được" thì đánh NA, ghi lý do.
- `node "$S/doctor.mjs"`: tài khoản trong `accounts` phải có mật khẩu.

## 2. Viết file chạy `e2e/<M>.run.mjs`
```bash
cp "$S/run_template.mjs" e2e/<M>.run.mjs
```
Với mỗi TC trong CSV, viết `tc(id, name, async (t) => {...}, { account })` **bám đúng Steps / Expected**:
- Mỗi bước trong CSV là một khối lệnh, comment số bước. Dùng đúng dữ liệu ghi trong TC / TD.
- Expected: dùng `t.expectText` / `expectVisible` / `expectHidden` / `expectUrl`, hoặc `t.fail('<thực tế cụ thể>')`. Ghi rõ nội dung message hay giá trị thấy được.
- `t.focus(locator)` để vùng kết quả nằm trọn trong ảnh. Nếu kết quả là toast thì truyền `{ toast: true }`.
- Không xác minh được expected (expected mơ hồ, thiếu dữ liệu): `t.na('lý do')`, tương ứng テスト不要・不可能.
- Bước Playwright không làm được (mail thật, OTP, kéo thả, đánh giá bằng mắt, thiết bị thật): `tc.manual(id, name, 'lý do')`.
- Selector ưu tiên role/label/text như người dùng thấy. Không sửa code app để thêm selector.
- Giữ file `e2e/` lại để verify và regression chạy y hệt.

## 3. Chạy
```bash
RUN=runs/$(date +%Y%m%d-%H%M)-<M>
APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node e2e/<M>.run.mjs --env test --out $RUN --build <build> [--only TC-1,TC-2] [--headed]
```
Runner đã thực hiện sẵn các quy tắc của rule: retry 1 lần khi có sự cố, **dừng sau 3 BLOCKED liên tiếp** (exit 2), FAIL thì vẫn chạy tiếp, ảnh không ghi đè (`_r2`). Kết quả nằm ở `$RUN/results.json`, `$RUN/report.md`, `$RUN/evidence/`.
- Bị dừng vì BLOCKED thì báo người dùng nguyên nhân (môi trường, dữ liệu, login). Không tự sửa môi trường.
- **Mở xem ảnh của mọi case FAIL / BLOCKED** (Read file png) để xác nhận ảnh thể hiện đúng hiện tượng. Thấy runner kết luận sai (selector sai chứ không phải bug) thì sửa file chạy và chạy lại case đó (ảnh `_r2`), không sửa kết quả bằng tay.
- Case MANUAL: soạn danh sách kèm bước để người dùng hoặc tester kiểm bằng Claude in Chrome. Ảnh của tester đặt cùng `$RUN/evidence/` theo cùng quy tắc tên, rồi bổ sung vào `results.json`.

## 4. Ghi TestRail (sau khi người dùng duyệt)
```bash
node "$S/testrail.mjs" results --run <R> --from $RUN/results.json            # dry-run
node "$S/testrail.mjs" results --run <R> --from $RUN/results.json --apply    # PASS/FAIL/BLOCKED/NA + ảnh + comment
```
Map trạng thái theo `testrail.statusIds` (Entoly: BLOCKED và NA đều là 「テスト不要・不可能」). MANUAL và NOT_RUN không được ghi.

## Báo cáo
Bảng tổng `PASS / FAIL / BLOCKED / NA / MANUAL / NOT_RUN`, danh sách FAIL kèm thực tế ngắn gọn, link Test Run. Bước tiếp theo là `app-bug-backlog` cho các case FAIL.
