#!/usr/bin/env node
// Pixel-spec check: compare live DOM computed styles + boxes with a Figma spec JSON.
// Usage:
//   node measure.mjs --spec specs/news.sp.json [--browser chromium] [--out runs/<id>] [--config qa-config.json]
// Output: <out>/measure.<page>.<vp>.<browser>.json  (+ ảnh bug trong <out>/shots/: khung đỏ + giá trị Figma mong muốn cạnh khung; ảnh sạch *.raw.png)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, findPage, readJson, writeJson, launch, openPage, runId, bugKey, toHex, colorDelta } from './lib.mjs';
import { renderMark } from './annotate.mjs';

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const spec = readJson(args.spec);
const pg = findPage(cfg, spec.page);
const vpName = spec.viewportName; // "sp" | "pc"
const viewport = spec.viewport || cfg.viewports[vpName];
const browserName = args.browser || 'chromium';
const out = args.out || `runs/${runId()}`;
const tol = { ...cfg.tolerance, ...(spec.tolerance || {}) };
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });

const NUM_PROPS = ['x', 'y', 'width', 'height', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'borderRadius', 'borderWidth', 'opacity'];
const COLOR_PROPS = ['color', 'backgroundColor', 'borderColor'];
const STR_PROPS = ['fontFamily', 'textAlign', 'textDecoration', 'objectFit'];

const browser = await launch(browserName);
const { ctx, page, url, consoleErrors, failedRequests } = await openPage(browser, cfg, pg, viewport, browserName);

const findings = [];
const measured = [];

