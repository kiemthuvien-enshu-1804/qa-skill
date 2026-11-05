# Web QA Kit — plugin Claude Code dùng chung (marketplace `enshu-qa`, plugin `web-qa`)

Repo này là **core dùng chung**: toàn bộ skill + script QA website (Figma spec, pixel, responsive, CMS data/seed, logic flow, bug tracker, checklist Excel).
**Không chứa dữ liệu dự án nào.** Mỗi dự án có một **thư mục QA riêng** chỉ chứa cấu hình và kết quả, rồi bật plugin này lên.

```
qa-skill/  (repo này)                            qa-<dự-án>/  (mỗi dự án một thư mục)
├─ .claude-plugin/marketplace.json, plugin.json  ├─ .claude/settings.json   bật web-qa@enshu-qa, chặn đọc .env.local
├─ skills/        11 skill (/web-qa:web-qa …)    ├─ package.json            playwright, pixelmatch, pngjs
├─ scripts/       script Node/Python             ├─ qa-config.json, .env.local
└─ templates/project/  khung thư mục QA          └─ specs/ flows/ checklist/ cms-seed/ runs/
```

## Cài lần đầu (mỗi máy, 1 lần)
Trong Claude Code (terminal hoặc VS Code):
```
/plugin marketplace add kiemthuvien-enshu-1804/qa-skill
/plugin install web-qa@enshu-qa
```
Sau đó **bật cập nhật tự động**: `/plugin` → **Marketplaces** → `enshu-qa` → **Enable auto-update**.
Claude Code mặc định không tự cập nhật marketplace bên thứ ba, nên mỗi người phải bật một lần. Chưa bật thì cập nhật tay bằng `/plugin marketplace update enshu-qa`.

- Repo private: máy phải có sẵn quyền đọc repo (SSH key trong ssh-agent, hoặc `gh auth login` + `gh auth setup-git`), vì Claude Code không hỏi mật khẩu khi clone.
- Máy không có SSH key GitHub: đặt biến môi trường `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`.
- Cần có: Node 18+, Python 3 + `openpyxl` (`pip install openpyxl`), Git.

## Tạo thư mục QA cho dự án mới
1. Tạo thư mục rỗng (vd `qa-<dự-án>/`), mở bằng VS Code → Claude Code.
2. Nói với Claude: *"tạo thư mục QA cho dự án <tên>, site https://…, mã bug ABC"*. Skill `web-qa` sẽ chạy `init` để copy khung từ `templates/project/`.
3. `npm install && npm run setup`, điền `qa-config.json` + `.env.local`, rồi nhờ Claude chạy doctor.
4. Commit thư mục QA (nếu dự án lưu vào git). `.claude/settings.json` đã khai marketplace + plugin, nên người khác mở thư mục và trust folder là được nhắc cài plugin.

## Chuyển dự án đang dùng bản copy cũ (`.claude/skills/` trong thư mục dự án)
1. Cài plugin như trên.
2. Trong thư mục dự án: nhờ Claude chạy `init` để thêm `.claude/settings.json` (plugin) và làm mới file mẫu. Init không ghi đè `qa-config.json`, `.env.local`, `specs/`, `flows/`, `checklist/`, `runs/`.
3. Xoá `.claude/skills/` cũ trong thư mục dự án, nếu không skill sẽ bị trùng (bản cũ `/web-qa` và bản plugin `/web-qa:web-qa`).
4. `flows/*.flow.mjs` cũ import `../.claude/skills/web-qa/scripts/lib.mjs`. Đổi phần import theo `scripts/flow_template.mjs` mới (đọc `WEBQA_ROOT`).
5. Trong `package.json` dự án: bỏ các script `node .claude/skills/...` (giữ `setup` + dependencies).

## Sửa kit và phát hành
- Sửa skill/script trong repo này, không sửa trong thư mục dự án hay trong cache plugin (`~/.claude/plugins/cache/...` bị ghi đè khi cập nhật).
- Thử trước khi push: trong một thư mục QA, chạy `claude --plugin-dir <đường-dẫn-repo-này>` để dùng bản đang sửa. Hoặc chạy `claude plugin validate <đường-dẫn-repo-này>`.
- `plugin.json` **không có `version`**, nên mỗi commit push lên `main` là một bản mới. Máy đã bật auto-update sẽ nhận ở lần mở Claude Code tiếp theo.
- Đổi tên plugin `web-qa` hoặc marketplace `enshu-qa` sẽ làm hỏng cài đặt của mọi dự án. Đổi tên hiển thị thì dùng `displayName`.
- Thêm field cấu hình mới: cập nhật `templates/project/qa-config.example.json`. Script phải chạy được khi dự án cũ chưa có field đó.

## Skill
| Skill | Việc |
|---|---|
| `web-qa` | điều phối toàn bộ, init/doctor thư mục QA |
| `qa-figma-spec` | spec SP/PC + PNG + Figma comments |
| `qa-cms-seed` | tạo/dọn dữ liệu test `[PREFIX001]` trên microCMS dev |
| `qa-cms-data` | dữ liệu CMS API ↔ trang |
| `qa-logic-flow` | logic Playwright (filter, pagination, form validation…) |
| `qa-pixel-check` | đo px so với Figma, diff ảnh |
| `qa-responsive` | 360→1920 × Chrome/Edge/WebKit |
| `qa-bug-report` | bugs.json → Bug Tracker |
| `qa-checklist-excel` | điền checklist Excel + prompt cho tester |
| `qa-chrome-verify` | phần tester: Claude in Chrome kiểm nốt / verify |
| `qa-verify-regression` | chạy lại sau khi dev fix |
