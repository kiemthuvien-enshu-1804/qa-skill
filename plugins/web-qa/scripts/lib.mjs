// Shared helpers for the web-qa kit scripts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Load .env.local / .env from the QA workspace root (API keys stay out of qa-config.json and git).
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

/**
 * Import a package installed in the QA project (cwd), not next to this script.
 * Scripts live in the plugin cache, which has no node_modules; the project's package.json holds the deps.
 */
export async function projectImport(name) {
  const req = createRequire(path.resolve('package.json'));
  let resolved;
  try { resolved = req.resolve(name); } catch {
    throw new Error(`Không tìm thấy thư viện "${name}" trong thư mục QA này — chạy: npm install && npm run setup (tại thư mục có qa-config.json)`);
  }
  const m = await import(pathToFileURL(resolved).href);
  return m;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[k] = v;
  }
  return out;
}

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

export function loadConfig(p = 'qa-config.json') {
  if (!fs.existsSync(p)) throw new Error(`Không tìm thấy ${p} — copy qa-config.example.json thành qa-config.json`);
  return readJson(p);
}

export function findPage(cfg, name) {
  const pg = cfg.pages.find((x) => x.name === name || x.path === name);
  if (!pg) throw new Error(`Page "${name}" không có trong qa-config.json`);
  return pg;
}

export const runId = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Stable key so the same defect gets the same id across runs (used by verify/regression). */
export function bugKey(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 10);
}

/** Launch a Playwright browser by logical name: chromium | msedge | chrome | webkit | firefox */
export async function launch(name) {
  const m = await projectImport('playwright');
  const pw = m.chromium ? m : m.default;
  if (name === 'webkit') return pw.webkit.launch();
  if (name === 'firefox') return pw.firefox.launch();
  if (name === 'msedge' || name === 'chrome') return pw.chromium.launch({ channel: name });
  return pw.chromium.launch();
}

export function contextOptions(cfg, viewport, browserName) {
  const opts = { viewport, deviceScaleFactor: 1 };
  const ba = cfg.basicAuth;
  if (ba && process.env[ba.userEnv]) {
    opts.httpCredentials = { username: process.env[ba.userEnv], password: process.env[ba.passEnv] || '' };
  }
  if (viewport.width < 768) {
    opts.isMobile = browserName !== 'firefox';
    opts.hasTouch = true;
  }
  return opts;
}

export async function openPage(browser, cfg, pg, viewport, browserName) {
  const ctx = await browser.newContext(contextOptions(cfg, viewport, browserName));
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('response', (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url()}`));
  const url = new URL(pg.path, cfg.baseUrl).toString();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (pg.waitFor) await page.waitForSelector(pg.waitFor, { timeout: 15000 }).catch(() => {});
  // Disable animations/transitions so measurements are stable; trigger lazy content by scrolling.
  // Hide scrollbars: Figma frames have none, and a 15px scrollbar shifts every centered element ~8px.
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
      html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}
      ${(pg.hideSelectors || []).join(',') || '.__none__'}{visibility:hidden!important}`,
  });
  await autoScroll(page);
  return { ctx, page, url, consoleErrors, failedRequests };
}

export async function autoScroll(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
}

export function toHex(c) {
  if (!c) return null;
  if (c.startsWith('#')) return c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c.toLowerCase().slice(0, 7);
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c;
  const [r, g, b, a] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (a === 0) return 'transparent';
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function colorDelta(a, b) {
  const h1 = toHex(a), h2 = toHex(b);
  if (h1 === h2) return 0;
  if (!h1?.startsWith('#') || !h2?.startsWith('#')) return 999;
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(h1), p(h2)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}
