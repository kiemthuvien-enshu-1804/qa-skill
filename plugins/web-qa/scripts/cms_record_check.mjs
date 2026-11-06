#!/usr/bin/env node
// CMS record ↔ detail page: every text / image / file / link in ONE CMS record must be rendered on the page.
// Use for pages built from a single record (facility detail, staff profile, service page…), where cms_check.mjs (lists) does not apply.
// Only compares web ↔ CMS. Figma text/images are demo data and are never the reference here.
// Usage:
//   node cms_record_check.mjs --page facility [--id kamijima] [--out runs/<id>] [--browser chromium]
// Config: qa-config.json → "cms" (connection) + pages[].cms.endpoint. Optional pages[].cms.record:
//   { "id": "kamijima", "fields": ["name", "services"], "skipFields": ["seo"], "skipPaths": ["^services\[[1-4]\]\.detailed_service"] }
//   id omitted → last segment of pages[].path. fields omitted → every field of the record.
//   skipPaths: regex on the leaf path (e.g. fields rendered on sub-pages, not on this page).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, findPage, writeJson, launch, openPage, runId, bugKey } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const pg = findPage(cfg, args.page);
if (!cfg.cms || !pg.cms?.endpoint) throw new Error('Thiếu "cms" trong qa-config.json hoặc pages[].cms.endpoint của page này');
const R = pg.cms.record || {};
const recId = args.id || R.id || pg.path.replace(/\/$/, '').split('/').pop();
const browserName = args.browser || 'chromium';
const out = args.out || `runs/${runId()}`;
fs.mkdirSync(path.join(out, 'cms'), { recursive: true });

const env = (s) => String(s).replace(/\$\{(\w+)\}/g, (_, k) => {
  if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} (API key CMS)`);
  return process.env[k];
});
const headers = Object.fromEntries(Object.entries(cfg.cms.headers || {}).map(([k, v]) => [k, env(v)]));
const ep = pg.cms.endpoint.replace(/^\/+/, '');
const u = new URL(`${env(cfg.cms.baseUrl).replace(/\/$/, '')}/${ep}/${encodeURIComponent(recId)}`);
for (const [k, v] of Object.entries({ ...(cfg.cms.query || {}), ...(pg.cms.query || {}) })) if (!['limit', 'offset', 'orders', 'filters'].includes(k)) u.searchParams.set(k, env(v));
const res = await fetch(u, { headers });
if (!res.ok) throw new Error(`CMS API ${res.status} tại /${ep}/${recId} — kiểm tra endpoint/id/API key`);
let rec = await res.json();
if (rec?.title?.rendered) rec = { ...rec, title: rec.title.rendered, content: rec.content?.rendered }; // WordPress
writeJson(path.join(out, 'cms', `${pg.name}.record.json`), rec); // response body only, no key

// ---------- record → leaves ----------
const SKIP = new Set(['id', 'createdAt', 'updatedAt', 'publishedAt', 'revisedAt', 'fieldId', 'width', 'height', ...(R.skipFields || [])]);
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const norm = (s) => decode(String(s)).replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/[\s　]+/g, '').replace(/[〜～]/g, '~');
const skipRe = (R.skipPaths || []).map((x) => new RegExp(x));
const leaves = [];
function walk(o, p) {
  if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${p}[${i}]`));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => !SKIP.has(k) && walk(v, p ? `${p}.${k}` : k));
  if (o == null || o === '' || typeof o === 'boolean' || typeof o === 'number') return;
  const s = String(o);
  if (skipRe.some((r) => r.test(p))) return;
  if (/files\.microcms-assets\.io\/|^\S+\.pdf(\?|$)/i.test(s)) leaves.push({ path: p, kind: 'file', value: s });
  else if (/^https?:\/\/[^\s]+\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(s) || /images\.microcms-assets\.io\//.test(s)) leaves.push({ path: p, kind: 'image', value: s });
  else if (/^(https?:\/\/|\/|mailto:|tel:)\S+$/.test(s)) leaves.push({ path: p, kind: 'link', value: s });
  else {
    // rich text: split into blocks so one missing paragraph is reported precisely
    const parts = /<(p|li|h\d|td|th)[\s>]/i.test(s) ? s.split(/<\/(?:p|li|h\d|td|th)>/i).map(norm).filter(Boolean) : [norm(s)];
    parts.forEach((t, i) => t && leaves.push({ path: parts.length > 1 ? `${p}#${i}` : p, kind: 'text', value: t }));
  }
}
for (const [k, v] of Object.entries(rec)) if (!SKIP.has(k) && (!R.fields || R.fields.includes(k))) walk(v, k);

