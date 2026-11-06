#!/usr/bin/env node
// Check chung cho MỌI trang (không cần viết flow riêng), lấy từ checklist Excel:
//   title / description / OGP / favicon, GTM, số điện thoại (PC không gọi, SP gọi được), ảnh Retina x2,
//   ảnh quá nặng, link ngoài mở tab mới, link nội bộ không lỗi, breadcrumb, trang 404 (chỉ chạy ở trang "/").
// Usage: node <plugin>/scripts/page_checks.mjs --page <page> --out $RUN [--vp sp|pc] [--browser chromium]
// Output: $RUN/flow.<page>.common.<vp>.<browser>.json — cùng format flow, nên make_bugs / compare_runs / update_checklist
//   đọc được như flow thường. status: pass | fail | na (trang không có thứ đó → checklist NA) | needs-chrome.
import path from 'node:path';
import { parseArgs, loadConfig, findPage, writeJson, launch, openPage, runId, bugKey } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig(args.config || 'qa-config.json');
const pg = findPage(cfg, args.page);
const vpName = args.vp || 'pc';
const viewport = cfg.viewports[vpName];
const browserName = args.browser || 'chromium';
const out = args.out || `runs/${runId()}`;
const IMG_MAX_KB = Number(args['img-max-kb'] || 500);
const LINK_LIMIT = Number(args['link-limit'] || 60);
const checks = [];

const browser = await launch(browserName);
const { ctx, page, url } = await openPage(browser, cfg, pg, viewport, browserName);
const host = new URL(url).host;

async function check(name, { expected = '', severity = 'medium', group = 'common', steps = [] }, fn) {
  const c = { name, steps: steps.length ? steps : [`Mở ${pg.path} (${vpName.toUpperCase()} ${viewport.width}px)`], expected, severity, group,
    viewport: viewport.width, viewportName: vpName, browser: browserName, key: bugKey(pg.name, 'common', name) };
  try {
    const r = await fn();
    if (r?.status) Object.assign(c, r);
    else { c.status = r?.ok ? 'pass' : 'fail'; c.actual = r?.actual ?? ''; }
  } catch (e) {
    c.status = 'fail'; c.actual = 'Lỗi khi chạy: ' + String(e.message).split('\n')[0];
  }
  if (c.status === 'fail') {
    c.screenshot = path.join(out, `flow.${pg.name}.common.${vpName}.${browserName}.${checks.length + 1}.png`);
    await page.screenshot({ path: c.screenshot }).catch(() => {});
  }
  checks.push(c);
  console.log(`  ${c.status.padEnd(12)} ${name}`);
}
const status = async (u) => {
  try { return (await ctx.request.get(u, { timeout: 20000, maxRedirects: 5 })).status(); } catch { return 0; }
};
const list = (xs, n = 5) => xs.slice(0, n).join('\n') + (xs.length > n ? `\n… +${xs.length - n}` : '');

// ---------- meta ----------
const meta = await page.evaluate(() => {
  const m = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || '';
  return {
    title: document.title.trim(), description: m('meta[name="description"]'),
    ogTitle: m('meta[property="og:title"]'), ogDescription: m('meta[property="og:description"]'), ogImage: m('meta[property="og:image"]'),
    ogUrl: m('meta[property="og:url"]'), icon: document.querySelector('link[rel~="icon"]')?.href || '',
    html: document.documentElement.outerHTML.slice(0, 400000),
  };
});
await check('Có title và meta description', { expected: '<title> và meta description có nội dung (đúng theo spec của trang)', severity: 'medium' }, async () => {
  const bad = [!meta.title && 'thiếu <title>', /^(document|untitled|nuxt|next\.js|react app|vite app)$/i.test(meta.title) && `title mặc định "${meta.title}"`, !meta.description && 'thiếu meta description'].filter(Boolean);
  return { ok: !bad.length, actual: bad.length ? bad.join('; ') : `title: ${meta.title}\ndescription: ${meta.description}` };
});
await check('Có OGP (og:title, og:description, og:image) và og:image tải được', { expected: 'Đủ 3 thẻ OGP, og:image trả 200', severity: 'medium' }, async () => {
  const miss = ['ogTitle', 'ogDescription', 'ogImage'].filter((k) => !meta[k]).map((k) => k.replace('og', 'og:').toLowerCase());
  let img = '';
  if (meta.ogImage) { const s = await status(new URL(meta.ogImage, url).href); if (s !== 200) img = `og:image → ${s || 'lỗi mạng'}`; }
  const bad = [miss.length && `thiếu ${miss.join(', ')}`, img].filter(Boolean);
  return { ok: !bad.length, actual: bad.length ? bad.join('; ') : `og:title: ${meta.ogTitle}\nog:image: ${meta.ogImage}` };
});
await check('Favicon tải được', { expected: 'link rel="icon" (hoặc /favicon.ico) trả 200', severity: 'low' }, async () => {
  const u = meta.icon || new URL('/favicon.ico', url).href;
  const s = await status(u);
  return { ok: s === 200, actual: `${u} → ${s || 'lỗi mạng'}` };
});
await check('GTM đúng định dạng GTM-XXXX', { expected: 'Có container GTM-XXXXXXX; bắn tag kiểm ở Chrome (GTM Preview)', severity: 'medium' }, async () => {
  const ids = [...new Set(meta.html.match(/GTM-[A-Z0-9]+/g) || [])];
  if (!ids.length) return { status: 'needs-chrome', reason: 'Không thấy GTM trong HTML — xác nhận với spec có cần GTM không, kiểm GTM Preview trên Chrome' };
  const bad = ids.filter((x) => !/^GTM-[A-Z0-9]{6,8}$/.test(x));
  return { ok: !bad.length, actual: `GTM: ${ids.join(', ')}` + (bad.length ? ` — sai định dạng: ${bad.join(', ')}` : '') };
});

