#!/usr/bin/env node
// Whole-page screenshot vs Figma frame export (PNG, exported at 1x so width == viewport width).
// Usage:
//   node visual_diff.mjs --page news --vp sp --figma-png specs/news.sp.png [--browser chromium] [--out runs/<id>] [--threshold 0.1]
// Output: <out>/visual.<page>.<vp>.<browser>.json, actual + diff + side-by-side PNGs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, findPage, writeJson, launch, openPage, runId, bugKey, projectImport } from './lib.mjs';

// Thư viện nằm trong node_modules của thư mục QA dự án (plugin không có node_modules).
const pngjs = await projectImport('pngjs');
const { PNG } = pngjs.PNG ? pngjs : pngjs.default;
const pm = await projectImport('pixelmatch');
const pixelmatch = typeof pm.default === 'function' ? pm.default : pm.default.default;

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const pg = findPage(cfg, args.page);
const vpName = args.vp || 'pc';
const viewport = cfg.viewports[vpName];
const browserName = args.browser || 'chromium';
const out = args.out || `runs/${runId()}`;
fs.mkdirSync(out, { recursive: true });

const browser = await launch(browserName);
const { ctx, page, url } = await openPage(browser, cfg, pg, viewport, browserName);
const actualPath = path.join(out, `visual.${pg.name}.${vpName}.${browserName}.actual.png`);
await page.screenshot({ path: actualPath, fullPage: true });
await ctx.close();
await browser.close();

const fig = PNG.sync.read(fs.readFileSync(args['figma-png']));
const act = PNG.sync.read(fs.readFileSync(actualPath));
const w = Math.min(fig.width, act.width);
const h = Math.min(fig.height, act.height);
const crop = (img) => {
  const o = new PNG({ width: w, height: h });
  PNG.bitblt(img, o, 0, 0, w, h, 0, 0);
  return o;
};
const a = crop(fig), b = crop(act);
const diff = new PNG({ width: w, height: h });
const mismatched = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: Number(args.threshold ?? 0.1), alpha: 0.3 });
const diffPath = path.join(out, `visual.${pg.name}.${vpName}.${browserName}.diff.png`);
fs.writeFileSync(diffPath, PNG.sync.write(diff));

// side by side: figma | actual | diff
const sbs = new PNG({ width: w * 3, height: h });
PNG.bitblt(a, sbs, 0, 0, w, h, 0, 0);
PNG.bitblt(b, sbs, 0, 0, w, h, w, 0);
PNG.bitblt(diff, sbs, 0, 0, w, h, w * 2, 0);
const sbsPath = path.join(out, `visual.${pg.name}.${vpName}.${browserName}.sbs.png`);
fs.writeFileSync(sbsPath, PNG.sync.write(sbs));

// Find vertical bands with heavy mismatch → hint which sections to inspect.
const bands = [];
const bandH = 100;
for (let y0 = 0; y0 < h; y0 += bandH) {
  let n = 0;
  for (let y = y0; y < Math.min(h, y0 + bandH); y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (diff.data[i] > 200 && diff.data[i + 1] < 100) n++;
  }
  const ratio = n / (w * Math.min(bandH, h - y0));
  if (ratio > 0.02) bands.push({ y: y0, height: Math.min(bandH, h - y0), mismatch: Math.round(ratio * 1000) / 10 });
}

const result = {
  kind: 'visual', page: pg.name, path: pg.path, url, viewportName: vpName, viewport: viewport.width, browser: browserName,
  figmaSize: { width: fig.width, height: fig.height }, actualSize: { width: act.width, height: act.height },
  heightDelta: act.height - fig.height, widthDelta: act.width - fig.width,
  mismatchPercent: Math.round((mismatched / (w * h)) * 10000) / 100,
  bands, files: { actual: actualPath, diff: diffPath, sideBySide: sbsPath },
  key: bugKey(pg.name, vpName, 'visual'),
};
writeJson(path.join(out, `visual.${pg.name}.${vpName}.${browserName}.json`), result);
console.log(`[visual] ${pg.name} ${vpName}: mismatch ${result.mismatchPercent}%, height Δ ${result.heightDelta}px, ${bands.length} bands → ${sbsPath}`);
