#!/usr/bin/env python3
"""Ghi kết quả test vào file checklist Excel (giữ nguyên format gốc, xuất file mới *_result.xlsx).
Mục chưa kiểm được để TRỐNG và được liệt kê vào *_result_tester-prompt.md để tester cho Claude in Chrome kiểm nốt.

Usage:
  python3 update_checklist.py --checklist Checklist.xlsx --mapping checklist-map.json --results checklist-results.json [--out out.xlsx] [--run runs/<id>]
  python3 update_checklist.py --checklist Checklist.xlsx --inspect          # in cấu trúc sheet để dựng mapping

checklist-map.json (mỗi dự án 1 lần):
{
  "sheets": ["TOP", "News"],             # sheet cần ghi (bỏ trống = tất cả)
  "headerRow": 5,                         # dòng tiêu đề
  "idCol": "A",                           # cột No./ID của item (tuỳ chọn)
  "itemCol": "C",                         # cột nội dung item (dùng để khớp nếu không có ID)
  "contextCols": ["B"],                   # cột ngữ cảnh đưa vào prompt tester (màn hình, khu vực…)
  "resultCols": {"chromium": "H", "msedge": "I", "webkit": "J"},   # hoặc {"all": "H"}
  "bugCol": "K", "noteCol": "L", "dateCol": "M", "testerCol": "N",
  "okText": "OK", "ngText": "NG", "naText": "NA"
}
checklist-results.json:
[{"sheet": "TOP", "row": 12, "status": "NG", "browsers": ["webkit"], "note": "..."},
 {"sheet": "News", "id": "N-03", "status": "OK"},
 {"sheet": "News", "id": "N-20", "status": "NA", "note": "Trang không có form"}]
  status: OK | NG | NA. Không ghi mã bug vào checklist (bug nằm trên Tracker); field "bugs" chỉ dùng nếu dự án yêu cầu.
  NA = trang được test không có chức năng/khối đó. Trang có nhưng chưa kiểm được → không đưa vào results (ô để trống).
"""
import argparse, datetime, json, os, sys
for _s in (sys.stdout, sys.stderr):  # console Windows (cp1252/cp932) không in được tiếng Việt
    _s.reconfigure(encoding="utf-8", errors="replace")
from openpyxl import load_workbook
from openpyxl.styles import PatternFill
from openpyxl.utils import column_index_from_string

FILL = {"OK": PatternFill("solid", fgColor="D9F2E3"), "NG": PatternFill("solid", fgColor="FBD5D5"), "NA": PatternFill("solid", fgColor="EEEEEE")}

ap = argparse.ArgumentParser()
ap.add_argument("--checklist", help="mặc định: qa-config.json → checklist.file")
ap.add_argument("--mapping", help="mặc định: qa-config.json → checklist.mapping")
ap.add_argument("--results")
ap.add_argument("--out")
ap.add_argument("--tester", default=os.environ.get("QA_TESTER", "EVN QA"))
ap.add_argument("--inspect", action="store_true")
ap.add_argument("--config", default="qa-config.json", help="để lấy baseUrl / link Tracker cho prompt tester")
ap.add_argument("--run", help="runs/<id> — thêm các flow needs-chrome/blocked vào prompt tester")
a = ap.parse_args()
_cfg = json.load(open(a.config, encoding="utf-8")).get("checklist", {}) if os.path.exists(a.config) else {}
a.checklist = a.checklist or _cfg.get("file")
a.mapping = a.mapping or _cfg.get("mapping")
if not a.checklist:
    raise SystemExit("Thiếu --checklist hoặc qa-config.json → checklist.file")
if not a.out and a.run and not a.inspect:
    a.out = os.path.join(a.run, os.path.basename(a.checklist).replace(".xlsx", "_result.xlsx"))

wb = load_workbook(a.checklist)
if a.inspect:
    for ws in wb.worksheets:
        print(f"=== {ws.title!r} ({ws.max_row}x{ws.max_column})")
        for r in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 15)):
            vals = [f"{c.coordinate}={str(c.value)[:25]}" for c in r if c.value not in (None, "")]
            if vals:
                print("  " + " | ".join(vals))
    raise SystemExit

m = json.load(open(a.mapping, encoding="utf-8"))
results = json.load(open(a.results, encoding="utf-8"))
ok, ng, na = m.get("okText", "OK"), m.get("ngText", "NG"), m.get("naText", "NA")
col = lambda letter: column_index_from_string(letter)
today = datetime.date.today().strftime("%Y/%m/%d")

