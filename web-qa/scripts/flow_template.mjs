#!/usr/bin/env node
// Mẫu kiểm logic bằng Playwright (Pha 1). Claude copy thành flows/<page>.flow.mjs rồi viết các check.
// Chạy: node flows/<page>.flow.mjs --out $RUN [--vp sp|pc] [--browser chromium]
// Output: $RUN/flow.<page>.<vp>.<browser>.json  { checks: [{name, status, expected, actual, steps, ...}] }
//   status: "pass" | "fail" | "blocked" (không tự động được, vd CAPTCHA) | "needs-chrome" (cần Chrome thật)
import path from 'node:path';
import { parseArgs, loadConfig, findPage, writeJson, launch, openPage, runId, bugKey } from '../.claude/skills/web-qa/scripts/lib.mjs';

const PAGE = 'news';            // ← tên page trong qa-config.json
const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const pg = findPage(cfg, PAGE);
const vpName = args.vp || 'pc';
const viewport = cfg.viewports[vpName];
const browserName = args.browser || 'chromium';
const out = args.out || `runs/${runId()}`;
const checks = [];

const browser = await launch(browserName);
const { ctx, page, url } = await openPage(browser, cfg, pg, viewport, browserName);

/** Một check. fn trả về {ok, actual} hoặc throw. */
async function check(name, { steps = [], expected = '', severity = 'high', group = 'common' }, fn) {
  const c = { name, steps, expected, severity, group, viewport: viewport.width, viewportName: vpName, browser: browserName, key: bugKey(PAGE, 'flow', name) };
  try {
    const r = await fn();
    if (r?.status) Object.assign(c, r);                       // blocked / needs-chrome
    else { c.status = r?.ok ? 'pass' : 'fail'; c.actual = r?.actual ?? ''; }
  } catch (e) {
    c.status = 'fail'; c.actual = 'Lỗi khi chạy: ' + String(e.message).split('\n')[0];
  }
  if (c.status === 'fail') {
    c.screenshot = path.join(out, `flow.${PAGE}.${vpName}.${browserName}.${checks.length + 1}.png`);
    await page.screenshot({ path: c.screenshot }).catch(() => {});
  }
  checks.push(c);
  console.log(`  ${c.status.padEnd(12)} ${name}`);
}

// ---------------- Ví dụ — thay bằng check thật của trang ----------------
await check('Filter category イベント chỉ hiện bài イベント', {
  steps: ['Mở trang', 'Bấm tab イベント'], expected: 'Mọi bài trong list có category イベント',
}, async () => {
  await page.getByRole('button', { name: 'イベント' }).click();
  await page.waitForLoadState('networkidle');
  const cats = await page.$$eval('.p-news__cat', (els) => els.map((e) => e.innerText.trim()));
  return { ok: cats.length > 0 && cats.every((c) => c === 'イベント'), actual: `category hiển thị: ${[...new Set(cats)].join(', ') || '(trống)'}` };
});

await check('Form: gửi thật + email tự động', { expected: 'Mail đến đúng nội dung' },
  async () => ({ status: 'needs-chrome', reason: 'Cần hộp mail thật trong Chrome của người test' }));
// -------------------------------------------------------------------------

await ctx.close();
await browser.close();
writeJson(path.join(out, `flow.${PAGE}.${vpName}.${browserName}.json`), { kind: 'flow', page: PAGE, path: pg.path, url, at: new Date().toISOString(), checks });
