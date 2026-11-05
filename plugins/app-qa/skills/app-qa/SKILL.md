---
name: app-qa
description: Điều phối QA webapp (tài liệu đặc tả trên git, mockup Claude Design, test case CSV → TestRail, bug → Backlog). Dùng khi được yêu cầu "QA/test chức năng X của webapp", "viết test case", "chạy test run", "log bug", "verify bug", "tạo thư mục QA webapp", "doctor". Không dùng cho website Figma + CMS (đó là plugin web-qa).
---

# App QA: điều phối

Chạy tại **thư mục QA của dự án**, tức thư mục có `qa-config.json` với `"type": "webapp"`.

```bash
S="${CLAUDE_PLUGIN_ROOT}/scripts"
node "$S/doctor.mjs"            # chạy trước mỗi phiên, và khi người dùng hỏi "doctor"
```

## Vị trí các thành phần
| Thứ | Ở đâu |
|---|---|
| Đặc tả | `docs.repo` (git, nhánh `docs.branch`), các thư mục `docs.specDirs` |
| Mockup | `design.url` (Claude Design) và bản export `design.local` trong repo docs |
| Rule QA | `<docs.repo>/<docs.testing>/RULES/0x_*.md` (**rule của dự án được ưu tiên**). Nếu không có thì dùng `${CLAUDE_PLUGIN_ROOT}/templates/rules/` |
| Test design / case / data / nháp bug | `<docs.repo>/<docs.testing>/{TESTCASE,TESTDATA,BUGREPORT}/` |
| File chạy TC, kết quả, evidence | Thư mục QA: `e2e/<Module>.run.mjs`, `runs/<stamp>-<Module>/` |
| Key | Key cá nhân `TESTRAIL_URL/USER/KEY`, `BACKLOG_URL/API_KEY` ở `~/.app-qa/.env` (1 file cho mọi dự án; `.env.local` của thư mục QA ghi đè nếu dự án dùng space khác). Project ID/key ở `qa-config.json`. **Không đọc, in hay ghi key** vào file, bug hay comment, không đặt key trong plugin hay `.env` của app |

## Quy trình (mỗi bước là một skill)
1. `app-testcase`: đặc tả + mockup → `TESTCASE/<M>_TestDesign.md` + `<M>_TestCase.csv` → (khi người dùng đồng ý) import TestRail và tạo Test Run
2. `app-testdata`: dữ liệu TD-xx → `TESTDATA/<M>/` (SQL/API, README, cleanup). **Không tự chạy** trên DB dùng chung
3. `app-run-test`: chạy từng TC theo Test Run → 1 ảnh/TC → ghi kết quả TestRail (**khi người dùng đồng ý**)
4. `app-bug-backlog`: TC FAIL → `BUGREPORT/<M>_Bug_Drafts_<YYYYMMDD>.md` → **DỪNG chờ duyệt** → tạo issue/comment Backlog
5. `app-verify-bug`: bug dev đã fix → kiểm build → retest + TC liên quan + hồi quy → nháp → **DỪNG chờ duyệt** → Backlog + TestRail

Người dùng có thể gọi từng bước riêng. Khi được yêu cầu "QA chức năng X" thì đi từ bước 1, mỗi bước báo kết quả rồi mới sang bước sau.

## Tạo thư mục QA cho dự án mới
```bash
mkdir -p <thư mục QA> && cd <thư mục QA>
node "$S/init.mjs" --project <tên> --docs <repo docs> --testing docs/07_Testing [--env-file <.env của app, lấy DB_*>] --url <https://env-test>
npm install && npm run setup
```
`init` không ghi đè file của dự án. Lệnh này bật `app-qa@enshu-qa` trong `.claude/settings.json`, tạo file mẫu `~/.app-qa/.env` nếu chưa có (người dùng tự điền key), chặn Claude đọc các file `.env`, và chép rule mặc định nếu dự án chưa có `RULES/`. Sau đó điền vào `qa-config.json` các mục `testrail.projectId`, `backlog.projectKey`, `apps.login`, `accounts`, `backlog.assignees` / `parentTasks`. Muốn tra tên thật thì chạy `node "$S/backlog.mjs" meta` và `node "$S/testrail.mjs" statuses`.

## Quy tắc chung (mọi bước)
- **Trung thực.** Không đổi bước hay dữ liệu để kết quả thành PASS. Không sửa code app, không sửa DB của môi trường dùng chung.
- **Không tự suy diễn ngoài tài liệu.** Chỗ mơ hồ ghi thành câu hỏi `Qxx`. Chỗ tài liệu lệch mockup thì ghi chú để `review.specOwner` chốt.
- **Ghi ra ngoài phải được duyệt.** `testrail.mjs` / `backlog.mjs` chỉ ghi khi có `--apply`. Luôn chạy dry-run trước, cho người dùng xem kế hoạch, và chỉ thêm `--apply` khi người dùng nói "Duyệt" / "OK" cho đúng phạm vi đó. Lần duyệt trước không áp dụng cho lần sau.
- Thông tin còn thiếu (build, dữ liệu, version) thì ghi `[CẦN BỔ SUNG]`, không bịa.
- Viết bằng ngôn ngữ của rule dự án. Với Entoly là tiếng Việt, giữ nguyên chữ Nhật của UI và message.
