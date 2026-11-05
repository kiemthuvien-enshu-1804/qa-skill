#!/usr/bin/env node
// Ảnh bằng chứng bug: KHÔNG gửi ảnh gốc. Ảnh ra = ảnh gốc + khung đỏ đánh số quanh từng chỗ sai + cột trắng bên phải:
//   3 dòng tiêu đề (mã bug · môi trường · ngày / mã đặt chỗ|item + tên / tài khoản · màn hình → thao tác)
//   rồi ghi chú (1), (2)…: tiêu đề đỏ đậm (cái gì sai) + 2〜4 dòng tiếng Việt (hiện tại — giữ nguyên chữ JA trên UI → đúng phải thế nào) + nguồn tài liệu.
// Chỉ khoanh chỗ chắc chắn là bug. Điểm chờ chốt: bỏ ra, hoặc "pending": true (khung cam nét đứt, ghi rõ ĐANG CHỜ CHỐT).
//
//   node annotate.mjs --spec <mark.json> [--check]        (--check: chỉ kiểm quy tắc, không vẽ)
// mark.json:
// {
//   "in": "runs/.../evidence/TC-FAC-012_FAIL.png",
//   "out": "runs/.../bug/TC-FAC-012_search-empty_FAIL.png",     // <bug/TC>_<mô tả ngắn>_FAIL.png (verify PASS: _PASS.png)
//   "status": "FAIL",                                            // FAIL (đỏ, mặc định) | PASS (xanh, ảnh verify)
//   "header": { "bug": "ENTORI_PJ-123", "env": "local http://localhost:3001 (FE e33abfd / BE 7dc680f)", "date": "2026-11-05",
//               "item": "FAC-0001 「浜松アリーナ」", "account": "admin_a", "screen": "A-01 施設一覧", "action": "nhập 「アリーナ」→ bấm 検索" },
//   "marks": [
//     { "box": [x, y, w, h], "title": "Kết quả tìm kiếm trống",
//       "lines": ["Hiện tại: bảng hiện 「該当するデータがありません」 dù FAC-0001 khớp từ khoá.",
//                 "Đúng: hiện 1 dòng FAC-0001 「浜松アリーナ」."],
//       "source": "M2 A-01 §3.2 / TC-FAC-012" },
//     { "box": [...], "title": "...", "lines": ["...", "..."], "source": "...", "pending": true }
//   ]
// }
// Toạ độ box theo pixel ảnh gốc (runner chụp deviceScaleFactor 1 → dùng locator.boundingBox()).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, launch, die } from './lib.mjs';

const a = parseArgs();
if (!a.spec || !fs.existsSync(a.spec)) die('Cần --spec <mark.json> (xem mẫu ở đầu annotate.mjs)');
const S = readJson(a.spec);
const base = path.dirname(path.resolve(a.spec));
const rel = (p) => (p && !path.isAbsolute(p) && !fs.existsSync(p) ? path.join(base, p) : p);
const input = rel(S.in);
const status = String(S.status || 'FAIL').toUpperCase();

// ---------- kiểm quy tắc ----------
const errs = [], warns = [];
if (!input || !fs.existsSync(input)) errs.push(`"in" không tồn tại: ${S.in}`);
const TBD = '[CẦN BỔ SUNG]';
let head;
if (Array.isArray(S.header)) {
  head = S.header.map(String);
  if (head.length !== 3) errs.push('"header" phải đúng 3 dòng');
} else {
  const h = S.header || {};
  const need = ['bug', 'env', 'date', 'item', 'account', 'screen', 'action'];
  const miss = need.filter((k) => !h[k]);
  if (miss.length) warns.push(`header thiếu: ${miss.join(', ')} → ghi ${TBD}`);
  const v = (k) => h[k] || TBD;
  head = [`${v('bug')} · ${v('env')} · ${v('date')}`, v('item'), `${v('account')} · ${v('screen')} → ${v('action')}`];
}
const marks = (S.marks || []).map((m, i) => ({ ...m, n: i + 1 }));
if (!marks.length) errs.push('Cần ít nhất 1 mục trong "marks"');
for (const m of marks) {
  const tag = `(${m.n})`;
  if (!Array.isArray(m.box) || m.box.length !== 4 || !m.box.every(Number.isFinite)) errs.push(`${tag} box phải là [x, y, w, h]`);
  if (!m.title) errs.push(`${tag} thiếu "title" (cái gì sai)`);
  const n = (m.lines || []).length;
  if (n < 2 || n > 4) errs.push(`${tag} "lines" phải 2〜4 dòng (đang ${n}): hiện tại → đúng phải thế nào`);
  if (!m.source) warns.push(`${tag} thiếu "source" (nguồn tài liệu: spec/mockup/TC)`);
  if (m.pending) warns.push(`${tag} đang chờ chốt — sẽ vẽ khung cam nét đứt, ghi ĐANG CHỜ CHỐT (hoặc bỏ khỏi ảnh)`);
}
const out = rel(S.out) || (input ? path.join(path.dirname(input), `${path.basename(input, '.png').replace(/_(FAIL|PASS|BLOCKED)(_r\d+)?$/, '')}_mark_${status}.png`) : '');
if (out && !new RegExp(`^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*-\\d+[a-z]?_.+_${status}\\.png$`).test(path.basename(out)))
  warns.push(`Tên file nên dạng <bug/TC>_<mô tả>_${status}.png (đang: ${path.basename(out)})`);
