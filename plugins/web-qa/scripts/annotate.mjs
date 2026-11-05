#!/usr/bin/env node
// Ảnh bug website: ảnh gốc + KHUNG ĐỎ quanh từng chỗ sai + ghi MONG MUỐN ngay bên cạnh khung. Không thêm thông tin nào khác.
// (Khác app-qa: không có cột tiêu đề, không có "hiện tại", nguồn… — bug trên Tracker đã có các thông tin đó.)
// Chỉ khoanh chỗ chắc chắn là bug.
//
//   node annotate.mjs --spec <mark.json> [--check]
// mark.json:
// { "in": "runs/x/upload/abc.png", "out": "runs/x/upload/abc_FAIL.png",
//   "marks": [{ "box": [x, y, w, h], "note": ["font-size: 16px", "line-height: 24px"] },
//             { "box": [x, y, w, h], "note": "Hiển thị 「お知らせ一覧」" }] }
// Nhãn đặt bên phải khung; hết chỗ thì bên trái, rồi bên dưới. Nhãn ra ngoài ảnh thì nền ảnh được nới thêm (trắng).
// Dùng trong script khác: import { renderMark } from './annotate.mjs'; await renderMark(browser, spec)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, launch } from './lib.mjs';

const noteLines = (n) => [].concat(n ?? []).map(String).filter((s) => s.trim());

/** Kiểm quy tắc. Trả về { errs, warns }. */
export function checkMark(S) {
  const errs = [], warns = [];
  if (!S.in || !fs.existsSync(S.in)) errs.push(`"in" không tồn tại: ${S.in}`);
  if (!(S.marks || []).length) errs.push('Cần ít nhất 1 mục trong "marks"');
  (S.marks || []).forEach((m, i) => {
    const t = `(${i + 1})`;
    if (!Array.isArray(m.box) || m.box.length !== 4 || !m.box.every(Number.isFinite)) errs.push(`${t} box phải là [x, y, w, h]`);
    if (!noteLines(m.note).length) errs.push(`${t} thiếu "note" (mong muốn ghi cạnh khung)`);
  });
  if (S.out && S.in && path.resolve(S.out) === path.resolve(S.in)) errs.push('"out" trùng ảnh gốc — không ghi đè ảnh gốc');
  return { errs, warns };
}

/** Vẽ ảnh bug từ spec. Dùng browser Playwright có sẵn. Trả về đường dẫn out. */
export async function renderMark(browser, S) {
  const out = S.out || S.in.replace(/(\.raw)?\.png$/i, '_FAIL.png');
  const marks = S.marks.filter((m) => Array.isArray(m.box)).map((m) => ({ box: m.box, lines: noteLines(m.note) }));
  const b64 = fs.readFileSync(S.in).toString('base64');
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="c" style="position:relative;display:inline-block;background:#fff"><img id="i" src="data:image/png;base64,${b64}" style="display:block"></div></body>`);
    await page.waitForFunction(() => document.getElementById('i').complete);
    const { w, h } = await page.evaluate(() => ({ w: document.getElementById('i').naturalWidth, h: document.getElementById('i').naturalHeight }));
    await page.setViewportSize({ width: w + 800, height: h + 400 });
    const size = await page.evaluate(({ marks, w, h }) => {
      const RED = '#dc2626', FONT = '"Segoe UI","Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans JP",sans-serif';
      const C = document.getElementById('c');
      const el = (style, text) => { const e = document.createElement('div'); Object.assign(e.style, { position: 'absolute', ...style }); if (text != null) e.textContent = text; C.appendChild(e); return e; };
      let maxR = w, maxB = h;
      for (const { box: [x, y, bw, bh], lines } of marks) {
        el({ left: x - 4 + 'px', top: y - 4 + 'px', width: bw + 8 + 'px', height: bh + 8 + 'px', border: `3px solid ${RED}`, borderRadius: '4px', boxSizing: 'border-box' });
        const L = el({ background: '#fff', color: RED, border: `2px solid ${RED}`, borderRadius: '4px', padding: '4px 8px', font: `700 14px/1.45 ${FONT}`, whiteSpace: 'pre', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }, lines.join('\n'));
        const lw = L.offsetWidth, lh = L.offsetHeight;
        let left, top = Math.max(0, y - 4);
        if (x + bw + 10 + lw <= w) left = x + bw + 10;            // phải (trong ảnh)
        else if (x - 10 - lw >= 0) left = x - 10 - lw;            // trái (trong ảnh)
        else if (y + bh + 10 + lh <= h) { left = Math.max(0, Math.min(x - 4, w - lw)); top = y + bh + 10; } // dưới
        else left = x + bw + 10;                                  // phải, nới nền ảnh
        Object.assign(L.style, { left: left + 'px', top: top + 'px' });
        maxR = Math.max(maxR, left + lw + 8); maxB = Math.max(maxB, top + lh + 8);
      }
      Object.assign(C.style, { width: maxR + 'px', height: maxB + 'px' });
      return { width: Math.ceil(maxR), height: Math.ceil(maxB) };
    }, { marks, w, h });
    await page.setViewportSize(size);
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    await page.locator('#c').screenshot({ path: out });
  } finally { await page.close(); }
  return out;
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs();
  if (!a.spec || !fs.existsSync(a.spec)) { console.error('Cần --spec <mark.json> (mẫu ở đầu annotate.mjs)'); process.exit(1); }
  const S = readJson(a.spec);
  const dir = path.dirname(path.resolve(a.spec));
  const rel = (p) => (p && !path.isAbsolute(p) && !fs.existsSync(p) ? path.join(dir, p) : p);
  S.in = rel(S.in); if (S.out) S.out = rel(S.out);
  const { errs, warns } = checkMark(S);
  for (const w of warns) console.log(`WARN ${w}`);
  for (const e of errs) console.log(`FAIL ${e}`);
  if (errs.length) process.exit(1);
  if (a.check) { console.log('OK   spec hợp lệ'); process.exit(0); }
  const browser = await launch('chromium');
  const out = await renderMark(browser, S);
  await browser.close();
  console.log(`+ ${path.resolve(out)}\n  → mở ảnh xem lại (khung đúng chỗ, nhãn không che chỗ sai).`);
}
