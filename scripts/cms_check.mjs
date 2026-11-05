#!/usr/bin/env node
// CMS data check: compare what the CMS API returns with what the site renders
// (list items, order, title, date format, category, link, thumbnail, pagination, filters, detail pages).
// Usage:
//   node cms_check.mjs --page news [--vp pc] [--browser chromium] [--out runs/<id>] [--dump]
// Config: qa-config.json → "cms" (connection) + pages[].cms (mapping). API key only via env var.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, findPage, writeJson, launch, openPage, runId, bugKey } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const pg = findPage(cfg, args.page);
if (!cfg.cms || !pg.cms) throw new Error('Thiếu "cms" trong qa-config.json hoặc pages[].cms của page này');
const vpName = args.vp || 'pc';
const viewport = cfg.viewports[vpName];
const browserName = args.browser || 'chromium';
const out = args.out || `runs/${runId()}`;
fs.mkdirSync(path.join(out, 'cms'), { recursive: true });
const M = pg.cms;
// SP có thể dùng markup/ảnh khác PC: pages[].cms.listSp + fields.imageSp (không khai báo thì dùng list / image).
const LIST = (vpName === 'sp' && M.listSp) || M.list;
const findings = [];

// ---------------- CMS API ----------------
const env = (s) => String(s).replace(/\$\{(\w+)\}/g, (_, k) => {
  if (!process.env[k]) throw new Error(`Thiếu biến môi trường ${k} (API key CMS)`);
  return process.env[k];
});
const headers = Object.fromEntries(Object.entries(cfg.cms.headers || {}).map(([k, v]) => [k, env(v)]));

function getPath(obj, p) {
  if (!p) return undefined;
  return p.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    if (Array.isArray(o) && !/^\d+$/.test(k)) return o.map((x) => x?.[k]).filter((x) => x != null).join(', ');
    return o[k];
  }, obj);
}

async function fetchAll(query = {}) {
  const pgn = cfg.cms.pagination || { style: 'offset', limitParam: 'limit', offsetParam: 'offset', pageSize: 100 };
  const size = pgn.pageSize || 100;
  const items = [];
  let total = Infinity;
  for (let i = 0; items.length < Math.min(total, M.maxItems || 500); i++) {
    const u = new URL(env(cfg.cms.baseUrl).replace(/\/$/, '') + (M.endpoint.startsWith('/') ? M.endpoint : '/' + M.endpoint));
    for (const [k, v] of Object.entries({ ...(cfg.cms.query || {}), ...(M.query || {}), ...query })) u.searchParams.set(k, env(v));
    if (pgn.style === 'page') { u.searchParams.set(pgn.pageParam || 'page', i + 1); u.searchParams.set(pgn.perPageParam || 'per_page', size); }
    else { u.searchParams.set(pgn.limitParam || 'limit', size); u.searchParams.set(pgn.offsetParam || 'offset', i * size); }
    const res = await fetch(u, { headers });
    if (res.status === 400 && pgn.style === 'page' && items.length) break; // WP: page out of range
    if (!res.ok) throw new Error(`CMS API ${res.status} tại ${u.pathname} — kiểm tra endpoint/API key`);
    const body = await res.json();
    const arr = cfg.cms.listPath ? getPath(body, cfg.cms.listPath) : body;
    if (!Array.isArray(arr)) throw new Error(`listPath "${cfg.cms.listPath}" không trả về mảng`);
    const t = cfg.cms.totalPath ? getPath(body, cfg.cms.totalPath) : res.headers.get(cfg.cms.totalHeader || 'x-wp-total');
    if (t != null) total = Number(t);
    items.push(...arr);
    if (arr.length < size) break;
  }
  return items.map((raw) => normalize(raw));
}