index = {}  # (sheet, id or item text) -> row
for ws in wb.worksheets:
    if m.get("sheets") and ws.title.strip() not in [s.strip() for s in m["sheets"]]:
        continue
    for r in range(m.get("headerRow", 1) + 1, ws.max_row + 1):
        for k in ("idCol", "itemCol"):
            if m.get(k):
                v = ws.cell(r, col(m[k])).value
                if v not in (None, ""):
                    index[(ws.title.strip(), str(v).strip())] = r

# Mục checklist có nhánh logic chưa phủ / chưa kiểm xong (logic_coverage.py) → không được điền OK
blocked = set()
if a.run:
    import glob as _g
    for f in _g.glob(os.path.join(a.run, "logic.*.json")):
        for c in json.load(open(f, encoding="utf-8")).get("checklistBlocked", []):
            blocked.add((str(c.get("sheet", "")).strip(), str(c.get("row") or c.get("id") or "").strip()))

written, missing, held_ok = 0, [], []
for res in results:
    sheet = next((w for w in wb.worksheets if w.title.strip() == res["sheet"].strip()), None)
    if sheet is None:
        missing.append(res); continue
    row = res.get("row") or index.get((sheet.title.strip(), str(res.get("id", res.get("item", ""))).strip()))
    if not row:
        missing.append(res); continue
    if res["status"].upper() == "OK" and ({(sheet.title.strip(), str(row)), (sheet.title.strip(), str(res.get("id", "")).strip())} & blocked):
        held_ok.append(res); continue  # để trống: còn nhánh logic chưa phủ → tester kiểm nốt
    status = {"OK": ok, "NG": ng, "NA": na, "N/A": na}.get(res["status"].upper(), res["status"])
    skey = "NA" if res["status"].upper() in ("NA", "N/A") else res["status"].upper()
    fill = FILL.get(skey)
    rc = m["resultCols"]
    targets = [rc["all"]] if "all" in rc else [rc[b] for b in rc]
    for letter in targets:
        b = next((k for k, v in rc.items() if v == letter), "all")
        st = status
        # NG chỉ ghi vào cột browser bị lỗi; các browser khác OK
        if res["status"].upper() == "NG" and res.get("browsers") and b != "all" and b not in res["browsers"]:
            st, f = ok, FILL["OK"]
        else:
            f = fill
        c = sheet.cell(row, col(letter)); c.value = st
        if f: c.fill = f
    if m.get("bugCol") and res.get("bugs"):
        sheet.cell(row, col(m["bugCol"])).value = ", ".join(res["bugs"])
    if m.get("noteCol") and res.get("note"):
        sheet.cell(row, col(m["noteCol"])).value = res["note"]
    if m.get("dateCol"):
        sheet.cell(row, col(m["dateCol"])).value = today
    if m.get("testerCol"):
        sheet.cell(row, col(m["testerCol"])).value = a.tester
    written += 1

out = a.out or a.checklist.replace(".xlsx", "_result.xlsx")
wb.save(out)
print(f"[checklist] ghi {written} dòng → {out}")
if missing:
    print(f"[checklist] {len(missing)} kết quả không khớp dòng nào:")
    for x in missing[:20]:
        print("   ", x)
if held_ok:
    print(f"[checklist] {len(held_ok)} mục OK bị để trống vì còn nhánh logic chưa phủ (logic.<page>.md):")
    for x in held_ok[:20]:
        print("   ", x)

# ---------- Mục còn trống → prompt bàn giao cho tester (Claude in Chrome) ----------
remaining = []
rc_letters = list(m["resultCols"].values())
for ws in wb.worksheets:
    if m.get("sheets") and ws.title.strip() not in [s.strip() for s in m["sheets"]]:
        continue
    for r in range(m.get("headerRow", 1) + 1, ws.max_row + 1):
        item = ws.cell(r, col(m["itemCol"])).value if m.get("itemCol") else None
        if item in (None, ""):
            continue
        if any(ws.cell(r, col(L)).value not in (None, "") for L in rc_letters):
            continue
        ctx = [str(ws.cell(r, col(c)).value) for c in m.get("contextCols", []) if ws.cell(r, col(c)).value not in (None, "")]
        rid = ws.cell(r, col(m["idCol"])).value if m.get("idCol") else None
        remaining.append({"sheet": ws.title.strip(), "row": r, "id": rid, "context": " / ".join(ctx), "item": str(item).strip()})

