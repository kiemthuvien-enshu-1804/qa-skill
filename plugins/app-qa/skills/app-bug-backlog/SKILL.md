---
name: app-bug-backlog
description: Từ các test case FAIL (TestRail / results.json), soạn bản nháp bug theo chuẩn (một bug một vấn đề, gộp theo hiện tượng, tìm issue trùng, ảnh bằng chứng có khung đỏ đánh số + cột ghi chú) → DỪNG chờ duyệt → tạo issue hoặc comment vào issue cũ trên Backlog, gán người xử lý FE/BE và parent task.
---

# Log bug lên Backlog (rule 03)

**Đọc trước:** `RULES/03_*.md` của dự án (nếu không có thì `${CLAUDE_PLUGIN_ROOT}/templates/rules/03_LogBug_Rules.md`). Mẫu bug report, nguyên tắc 1–6 và 2 giai đoạn đều theo rule đó.

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"; T="<docs.repo>/<docs.testing>"
```

## Giai đoạn 1: soạn nháp (KHÔNG tạo issue)
1. **Lọc FAIL**: `node "$S/testrail.mjs" tests --run <R> --status "Failed (NG)"` (đúng label của dự án, xem `statuses`) hoặc lấy từ `$RUN/results.json`. Case BLOCKED không log bug, liệt kê riêng.
2. **Mở ảnh** của từng case (Read file png). Ảnh không thể hiện lỗi thì đánh dấu `[ẢNH KHÔNG KHỚP]`.
   **Vẽ ảnh bằng chứng** (bắt buộc, không gửi ảnh gốc), xem mục *Ảnh bằng chứng* bên dưới.
3. **Gộp theo hiện tượng** (nguyên tắc 3). Nếu chỉ nghi cùng nguyên nhân thì tách riêng và ghi "có thể liên quan Nxx".
4. **Tìm issue trùng** (đang mở):
   `node "$S/backlog.mjs" issues --type Bug --keyword "<màn hình hoặc message>"`, rồi `node "$S/backlog.mjs" issue <KEY> --comments` để đọc.
   Nghi trùng thì đề xuất `action: comment` vào issue cũ.
5. **Soạn** `BUGREPORT/<M>_Bug_Drafts_<YYYYMMDD>.md` theo mẫu của rule. Mẫu tham khảo là các file đã có trong `BUGREPORT/`. Mỗi bug có:
   `### Nxx · <Tiêu đề [Chức năng][Màn hình] Hiện tượng khi điều kiện>`, dòng `Hành động: new|comment <KEY> · Phụ trách: FE|BE`, và các mục Tiền điều kiện / Các bước tái hiện (URL rút gọn) / Kết quả thực tế / Kết quả mong đợi (ghi nguồn) / Evidence / Test case liên quan (`T<testId>: <TC> — <link test TestRail>`) / Ghi chú ("Nghi ngờ:", lệch spec thì ghi `【要確認・仕様差異】`).
   Thiếu thông tin thì ghi `[CẦN BỔ SUNG]`.
6. Đồng thời ghi `BUGREPORT/<M>_Bug_Drafts_<YYYYMMDD>.json` cho script. Đây là mảng các object:
   `{ ref, action, issueKey?, module, summary, description (Markdown, ảnh chèn bằng {{img:<file>}}), assignee: "FE"|"BE", parent?, priority?, marks: [đường dẫn mark.json], attachments?: [file khác nếu cần, vd log] }`.
   `assignee` FE/BE map qua `backlog.assignees`, `parent` mặc định lấy theo `backlog.parentTasks[module]`.
7. Chạy thử: `node "$S/backlog.mjs" create --from <drafts.json>` (dry-run), để kiểm loại issue, ưu tiên, người xử lý, parent, số ảnh, và vẽ bản xem trước của ảnh bằng chứng (bước 3 ở mục *Ảnh bằng chứng*).
8. **DỪNG.** Gửi người dùng: đường dẫn file nháp, bảng tóm tắt `Nxx | tiêu đề | new/comment | FE/BE | TC`, danh sách ảnh bằng chứng đã vẽ (đường dẫn đầy đủ, để tham khảo), danh sách BLOCKED, danh sách `[ẢNH KHÔNG KHỚP]`. Chờ câu trả lời "Duyệt", "Duyệt trừ Nxx" hoặc yêu cầu sửa.