function normalize(raw) {
  const f = M.fields || {};
  const o = { _raw: raw };
  for (const [k, p] of Object.entries(f)) o[k] = getPath(raw, p);
  if (vpName === 'sp' && f.imageSp) o.image = o.imageSp;
  if (typeof o.title === 'object' && o.title?.rendered) o.title = o.title.rendered; // WordPress
  o.title = stripHtml(o.title);
  return o;
}
const stripHtml = (s) => (s == null ? s : String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&nbsp;/g, ' ').trim());
const norm = (s) => (s == null ? '' : String(s).replace(/\s+/g, '').replace(/[‐－―]/g, '-'));

function fmtDate(v, pattern = 'YYYY.MM.DD', tz = 'Asia/Tokyo') {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: tz, weekday: 'short' }).format(d);
  return pattern.replace(/YYYY|MM|DD|HH|mm|M|D|ddd/g, (t) => ({ YYYY: parts.year, MM: parts.month, DD: parts.day, HH: parts.hour, mm: parts.minute, M: String(+parts.month), D: String(+parts.day), ddd: wd }[t]));
}

function add(prop, label, expected, actual, sev, extra = {}) {
  findings.push({
    key: bugKey(pg.name, 'cms', prop, extra.where || '', label), page: pg.name, path: pg.path, viewportName: vpName, viewport: viewport.width,
    browser: browserName, type: 'cms', prop, label, expected: String(expected ?? ''), actual: String(actual ?? ''), severity: sev, ...extra,
  });
}

// ---------------- Site ----------------
async function readList(page) {
  const L = LIST;
  return page.$$eval(L.item, (els, L) => els.map((el) => {
    const q = (s) => (s ? el.querySelector(s) : null);
    const txt = (s) => (s ? (q(s)?.innerText || '').trim() : null);
    const a = L.link ? (el.matches(L.link) ? el : q(L.link)) : el.closest('a') || q('a');
    const img = q(L.image || 'img');
    return { title: txt(L.title), date: txt(L.date), category: txt(L.category), href: a?.getAttribute('href') || null, img: img ? img.currentSrc || img.src || img.getAttribute('data-src') : null };
  }), L);
}

function compareList(expected, actual, where, shot) {
  if (expected.length !== actual.length) add('cms-count', `Số bài (${where})`, expected.length, actual.length, 'high', { where, screenshot: shot });
  // order check: same set but different order
  const expT = expected.map((e) => norm(e.title)), actT = actual.map((a) => norm(a.title));
  if (expT.join('|') !== actT.join('|') && [...expT].sort().join('|') === [...actT].sort().join('|')) {
    add('cms-order', `Thứ tự bài (${where})`, M.sortLabel || 'theo CMS', 'sai thứ tự', 'medium', { where, screenshot: shot });
  }
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    const e = expected[i], a = actual.find((x) => norm(x.title) === norm(e.title)) || actual[i];
    const tag = `${where} #${i + 1}`;
    if (LIST.title && norm(e.title) !== norm(a.title) && !actT.includes(norm(e.title))) {
      add('cms-title', `Tiêu đề bài ${tag}`, e.title, a.title, 'high', { where: tag, screenshot: shot });
      continue; // other fields would be noise if it is a different post
    }
    if (LIST.date && e.date) {
      const exp = fmtDate(e.date, M.dateFormat, M.timezone);
      if (norm(exp) !== norm(a.date)) add('cms-date', `Ngày bài ${tag}`, exp, a.date, 'medium', { where: tag, screenshot: shot });
    }
    if (LIST.category && e.category != null) {
      const ec = M.categoryMap?.[e.category] ?? e.category;
      if (norm(ec) !== norm(a.category)) add('cms-category', `Category bài ${tag}`, ec, a.category, 'medium', { where: tag, screenshot: shot });
    }
    if (M.detail?.urlTemplate && (e.id || e.slug)) {
      const expHref = M.detail.urlTemplate.replace('{id}', e.id ?? '').replace('{slug}', e.slug ?? '');
      if (!a.href || !decodeURI(a.href).replace(/\/$/, '').endsWith(expHref.replace(/\/$/, ''))) add('cms-link', `Link bài ${tag}`, expHref, a.href || '(không có link)', 'high', { where: tag, screenshot: shot });
    }
    if (LIST.image !== false && e.image) {
      const base = String(e.image).split('?')[0].split('/').pop();
      if (!a.img) add('cms-image', `Ảnh thumbnail ${tag}`, base, '(không có ảnh)', 'medium', { where: tag, screenshot: shot });
      else if (!decodeURIComponent(a.img).includes(decodeURIComponent(base)) && !M.imageProxy) add('cms-image', `Ảnh thumbnail ${tag}`, base, a.img.split('/').pop(), 'medium', { where: tag, screenshot: shot });
    }
    if (!e.image && M.noImageFallback && a.img && !a.img.includes(M.noImageFallback)) add('cms-image', `Ảnh no-image ${tag}`, M.noImageFallback, a.img.split('/').pop(), 'low', { where: tag });
  }
}

