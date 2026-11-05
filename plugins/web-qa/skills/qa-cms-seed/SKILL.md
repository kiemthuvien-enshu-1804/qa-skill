---
name: qa-cms-seed
description: Tạo bộ dữ liệu test (tiếng Nhật, có nhãn [<PREFIX>001] tăng dần) trên microCMS môi trường dev trước khi test bất kỳ trang/khối nào lấy dữ liệu CMS (list, detail, slider, accordion, bảng, khối pickup ở TOP…) — gồm các ca biên số lượng, chữ dài, thiếu field, lệch ngày JST, ký tự đặc biệt, bài nháp — và dọn sau khi test xong. Chạy trong VS Code, trước qa-cms-data.
---

# Tạo dữ liệu test CMS (microCMS, chỉ môi trường dev)

Mục đích: biết chắc trang **phải** hiển thị gì. Mỗi bài trong bộ seed có một mục đích riêng (`purpose`), nên khi trang hiển thị sai thì biết ngay là sai ở ca nào.

## Thứ tự trong một lần QA trang CMS
1. `qa-figma-spec`: lấy spec và **Figma comments về luồng hiển thị** (sort, số bài/trang, khi 0 bài, khi không có ảnh…). Ghi vào `specs/<page>.notes.md`.
2. **`qa-cms-seed`** (skill này): viết file seed theo các comment đó, tạo dữ liệu, rebuild nếu site build tĩnh.
3. `qa-cms-data`: dữ liệu API ↔ trang (số bài, thứ tự, ngày, category, ảnh, link, pagination, detail).
4. `qa-logic-flow`: luồng theo Figma comment (filter, category rỗng, pagination, accordion, bài nháp không hiện).
5. `qa-pixel-check`, `qa-responsive`: UI. Pixel-check so với Figma dùng bài `noPrefix` có text giống hệt Figma; các bài khác dùng để kiểm cắt chữ, xuống dòng, tràn.
6. Test xong hết (kể cả regression) → dọn dữ liệu.

## 1. Cấu hình (1 lần mỗi dự án)
`qa-config.json → cms.seed`:
```json
"seed": {
  "allowedHosts": ["<service-dev>.microcms.io"],
  "headers": { "X-MICROCMS-API-KEY": "${CMS_WRITE_API_KEY}" },
  "prefix": "${QA_SEED_PREFIX}"
}
```
- `allowedHosts`: host microCMS của **môi trường dev**. Script dừng nếu host của `cms.baseUrl` không nằm trong danh sách này. **Hỏi người dùng** để xác nhận service đó là dev. Không tự điền.
- `CMS_WRITE_API_KEY`: API key có quyền GET/POST/PUT/PATCH/DELETE cho các endpoint cần seed, điền trong `.env.local`. Nếu key đọc (`CMS_API_KEY`) đã có quyền ghi thì trỏ `headers` về `${CMS_API_KEY}`.
- `QA_SEED_PREFIX`: tên viết tắt của người test (vd `KIM`), điền trong `.env.local`. Mỗi tester một prefix nên dữ liệu không đè nhau.

## 2. Viết file seed `cms-seed/<tên>.seed.json`
Mỗi API (endpoint) của CMS cần một file seed. Một API có thể đổ dữ liệu ra nhiều chỗ trên site (trang list, detail, khối pickup ở TOP, slider, sidebar…). Liệt kê hết các chỗ đó từ Figma + `pages[]` trước khi viết seed, rồi chọn ca test sao cho phủ được tất cả.

**Lấy schema thật trước, không đoán tên field:** chạy `node "${CLAUDE_PLUGIN_ROOT}/scripts/cms_check.mjs" --page <page> --dump` hoặc GET 1 bài của endpoint đó. Từ đó biết field nào là text, rich editor, ảnh, tham chiếu, select, bool, số, ngày, lặp (repeater).

**Chọn ca theo kiểu field / kiểu hiển thị:**
| Kiểu | Ca nên có |
|---|---|
| Số lượng (list, slider, grid, khối TOP) | 0 bài (qua filter/category rỗng), 1 bài, đúng giới hạn hiển thị, giới hạn + 1 (pagination / "xem thêm" / ẩn bớt), số lẻ làm grid thiếu ô cuối |
| Text ngắn (tiêu đề, tên, label) | 1 ký tự, rất dài (`{jp:120}`), toàn số/chữ Latin dài không dấu cách (vỡ layout), ký tự đặc biệt / emoji / ｶﾀｶﾅ半角 / `<b>` |
| Rich editor / textarea | nhiều đoạn, h2/h3, list, link, ảnh, bảng, xuống dòng trong textarea |
| Ảnh | không có ảnh (no-image), ảnh dọc, ảnh ngang rất dài |
| Ngày | 00:10 và 23:50 giờ Nhật (lệch UTC/JST), cùng ngày (thứ tự), năm trước (format), ngưỡng "NEW" nếu có |
| Tham chiếu / select / tag | không chọn, chọn 1, chọn nhiều, category không có bài |
| Bool / số / link ngoài | true/false, 0 / số lớn / số âm, link `target="_blank"`, link trống |
| Trạng thái | bài nháp (không được hiện) |
| Thiết kế | 1 bài `noPrefix` có text y hệt Figma, dùng cho pixel-check |

