# QA Kit — marketplace Claude Code `enshu-qa` (plugin `web-qa` + `app-qa`)

Repo này là **core dùng chung** của 2 plugin QA. **Không chứa dữ liệu dự án nào.** Mỗi dự án có một **thư mục QA riêng** chỉ chứa cấu hình và kết quả, rồi bật plugin của mảng mình.

```
qa-skill/  (repo này)                              qa-<dự-án>/  (mỗi dự án một thư mục)
├─ .claude-plugin/marketplace.json  khai 2 plugin  ├─ .claude/settings.json   bật plugin, chặn đọc .env.local
├─ plugins/                                        ├─ package.json            playwright …
│  ├─ web-qa/   website (Figma + CMS)              ├─ qa-config.json, .env.local
│  │  ├─ .claude-plugin/plugin.json                └─ specs/ flows/ e2e/ runs/ …
│  │  ├─ skills/  11 skill (/web-qa:web-qa …)
│  │  ├─ scripts/ script Node/Python
│  │  └─ templates/project/  khung thư mục QA website
│  └─ app-qa/   webapp (git docs + TestRail + Backlog), cấu trúc tương tự
└─ README.md
```

## Hai plugin trong marketplace `enshu-qa`
| Plugin | Dùng cho | Nguồn | Bật trong thư mục QA |
|---|---|---|---|
| `web-qa` | Website: design + tài liệu trên **Figma**, dữ liệu CMS, checklist Excel, Bug Tracker | [`plugins/web-qa/`](plugins/web-qa/) | `"web-qa@enshu-qa": true` |
| `app-qa` | Webapp: tài liệu trên **git**, mockup **Claude Design**, test case CSV → **TestRail**, bug → **Backlog** | [`plugins/app-qa/`](plugins/app-qa/) | `"app-qa@enshu-qa": true` |

Hai plugin độc lập: không gọi skill hay script của nhau. Mỗi thư mục QA chỉ bật plugin của mảng mình.
Cài `app-qa`: `/plugin install app-qa@enshu-qa`. Tạo thư mục QA webapp: nói với Claude *"tạo thư mục QA webapp cho dự án <tên>, docs ở <repo docs>"*.
Key TestRail/Backlog của `app-qa` là key **cá nhân**, để ở `~/.app-qa/.env` trên máy mỗi người (init tạo file mẫu), **không** để trong plugin hay `.env` của app. Project ID/key ghi ở `qa-config.json` của thư mục QA.
Quy trình và rule của `app-qa` lấy từ `07_Testing` của dự án Entoly (`RULES/01–04`). Rule của dự án (trong repo docs) được ưu tiên hơn bản mặc định trong `plugins/app-qa/templates/rules/`.

