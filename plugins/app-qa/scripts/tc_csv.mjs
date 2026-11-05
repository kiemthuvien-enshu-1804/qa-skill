#!/usr/bin/env node
// Kiểm / tra cứu file TestCase CSV (template "CSV Import Template for Docs - Test Case Text").
//   node tc_csv.mjs check <file.csv> [--template <template.csv>] [--rules R01,R02,...]   → lỗi định dạng + rule chưa có TC
//   node tc_csv.mjs list  <file.csv>                                                    → TC ID / Priority / Tên
//   node tc_csv.mjs trace <file.csv>                                                    → ma trận Rule → TC (từ cột Remarks "Rule: R01, R02")
//   node tc_csv.mjs stats <file.csv>                                                    → số TC theo Priority / Module, số ảnh dự kiến
// Exit 1 nếu check có lỗi.
import fs from 'node:fs';
import { parseArgs, list, parseCsv, die } from './lib.mjs';

const args = parseArgs();
const [cmd, file] = args._;
if (!file || !fs.existsSync(file)) die('Usage: tc_csv.mjs check|list|trace|stats <file.csv>');
const raw = fs.readFileSync(file, 'utf8');
const { head, rows } = parseCsv(raw);
const DEFAULT_HEAD = ['Test Case ID', 'Test Case Name', 'Feature ID', 'Feature Name', 'Module', 'Priority', 'Pre-Condition', 'Steps', 'Expected Result', 'Actual Result', 'Status', 'Date Tested', 'Tested By', 'Remarks'];
// Mã rule nằm sau "Rule:" tới dấu "|" — tiền tố tuỳ module (R01, E08, P04, K04…).
const rulesOf = (r) => {
  const m = String(r.Remarks || '').match(/Rule\s*:\s*([^|\n]*)/i);
  return m ? [...new Set([...m[1].matchAll(/\b[A-Z]{1,4}\d{2,3}[a-z]?\b/g)].map((x) => x[0]))] : [];
};
const stepCount = (s) => String(s || '').split(/\r?\n/).filter((l) => /^\s*\d+[.)]/.test(l)).length || (String(s).trim() ? 1 : 0);

if (cmd === 'list') { for (const r of rows) console.log(`${r['Test Case ID']}\t${r.Priority}\t${r['Test Case Name']}`); process.exit(0); }

if (cmd === 'trace') {
  const m = new Map();
  for (const r of rows) for (const rule of rulesOf(r)) m.set(rule, [...(m.get(rule) || []), r['Test Case ID']]);
  const keys = [...m.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  console.log('| Mã rule | TC cover |\n| --- | --- |');
  for (const k of keys) console.log(`| ${k} | ${m.get(k).join(', ')} |`);
  process.exit(0);
}

if (cmd === 'stats') {
  const by = (k) => rows.reduce((a, r) => ((a[r[k] || '-'] = (a[r[k] || '-'] || 0) + 1), a), {});
  console.log(`Tổng TC: ${rows.length} · Ảnh dự kiến (1 ảnh/TC): ${rows.length}`);
  console.log('Priority:', JSON.stringify(by('Priority')));
  console.log('Module:', JSON.stringify(by('Module')));
  console.log(`Bước trung bình: ${(rows.reduce((a, r) => a + stepCount(r.Steps), 0) / (rows.length || 1)).toFixed(1)}`);
  process.exit(0);
}

if (cmd !== 'check') die('Lệnh: check | list | trace | stats');
const errs = [], warns = [];
if (!raw.startsWith('﻿')) warns.push('File không có UTF-8 BOM — Excel/TestRail có thể đọc sai tiếng Việt/Nhật');
let tplHead = DEFAULT_HEAD;
if (args.template && fs.existsSync(args.template)) tplHead = parseCsv(fs.readFileSync(args.template, 'utf8')).head;
if (head.join('|') !== tplHead.join('|')) errs.push(`Header khác template:\n  có:   ${head.join(', ')}\n  cần:  ${tplHead.join(', ')}`);
const seen = new Map();
for (const [i, r] of rows.entries()) {
  const id = r['Test Case ID'], at = `dòng ${i + 2} (${id || '?'})`;
  if (!id) errs.push(`${at}: thiếu Test Case ID`);
  else if (seen.has(id)) errs.push(`${at}: trùng ID với dòng ${seen.get(id)}`);
  else seen.set(id, i + 2);
  if (!r['Test Case Name']) errs.push(`${at}: thiếu Test Case Name`);
  if (!/^P[1-3]$/.test(r.Priority || '')) errs.push(`${at}: Priority phải là P1/P2/P3 (đang: "${r.Priority}")`);
  const n = stepCount(r.Steps);
  if (!n) errs.push(`${at}: thiếu Steps`);
  else if (n > 6) errs.push(`${at}: ${n} bước — tối đa 6 bước/case`);
  if (!String(r['Expected Result'] || '').trim()) errs.push(`${at}: thiếu Expected Result`);
  if (/hệ thống xử lý đúng|hoạt động bình thường|hiển thị đúng\s*$/i.test(r['Expected Result'] || '')) warns.push(`${at}: Expected chung chung — ghi cụ thể message / giá trị`);
  if (!rulesOf(r).length && !/^COMMON/i.test(id)) warns.push(`${at}: Remarks chưa ghi "Rule: Rxx" — không truy vết được`);
  for (const k of ['Actual Result', 'Status', 'Date Tested', 'Tested By']) if (String(r[k] || '').trim()) warns.push(`${at}: cột "${k}" nên để trống khi thiết kế (kết quả ghi ở TestRail)`);
}
const want = list(args.rules);
if (want.length) {
  const covered = new Set(rows.flatMap(rulesOf));
  const miss = want.filter((r) => !covered.has(r));
  if (miss.length) errs.push(`Rule chưa có TC cover: ${miss.join(', ')} (nếu cố ý → giải thích ở Phần D)`);
}
for (const w of warns) console.log('WARN ' + w);
for (const e of errs) console.log('FAIL ' + e);
console.log(`\n${rows.length} TC · ${errs.length} lỗi · ${warns.length} cảnh báo`);
process.exit(errs.length ? 1 : 0);
