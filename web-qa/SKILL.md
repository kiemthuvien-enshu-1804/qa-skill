---
name: web-qa
description: Điều phối QA website theo Figma + dữ liệu CMS. Chạy hết phần tự động trong VS Code (Playwright, CMS API), đẩy bug lên Tracker, điền checklist Excel — mục chưa kiểm được để trống kèm prompt cho tester kiểm nốt bằng Claude in Chrome. Dùng khi được yêu cầu "QA/test trang X", "verify bug", "chạy regression".
---

# Web QA — VS Code trước, tester + Claude in Chrome sau

**Checklist Excel là chỗ bàn giao.** VS Code điền các mục kiểm được tự động; mục nào chưa kiểm được thì **để trống**. Tester mở checklist và dùng Claude in Chrome kiểm nốt đúng các ô trống.

Scripts: `.claude/skills/web-qa/scripts/`. Chạy từ thư mục gốc QA workspace (có `qa-config.json`). Mỗi lần test: `RUN=runs/$(date +%Y%m%d-%H%M)`.

## Phần VS Code (người chạy Claude Code)
1. `qa-figma-spec` — spec SP/PC + PNG + Figma comments
2. `qa-pixel-check` — từng px, diff ảnh, Chrome/Edge/WebKit
3. `qa-responsive` — 360→1920 × 3 browser
4. `qa-cms-data` — dữ liệu CMS (API key) ↔ list/detail/pagination/filter
5. `qa-logic-flow` — filter, pagination, menu, modal, validation (không gửi form thật), link
6. `qa-bug-report` — bugs.json → Import vào Tracker (có mã bug để ghi vào checklist)
7. `qa-checklist-excel` — điền OK/NG/N/A cho mục có bằng chứng tự động; **mục còn lại để trống** → sinh `<Checklist>_result_tester-prompt.md`
8. Báo tester (soạn sẵn tin nhắn, mẫu bên dưới) kèm: file `_result.xlsx`, file prompt, link Tracker, thời điểm chạy/build.

## Phần tester (Claude in Chrome) — `qa-chrome-verify`
Tester dán prompt vào Claude in Chrome → Claude kiểm từng mục trống → NG thì tạo bug trên Tracker ("+ Bug", Kiểm bằng = Claude in Chrome) → điền kết quả vào checklist.

## Sau khi dev fix — `qa-verify-regression`
- Bug tự động: VS Code chạy lại + `compare_runs.py` → Import `verify.json`.
- Bug tester tạo (Kiểm bằng = Chrome/Tay): tester kiểm lại bằng Claude in Chrome, đổi trạng thái trên Tracker.
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
- Không sửa code dự án, không thao tác dữ liệu CMS.
