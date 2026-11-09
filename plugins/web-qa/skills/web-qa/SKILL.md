---
name: web-qa
description: Điều phối QA website theo Figma (thông số và comment Figma) + dữ liệu CMS. Chạy hết phần tự động trong VS Code (Playwright, CMS API), đẩy bug lên Tracker, điền checklist Excel (OK / NG / NA; mục chưa kiểm được để trống) kèm prompt cho tester kiểm nốt bằng Claude in Chrome. Dùng khi được yêu cầu "QA/test trang X", "tạo thư mục QA", "doctor". Verify bug / regression sau khi dev fix thì dùng qa-verify-regression.
---

# Web QA — VS Code trước, tester + Claude in Chrome sau

**Checklist Excel là chỗ bàn giao.** VS Code điền theo 4 trạng thái:
| Kết quả | Khi nào |
|---|---|
| `OK` | Đã kiểm tự động và đạt |
| `NG` | Đã kiểm tự động và có lỗi. **Không ghi mã bug vào Excel** (bug nằm trên Tracker) |
| `NA` | Trang được test **không có** chức năng/khối đó (vd trang không có form → các mục form = NA) |
| *(trống)* | Trang có mục đó nhưng VS Code chưa kiểm được → tester kiểm nốt bằng Claude in Chrome |

Scripts: `${CLAUDE_PLUGIN_ROOT}/scripts/` (plugin web-qa). Chạy từ thư mục gốc QA workspace (có `qa-config.json`). Mỗi lần test: `RUN=runs/$(date +%Y%m%d-%H%M)`.
Python: các skill gọi `$PY`, đặt bằng `PY=$(python3 -c 1 2>/dev/null && echo python3 || echo python)`. Trên Windows `python3` thường là lối tắt Microsoft Store và không chạy, nên phải dùng `python`. Không gọi thẳng `python3`.

## Thư mục QA của dự án (plugin = code dùng chung, thư mục QA = dữ liệu dự án)
- **Tạo mới / cập nhật khung** (khi người dùng yêu cầu "tạo thư mục QA cho dự án X", hoặc thư mục chưa có `qa-config.json`):
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" --project <tên> --base-url https://<site-test> --prefix <ABC>
  npm install && npm run setup
  ```
  init không ghi đè file dự án. Nó làm mới `qa-config.example.json`, `.env.example`, `README.md` (do plugin quản lý), và thêm marketplace `enshu-qa` + `web-qa@enshu-qa` vào `.claude/settings.json` để người khác mở thư mục cũng được bật plugin.
- **Kiểm cấu hình** trước mỗi lần chạy, và khi người dùng hỏi "doctor":
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"
  ```
- Thiếu thư viện (`Không tìm thấy thư viện "playwright"`): chạy `npm install && npm run setup` trong thư mục QA. Script nằm trong plugin nhưng dùng `node_modules` của thư mục QA.
- Không sửa file trong `${CLAUDE_PLUGIN_ROOT}`, vì bản cập nhật plugin sẽ ghi đè. Sửa kit thì sửa ở repo plugin (`qa-skill`).

## Phần VS Code (người chạy Claude Code)
1. `qa-figma-spec` — spec SP/PC + PNG + Figma comments (gồm comment về luồng hiển thị dữ liệu). Đối chiếu cùng 1 component giữa page `common_component`, các màn khác, SP ↔ PC → `specs/figma-conflicts.md`; Figma không thống nhất thì **đưa tester chọn**, bug của thuộc tính đó giữ lại đến khi chọn xong
2. Bóc logic/luồng từ Figma comment (thread, lấy reply mới nhất) + checklist → `specs/<page>.logic.json`: mỗi quy tắc tách thành nhánh if/else/biên (`qa-logic-flow` mục 0). Comment mơ hồ → gom câu hỏi cho designer.
   *(trang/khối có dữ liệu CMS)* `qa-cms-seed` — **mỗi nhánh có bài seed** + tạo bộ dữ liệu test có nhãn `[<PREFIX>001]` trên CMS dev theo ca biên + Figma comment (xem trước → người dùng đồng ý → `--apply`; SSG thì rebuild)
3. `qa-cms-data` — dữ liệu CMS (API key) ↔ list/detail/pagination/filter; trang dựng từ 1 bản ghi → `cms_record_check.mjs`
4. `qa-logic-flow` — mỗi nhánh trong `logic.json` có check `[<id nhánh>]`, chạy `logic_coverage.py` đến khi hết nhánh "Thiếu dữ liệu" / "Thiếu check"; check chung mọi trang (`page_checks.mjs`: title/OGP/favicon, GTM, số điện thoại, ảnh Retina/nặng, link, breadcrumb, 404) + flow riêng theo Figma comment và checklist (menu, slider, filter/search, tab, pagination, accordion, modal, map, validation không gửi form thật, print)
5. `qa-pixel-check` — từng px, diff ảnh, Chrome/Edge/WebKit (trang CMS: so Figma bằng bài `noPrefix` text giống Figma)
6. `qa-responsive` — đọc page `common_StyleGuide` trước → `specs/styleguide.json` (breakpoint, cỡ chữ tối thiểu, khung nội dung…); không có thì theo tiêu chuẩn responsive chung. Quét 360→1920 × 3 browser (dữ liệu seed dài/ngắn giúp bắt tràn, cắt chữ)
7. `qa-bug-report` — bugs.json → Import vào Tracker (ảnh bug: khung đỏ từng chỗ sai + mong muốn ghi cạnh khung; ảnh đi kèm bug, không cần duyệt riêng)
8. `qa-checklist-excel` — đầu tiên tự tạo thêm cột cho trang được test tương tự các cột có sẵn trong file (ở cả 3 sheet trong file). Điền OK/NG cho mục có bằng chứng tự động, NA cho mục trang không có; **mục còn lại để trống** → sinh `<Checklist>_result_tester-prompt.md`
9. Báo tester (soạn sẵn tin nhắn, mẫu bên dưới) kèm: file `_result.xlsx`, file prompt, link Tracker, thời điểm chạy/build.

