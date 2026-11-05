---
name: app-testcase
description: Thiết kế test case webapp theo hướng rủi ro từ tài liệu đặc tả trên git + mockup Claude Design — trích rule, câu hỏi, chọn kỹ thuật (BVA/EP/Decision Table/State/Pairwise), gộp & chống trùng, RTM + coverage — xuất TestDesign.md + TestCase.csv theo template, rồi (khi được duyệt) import TestRail và tạo Test Run.
---

# Thiết kế test case (rule 01)

**Đọc trước:** `<docs.repo>/<docs.testing>/RULES/01_*.md`. Nếu dự án không có thì đọc `${CLAUDE_PLUGIN_ROOT}/templates/rules/01_TestCase_Rules.md`. File rule là chuẩn: vai trò, quy trình 4 bước, G1–G6, D1–D3, giới hạn độ chi tiết, priority, định dạng Phần A–F, checklist tự kiểm, yêu cầu coverage. Skill này chỉ nêu cách áp dụng.

## 1. Thu thập đầu vào (hỏi người dùng những mục còn thiếu, đừng đoán)
- **Phạm vi**: module, màn hình, mục tài liệu. Đối chiếu nhánh docs bằng `git -C <docs.repo> log -1 --format="%h %ad" -- <file>`, ghi version và ngày của tài liệu nguồn.
- **Tài liệu**: file đặc tả chính, nhật ký thay đổi (CH-xxx), Q&A, requirement liên quan.
- **Mockup**: bản export trong `design.local` (HTML/MD/ảnh màn hình) đọc trực tiếp được. Link `design.url` dùng để ghi nguồn. Không đọc được mockup thì ghi `[Mockup không thể hiện]` vào Remarks, không bịa.
- **TC đã có**: liệt kê `TESTCASE/*_TestCase.csv` (`node "$S/tc_csv.mjs" list <csv>`), không test lại.
- **Nhóm COMMON đã có**: tìm `COMMON-xx` trong các CSV hiện có, chỉ tham chiếu lại (D1).
- **Cách hiển thị validation** của từng màn hình (tất cả lỗi cùng lúc hay dừng ở lỗi đầu): đây là căn cứ cho ngoại lệ G2.
- **Role**: lấy từ tài liệu, đối chiếu thêm code BE nếu người dùng cho phép.

## 2. Thực hiện đúng 4 bước của rule
Bước 1 trích rule và câu hỏi → Bước 2 chọn kỹ thuật → Bước 3 sinh TC, gộp và chống trùng → Bước 4 tự kiểm. Rule không có bước nào chưa cover thì giải thích lý do ở Phần D.

## 3. Đầu ra (theo mẫu đã dùng trong `TESTCASE/`)
- `TESTCASE/<M>_<Ten-chuc-nang>_TestDesign.md` gồm: bảng thông tin (link CSV, rule áp dụng, tài liệu nguồn kèm version/ngày, ngày lập), **0. Phạm vi** (trong / ngoài phạm vi kèm lý do, các đầu vào theo rule), **1. Dữ liệu kiểm thử TD-xx**, Phần A (rule), B (câu hỏi), D (ma trận truy vết), E (thống kê), F (đề xuất bổ sung), RTM + % coverage + requirement chưa test được + rủi ro.
- `TESTCASE/<M>_<Ten-chuc-nang>_TestCase.csv` (Phần C): header **y hệt** CSV template trong `RULES/`, mã hoá **UTF-8 có BOM**, xuống dòng trong ô bằng `\n` và đặt ô trong ngoặc kép.
  - Steps và Expected đánh số `1.` `2.` và tương ứng 1-1. Tối đa 6 bước.
  - Remarks ghi: `Rule: <mã> | Nguồn: <mục tài liệu> | Mockup: ...`. Lệch tài liệu và mockup thì ghi `[Tài liệu ≠ Mockup] ... → xác nhận <specOwner>`.
  - Để trống `Actual Result`, `Status`, `Date Tested`, `Tested By`.
- Ghi file CSV bằng script Node (dùng `toCsv` trong `${CLAUDE_PLUGIN_ROOT}/scripts/lib.mjs`) thay vì gõ tay, để đảm bảo đúng ngoặc kép và BOM.

## 4. Tự kiểm bằng script (bắt buộc trước khi báo xong)
```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; T="<docs.repo>/<docs.testing>"
node "$S/tc_csv.mjs" check "$T/TESTCASE/<M>_TestCase.csv" --template "$T/RULES/<template>.csv" --rules R01,R02,...   # mã rule ở Phần A
node "$S/tc_csv.mjs" trace "$T/TESTCASE/<M>_TestCase.csv"    # → Phần D
node "$S/tc_csv.mjs" stats "$T/TESTCASE/<M>_TestCase.csv"    # → Phần E
```
Có FAIL thì sửa rồi chạy lại. Sau đó trả lời 5 câu trong checklist của rule ngay trong TestDesign.md.

## 5. Đưa lên TestRail (chỉ khi người dùng yêu cầu)
```bash
node "$S/testrail.mjs" sections                       # chọn section theo module/màn hình (vd "M2-A01 - ...")
node "$S/testrail.mjs" import-csv --file <csv> --section <id>          # dry-run: thêm / bỏ qua
node "$S/testrail.mjs" import-csv --file <csv> --section <id> --apply  # sau khi người dùng duyệt
node "$S/testrail.mjs" add-run --name "<testrail.runNamePrefix><chức năng>" --csv <csv> [--section <id cha>] --apply
```
TC đã có trong section (trùng TC ID ở đầu title) sẽ được bỏ qua. Chỉ ghi đè khi người dùng yêu cầu, bằng `--update`. Báo lại ID và link của Test Run.

## Báo cáo cho người dùng
Đường dẫn 2 file, số rule / TC / ảnh dự kiến, % coverage, danh sách câu hỏi Qxx cần `specOwner` chốt, các điểm lệch tài liệu và mockup.
