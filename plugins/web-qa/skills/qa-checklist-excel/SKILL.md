---
name: qa-checklist-excel
description: Điền kết quả kiểm tự động (OK/NG/N/A theo browser, mã bug, ngày) vào checklist Excel, giữ nguyên format; mục chưa kiểm được để trống và sinh prompt để tester cho Claude in Chrome kiểm nốt.
---

# Checklist Excel — điền phần tự động, để trống phần còn lại

## 0. Vị trí file
- Checklist gốc: `checklist/<tên>.xlsx`, mapping: `checklist/checklist-map.json` — khai báo trong `qa-config.json → checklist.file / checklist.mapping` (script tự đọc, không cần truyền `--checklist`).
- Kết quả mỗi lần chạy: `$RUN/<tên>_result.xlsx` + `$RUN/<tên>_result_tester-prompt.md` (file gốc không bị sửa).
- Tester điền xong (trên Excel Online / Google Sheets) → tải về đặt `checklist/<tên>_tester.xlsx`, cập nhật `checklist.file` trỏ vào file này cho lần verify sau.

## 1. Mapping (lần đầu mỗi dự án)
```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/update_checklist.py" --inspect
```
Xác định dòng tiêu đề, cột ID, cột nội dung mục, cột ngữ cảnh (màn hình/khu vực), cột kết quả theo browser, cột bug/ghi chú/ngày/người test → `checklist-map.json` (schema trong docstring script). Hỏi người dùng nếu cột không rõ.

## 2. Quyết định từng mục — chỉ dựa trên bằng chứng của run
| Mục | Bằng chứng |
|---|---|
| UI/spec | `measure.*`, `visual.*` + trạng thái bug Tracker |
| Responsive / browser | `responsive.<page>.json` (NG chỉ ở browser lỗi) |
| Dữ liệu CMS | `cms.<page>.json` |
| Logic | `flow.*.json` (check `pass`/`fail`) |
- Có bằng chứng: OK, hoặc NG kèm mã bug (lấy từ Tracker sau khi Import), hoặc N/A khi script xác nhận không áp dụng (vd trang không có form).
- **Không có bằng chứng → không đưa vào results (ô để trống).** Không đoán, không đánh N/A thay tester.
- Mục kiểm được một phần (vd UI form OK nhưng chưa gửi thật): để trống, ghi `note` "UI OK (tự động); còn gửi thật + mail".

## 3. Ghi
```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/update_checklist.py" --results $RUN/checklist-results.json --run $RUN
```
→ `$RUN/<Checklist>_result.xlsx` + `$RUN/<Checklist>_result_tester-prompt.md`: danh sách các ô còn trống + quy tắc cho Claude in Chrome + flow `needs-chrome` của run.
Đọc lại prompt, bổ sung nếu cần (URL trang cụ thể, form được gửi thật, email test).

## 4. Báo người dùng
Số OK / NG / N/A / còn trống, dòng không khớp, và tin nhắn báo tester (mẫu trong `web-qa`).

## Sau khi tester làm xong
Tester trả checklist đã điền (hoặc bảng kết quả). Khi verify sau fix, chạy lại bước 3 với results mới — script chỉ ghi đè các dòng có trong results, giữ nguyên kết quả tester đã điền.
