# Thư mục QA của dự án

Thư mục này chỉ chứa **dữ liệu dự án** (cấu hình, spec, flow, checklist, kết quả).
Skill + script nằm ở plugin Claude Code **`web-qa@enshu-qa`** (repo `kiemthuvien-enshu-1804/qa-skill`). `.claude/settings.json` đã khai sẵn plugin này.
File này do plugin quản lý và được làm mới mỗi lần chạy init. Đừng ghi chú riêng của dự án vào đây.

## Quy trình
```
VS Code (người chạy Claude Code)                 Tester (Claude in Chrome)
figma-spec → (trang CMS) cms-seed → cms-data
→ logic-flow → pixel → responsive
→ bug-report (Import Tracker)
→ checklist-excel: điền mục tự động,
  mục chưa kiểm để TRỐNG + sinh tester-prompt ──► dán prompt vào Claude in Chrome
  báo tester (file + link + build)                 kiểm nốt ô trống → bug "+ Bug" trên Tracker
                                                   → điền checklist
Dev fix ─► chạy lại + compare_runs → verify.json   Verify bug do tester tạo, đổi trạng thái
         → cập nhật checklist (mục tự động)
```

## Bắt đầu
1. Cài plugin trên máy (1 lần). Lệnh `/plugin` không chạy trong khung chat của extension VS Code, nên dùng terminal PowerShell (cần Claude Code CLI, xem README của repo `qa-skill`):
   ```powershell
   claude plugin marketplace add kiemthuvien-enshu-1804/qa-skill
   claude plugin install web-qa@enshu-qa
   ```
   Nên bật auto-update: gõ `claude` → `/plugin` → **Marketplaces** → `enshu-qa` → **Enable auto-update**. Không bật thì tự cập nhật theo mục [Cập nhật](#cập-nhật) khi owner báo có bản mới.
   Nếu mở thư mục này và trust folder, Claude Code sẽ tự nhắc cài.
2. `npm install && npm run setup` (Playwright Chromium + WebKit; Edge dùng bản đã cài trên máy). Script của plugin dùng thư viện trong `node_modules` ở đây.
3. Điền thông số dự án (bảng dưới), rồi nói với Claude *"chạy doctor"* và sửa đến khi hết `[FAIL]`.
4. Nói với Claude: *"QA trang news"* hoặc `/web-qa:web-qa`.

### Cần điền gì
| Ở đâu | Mục | Ghi chú |
|---|---|---|
| `qa-config.json` | `project`, `bugPrefix`, `baseUrl` | `bugPrefix` = tiền tố mã bug (vd `LC` → `LC-001`) |
| | `figma.url` | **1 link chung**: link file, hoặc link page Figma chứa thiết kế. Frame SP/PC từng trang tự tìm → `specs/figma-map.json` (xác nhận 1 lần) |
| | `pages[]` | Mỗi trang cần test: `name` (không trùng), `path` tương đối (`/news`, không ghi domain) |
| | `pages[].cms` | Chỉ trang có dữ liệu CMS. Endpoint/selector chưa rõ → nhờ Claude map (`qa-cms-data`) |
| | `cms` | Kết nối CMS. microCMS: `https://<service>.microcms.io/api/v1` (không phải link admin `/apis/…`). Mẫu WordPress / Laravel trong `cms._examples`. Không dùng CMS → xoá khối `cms` |
| | `checklist.file`, `tracker.url` | Checklist Excel của dự án; Tracker để trống → tạo mới |
| | `viewports` | Đổi nếu Figma dùng width khác 375 / 1536 |
| `.env.local` | `CMS_API_KEY`, `FIGMA_TOKEN`, `QA_BASIC_USER/PASS`, `QA_TESTER` | Chỉ điền ở file này. Không có `FIGMA_TOKEN` → dùng Figma MCP |
| `checklist/` | file `.xlsx` | Copy từ template `checklist/*Template*.xlsx` hoặc checklist khách hàng |

## Cấu trúc
```
qa-<dự-án>/
├─ .claude/settings.json       bật plugin web-qa@enshu-qa + chặn Claude đọc .env.local
├─ package.json                thư viện cho script của plugin (playwright, pixelmatch, pngjs)
├─ qa-config.example.json      mẫu (plugin làm mới khi chạy init)
├─ .env.example                mẫu, không chứa key thật (plugin làm mới)
├─ qa-config.json              DỰ ÁN — site, Figma, CMS, pages, checklist, Tracker
├─ .env.local                  DỰ ÁN — API key, token (không commit)
├─ checklist/                  DỰ ÁN — checklist .xlsx + checklist-map.json
├─ specs/                      DỰ ÁN — figma-map.json, spec/PNG Figma (tự sinh)
├─ flows/                      DỰ ÁN — kịch bản logic Playwright
├─ cms-seed/                   DỰ ÁN — <page>.seed.json + <page>.applied.json (dữ liệu test CMS)
└─ runs/<ngày-giờ>/            DỰ ÁN — kết quả mỗi lần chạy: bug, ảnh, checklist_result, tester-prompt
```

## Cập nhật
- Skill/script: đã bật auto-update thì Claude Code tự kéo bản mới khi khởi động (mở phiên mới hoặc Reload Window là có). Không bật thì khi owner báo có bản mới, tự cập nhật bằng một trong hai cách:
  - VS Code: trang Plugins → tab **Marketplaces** → bấm **↻** ở `enshu-qa`, rồi `Ctrl+Shift+P` → **Developer: Reload Window**.
  - Terminal: `claude plugin marketplace update enshu-qa` rồi `claude plugin update web-qa@enshu-qa`, sau đó Reload Window.

  Không cần copy gì vào thư mục này.
- File mẫu (`qa-config.example.json`, `.env.example`, README này): nhờ Claude chạy lại init. Init không đụng tới file của dự án.
- Muốn sửa kit thì sửa ở repo `qa-skill`, không sửa trong thư mục này.

## Biến môi trường (`.env.local`)
| Biến | Dùng cho |
|---|---|
| `CMS_API_KEY` (hoặc tên bạn đặt trong `cms.headers`) | `cms_check.mjs`, `doctor` |
| `FIGMA_TOKEN` | `figma_api.py` (không có thì dùng Figma MCP) |
| `QA_BASIC_USER`, `QA_BASIC_PASS` | site test có Basic Auth |
| `CMS_WRITE_API_KEY` | `cms_seed.mjs` — key có quyền ghi, chỉ service dev |
| `QA_SEED_PREFIX` | tiền tố dữ liệu test (vd `KIM`) |
| `QA_TESTER` | tên người test trong checklist |

Scripts tự đọc `.env.local`; `.gitignore` loại nó khỏi git; `.claude/settings.json` chặn Claude đọc nó.

## Scripts (trong plugin, `${CLAUDE_PLUGIN_ROOT}/scripts/`; Claude gọi qua skill)
`init`, `doctor`, `figma_api.py`, `measure`, `visual_diff`, `responsive_sweep`, `cms_seed`, `cms_check`, `page_checks`, `flow_template`, `make_bugs.py`, `compare_runs.py`, `update_checklist.py`. Chi tiết xem README của repo plugin.

## Giới hạn
- WebKit ≈ Safari, không phải Safari thật → xác nhận trên Mac/iPhone, ghi vào `manual_bugs.json`.
- Claude in Chrome: cửa sổ không nhỏ hơn ~500px (SP đo ở VS Code), không tự nhập mật khẩu hay giải CAPTCHA, chỉ gửi form/thao tác CMS khi tester cho phép.