## Phần tester (Claude in Chrome) — `qa-chrome-verify`
Tester dán prompt vào Claude in Chrome → Claude kiểm từng mục trống → NG thì tạo bug trên Tracker ("+ Bug", Kiểm bằng = Claude in Chrome) → điền kết quả vào checklist.

## Sau khi dev fix — `qa-verify-regression`
- List all bug: VS Code chạy lại + `compare_runs.py` → Import `verify.json`.
- Bug nào không verify được bằng VS Code thì giữ nguyên trạng thái để verify lại bằng Claude in Chrome.
- Cập nhật checklist lần nữa (NG → OK khi đã verify).

## Mục nào VS Code điền, mục nào để trống
| Điền ở VS Code (có bằng chứng script) | Để trống cho tester |
|---|---|
| Spec px SP/PC, font, màu, khoảng cách | Gửi form thật + mail tự động |
| Responsive 360–1920, scroll ngang, text cắt | Đăng nhập / SSO / 2FA, CMS admin preview |
| Chrome / Edge / WebKit (Safari sàng lọc) | Trang bị CAPTCHA/Cloudflare chặn |
| Dữ liệu CMS: số bài, thứ tự, ngày, category, ảnh, link, pagination, filter, chi tiết | Hover/animation/slider cần mắt người |
| Logic: menu, dropdown, slider, filter/search, tab, pagination, accordion, modal, map, validation, anchor, 404, print | GTM Preview / GA4 bắn tag, embed bên thứ ba, zoom 125/150% |
| Title, description, OGP, favicon, định dạng GTM, số điện thoại SP/PC, ảnh Retina/nặng, link ngoài/nội bộ, breadcrumb | Hover có transition, animation khi cuộn (script tắt animation để đo) |
| Console error, ảnh lỗi | Figma comment cần xem prototype; Safari / iPhone thật; mail + chuyển tiếp Garoon |
| | Core Web Vitals (checklist ghi "pending" → để trống) |
**Quy tắc:** OK/NG chỉ điền khi có kết quả script thật. NA chỉ điền khi đã xác nhận trang không có chức năng/khối đó (xem DOM/Figma). Trang có mục đó nhưng chưa kiểm được → để trống, không đánh NA.

## Mẫu tin nhắn báo tester
```
[QA] <dự án> — phần tự động xong (<YYYY/MM/DD HH:mm>, build/commit <…>)
Checklist: <tên>_result.xlsx — còn trống <N> mục (Claude in Chrome kiểm nốt)
Prompt: <tên>_result_tester-prompt.md (dán vào Claude in Chrome)
Bug tự động: <M> bug trên Tracker <link>
Logic: <đạt>/<tổng> nhánh đạt · <n> nhánh tester kiểm · <q> câu hỏi cho designer (runs/<id>/logic.<page>.md)
Thông số Figma cần chọn: <K> mục (specs/figma-conflicts.md) — bug liên quan chưa đưa lên Tracker
Responsive theo: <style guide Figma | tiêu chuẩn chung (Figma không có style guide)>
Form được gửi thật: <…> · Email test: <…>
Vui lòng test đúng build này; nếu site deploy lại, báo mình chạy lại phần tự động.
```

## Quy tắc chung
- Figma tự mâu thuẫn (component gốc / màn khác / SP ↔ PC / style guide khác nhau) → tester chọn giá trị đúng, không tự chọn. Trong lúc chờ: đo theo giá trị đề xuất nhưng không đẩy bug của thuộc tính đó (`qa-figma-spec` mục Đối chiếu).
- Spec Figma là chuẩn layout; dữ liệu CMS là chuẩn nội dung động. Trang lấy dữ liệu CMS: chỉ kiểm web hiển thị đúng dữ liệu đã nhập trên CMS, **không so dữ liệu CMS với Figma** (text/ảnh Figma là demo). Dữ liệu CMS nhập sai nhưng web hiện đúng → ghi chú cho người dùng, không tạo bug.
- Bug layout/pixel ghi **nguyên nhân gốc** (element/CSS gây lệch, so với cấu trúc Figma) + đề xuất sửa, không chỉ "Figma X / thực tế Y" (`qa-pixel-check` mục 4, `qa-bug-report` bước 2).
- Lỗi cả SP và PC → `common`; lỗi dữ liệu CMS → `common`.
- Bug viết **tiếng Việt** (Tracker là link nội bộ của team), mức độ theo bảng Severity và chỉ ghi môi trường khi lỗi riêng 1 môi trường (`qa-bug-report` 1b, 1c).
- `tracker.url` trống → `qa-bug-report` tạo Tracker mới từ mẫu của plugin, rồi người dùng bật Share "Anyone with the link" để QA/dev sửa bug, comment, đổi trạng thái.
- API key, mật khẩu chỉ trong biến môi trường; không ghi vào bug, checklist, prompt.
- Không sửa code dự án. Chỉ ghi dữ liệu CMS qua `qa-cms-seed` (bài `qa-<prefix>…`, host dev trong `cms.seed.allowedHosts`, người dùng đồng ý từng lần `--apply`).
- Thứ tự trang CMS: dữ liệu → logic/luồng → UI (UI phụ thuộc dữ liệu).
