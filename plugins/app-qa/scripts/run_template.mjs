// Mẫu file chạy test case — copy thành e2e/<Module>.run.mjs rồi viết từng TC theo đúng Steps / Expected trong CSV.
// Chạy: APPQA_ROOT="${CLAUDE_PLUGIN_ROOT}" node e2e/<Module>.run.mjs --env test --out runs/<stamp>-<Module> [--only TC-1,TC-2] [--build <ver>] [--headed]
//
// Quy tắc (02_RunTest_Rules):
//  - Làm ĐÚNG bước + dữ liệu trong TC. Không đổi bước/dữ liệu để PASS, không sửa app/DB.
//  - Kết thúc TC ở màn hình chứa kết quả cần chụp; dùng t.focus(locator) để vùng kết quả nằm trọn trong ảnh.
//  - Sai expected → t.fail('thực tế cụ thể') / t.expectText(...). Không xác minh được → t.na('lý do').
//  - Bước Playwright không làm được (mail thật, OTP, kéo thả phức tạp, xem bằng mắt) → tc.manual(id, name, 'lý do').
//  - Toast: truyền { toast: true } để chụp ngay, không chờ networkidle.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.APPQA_ROOT;
if (!ROOT) throw new Error('Đặt APPQA_ROOT = thư mục plugin app-qa (Claude: ${CLAUDE_PLUGIN_ROOT})');
const { defineRun } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'runner.mjs')).href);

defineRun({ module: 'M2_Quan-ly-co-so', app: 'admin', viewport: { width: 1440, height: 900 } }, ({ tc }) => {
  tc('TC-FAC-001', 'A-01 Hiển thị ban đầu', async (t) => {
    // Pre-Condition: đăng nhập admin_a (TD-01) — đã làm qua { account } bên dưới
    await t.page.goto(t.url('/admin/facilities'));                                     // 1. Mở A-01
    const row = t.page.getByRole('row', { name: /Quầy bar tầng 1/ });
    t.focus(t.page.getByRole('table'));
    await t.expectText(row, '常時', 'Cột 掲載期間 của F-PUB');                            // Expected 1
  }, { account: 'admin_a' });

  tc.manual('TC-FAC-050', 'Mail thông báo gửi tới khách', 'Cần mở hộp thư thật — tester kiểm bằng Claude in Chrome');
});