cfg = json.load(open(a.config, encoding="utf-8")) if a.config and os.path.exists(a.config) else {}
extra = []
if a.run:
    import glob
    for f in glob.glob(os.path.join(a.run, "flow.*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for c in d.get("checks", []):
            if c.get("status") in ("blocked", "needs-chrome"):
                extra.append(f"- {d['page']} ({d['path']}): {c['name']} — {c.get('reason', '')}")
    # nhánh logic chưa phủ / cần tester / cần hỏi designer (logic_coverage.py)
    for f in glob.glob(os.path.join(a.run, "logic.*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for x in d.get("rows", []):
            if x["status"] == "manual":
                extra.append(f"- {d['page']}: [{x['branch']}] {x['ruleTitle']} — khi {x['when']} → {x['expected']} ({x.get('detail', '')})")
            elif x["status"] in ("no-seed", "no-check"):
                extra.append(f"- {d['page']}: [{x['branch']}] {x['ruleTitle']} — khi {x['when']} → {x['expected']} (tự động chưa phủ: {x.get('detail', '')})")
    extra = sorted(set(extra))

browsers = [b for b in m["resultCols"] if b != "all"]
lines = [
    f"# Kiểm nốt checklist — {cfg.get('project', '')}",
    "",
    "Bạn là Claude in Chrome, hỗ trợ tester kiểm nốt các mục checklist mà bước tự động (VS Code/Playwright) chưa kiểm được.",
    "",
    "## Thông tin",
    f"- Site test: {cfg.get('baseUrl', '(điền)')}",
    f"- Bug Tracker: {(cfg.get('tracker') or {}).get('url', '(điền)')}",
    f"- Checklist: {os.path.basename(out)} — chỉ các dòng dưới đây (cột kết quả đang trống)",
    f"- Bước tự động đã chạy lúc: {datetime.datetime.now().strftime('%Y/%m/%d %H:%M')} — nếu site đã deploy lại sau thời điểm này, báo tester trước khi test",
    "",
    "## Quy tắc",
    "1. Chỉ kiểm các mục trong danh sách. Mỗi mục: mở trang, thao tác theo nội dung mục, so với Figma/spec, kết luận OK / NG / NA (NA = trang không có chức năng/khối đó).",
    "2. Trước khi bắt đầu, hỏi tester 1 lần: form nào được gửi thật và email test nào; có được thao tác CMS admin không; tab Gmail/Outlook nào để kiểm mail.",
    "3. Gặp màn hình đăng nhập, OTP, CAPTCHA: dừng lại, nhờ tester tự làm rồi tiếp tục. Không tự nhập mật khẩu.",
    "4. Không gửi form, không sửa/xoá dữ liệu CMS, không gửi mail ngoài phạm vi tester đã cho phép.",
    "5. Cửa sổ Chrome không thu nhỏ dưới khoảng 500px: mục chỉ kiểm được ở SP 375px thì ghi \"cần kiểm SP bằng DevTools/thiết bị\" thay vì đoán.",
    "6. Mục NG: mở Bug Tracker → \"+ Bug\", chọn Kiểm bằng = Claude in Chrome, điền bằng tiếng Việt: tiêu đề ngắn, trang, mong đợi / thực tế / cách tái hiện, đính kèm ảnh chụp. Checklist chỉ ghi NG, không ghi mã bug.",
    "   Mức độ: high = chặn chức năng / sai dữ liệu; medium = sai design/spec dễ thấy nhưng vẫn dùng được; low = lệch nhỏ, thẩm mỹ, tối ưu.",
    "   Môi trường: chỉ điền khi lỗi riêng 1 môi trường (browser + version, OS, thiết bị), vd \"Safari 18.2 · iPhone 15 (iOS 18.2)\".",
    "   Lỗi animation/thao tác: quay GIF đính kèm.",
    f"7. Ghi kết quả: nếu checklist đang mở trên trình duyệt (Excel Online / Google Sheets) thì điền thẳng vào cột kết quả ({', '.join(browsers) or 'kết quả'}), ngày, người test (không ghi mã bug); nếu không, cuối cùng trả bảng: Sheet | Dòng | ID | Kết quả | Ghi chú để tester dán vào.",
    "8. Chưa kiểm được thì để trống và ghi lý do. Không đánh OK cho mục chưa thực sự kiểm.",
    "",
    f"## Mục cần kiểm ({len(remaining)})",
]
cur = None
for x in remaining:
    if x["sheet"] != cur:
        cur = x["sheet"]
        lines += ["", f"### Sheet: {cur}"]
    lines.append(f"- [ ] Dòng {x['row']}" + (f" · {x['id']}" if x["id"] else "") + (f" · {x['context']}" if x["context"] else "") + f" — {x['item']}")
if extra:
    lines += ["", "## Ghi chú từ bước tự động (không tự động hoá được)", *extra]
rem_path = out.replace(".xlsx", "_tester-prompt.md")
open(rem_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(f"[checklist] còn trống {len(remaining)} mục → {rem_path}")