// ---------- số điện thoại ----------
const tel = await page.evaluate(() => {
  const re = /0\d{1,4}-\d{1,4}-\d{3,4}/;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const links = [...document.querySelectorAll('a[href^="tel:"]')].filter(vis).map((a) => ({ text: a.innerText.trim(), pe: getComputedStyle(a).pointerEvents }));
  const plain = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode; const m = n.textContent.match(re);
    if (m && n.parentElement && vis(n.parentElement) && !n.parentElement.closest('a[href^="tel:"]')) plain.push(m[0]);
  }
  return { links, plain: [...new Set(plain)] };
});
if (!tel.links.length && !tel.plain.length) {
  await check('Số điện thoại', { expected: '' }, async () => ({ status: 'na', reason: 'Trang không có số điện thoại' }));
} else if (vpName === 'sp') {
  await check('SP: số điện thoại bấm gọi được (a href="tel:")', { expected: 'Mọi số điện thoại hiển thị là link tel:', severity: 'medium', group: 'sp' }, async () =>
    ({ ok: !tel.plain.length, actual: tel.plain.length ? `Số không phải link tel:\n${list(tel.plain)}` : `${tel.links.length} link tel:` }));
} else {
  await check('PC: số điện thoại không bấm gọi được', { expected: 'PC: link tel: bị tắt (pointer-events: none) hoặc không phải link', severity: 'low', group: 'pc' }, async () => {
    const on = tel.links.filter((l) => l.pe !== 'none').map((l) => l.text);
    return { ok: !on.length, actual: on.length ? `Link tel: bấm được trên PC:\n${list(on)}` : 'Không có link tel: bấm được' };
  });
}

// ---------- ảnh ----------
const imgs = await page.evaluate(() => [...document.images].map((i) => {
  const r = i.getBoundingClientRect();
  return { src: i.currentSrc || i.src, w: Math.round(r.width), h: Math.round(r.height), nw: i.naturalWidth, nh: i.naturalHeight, svg: /\.svg(\?|$)/i.test(i.currentSrc || i.src) };
}).filter((i) => i.w >= 40 && i.h >= 40 && i.nw > 0 && !i.svg));
await check('Ảnh Retina (độ phân giải ≥ 2x kích thước hiển thị)', { expected: 'naturalWidth ≥ 2 × width hiển thị (hoặc SVG)', severity: 'low' }, async () => {
  if (!imgs.length) return { status: 'na', reason: 'Trang không có ảnh bitmap' };
  const low = imgs.filter((i) => i.nw < i.w * 2 - 2).map((i) => `${i.src.split('/').pop().slice(0, 60)}: hiển thị ${i.w}px, ảnh ${i.nw}px`);
  return { ok: !low.length, actual: low.length ? `${low.length}/${imgs.length} ảnh chưa đủ 2x:\n${list(low)}` : `${imgs.length} ảnh đạt 2x` };
});
await check(`Ảnh không quá nặng (≤ ${IMG_MAX_KB}KB/ảnh)`, { expected: `Mỗi ảnh ≤ ${IMG_MAX_KB}KB (load nhanh)`, severity: 'low' }, async () => {
  const heavy = await page.evaluate((max) => performance.getEntriesByType('resource')
    .filter((e) => e.initiatorType === 'img' || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(e.name))
    .filter((e) => (e.encodedBodySize || e.transferSize) > max * 1024)
    .map((e) => `${e.name.split('/').pop().slice(0, 60)}: ${Math.round((e.encodedBodySize || e.transferSize) / 1024)}KB`), IMG_MAX_KB);
  if (!imgs.length) return { status: 'na', reason: 'Trang không có ảnh bitmap' };
  return { ok: !heavy.length, actual: heavy.length ? list(heavy) : 'Không có ảnh vượt ngưỡng' };
});