if (out && path.resolve(out) === path.resolve(input || '')) errs.push('"out" trùng ảnh gốc — không ghi đè ảnh gốc');

for (const w of warns) console.log(`WARN ${w}`);
for (const e of errs) console.log(`FAIL ${e}`);
if (errs.length) process.exit(1);
if (a.check) { console.log('OK   spec hợp lệ'); process.exit(0); }

// ---------- vẽ ----------
const color = status === 'PASS' ? '#16a34a' : '#dc2626';
const b64 = fs.readFileSync(input).toString('base64');
const browser = await launch('chromium');
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><img id="i" src="data:image/png;base64,${b64}"></body>`);
await page.waitForFunction(() => document.getElementById('i').complete);
const { w, h } = await page.evaluate(() => ({ w: document.getElementById('i').naturalWidth, h: document.getElementById('i').naturalHeight }));
const panelW = Math.round(Math.min(620, Math.max(420, w * 0.36)));
await page.setViewportSize({ width: w + panelW, height: h });

await page.evaluate(({ head, marks, color, panelW, w, h }) => {
  const FONT = '"Segoe UI","Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans JP",sans-serif';
  const el = (tag, style, text) => { const e = document.createElement(tag); Object.assign(e.style, style); if (text != null) e.textContent = text; return e; };
  const img = document.getElementById('i');
  img.remove();
  const root = el('div', { display: 'flex', alignItems: 'flex-start', width: w + panelW + 'px', font: `14px/1.5 ${FONT}`, color: '#111' });
  const shot = el('div', { position: 'relative', width: w + 'px', height: h + 'px', flex: 'none' });
  img.style.display = 'block';
  shot.appendChild(img);
  root.appendChild(shot);
  document.body.appendChild(root); // gắn vào DOM trước để đo được kích thước số (n)
  for (const m of marks) {
    const [x, y, bw, bh] = m.box;
    const c = m.pending ? '#ea580c' : color;
    shot.appendChild(el('div', { position: 'absolute', left: x - 4 + 'px', top: y - 4 + 'px', width: bw + 8 + 'px', height: bh + 8 + 'px', border: `3px ${m.pending ? 'dashed' : 'solid'} ${c}`, borderRadius: '4px', boxSizing: 'border-box' }));
    // Số (n) đặt NGOÀI khung để không che chữ trên UI: bên trái khung; hết chỗ → bên phải; hết nữa → phía trên.
    const badge = el('div', { position: 'absolute', background: c, color: '#fff', font: `700 15px/26px ${FONT}`, padding: '0 8px', borderRadius: '4px', whiteSpace: 'nowrap', boxShadow: '0 0 0 2px #fff' }, `(${m.n})`);
    shot.appendChild(badge);
    const bwid = badge.offsetWidth;
    if (x - 4 - bwid - 6 >= 0) Object.assign(badge.style, { left: x - 4 - bwid - 6 + 'px', top: Math.max(0, y - 4) + 'px' });
    else if (x + bw + 4 + 6 + bwid <= w) Object.assign(badge.style, { left: x + bw + 4 + 6 + 'px', top: Math.max(0, y - 4) + 'px' });
    else Object.assign(badge.style, { left: Math.max(0, x - 4) + 'px', top: Math.max(0, y - 34) + 'px' });
  }
  const panel = el('div', { width: panelW + 'px', minHeight: h + 'px', boxSizing: 'border-box', padding: '16px 18px', background: '#fff', borderLeft: '1px solid #d4d4d4', flex: 'none' });
  const hb = el('div', { borderBottom: `2px solid ${color}`, paddingBottom: '10px', marginBottom: '14px' });
  head.forEach((t, i) => hb.appendChild(el('div', { font: `${i === 0 ? 700 : 600} ${i === 0 ? 15 : 14}px/1.5 ${FONT}`, wordBreak: 'break-word' }, t)));
  panel.appendChild(hb);
  for (const m of marks) {
    const c = m.pending ? '#ea580c' : color;
    const box = el('div', { marginBottom: '14px' });
    box.appendChild(el('div', { color: c, font: `700 15px/1.45 ${FONT}`, marginBottom: '4px' }, `(${m.n}) ${m.pending ? '[ĐANG CHỜ CHỐT] ' : ''}${m.title}`));
    for (const l of m.lines) box.appendChild(el('div', { paddingLeft: '10px', wordBreak: 'break-word' }, l));
    if (m.source) box.appendChild(el('div', { paddingLeft: '10px', color: '#555', fontSize: '13px' }, `Nguồn: ${m.source}`));
    panel.appendChild(box);
  }
  root.appendChild(panel);
}, { head, marks, color, panelW, w, h });

const total = await page.evaluate(() => document.body.firstElementChild.getBoundingClientRect().height);
await page.setViewportSize({ width: w + panelW, height: Math.ceil(total) });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await page.locator('body > div').screenshot({ path: out });
await browser.close();
console.log(`+ ${path.resolve(out)}\n  → MỞ ẢNH XEM LẠI (khung đúng chỗ, chữ không bị cắt, số (n) khớp ghi chú) trước khi đính kèm.`);
