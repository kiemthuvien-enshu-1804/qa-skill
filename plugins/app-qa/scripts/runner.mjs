// Runner Playwright cho test case webapp — hiện thực 02_RunTest_Rules:
//  - làm đúng bước, không tự sửa để PASS; mỗi TC 1 ảnh kết quả cuối: evidence/{TC_ID}_{PASS|FAIL|BLOCKED}.png (_r2… không ghi đè)
//  - sự cố (exception, timeout, mạng) → retry 1 lần → vẫn lỗi = BLOCKED; 3 BLOCKED liên tiếp → dừng và báo
//  - không xác minh được expected → NA (テスト不要・不可能); việc Playwright không làm được → MANUAL (để tester / Claude in Chrome)
//  - FAIL không dừng run
// Dùng trong e2e/<module>.run.mjs (copy từ run_template.mjs). Kết quả: <out>/results.json + report.md + evidence/
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, list, loadConfig, launch, env, evidenceName, stamp, writeJson, redact } from './lib.mjs';

export class Fail extends Error { constructor(actual) { super(actual); this.actual = actual; } }
export class NA extends Error { constructor(reason) { super(reason); this.reason = reason; } }
export class Manual extends Error { constructor(reason) { super(reason); this.reason = reason; } }

export function defineRun(meta, body) {
  const args = parseArgs();
  const cfg = loadConfig();
  const envName = args.env || cfg.defaultEnv || Object.keys(cfg.envs || {})[0];
  const E = cfg.envs?.[envName];
  if (!E) throw new Error(`env "${envName}" không có trong qa-config.json envs`);
  const out = path.resolve(args.out || `runs/${stamp()}-${meta.module}`);
  const evDir = path.join(out, 'evidence');
  fs.mkdirSync(evDir, { recursive: true });
  const only = new Set(list(args.only));
  const cases = [];
  const tc = (id, name, fn, opts = {}) => cases.push({ id, name, fn, opts });
  tc.manual = (id, name, reason) => cases.push({ id, name, fn: () => { throw new Manual(reason); }, opts: {} });

  body({ tc, cfg, env: E, envName });

  (async () => {
    const browser = await launch(args.browser || 'chromium', { headless: !args.headed });
    const states = {};
    const login = async (page, account, app = meta.app || 'admin') => {
      const a = cfg.accounts?.[account];
      const L = cfg.apps?.[app]?.login;
      if (!a || !L) throw new Error(`Thiếu accounts.${account} hoặc apps.${app}.login trong qa-config.json`);
      const user = a.user || env(a.userEnv), pass = env(a.passEnv);
      if (!user || !pass) throw new Error(`Thiếu user/mật khẩu của ${account} (${a.userEnv || 'user'} / ${a.passEnv})`);
      await page.goto(E.url + L.path.replace('{tenant}', a.tenant || ''));
      await page.locator(L.user).fill(user);
      await page.locator(L.pass).fill(pass);
      await page.locator(L.submit).click();
      if (L.otp) { const o = page.locator(L.otp).first(); if (await o.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) throw new Manual(`${account}: cần OTP/MFA — tắt MFA ở env test hoặc kiểm tay`); }
      await page.waitForURL((u) => !u.pathname.endsWith(L.path.split('/').pop()), { timeout: 15000 });
    };
    const results = [];
    let blockedStreak = 0, stopped = false;
    for (const c of cases) {
      if (only.size && !only.has(c.id)) continue;
      if (stopped) { results.push({ id: c.id, name: c.name, status: 'NOT_RUN', note: 'Dừng sau 3 case BLOCKED liên tiếp' }); continue; }
      let r;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const ctx = await browser.newContext({ viewport: c.opts.viewport || meta.viewport || { width: 1440, height: 900 }, locale: cfg.locale || 'ja-JP', timezoneId: cfg.timezone || 'Asia/Tokyo', ...(c.opts.account && states[c.opts.account] ? { storageState: states[c.opts.account] } : {}) });
        const page = await ctx.newPage();
        const consoleErrors = [];
        page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
        const notes = [];
        let shotTarget = null;
        const t = {
          page, ctx, env: E, cfg, notes,
          url: (p) => E.url + p,
          login: async (account) => { await login(page, account); states[account] = await ctx.storageState(); },
          fail: (actual) => { throw new Fail(actual); },
          na: (reason) => { throw new NA(reason); },
          manual: (reason) => { throw new Manual(reason); },
          note: (s) => notes.push(s),
          /** Vùng cần nằm trọn trong ảnh evidence (locator). Mặc định: viewport. */
          focus: (loc) => { shotTarget = loc; },
          /** Kiểm text: so khớp chứa (string) hoặc regex. Sai → FAIL với actual cụ thể. */
          expectText: async (loc, exp, label = '') => {
            await loc.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
            const got = (await loc.allInnerTexts().catch(() => [])).join(' | ').trim();
            const ok = exp instanceof RegExp ? exp.test(got) : got.includes(exp);
            if (!ok) throw new Fail(`${label || 'Text'}: mong đợi「${exp}」, thực tế「${got || '(không hiển thị)'}」`);
            return got;
          },
          expectVisible: async (loc, label = '') => { if (!(await loc.first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false))) throw new Fail(`${label || 'Phần tử'} không hiển thị`); },
          expectHidden: async (loc, label = '') => { if (!(await loc.first().waitFor({ state: 'hidden', timeout: 5000 }).then(() => true, () => false))) throw new Fail(`${label || 'Phần tử'} vẫn hiển thị`); },
          expectUrl: async (re, label = 'URL') => { await page.waitForURL(re, { timeout: 10000 }).catch(() => {}); if (!re.test(page.url())) throw new Fail(`${label}: mong đợi ${re}, thực tế ${page.url().replace(E.url, '')}`); },
        };
        let status, actual = '', note = '';
        try {
          if (c.opts.account && !states[c.opts.account]) await t.login(c.opts.account);
          const ret = await c.fn(t);
          status = 'PASS'; actual = typeof ret === 'string' ? ret : 'Đúng như kết quả mong đợi';
        } catch (e) {
          if (e instanceof Fail) { status = 'FAIL'; actual = e.actual; }
          else if (e instanceof NA) { status = 'NA'; note = e.reason; }
          else if (e instanceof Manual) { status = 'MANUAL'; note = e.reason; }
          else { status = 'BLOCKED'; note = redact(String(e.message || e).split('\n')[0].slice(0, 300)); }
        }
        // toast biến mất nhanh → chụp ngay; còn lại chờ loading xong
        if (!c.opts.toast) await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        let evidence = '';
        if (status !== 'MANUAL') {
          const fileStatus = status === 'NA' ? 'BLOCKED' : status;
          evidence = evidenceName(evDir, args.suffix ? `${c.id}_${args.suffix}` : c.id, fileStatus); // --suffix retest → {ID}_retest_{STATUS}.png
          try {
            if (shotTarget && (await shotTarget.first().isVisible().catch(() => false))) {
              await shotTarget.first().scrollIntoViewIfNeeded().catch(() => {});
              await shotTarget.first().screenshot({ path: path.join(evDir, evidence) });
            } else await page.screenshot({ path: path.join(evDir, evidence), fullPage: !!c.opts.fullPage });
          } catch { evidence = ''; }
        }
        await ctx.close();
        r = { id: c.id, name: c.name, status, actual, note: [note, ...notes].filter(Boolean).join(' / '), evidence, attempts: attempt, url: '', consoleErrors: consoleErrors.slice(0, 5) };
        if (status !== 'BLOCKED' || attempt === 2) break; // retry 1 lần chỉ cho sự cố
      }
      results.push(r);
      blockedStreak = r.status === 'BLOCKED' ? blockedStreak + 1 : 0;
      if (blockedStreak >= 3) stopped = true;
      console.log(`${r.status.padEnd(7)} ${r.id} ${r.name}${r.actual && r.status === 'FAIL' ? ' — ' + r.actual : ''}${r.note ? ' — ' + r.note : ''}`);
    }
    await browser.close();
    // Chạy nhiều lần vào cùng --out (vd retest + hồi quy) → gộp theo TC ID, lần sau thay lần trước.
    const prevPath = path.join(out, 'results.json');
    if (fs.existsSync(prevPath)) {
      try {
        const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8')).results || [];
        const ids = new Set(results.map((r) => r.id));
        results.unshift(...prev.filter((r) => !ids.has(r.id)));
      } catch { /* file hỏng → ghi mới */ }
    }
    const sum = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
    writeJson(path.join(out, 'results.json'), { module: meta.module, env: envName, url: E.url, build: args.build || '', startedAt: new Date().toISOString(), summary: sum, stopped, results });
    const md = [`# Kết quả chạy — ${meta.module} (${envName} ${E.url})`, '', `Build: ${args.build || '[CẦN BỔ SUNG]'} · ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`, '',
      `Tổng: ${Object.entries(sum).map(([k, v]) => `${k} ${v}`).join(' · ')}${stopped ? ' · **DỪNG: 3 case BLOCKED liên tiếp**' : ''}`, '',
      '| TC | Kết quả | Thực tế / Ghi chú | Evidence |', '| --- | --- | --- | --- |',
      ...results.map((r) => `| ${r.id} | ${r.status} | ${(r.actual && r.status !== 'PASS' ? r.actual : '') + (r.note ? (r.actual && r.status !== 'PASS' ? ' / ' : '') + r.note : '')} | ${r.evidence} |`.replace(/\n/g, ' '))].join('\n');
    fs.writeFileSync(path.join(out, 'report.md'), md + '\n');
    console.log(`\n${Object.entries(sum).map(([k, v]) => `${k} ${v}`).join(' · ')}${stopped ? ' — DỪNG sau 3 BLOCKED liên tiếp' : ''}\n→ ${path.join(out, 'results.json')}`);
    process.exit(stopped ? 2 : 0);
  })().catch((e) => { console.error(redact(e.stack || e.message)); process.exit(1); });
}