// ---------- link ----------
const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, target: a.target, text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40) }))
  .filter((l) => /^https?:/.test(l.href)));
await check('Link ngoài mở tab mới (target="_blank")', { expected: 'Link sang domain khác có target="_blank" (trừ khi spec ghi mở cùng tab)', severity: 'low' }, async () => {
  const ext = links.filter((l) => new URL(l.href).host !== host);
  if (!ext.length) return { status: 'na', reason: 'Trang không có link ngoài' };
  const same = [...new Set(ext.filter((l) => l.target !== '_blank').map((l) => `${l.text || '(không chữ)'} → ${l.href}`))];
  return { ok: !same.length, actual: same.length ? `Mở cùng tab:\n${list(same)}` : `${ext.length} link ngoài đều mở tab mới` };
});
await check('Link nội bộ không lỗi (không 4xx/5xx)', { expected: 'Mọi link nội bộ trả 2xx/3xx', severity: 'high' }, async () => {
  const internal = [...new Set(links.filter((l) => new URL(l.href).host === host).map((l) => l.href.split('#')[0]))].slice(0, LINK_LIMIT);
  if (!internal.length) return { status: 'na', reason: 'Trang không có link nội bộ' };
  const bad = [];
  for (const u of internal) { const s = await status(u); if (!s || s >= 400) bad.push(`${s || 'lỗi mạng'} ${u}`); }
  return { ok: !bad.length, actual: bad.length ? list(bad) : `${internal.length} link nội bộ OK` };
});

// ---------- breadcrumb ----------
const bc = await page.evaluate(() => {
  const root = document.querySelector('nav[aria-label*="breadcrumb" i], [class*="breadcrumb" i], [class*="pankuzu" i], [itemtype*="BreadcrumbList"]');
  if (!root) return null;
  const items = [...root.querySelectorAll('li, [itemprop="itemListElement"]')];
  const last = items[items.length - 1] || root;
  const a = last.querySelector('a[href]');
  return { count: items.length, lastText: last.innerText.trim().slice(0, 40), lastHref: a?.href || '', links: [...root.querySelectorAll('a[href]')].map((x) => x.href) };
});
if (!bc) {
  await check('Breadcrumb', { expected: '' }, async () => ({ status: 'na', reason: 'Trang không có breadcrumb' }));
} else {
  await check('Breadcrumb: trang hiện tại không bấm được, các link không lỗi', { expected: 'Mục cuối (trang hiện tại) không phải link; link breadcrumb trả 2xx/3xx', severity: 'low' }, async () => {
    const bad = [];
    if (bc.lastHref && bc.lastHref.split('#')[0].replace(/\/$/, '') === url.split('#')[0].replace(/\/$/, '')) bad.push(`Mục cuối "${bc.lastText}" vẫn là link về chính trang này`);
    for (const u of [...new Set(bc.links)]) { const s = await status(u); if (!s || s >= 400) bad.push(`${s || 'lỗi mạng'} ${u}`); }
    return { ok: !bad.length, actual: bad.length ? bad.join('\n') : `${bc.count} mục, mục cuối: ${bc.lastText}` };
  });
}

// ---------- 404 (cấp site → chỉ chạy ở trang đầu tiên trong pages[], URL giả nằm dưới path của trang đó) ----------
if (pg.name === cfg.pages[0]?.name) {
  const missing = `${pg.path.replace(/\/$/, '')}/__qa-not-found-${Date.now()}`;
  await check('URL không tồn tại → trang 404 (HTTP 404, tiếng Nhật)', { expected: 'HTTP 404, nội dung tiếng Nhật (theo design nếu có)', severity: 'medium', steps: [`Mở ${missing}`] }, async () => {
    const p = await ctx.newPage();
    const r = await p.goto(new URL(missing, url).href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    const txt = r ? await p.innerText('body').catch(() => '') : '';
    await p.close();
    const ja = /[\u3040-\u30ff\u4e00-\u9faf]/.test(txt);
    return { ok: r?.status() === 404 && ja, actual: `HTTP ${r?.status() ?? 'lỗi'}; ${ja ? 'có' : 'không có'} chữ tiếng Nhật; "${txt.trim().slice(0, 80)}"` };
  });
}

await ctx.close();
await browser.close();
writeJson(path.join(out, `flow.${pg.name}.common.${vpName}.${browserName}.json`), { kind: 'flow', page: pg.name, path: pg.path, url, at: new Date().toISOString(), checks });
console.log(`[page_checks] ${pg.name} ${vpName} ${browserName}: ${checks.filter((c) => c.status === 'fail').length} fail / ${checks.length} → ${out}`);
