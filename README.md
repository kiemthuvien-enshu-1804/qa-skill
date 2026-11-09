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
Sau đó **nên bật cập nhật tự động**: gõ `claude` (hoặc `claude.cmd`) → `/plugin` → **Marketplaces** → `enshu-qa` → **Enable auto-update**. Claude Code mặc định không tự cập nhật marketplace bên thứ ba, nên mỗi máy bật một lần. Đã bật thì mỗi lần khởi động Claude Code sẽ tự kéo bản mới.

**Không bật auto-update** thì phải tự chủ động cập nhật: khi owner báo có bản mới, làm theo mục [Cập nhật plugin](#cập-nhật-plugin).

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
Đã bật auto-update: chỉ cần mở phiên Claude mới hoặc Reload Window. Làm tay các bước dưới khi **chưa bật auto-update** mà owner báo có bản mới, hoặc khi skill vẫn chạy kiểu cũ.

**Cách nhanh trong VS Code:** trang Plugins → tab **Marketplaces** → bấm **↻** ở `enshu-qa`, rồi `Ctrl+Shift+P` → **Developer: Reload Window**.

**Cách dùng terminal:**
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
Mỗi dự án một thư mục QA riêng, tách khỏi source code. Máy phải cài plugin trước (mục [Cài lần đầu](#cài-lần-đầu-mỗi-máy-1-lần)).

> **Không gửi API key, token, mật khẩu qua chat.** Tự điền vào `.env.local` (Claude bị chặn đọc file này).

### Website (Figma + CMS) — plugin `web-qa`
1. **Chuẩn bị thông tin:**
   - Tên dự án, mã bug (vd `ABC` → `ABC-001`).
   - Link site test, Basic Auth (nếu có).
   - Link Figma: 1 link file hoặc 1 link page. Frame SP/PC của từng trang được tự tìm.
   - CMS: loại (microCMS / WordPress / Laravel…), API base URL, các endpoint (vd `/news`, `/blog`).
   - Danh sách trang cần test (vd top `/`, news `/news`, contact `/contact`).
   - File checklist Excel (nếu có).
2. **Tạo thư mục rỗng** (vd `qa-abc-website/`), mở bằng VS Code → Claude Code.
3. **Nhờ Claude tạo khung**, ví dụ:
   > Tạo thư mục QA **website** cho dự án ABC, site https://test.abc.jp, mã bug ABC.
   > Figma: https://www.figma.com/design/…
   > CMS: microCMS, API https://abc-dev.microcms.io/api/v1, endpoint /news, /blog.
   > Các trang: top (/), news (/news), contact (/contact).

   Claude chạy `init` (copy khung từ `plugins/web-qa/templates/project/`), điền `qa-config.json`, rồi `npm install && npm run setup` (cài Playwright + trình duyệt).
4. **Tự điền `.env.local`:**
   - `CMS_API_KEY`, `CMS_WRITE_API_KEY` (nếu cần tạo dữ liệu test trên microCMS dev).
   - `FIGMA_TOKEN` (không có thì Claude dùng Figma MCP).
   - `QA_BASIC_USER` / `QA_BASIC_PASS` (nếu có Basic Auth).
   - `QA_TESTER` (tên người test), `QA_SEED_PREFIX` (viết tắt tên, vd `KIM`).
5. **Kiểm tra:** nói *"chạy doctor"*, bổ sung theo báo lỗi đến khi sạch.
6. **Bắt đầu test**, vd *"QA trang news"*. Thứ tự (dữ liệu trước, giao diện sau): `qa-figma-spec` → *(trang có CMS)* `qa-cms-seed` → `qa-cms-data` → `qa-logic-flow` → `qa-pixel-check` → `qa-responsive` → `qa-bug-report` (bug lên Tracker) → `qa-checklist-excel`.
   Checklist: `OK` = đạt, `NG` = lỗi (**không ghi mã bug vào Excel**), `NA` = trang không có chức năng/khối đó, *để trống* = chưa kiểm được → tester kiểm nốt bằng Claude in Chrome (`qa-chrome-verify`).
7. **Commit thư mục QA** (khuyến nghị, xem [Có nên commit thư mục QA?](#có-nên-commit-thư-mục-qa)).

### Webapp — plugin `app-qa`
1. **Chuẩn bị thông tin:**
   - Tên dự án, link môi trường test (và local nếu có).
   - Đường dẫn repo tài liệu trên máy (vd `C:/…/abc-docs`) và thư mục testing (vd `docs/07_Testing`).
   - Link mockup Claude Design.
   - TestRail: Project ID. Backlog: project key, tên dev FE/BE, issue cha theo module.
   - Tài khoản test theo role/tenant.
   - Đường dẫn `.env` của app (nếu cần tạo dữ liệu test qua DB local).
2. **Key cá nhân (mỗi máy 1 lần):** điền `TESTRAIL_URL`, `TESTRAIL_USER`, `TESTRAIL_KEY`, `BACKLOG_URL`, `BACKLOG_API_KEY` vào `~/.app-qa/.env`. Chưa có file thì `init` lần đầu sẽ tạo file mẫu.
3. **Tạo thư mục rỗng** (vd `qa-abc-webapp/`), mở bằng VS Code → Claude Code.
4. **Nhờ Claude tạo khung**, ví dụ:
   > Tạo thư mục QA **webapp** cho dự án ABC, môi trường test https://app-test.abc.jp.
   > Docs: C:/…/abc-docs, testing ở docs/07_Testing.
   > Mockup: https://claude.ai/design/p/…
   > TestRail project ID 12, Backlog project key ABC, dev FE: …, BE: …

   Claude chạy `init`, điền `qa-config.json` (`testrail`, `backlog`, `apps.login`, `accounts`), rồi `npm install && npm run setup`.
5. **Tự điền `.env.local`:** mật khẩu tài khoản test, vd `QA_ADMIN_A_USER` / `QA_ADMIN_A_PASS` (tên biến khớp `accounts` trong `qa-config.json`).
6. **Kiểm tra:** nói *"chạy doctor"*, bổ sung theo báo lỗi đến khi sạch.
7. **Bắt đầu test:** `app-testcase` (viết TC → duyệt → import TestRail, tạo Test Run) → `app-testdata` → `app-run-test` → `app-bug-backlog` (duyệt → tạo issue Backlog) → `app-verify-bug` sau khi dev fix.
8. **Commit thư mục QA** (khuyến nghị, xem [Có nên commit thư mục QA?](#có-nên-commit-thư-mục-qa)).

### Kiểm tra thư mục đã có plugin chưa
- **Trong chat:** gõ `/`, phải thấy `web-qa:…` hoặc `app-qa:…`. Không thấy → `Ctrl+Shift+P` → **Developer: Reload Window**.
- **Máy đã cài plugin:** `claude.cmd plugin list` phải có `web-qa@enshu-qa` / `app-qa@enshu-qa`.
- **Thư mục đã `init`:** `.claude/settings.json` có `"enabledPlugins": { "web-qa@enshu-qa": true }` (hoặc `app-qa@enshu-qa`), và có `qa-config.json`, `.env.local`, `package.json`.
- **Toàn bộ:** nói *"chạy doctor"*.

`.claude/settings.json` đã khai marketplace + plugin, nên người khác mở thư mục và trust folder là được nhắc cài plugin.

### Có nên commit thư mục QA?
**Nên**, vào một repo **private** (checklist, ảnh Figma có thể là tài liệu của khách hàng). Lợi ích: cả team dùng chung `qa-config.json`, và regression sau khi dev fix chạy lại đúng spec, flow, seed của lần test trước.

| Commit | Không commit (đã có trong `.gitignore`) |
|---|---|
| `qa-config.json`, `.claude/settings.json`, `package.json` | `.env.local`, `.env` (key, mật khẩu) |
| `specs/` (spec JSON, `figma-map.json`, PNG Figma, `notes.md`) | `runs/` (kết quả từng lần chạy, sinh lại được) |
| `flows/`, `cms-seed/`, `checklist/` (file `.xlsx` + `checklist-map.json`) | `node_modules/` |

Bug nằm trên Tracker, kết quả từng lần chạy nằm trong `runs/`, nên không cần commit `runs/`. Cần giữ bằng chứng thì gửi file `_result.xlsx` / link Tracker cho người liên quan.

### Thư mục QA đã tạo từ trước
Khi plugin có bản mới, file mẫu trong thư mục QA cũ (`README.md`, `qa-config.example.json`, `.env.example`) không tự đổi theo. Sau khi cập nhật plugin, mở thư mục đó và nói với Claude *"chạy lại init"*. Init chỉ làm mới các file mẫu, không đụng `qa-config.json`, `.env.local` hay dữ liệu dự án.
- `.gitignore` là file của dự án nên init **không** sửa. Thư mục cũ muốn commit dữ liệu QA thì tự xoá các dòng `qa-config.json`, `specs/*`, `checklist/*`, `flows/*`, `cms-seed/*` trong `.gitignore` (giữ `.env*`, `node_modules/`, `runs/`).

## Chuyển dự án đang dùng bản copy cũ (`.claude/skills/` trong thư mục dự án)
1. Cài plugin như trên.
2. Trong thư mục dự án: nhờ Claude chạy `init` để thêm `.claude/settings.json` (plugin) và làm mới file mẫu. Init không ghi đè `qa-config.json`, `.env.local`, `specs/`, `flows/`, `checklist/`, `runs/`.
3. Xoá `.claude/skills/` cũ trong thư mục dự án, nếu không skill sẽ bị trùng (bản cũ `/web-qa` và bản plugin `/web-qa:web-qa`).
4. `flows/*.flow.mjs` cũ import `../.claude/skills/web-qa/scripts/lib.mjs`. Đổi phần import theo `plugins/web-qa/scripts/flow_template.mjs` mới (đọc `WEBQA_ROOT`).
5. Trong `package.json` dự án: bỏ các script `node .claude/skills/...` (giữ `setup` + dependencies).

## Sửa kit và phát hành
- Sửa skill/script trong repo này, không sửa trong thư mục dự án hay trong cache plugin (`~/.claude/plugins/cache/...` bị ghi đè khi cập nhật).
- Thử trước khi push: trong một thư mục QA, chạy `claude --plugin-dir <repo>/plugins/web-qa` (hoặc `.../app-qa`) để dùng bản đang sửa. Hoặc `claude plugin validate <repo>`.
- `plugin.json` **không có `version`**, nên mỗi commit push lên `main` là một bản mới. Push xong thì báo team cập nhật theo mục [Cập nhật plugin](#cập-nhật-plugin).
- Đổi tên plugin `web-qa`/`app-qa` hoặc marketplace `enshu-qa` sẽ làm hỏng cài đặt của mọi dự án. Đổi tên hiển thị thì dùng `displayName`.
- Thêm field cấu hình mới: cập nhật `plugins/<plugin>/templates/project/qa-config.example.json`. Script phải chạy được khi dự án cũ chưa có field đó.

## Skill của web-qa
| Skill | Việc |
|---|---|
| `web-qa` | điều phối toàn bộ, init/doctor thư mục QA |
| `qa-figma-spec` | spec SP/PC + PNG + Figma comments; so cùng component giữa `common_component`, các màn khác, SP ↔ PC → Figma không thống nhất thì tester chọn |
| `qa-cms-seed` | tạo/dọn dữ liệu test `[PREFIX001]` trên microCMS dev |
| `qa-cms-data` | dữ liệu CMS API ↔ trang |
| `qa-logic-flow` | quy tắc/luồng từ Figma comment → nhánh if/else/biên, mỗi nhánh có data seed + check, đo độ phủ (`logic_coverage.py`); check chung mọi trang (OGP, GTM, tel, ảnh, link, breadcrumb, 404) + flow riêng (menu, slider, filter, pagination, form validation…) |
| `qa-pixel-check` | đo px so với Figma, diff ảnh |
| `qa-responsive` | theo `common_StyleGuide` của Figma (không có thì tiêu chuẩn chung), 360→1920 × Chrome/Edge/WebKit |
| `qa-bug-report` | bugs.json → Bug Tracker (tiếng Việt, severity high/medium/low; chưa có Tracker thì tạo mới) |
| `qa-checklist-excel` | điền checklist Excel + prompt cho tester |
| `qa-chrome-verify` | phần tester: Claude in Chrome kiểm nốt / verify |
| `qa-verify-regression` | chạy lại sau khi dev fix |

## Skill của app-qa
| Skill | Việc |
|---|---|
| `app-qa` | điều phối toàn bộ, init/doctor thư mục QA webapp |
| `app-testcase` | thiết kế test case từ đặc tả + mockup → TestDesign.md + TestCase.csv, import TestRail |
| `app-testdata` | script SQL/API tạo dữ liệu test (TD-xx) + cleanup |
| `app-run-test` | chạy Test Run bằng Playwright, ảnh evidence/TC, ghi kết quả lên TestRail |
| `app-bug-backlog` | TC FAIL → bản nháp bug (ảnh khung đỏ) → duyệt → tạo issue Backlog |
| `app-verify-bug` | verify bug sau khi dev fix → đóng/reopen trên Backlog |