// ---------- page ----------
const findings = [];
const fileId = (s) => s.split('?')[0].split('/').slice(-2).join('/');
const browser = await launch(browserName);
const perVp = {};
for (const vpName of Object.keys(cfg.viewports)) {
  const viewport = cfg.viewports[vpName];
  const o = await openPage(browser, cfg, pg, viewport, browserName);
  const dom = await o.page.evaluate(() => {
    const media = [...document.querySelectorAll('img, source, video, [style*="background"]')]
      .flatMap((e) => [e.currentSrc, e.src, e.srcset, e.getAttribute('data-src'), e.getAttribute('data-srcset'), e.getAttribute('poster')])
      .concat([...document.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).filter((b) => b && b !== 'none'))
      .filter(Boolean).join(' ');
    const links = [...document.querySelectorAll('a[href], iframe[src]')].map((a) => ({ href: a.href || a.src, raw: a.getAttribute('href') || a.getAttribute('src'), text: (a.innerText || '').trim().slice(0, 40) }));
    return { all: document.body.textContent, vis: document.body.innerText, media, links };
  });
  const allN = dom.all.replace(/[\s　]+/g, '').replace(/[〜～]/g, '~');
  const visN = dom.vis.replace(/[\s　]+/g, '').replace(/[〜～]/g, '~');
  const rows = leaves.map((l) => {
    let status;
    if (l.kind === 'text') status = visN.includes(l.value) ? 'visible' : allN.includes(l.value) ? 'in-dom-hidden' : 'missing';
    else if (l.kind === 'image') status = dom.media.includes(fileId(l.value)) ? 'present' : 'missing';
    else {
      const abs = new URL(l.value, o.url).href;
      status = dom.links.some((a) => a.href === abs || a.raw === l.value || (l.kind === 'file' && (a.href || '').includes(fileId(l.value)))) ? 'present' : 'missing';
    }
    return { ...l, status };
  });
  perVp[vpName] = rows;
  const shot = path.join(out, 'cms', `${pg.name}.record.${vpName}.png`);
  await o.page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  writeJson(path.join(out, 'cms', `${pg.name}.record.${vpName}.links.json`), dom.links);
  // Links on the page that point at a CMS file (PDF…) not belonging to this record = hard-coded file shared by every record.
  const recFiles = new Set(leaves.filter((l) => l.kind === 'file').map((l) => fileId(l.value)));
  for (const a of dom.links.filter((a) => /files\.microcms-assets\.io\//.test(a.href) && !recFiles.has(fileId(a.href)))) {
    findings.push({ key: bugKey(pg.name, 'cms', 'cms-file-foreign', vpName, fileId(a.href)), page: pg.name, path: pg.path, viewportName: vpName, viewport: viewport.width, browser: browserName,
      type: 'cms', prop: 'cms-link', label: `Link file 「${a.text || fileId(a.href)}」 không thuộc bản ghi ${recId}`, expected: 'File lấy từ bản ghi CMS của trang này', actual: a.href, severity: 'high', where: o.url, url: o.url });
  }
  await o.ctx.close();
}
await browser.close();

// Missing on every viewport → 1 finding; missing on one viewport only → finding for that viewport.
const vps = Object.keys(perVp);
for (let i = 0; i < leaves.length; i++) {
  const l = leaves[i];
  const miss = vps.filter((v) => perVp[v][i].status === 'missing');
  if (!miss.length) continue;
  const vpName = miss.length === vps.length ? vps[0] : miss[0];
  const prop = l.kind === 'text' ? 'cms-field' : l.kind === 'image' ? 'cms-image' : 'cms-link';
  findings.push({
    key: bugKey(pg.name, 'cms', prop, recId, l.path), page: pg.name, path: pg.path, viewportName: miss.length === vps.length ? 'all' : vpName,
    viewport: cfg.viewports[vpName].width, browser: browserName, type: 'cms', prop,
    label: `${l.path} (${l.kind}) không hiển thị${miss.length < vps.length ? ` ở ${miss.join('/')}` : ''}`,
    expected: l.value.slice(0, 300), actual: '(không có trên trang)', severity: l.kind === 'text' ? 'medium' : 'high', where: `${recId} · ${l.path}`,
  });
}

const summary = Object.fromEntries(vps.map((v) => [v, perVp[v].reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {})]));
writeJson(path.join(out, `cms.${pg.name}.json`), {
  kind: 'cms', mode: 'record', page: pg.name, path: pg.path, cms: cfg.cms.name || 'CMS', record: recId, leaves: leaves.length, summary,
  rows: perVp, browser: browserName, at: new Date().toISOString(), findings,
});
console.log(`[cms-record] ${pg.name} (${recId}): ${leaves.length} giá trị — ${JSON.stringify(summary)} — ${findings.length} findings → ${out}`);