for (const el of spec.elements) {
  const handle = await locate(page, el);
  if (!handle) {
    findings.push(mk(el, 'missing', 'element exists', 'không tìm thấy element', 'high'));
    continue;
  }
  const actual = await handle.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    const px = (v) => (v === 'normal' ? null : parseFloat(v));
    const lh = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
    return {
      x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height,
      fontSize: px(cs.fontSize), fontWeight: Number(cs.fontWeight), lineHeight: lh,
      letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
      paddingTop: px(cs.paddingTop), paddingRight: px(cs.paddingRight), paddingBottom: px(cs.paddingBottom), paddingLeft: px(cs.paddingLeft),
      gap: px(cs.rowGap) ?? px(cs.gap), borderRadius: px(cs.borderTopLeftRadius), borderWidth: px(cs.borderTopWidth),
      opacity: Number(cs.opacity), color: cs.color, backgroundColor: cs.backgroundColor, borderColor: cs.borderTopColor,
      fontFamily: cs.fontFamily, textAlign: cs.textAlign, textDecoration: cs.textDecorationLine, objectFit: cs.objectFit,
      text: (node.innerText || '').trim().slice(0, 200),
    };
  });
  measured.push({ id: el.id, selector: el.selector, actual });
  const exp = el.expect || {};
  const diffs = [];
  for (const k of NUM_PROPS) {
    if (exp[k] == null || actual[k] == null) continue;
    const t = k.startsWith('font') || k === 'lineHeight' || k === 'letterSpacing' ? tol.fontPx ?? 0 : tol.px ?? 1;
    const d = Math.abs(actual[k] - exp[k]);
    if (d > t + 0.01) diffs.push({ prop: k, expected: exp[k], actual: round(actual[k]), delta: round(d) });
  }
  for (const k of COLOR_PROPS) {
    if (!exp[k]) continue;
    if (colorDelta(actual[k], exp[k]) > (tol.colorDelta ?? 2)) diffs.push({ prop: k, expected: toHex(exp[k]), actual: toHex(actual[k]) });
  }
  for (const k of STR_PROPS) {
    if (!exp[k]) continue;
    const a = String(actual[k] || '').toLowerCase();
    const ok = k === 'fontFamily' ? a.split(',')[0].replace(/["']/g, '').trim().includes(exp[k].toLowerCase()) || a.includes(exp[k].toLowerCase()) : a === String(exp[k]).toLowerCase();
    if (!ok) diffs.push({ prop: k, expected: exp[k], actual: actual[k] });
  }
  if (el.text && actual.text && norm(actual.text) !== norm(el.text)) {
    diffs.push({ prop: 'text', expected: el.text, actual: actual.text });
  }
  if (!diffs.length) continue;
  const shot = path.join(out, 'shots', `${spec.page}.${vpName}.${browserName}.${el.id}.png`);
  handle.__label = el.label || el.id; handle.__node = el.figmaNodeId;
  await annotate(page, handle, shot, diffs);
  for (const d of diffs) {
    findings.push({
      ...mk(el, d.prop, fmt(d.expected), fmt(d.actual), severity(d)),
      delta: d.delta ?? null,
      // Figma có nhiều giá trị khác nhau cho thuộc tính này (figma_api.py consistency) → bug bị giữ lại đến khi tester chọn
      figmaConflict: el.conflicts?.[d.prop] || null,
      screenshot: shot,
    });
  }
}

writeJson(path.join(out, `measure.${spec.page}.${vpName}.${browserName}.json`), {
  kind: 'measure', page: spec.page, path: pg.path, url, viewportName: vpName, viewport, browser: browserName,
  figma: spec.figma, at: new Date().toISOString(), consoleErrors, failedRequests, findings, measured,
});
console.log(`[measure] ${spec.page} ${vpName} ${browserName}: ${findings.length} findings → ${out}`);
await ctx.close();
await browser.close();

// ---------- helpers ----------
async function locate(page, el) {
  if (el.selector) {
    const loc = page.locator(el.selector).nth(el.index ?? 0);
    if (await loc.count().catch(() => 0)) return loc.elementHandle();
  }
  if (el.text) {
    const loc = page.getByText(el.text, { exact: false }).first();
    if (await loc.count().catch(() => 0)) return loc.elementHandle();
  }
  return null;
}

function mk(el, prop, expected, actual, sev) {
  return {
    key: bugKey(spec.page, vpName, el.id, prop),
    elementKey: bugKey(spec.page, el.id, prop), // same across SP/PC → used to group "common"
    page: spec.page, path: pg.path, viewportName: vpName, viewport: viewport.width, browser: browserName,
    element: el.id, selector: el.selector || null, label: el.label || el.id, prop, expected, actual,
    type: prop === 'missing' ? 'layout' : propType(prop), severity: sev,
    figmaNodeId: el.figmaNodeId || spec.figma?.nodeId || null,
  };
}
function propType(p) {
  if (['x', 'y', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap'].includes(p)) return 'layout';
  if (p.startsWith('font') || ['lineHeight', 'letterSpacing', 'textAlign', 'textDecoration'].includes(p)) return 'typography';
  if (p.toLowerCase().includes('color') || p === 'opacity') return 'color';
  if (p === 'text') return 'content';
  return 'component';
}
function severity(d) {
  if (d.prop === 'text') return 'medium';
  if (['fontSize', 'fontWeight', 'lineHeight'].includes(d.prop)) return d.delta >= 4 ? 'high' : 'medium';
  if (d.delta != null) return d.delta >= 8 ? 'high' : d.delta >= 3 ? 'medium' : 'low';
  return 'medium';
}
function round(n) { return Math.round(n * 100) / 100; }
function fmt(v) { return typeof v === 'number' ? `${round(v)}` : String(v); }
function norm(s) { return s.replace(/\s+/g, ''); }

// Ảnh bug: chụp sạch vùng quanh phần tử (*.raw.png) → khung đỏ + mong muốn (Figma) cạnh khung (annotate.mjs).
async function annotate(page, handle, file, diffs) {
  const PROP_LABEL = { x: 'X', y: 'Y', fontSize: 'font-size', fontWeight: 'font-weight', lineHeight: 'line-height', letterSpacing: 'letter-spacing',
    paddingTop: 'padding-top', paddingRight: 'padding-right', paddingBottom: 'padding-bottom', paddingLeft: 'padding-left', borderRadius: 'border-radius',
    borderWidth: 'border-width', backgroundColor: 'màu nền', borderColor: 'màu viền', color: 'màu chữ', fontFamily: 'font-family', textAlign: 'text-align', text: 'text' };
  const short = (v) => { const t = fmt(v); return t.length > 60 ? t.slice(0, 57) + '…' : t; };
  const unit = (p, v) => (typeof v === 'number' && !['fontWeight', 'opacity'].includes(p) ? `${short(v)}px` : short(v));
  await handle.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const b = await handle.boundingBox();
  const vp = page.viewportSize();
  const pad = 80;
  let clip;
  if (b) {
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
    clip = { x, y, width: Math.min(vp.width - x, b.width + pad * 2), height: Math.min(vp.height - y, b.height + pad * 2) };
    if (!(clip.width > 0 && clip.height > 0)) clip = undefined;
  }
  const raw = file.replace(/\.png$/, '.raw.png');
  await page.screenshot({ path: raw, clip });
  const box = b && clip ? [b.x - clip.x, b.y - clip.y, b.width, b.height] : null; // không hiển thị → không khoanh bừa cả màn hình
  // Ảnh bug website: chỉ khung đỏ + mong muốn (giá trị Figma) cạnh khung. Phần tử không hiển thị → giữ ảnh, không khoanh bừa.
  if (!box) { fs.copyFileSync(raw, file); return; }
  const name = (p) => PROP_LABEL[p] || p;
  await renderMark(browser, { in: raw, out: file, marks: [{ box, note: diffs.map((d) => `${name(d.prop)}: ${unit(d.prop, d.expected)}`) }] });
}
