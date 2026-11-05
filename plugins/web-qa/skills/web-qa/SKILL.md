---
name: web-qa
description: Điều phối QA website theo Figma (bao gồm các thông số figma, các comment figma) + dữ liệu CMS. Chạy hết phần tự động trong VS Code (Playwright, CMS API), đẩy bug lên Tracker, điền checklist Excel —mục nào không có trong trang được test thì để NA - mục chưa kiểm được để trống kèm prompt cho tester kiểm nốt bằng Claude in Chrome. Dùng khi được yêu cầu "QA/test trang X", "verify bug", "chạy regression".
---

# Web QA — VS Code trước, tester + Claude in Chrome sau

**Checklist Excel là chỗ bàn giao.** VS Code điền các mục kiểm được tự động: mục nào đã pass đánh OK, mục nào chưa pass đánh NG(không cần kèm mã bug); mục nào chưa kiểm được thì **để trống**. Mục nào không có trong trang được test thì để NA. Tester mở checklist và dùng Claude in Chrome kiểm nốt đúng các ô trống.

Scripts: `${CLAUDE_PLUGIN_ROOT}/scripts/` (plugin web-qa). Chạy từ thư mục gốc QA workspace (có `qa-config.json`). Mỗi lần test: `RUN=runs/$(date +%Y%m%d-%H%M)`.

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
1. `qa-figma-spec` — spec SP/PC + PNG + Figma comments (gồm comment về luồng hiển thị dữ liệu)
2. *(trang/khối có dữ liệu CMS)* `qa-cms-seed` — tạo bộ dữ liệu test có nhãn `[<PREFIX>001]` trên CMS dev theo ca biên + Figma comment (xem trước → người dùng đồng ý → `--apply`; SSG thì rebuild)
3. `qa-cms-data` — dữ liệu CMS (API key) ↔ list/detail/pagination/filter
4. `qa-logic-flow` — luồng theo Figma comment, filter, pagination, menu, modal, validation (không gửi form thật), link
5. `qa-pixel-check` — từng px, diff ảnh, Chrome/Edge/WebKit (trang CMS: so Figma bằng bài `noPrefix` text giống Figma)
6. `qa-responsive` — 360→1920 × 3 browser (dữ liệu seed dài/ngắn giúp bắt tràn, cắt chữ)
7. `qa-bug-report` — bugs.json → Import vào Tracker (ảnh bug: khung đỏ từng chỗ sai + mong muốn ghi cạnh khung; ảnh đi kèm bug, không cần duyệt riêng)
8. `qa-checklist-excel` — đầu tiên tự tạo thêm cột cho trang được test tương tự các cột có sẵn trong file (ở cả 3 sheet trong file). Điền OK/NG/N/A cho mục có bằng chứng tự động; **mục còn lại để trống** → sinh `<Checklist>_result_tester-prompt.md`
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
| Logic: filter, tab, pagination, menu SP, modal, validation, link 200/404 | GA4/GTM, embed bên thứ ba, zoom 125/150% |
| Console error, ảnh lỗi | Figma comment cần xem prototype; Safari thật |
**Quy tắc:** chỉ điền khi có kết quả script thật. Không chắc → để trống. Không đánh N/A thay tester.

## Mẫu tin nhắn báo tester
```
[QA] <dự án> — phần tự động xong (<YYYY/MM/DD HH:mm>, build/commit <…>)
Checklist: <tên>_result.xlsx — còn trống <N> mục (Claude in Chrome kiểm nốt)
Prompt: <tên>_result_tester-prompt.md (dán vào Claude in Chrome)
Bug tự động: <M> bug trên Tracker <link>
Form được gửi thật: <…> · Email test: <…>
Vui lòng test đúng build này; nếu site deploy lại, báo mình chạy lại phần tự động.
```

## Quy tắc chung
- Spec Figma là chuẩn layout; dữ liệu CMS là chuẩn nội dung động.
- Lỗi cả SP và PC → `common`; lỗi dữ liệu CMS → `common`.
- API key, mật khẩu chỉ trong biến môi trường; không ghi vào bug, checklist, prompt.
- Không sửa code dự án. Chỉ ghi dữ liệu CMS qua `qa-cms-seed` (bài `qa-<prefix>…`, host dev trong `cms.seed.allowedHosts`, người dùng đồng ý từng lần `--apply`).
- Thứ tự trang CMS: dữ liệu → logic/luồng → UI (UI phụ thuộc dữ liệu).