## Cài lần đầu (mỗi máy, 1 lần)
> Lệnh `/plugin` **không chạy trong khung chat của extension VS Code** (báo *"/plugin isn't available in this environment"*). Hãy dùng Claude Code CLI trong terminal: cài CLI theo mục [Cài Claude Code CLI trên Windows](#cài-claude-code-cli-trên-windows), rồi chạy lệnh `claude plugin ...` bên dưới, hoặc gõ `claude` để vào chế độ tương tác rồi dùng `/plugin`.

Trong terminal (PowerShell):
```powershell
claude plugin marketplace add kiemthuvien-enshu-1804/qa-skill
claude plugin install web-qa@enshu-qa
claude plugin install app-qa@enshu-qa   # nếu làm webapp
```
Sau đó **bật cập nhật tự động**: gõ `claude` → `/plugin` → **Marketplaces** → `enshu-qa` → **Enable auto-update**.
Claude Code mặc định không tự cập nhật marketplace bên thứ ba, nên mỗi người phải bật một lần. Chưa bật thì cập nhật tay theo mục [Cập nhật plugin](#cập-nhật-plugin).

- Repo private: máy phải có sẵn quyền đọc repo (SSH key trong ssh-agent, hoặc `gh auth login` + `gh auth setup-git`), vì Claude Code không hỏi mật khẩu khi clone.
- Máy không có SSH key GitHub: đặt biến môi trường `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`.
- Cần có: Node 18+, Python 3 + `openpyxl` (`pip install openpyxl`), Git.

## Cài Claude Code CLI trên Windows
Extension VS Code không có lệnh `claude` trong terminal. Nếu gõ `claude` mà PowerShell báo *"The term 'claude' is not recognized"*, bạn cần cài CLI (một lần):

1. Mở terminal trong VS Code (`` Ctrl+` ``), chọn PowerShell.
2. Cài CLI:
   ```powershell
   npm.cmd install -g @anthropic-ai/claude-code
   ```
   Dùng `npm.cmd` thay `npm` để tránh lỗi *"npm.ps1 cannot be loaded because running scripts is disabled on this system"*.
3. **Đóng terminal, mở terminal mới**, rồi kiểm tra bằng `claude --version`.

**Lỗi "running scripts is disabled" (Execution Policy):** PowerShell chặn file `.ps1` (`npm.ps1`, `claude.ps1`). Có hai cách xử lý:
- Gọi bản `.cmd`: `npm.cmd ...`, `claude.cmd ...`.
- Hoặc sửa hẳn cho user hiện tại (không cần quyền admin), gõ `Y` khi được hỏi:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```
  Sau đó `npm` và `claude` chạy bình thường.

## Cập nhật plugin
Làm khi repo này có commit mới mà máy chưa bật auto-update, hoặc khi skill chưa thấy thay đổi mới.

1. Mở terminal PowerShell (cần CLI, xem mục trên).
2. Kéo bản mới của marketplace:
   ```powershell
   claude plugin marketplace update enshu-qa
   ```
3. Cập nhật từng plugin đã cài:
   ```powershell
   claude plugin update web-qa@enshu-qa
   claude plugin update app-qa@enshu-qa
   ```
4. Trong VS Code: `Ctrl+Shift+P` → **Developer: Reload Window** (hoặc mở phiên chat Claude mới) để nạp lại skill.

**Kiểm tra đang ở bản nào:** commit đã cài ghi trong `~/.claude/plugins/installed_plugins.json` (trường `gitCommitSha`). So với commit mới nhất trên `main` của repo, nếu trùng thì đã là bản mới nhất.

**Nếu `update` báo lỗi không tìm thấy plugin hay sai đường dẫn** (vd sau khi đổi cấu trúc thư mục `plugins/`), gỡ rồi cài lại:
```powershell
claude plugin uninstall web-qa@enshu-qa
claude plugin install web-qa@enshu-qa
```

## Tạo thư mục QA cho dự án mới
1. Tạo thư mục rỗng (vd `qa-<dự-án>/`), mở bằng VS Code → Claude Code.
2. Nói với Claude: *"tạo thư mục QA cho dự án <tên>, site https://…, mã bug ABC"*. Skill `web-qa` sẽ chạy `init` để copy khung từ `plugins/web-qa/templates/project/`.
3. `npm install && npm run setup`, điền `qa-config.json` + `.env.local`, rồi nhờ Claude chạy doctor.
4. Commit thư mục QA (nếu dự án lưu vào git). `.claude/settings.json` đã khai marketplace + plugin, nên người khác mở thư mục và trust folder là được nhắc cài plugin.

## Chuyển dự án đang dùng bản copy cũ (`.claude/skills/` trong thư mục dự án)
1. Cài plugin như trên.
2. Trong thư mục dự án: nhờ Claude chạy `init` để thêm `.claude/settings.json` (plugin) và làm mới file mẫu. Init không ghi đè `qa-config.json`, `.env.local`, `specs/`, `flows/`, `checklist/`, `runs/`.
3. Xoá `.claude/skills/` cũ trong thư mục dự án, nếu không skill sẽ bị trùng (bản cũ `/web-qa` và bản plugin `/web-qa:web-qa`).
4. `flows/*.flow.mjs` cũ import `../.claude/skills/web-qa/scripts/lib.mjs`. Đổi phần import theo `plugins/web-qa/scripts/flow_template.mjs` mới (đọc `WEBQA_ROOT`).
5. Trong `package.json` dự án: bỏ các script `node .claude/skills/...` (giữ `setup` + dependencies).

## Sửa kit và phát hành
- Sửa skill/script trong repo này, không sửa trong thư mục dự án hay trong cache plugin (`~/.claude/plugins/cache/...` bị ghi đè khi cập nhật).
- Thử trước khi push: trong một thư mục QA, chạy `claude --plugin-dir <repo>/plugins/web-qa` (hoặc `.../app-qa`) để dùng bản đang sửa. Hoặc `claude plugin validate <repo>`.
- `plugin.json` **không có `version`**, nên mỗi commit push lên `main` là một bản mới. Máy đã bật auto-update sẽ nhận ở lần mở Claude Code tiếp theo.
- Đổi tên plugin `web-qa`/`app-qa` hoặc marketplace `enshu-qa` sẽ làm hỏng cài đặt của mọi dự án. Đổi tên hiển thị thì dùng `displayName`.
- Thêm field cấu hình mới: cập nhật `plugins/<plugin>/templates/project/qa-config.example.json`. Script phải chạy được khi dự án cũ chưa có field đó.

## Skill của web-qa
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
