# Thư mục QA webapp (plugin app-qa)

File này do plugin quản lý — `init` sẽ làm mới nó.

| Ở đâu | Nội dung |
| --- | --- |
| Plugin `app-qa@enshu-qa` | Skill, script (TestRail, Backlog, runner Playwright) |
| `~/.app-qa/.env` (máy của bạn) | Key TestRail/Backlog **cá nhân**, dùng chung mọi thư mục QA. Không commit, không đặt trong plugin |
| Thư mục này | `qa-config.json` (gồm project ID/key), `.env.local` (mật khẩu tài khoản test của dự án), `e2e/` (file chạy TC), `runs/` (kết quả + evidence, không commit) |
| Repo tài liệu (`docs.testing`) | `RULES/`, `TESTCASE/`, `TESTDATA/`, `BUGREPORT/`: test design, test case, dữ liệu, nháp bug |

## Quy trình

1. `app-testcase`: đặc tả + mockup → TestDesign.md + TestCase.csv
2. `app-testdata`: dữ liệu TD-xx (SQL/API) + README + cleanup
3. Import lên TestRail, tạo Test Run
4. `app-run-test`: chạy từng TC, 1 ảnh/TC, ghi TestRail
5. `app-bug-backlog`: soạn nháp bug → **duyệt** → tạo issue Backlog
6. `app-verify-bug`: sau khi dev fix → retest → **duyệt** → cập nhật Backlog + TestRail

Bắt đầu: trong Claude Code nói "kiểm tra cấu hình QA" (doctor), rồi "viết test case cho <chức năng>".
Script nằm trong plugin: Claude gọi `node "${CLAUDE_PLUGIN_ROOT}/scripts/<doctor|testrail|backlog|tc_csv|annotate>.mjs"` tại thư mục này.