Ngoài ra thêm ca từ **Figma comment về luồng**. Ví dụ comment ghi "TOP hiện tối đa 3 bài" thì seed ít nhất 4 bài; "NEW trong 7 ngày" thì có bài 6 ngày và 8 ngày trước; "không có ảnh thì dùng ảnh mặc định" thì có bài không ảnh.

File mẫu tham khảo cách viết: `${CLAUDE_PLUGIN_ROOT}/skills/qa-cms-seed/templates/news.seed.json` (list + detail), `faq.seed.json` (accordion). Đây chỉ là ví dụ, nên phải đổi endpoint, field và ca test cho đúng API của dự án.
- Nếu dev đã có sẵn bài thì bài seed (ngày gần nhất) đứng đầu, bài cũ bị đẩy xuống sau. Tính số bài theo chỗ hiển thị có giới hạn nhỏ nhất.
- API dạng object (1 bài duy nhất, vd thông tin công ty): không seed bằng script này, vì PUT sẽ ghi đè dữ liệu thật. Để trống cho tester.
- Field ảnh: URL ảnh đã có trong media của service dev (upload 1 ảnh trên admin rồi copy URL vào `vars.image`).
- Field tham chiếu (category): `"$ref:<key>"`, item được tham chiếu phải khai báo trước.

| Token | Thành |
|---|---|
| `$ref:<key>` | content ID của item khác (field tham chiếu), mảng cho tham chiếu nhiều |
| `{label}` | `[KIM001]` |
| `{jp:N}` | N ký tự tiếng Nhật |
| `{days:-N}` / `{days:-N@HH:MM}` | ISO của N ngày trước / ngày đó lúc HH:MM giờ Nhật |
| `{var:name}` | giá trị trong `vars` |

Mỗi item: `key`, `purpose`, `fields`, và tuỳ chọn `endpoint`, `status: "draft"`, `prefixField`, `noPrefix`.
Nhãn `[<PREFIX><số>]` tự gắn vào đầu `prefixField` (mặc định `title`). Số = `numberStart` + thứ tự, content ID = `qa-<prefix><số>`. Mỗi trang nên dùng một `numberStart` riêng (news 1, FAQ 101…) để nhãn không trùng.

## 3. Chạy
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cms_seed.mjs" --file cms-seed/news.seed.json            # xem trước, không ghi
node "${CLAUDE_PLUGIN_ROOT}/scripts/cms_seed.mjs" --file cms-seed/news.seed.json --apply    # dọn bộ cũ + tạo lại
node "${CLAUDE_PLUGIN_ROOT}/scripts/cms_seed.mjs" --file cms-seed/news.seed.json --clean --apply   # chỉ dọn
```
- **Luôn chạy xem trước, cho người dùng xem bảng rồi mới `--apply`.** `--apply` ghi lên CMS, nên cần người dùng đồng ý mỗi lần.
- `--apply` xoá đúng các content ID `qa-<prefix>…` trong file rồi tạo lại, nên chạy lại bao nhiêu lần vẫn ra cùng một bộ. Script không đụng bài khác.
- Kết quả ghi vào `cms-seed/<page>.applied.json` (nhãn, ID, mục đích). Dùng file này khi viết flow và bug.
- Lỗi 400: tên field / kiểu dữ liệu khác schema → sửa file seed. 401/403: key thiếu quyền ghi.
- Bài nháp: microCMS không cho set `publishedAt` cho bài nháp, nên script tự bỏ field này.
- Site build tĩnh (SSG): sau `--apply` phải rebuild/deploy môi trường dev rồi mới test. Ghi thời điểm build vào tin nhắn báo tester.

## 4. Kiểm sau khi seed
- `qa-cms-data` so API ↔ trang như thường lệ. Bài nháp không có trong API, nên nếu trang hiện bài đó thì `cms-count` / `cms-title` sẽ báo lỗi.
- `qa-logic-flow`: thêm check theo `purpose`, ví dụ trang không chứa chữ `[KIM0xx]` của bài nháp, category rỗng hiện đúng trạng thái trong Figma, bài `jst-midnight` hiện đúng ngày JST.
- Bug do dữ liệu seed: ghi nhãn `[KIM0xx]` + `purpose` trong bug để dev tìm đúng bài.

## Quy tắc
- Chỉ ghi lên host trong `allowedHosts`. Không tạo / sửa / xoá bài không phải `qa-<prefix>…`.
- Không đọc hay in `.env.local`. Không ghi API key vào file seed, bug hay log.
- Không tự dọn dữ liệu khi người dùng chưa yêu cầu, vì regression cần dùng lại đúng bộ này.