function listUrl(n, base = pg.path) {
  if (n === 1 && !M.firstPageWithParam) return base;
  const tpl = M.pageUrl || '{path}?page={n}';
  return tpl.replace('{path}?', base + (base.includes('?') ? '&' : '?')).replace('{path}', base).replace('{n}', n);
}

const browser = await launch(browserName);
const items = await fetchAll();
const visible = M.excludeIf ? items.filter((i) => !getPath(i._raw, M.excludeIf)) : items;
if (args.dump) writeJson(path.join(out, 'cms', `${pg.name}.api.json`), visible.map(({ _raw, ...x }) => x));
const size = M.pageSize || visible.length || 1;
const totalPages = Math.max(1, Math.ceil(visible.length / size));

async function checkListing(label, all, base) {
  const pages = Math.max(1, Math.ceil(all.length / size));
  for (let n = 1; n <= Math.min(pages, M.maxPages || 5); n++) {
    const p = { ...pg, path: listUrl(n, base) };
    const { ctx, page } = await openPage(browser, cfg, p, viewport, browserName);
    const actual = await readList(page);
    const shot = path.join(out, 'cms', `${pg.name}.${label}.p${n}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    if (!actual.length && all.length) add('cms-count', `Danh sách trống (${label} trang ${n})`, `${Math.min(size, all.length - (n - 1) * size)} bài`, '0 bài — kiểm tra selector list.item hoặc trang lỗi', 'high', { where: `${label} p${n}`, screenshot: shot });
    else compareList(all.slice((n - 1) * size, n * size), actual, `${label} trang ${n}`, shot);
    if (n === 1 && LIST.pagerLast) {
      const shownLast = await page.$$eval(LIST.pagerLast, (els) => els.map((e) => e.innerText.trim()).filter((t) => /^\d+$/.test(t)).map(Number).pop() ?? null).catch(() => null);
      if (shownLast != null && shownLast !== pages) add('cms-pagination', `Tổng số trang (${label})`, pages, shownLast, 'high', { where: label, screenshot: shot });
    }
    await ctx.close();
  }
  // page after the last must not show posts
  if (M.checkOverflowPage !== false && all.length) {
    const p = { ...pg, path: listUrl(pages + 1, base) };
    const { ctx, page } = await openPage(browser, cfg, p, viewport, browserName);
    const extra = await readList(page).catch(() => []);
    if (extra.length) add('cms-pagination', `Trang ${pages + 1} (${label}) vượt quá số trang`, '0 bài / 404', `${extra.length} bài`, 'medium', { where: `${label} p${pages + 1}` });
    await ctx.close();
  }
}

await checkListing('list', visible, pg.path);

for (const f of M.filters || []) {
  const fItems = (await fetchAll(f.query || {})).filter((i) => !(M.excludeIf && getPath(i._raw, M.excludeIf)));
  await checkListing(`filter-${f.name}`, fItems, f.url);
}

// detail pages: first N + last
if (M.detail?.urlTemplate) {
  const sample = [...visible.slice(0, M.detail.sample ?? 3), visible.at(-1)].filter(Boolean);
  for (const e of [...new Set(sample)]) {
    const url = M.detail.urlTemplate.replace('{id}', e.id ?? '').replace('{slug}', e.slug ?? '');
    const p = { ...pg, path: url, waitFor: M.detail.waitFor };
    let ctx;
    try {
      const o = await openPage(browser, cfg, p, viewport, browserName);
      ctx = o.ctx;
      const status = o.failedRequests.find((r) => r.includes(new URL(url, cfg.baseUrl).href));
      const d = await o.page.evaluate((D) => ({ title: D.title ? document.querySelector(D.title)?.innerText?.trim() : null, date: D.date ? document.querySelector(D.date)?.innerText?.trim() : null, body: D.body ? (document.querySelector(D.body)?.innerText || '').trim().length : null }), M.detail);
      const shot = path.join(out, 'cms', `${pg.name}.detail.${e.id || e.slug}.png`);
      if (status) { add('cms-detail', `Trang chi tiết ${url}`, 'HTTP 200', status.split(' ')[0], 'high', { where: url, url }); continue; }
      if (M.detail.title && norm(d.title) !== norm(e.title)) { await o.page.screenshot({ path: shot }); add('cms-detail', `Tiêu đề chi tiết ${url}`, e.title, d.title ?? '(không có)', 'high', { where: url, url, screenshot: shot }); }
      if (M.detail.date && e.date && norm(fmtDate(e.date, M.dateFormat, M.timezone)) !== norm(d.date)) add('cms-detail', `Ngày chi tiết ${url}`, fmtDate(e.date, M.dateFormat, M.timezone), d.date ?? '(không có)', 'medium', { where: url, url });
      if (M.detail.body && d.body === 0) add('cms-detail', `Nội dung chi tiết ${url}`, 'có nội dung', 'trống', 'high', { where: url, url });
    } catch (err) {
      add('cms-detail', `Trang chi tiết ${url}`, 'mở được', String(err.message).split('\n')[0], 'high', { where: url, url });
    } finally { await ctx?.close(); }
  }
}
await browser.close();

// Collapse systematic errors (e.g. every date off by one day = timezone bug) into one finding with examples.
const collapsed = [];
const byProp = {};
for (const f of findings) (byProp[f.prop + '|' + f.label.replace(/[#\d].*$/, '')] ||= []).push(f);
for (const fs of Object.values(byProp)) {
  if (fs.length < 3 || !['cms-date', 'cms-category', 'cms-image', 'cms-link'].includes(fs[0].prop)) { collapsed.push(...fs); continue; }
  const f = fs[0];
  collapsed.push({ ...f, key: bugKey(pg.name, 'cms', f.prop, 'systematic'), label: `${f.label.replace(/\s*(list|filter).*$/, '')} (${fs.length} chỗ)`,
    expected: fs.slice(0, 5).map((x) => `${x.where}: ${x.expected}`).join('\n'), actual: fs.slice(0, 5).map((x) => `${x.where}: ${x.actual}`).join('\n') + (fs.length > 5 ? `\n… +${fs.length - 5}` : ''),
    severity: 'high', where: 'nhiều bài' });
}
findings.length = 0;
findings.push(...collapsed);

writeJson(path.join(out, `cms.${pg.name}.json`), {
  kind: 'cms', page: pg.name, path: pg.path, cms: cfg.cms.name || 'CMS', items: visible.length, pageSize: size, totalPages,
  viewportName: vpName, browser: browserName, at: new Date().toISOString(), findings,
});
console.log(`[cms] ${pg.name}: CMS ${visible.length} bài / ${totalPages} trang — ${findings.length} findings → ${out}`);
