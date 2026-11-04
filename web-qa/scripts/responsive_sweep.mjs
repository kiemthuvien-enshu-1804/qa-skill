#!/usr/bin/env node
// Responsive sweep: every width × browser, detect horizontal overflow, elements leaking past the
// viewport, clipped text, broken images, console errors and failed requests. Screenshot each width.
// Usage:
//   node responsive_sweep.mjs --page news [--browsers chromium,msedge,webkit] [--widths 360,375,768] [--from 360 --to 1920 --step 40] [--full] [--out runs/<id>]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, findPage, writeJson, launch, openPage, runId, bugKey } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const pg = findPage(cfg, args.page);
const out = args.out || `runs/${runId()}`;
const browsers = (args.browsers || (cfg.browsers || ['chromium']).join(',')).split(',');
let widths = args.widths ? String(args.widths).split(',').map(Number) : cfg.responsive?.widths || [360, 375, 768, 1024, 1280, 1440, 1920];
if (args.from) {
  widths = [];
  for (let w = Number(args.from); w <= Number(args.to || 1920); w += Number(args.step || 40)) widths.push(w);
}
const height = cfg.responsive?.height || 900;
fs.mkdirSync(path.join(out, 'responsive'), { recursive: true });

const findings = [];
const shots = [];

for (const bName of browsers) {
  let browser;
  try { browser = await launch(bName); } catch (e) {
    console.warn(`[responsive] bỏ qua ${bName}: ${e.message.split('\n')[0]}`);
    findings.push({ key: bugKey(pg.name, bName, 'launch'), page: pg.name, browser: bName, prop: 'launch', type: 'env', severity: 'info', actual: 'browser not installed' });
    continue;
  }
  for (const width of widths) {
    const { ctx, page, consoleErrors, failedRequests } = await openPage(browser, cfg, pg, { width, height }, bName);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const cssPath = (el) => {
        const parts = [];
        while (el && el.nodeType === 1 && parts.length < 5) {
          let s = el.tagName.toLowerCase();
          if (el.id) { parts.unshift(`${s}#${el.id}`); break; }
          const cls = [...el.classList].filter((c) => !/^(is-|js-|active)/.test(c)).slice(0, 2);
          if (cls.length) s += '.' + cls.join('.');
          parts.unshift(s);
          el = el.parentElement;
        }
        return parts.join(' > ');
      };
      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const clippedByAncestor = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(hidden|auto|scroll|clip)/.test(cs.overflowX + cs.overflow)) {
            const pr = p.getBoundingClientRect();
            if (pr.right <= vw + 1 && pr.left >= -1) return true;
          }
          if (cs.position === 'fixed') return false;
        }
        return false;
      };
      const all = [...document.body.querySelectorAll('*')].filter(visible);
      const overflowing = [];
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if ((r.right > vw + 1 || r.left < -1) && !clippedByAncestor(el)) {
          // keep the outermost offender only
          if (!overflowing.some((o) => o.el.contains(el))) overflowing.push({ el, right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width) });
        }
      }
      const clippedText = [];
      for (const el of all) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const cs = getComputedStyle(el);
        const hidesX = /(hidden|clip)/.test(cs.overflowX);
        const hidesY = /(hidden|clip)/.test(cs.overflowY);
        const ell = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
        if ((hidesX && el.scrollWidth > el.clientWidth + 1) || (hidesY && el.scrollHeight > el.clientHeight + 1)) {
          clippedText.push({ sel: cssPath(el), text: el.textContent.trim().slice(0, 40), ellipsis: ell });
        }
      }
      const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && visible(i)).map((i) => i.currentSrc || i.src);
      const tinyTap = vw < 768 ? [...document.querySelectorAll('a,button,input,select,textarea,[role=button]')].filter(visible).filter((e) => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).slice(0, 10).map((e) => cssPath(e)) : [];
      return {
        vw, scrollWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight,
        overflowing: overflowing.slice(0, 10).map((o) => ({ sel: cssPath(o.el), left: o.left, right: o.right, width: o.w })),
        clippedText: clippedText.slice(0, 15), brokenImages, tinyTap,
      };
    });
    const shot = path.join(out, 'responsive', `${pg.name}.${bName}.${width}.png`);
    await page.screenshot({ path: shot, fullPage: !!args.full });
    shots.push({ browser: bName, width, file: shot });
    const base = { page: pg.name, path: pg.path, browser: bName, viewport: width, viewportName: 'responsive', type: 'responsive', screenshot: shot };
    if (r.scrollWidth > r.vw + 1) findings.push({ ...base, key: bugKey(pg.name, 'hscroll', bName, width), group: 'hscroll', prop: 'horizontal-scroll', severity: 'high', expected: `scrollWidth ≤ ${r.vw}`, actual: `scrollWidth ${r.scrollWidth}`, detail: r.overflowing });
    for (const o of r.overflowing) findings.push({ ...base, key: bugKey(pg.name, 'overflow', o.sel, width), group: `overflow:${o.sel}`, prop: 'overflow-viewport', element: o.sel, severity: 'medium', expected: `0 ≤ left, right ≤ ${r.vw}`, actual: `left ${o.left}, right ${o.right}` });
    for (const t of r.clippedText) findings.push({ ...base, key: bugKey(pg.name, 'clip', t.sel, width), group: `clip:${t.sel}`, prop: t.ellipsis ? 'text-ellipsis' : 'text-clipped', element: t.sel, severity: t.ellipsis ? 'low' : 'medium', expected: 'text hiển thị đủ (hoặc ellipsis theo Figma)', actual: `"${t.text}" bị cắt` });
    for (const src of r.brokenImages) findings.push({ ...base, key: bugKey(pg.name, 'img', src), group: `img:${src}`, prop: 'broken-image', element: src, severity: 'high', expected: 'ảnh load được', actual: 'ảnh lỗi' });
    for (const sel of r.tinyTap) findings.push({ ...base, key: bugKey(pg.name, 'tap', sel, width), group: `tap:${sel}`, prop: 'tap-target', element: sel, severity: 'low', expected: 'vùng chạm ≥ 24×24px', actual: '< 24px' });
    for (const e of consoleErrors) findings.push({ ...base, key: bugKey(pg.name, 'console', e.slice(0, 80)), group: `console:${e.slice(0, 80)}`, prop: 'console-error', type: 'console', severity: 'low', actual: e.slice(0, 300) });
    for (const f of failedRequests) findings.push({ ...base, key: bugKey(pg.name, 'req', f), group: `req:${f}`, prop: 'http-error', type: 'console', severity: 'medium', actual: f });
    await ctx.close();
    process.stdout.write(`[responsive] ${bName} ${width}px ✓\n`);
  }
  await browser.close();
}

// Collapse: same issue over many widths/browsers → one entry with ranges.
const grouped = {};
for (const f of findings) {
  const g = `${f.group || f.key}|${f.prop}`;
  (grouped[g] ||= { ...f, widths: new Set(), browsers: new Set(), shots: [] });
  if (f.viewport) grouped[g].widths.add(f.viewport);
  grouped[g].browsers.add(f.browser);
  if (f.screenshot && grouped[g].shots.length < 3) grouped[g].shots.push(f.screenshot);
}
const issues = Object.values(grouped).map((g) => ({
  ...g, key: bugKey(g.page, g.prop, g.group || ''), widths: [...g.widths].sort((a, b) => a - b), browsers: [...g.browsers],
  // same defect in every browser = CSS bug; only one browser = browser-specific bug
  browserSpecific: g.browsers.size < browsers.length,
}));

writeJson(path.join(out, `responsive.${pg.name}.json`), { kind: 'responsive', page: pg.name, path: pg.path, widths, browsers, at: new Date().toISOString(), issues, shots });
console.log(`[responsive] ${pg.name}: ${issues.length} issues (${findings.length} raw) → ${out}`);