## Ảnh bằng chứng (áp dụng cho mọi bug, kể cả khi rule dự án không ghi)
Ảnh gửi đi = ảnh gốc + khung đỏ đánh số quanh **từng** chỗ sai + cột trắng bên phải:
- 3 dòng tiêu đề: `mã bug · môi trường · ngày` / `mã đặt chỗ hoặc mã item + tên` / `tài khoản · màn hình → thao tác`. Để `header.bug` là `"{{key}}"`: script tự điền mã issue thật khi tạo (bug mới), hoặc mã issue cũ (action comment).
- Mỗi khung có ghi chú (1), (2)…: `title` đỏ đậm nói **cái gì sai**, rồi `lines` 2〜4 dòng tiếng Việt: *Hiện tại:* … (giữ nguyên chữ JA trên UI trong 「」) → *Đúng:* …, và `source` (mục spec / mockup / TC).
- **Chỉ khoanh chỗ chắc chắn là bug.** Điểm còn chờ chốt (`【要確認・仕様差異】`, đang hỏi spec owner) thì bỏ ra, hoặc đặt `"pending": true` (khung cam nét đứt, ghi ĐANG CHỜ CHỐT).
- Tên file `<bug/TC>_<mô tả ngắn>_FAIL.png`, lưu ở `$RUN/bug/`. Không ghi đè ảnh gốc trong `evidence/`.

Cách làm:
1. Lấy toạ độ khung: `locator.boundingBox()` (ảnh của runner chụp ở tỉ lệ 1:1), hoặc đo trên ảnh.
2. Viết `$RUN/bug/<ID>.mark.json` (mẫu ở đầu `annotate.mjs`) và khai vào `marks` của bug nháp. Chạy `node "$S/annotate.mjs" --spec <file> --check`: có FAIL thì sửa spec; có WARN (`[CẦN BỔ SUNG]`, thiếu nguồn) thì ghi vào báo cáo.
3. Dry-run `create` sẽ vẽ bản xem trước (mã = `Nxx`). **Claude tự mở ảnh ra xem lại** (Read file png): khung đúng chỗ, không che chữ, số khớp ghi chú, chữ không bị cắt. Sai thì sửa spec và vẽ lại.
4. Ảnh **không cần duyệt riêng**: khi `create --apply`, script vẽ lại với mã thật và tự đính kèm vào đúng issue (bug mới) hoặc comment (issue cũ). Mô tả chèn ảnh bằng `{{img:<tên file out>}}`. Ảnh gốc không đính kèm (không để ảnh gốc trong `attachments`).

## Giai đoạn 2: tạo trên Backlog (chỉ sau khi duyệt, đúng phạm vi đã duyệt)
```bash
node "$S/backlog.mjs" create --from <drafts.json> [--only N01,N03] --apply
```
Script tạo issue, vẽ ảnh bằng chứng với mã thật rồi upload và đính kèm vào issue đó, chèn ảnh vào mô tả theo format của project (markdown `![f][f]` hoặc `#image(f)`), gán parent và người xử lý, ghi `issueKey` / `url` / `result` vào lại file json. Upload lỗi thì vẫn tạo issue kèm dòng `[ẢNH CẦN ĐÍNH KÈM THỦ CÔNG: …]`. Gặp lỗi thì không thử lại quá 1 lần.
- Cập nhật file `.md` nháp: thêm mã issue thật cạnh từng Nxx.
- Ghi defect lên TestRail (nếu người dùng muốn): `node "$S/testrail.mjs" result --run <R> --tc <TC> --status FAIL --defects <KEY> --apply`.

## Báo cáo
Bảng `Nxx → issue KEY (link) | comment vào KEY | lỗi`, danh sách việc người dùng phải làm tay (đính kèm ảnh, BLOCKED cần xử lý).
