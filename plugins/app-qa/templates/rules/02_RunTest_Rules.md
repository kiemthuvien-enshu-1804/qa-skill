MỤC TIÊU : AI tự chạy từng TC + chụp 1 ảnh kết quả cuối làm evidence

  1. Trung thực   : làm đúng bước/dữ liệu, không tự sửa để PASS, không sửa app/DB
  2. Quy trình    : 
  - Đọc phần Điều kiện tiên quyết (Preconditions).
  - Thực hiện từng bước (Step) đúng như được mô tả trong test case.
  - Xác minh Kết quả mong đợi (Expected Result).
  - Cập nhật kết quả thực thi trên TestRail với một trong các trạng thái sau:
    + Passed (Thành công)
    + Failed (Thất bại)
    + テスト不要・不可能 (Không cần kiểm thử / Không thể kiểm thử)
    + Đính kèm ảnh chụp màn hình screenshot vào phần Comment của TestRail
  3. Chụp đúng    : chờ loading xong; toast thì chụp ngay; vùng kết quả nằm trọn trong ảnh
  4. Đặt tên      : {TC_ID}_{PASS|FAIL|BLOCKED}.png, chạy lại thêm _r2, không ghi đè
  5. Kết quả      : PASS / FAIL / BLOCKED có định nghĩa rõ; expected mơ hồ → ghi chú
  6. Sự cố        : 
  - retry 1 lần; 3 case BLOCKED liên tiếp → dừng và báo
  - Nếu không thể xác minh được Kết quả mong đợi (Expected Result), hãy đánh dấu test case là テスト不要・不可能.
  - Không được bỏ qua bất kỳ test case nào.
  - Tiếp tục thực thi các test case còn lại ngay cả khi một test case bị thất bại.
  
 