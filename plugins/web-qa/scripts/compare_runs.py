#!/usr/bin/env python3
"""Verify bug đã fix + phát hiện bug mới (regression) bằng cách so tracker export với lần chạy lại.

Usage:
  python3 compare_runs.py --tracker tracker-export.json --rerun runs/<new>/bugs.json [--pages news,top]

tracker-export.json: file "Export JSON" tải từ Bug Tracker (có code, key, status, source).
Output (cạnh --rerun):
  verify.json          — {"updates": [...], "newBugs": [...]} → import lại vào Tracker
  verify_report.md     — báo cáo đọc nhanh
Quy tắc:
  status fixed  + key còn lỗi      → reopened  (kèm giá trị thực tế mới)
  status fixed  + key hết lỗi      → verified — CHỈ khi lần chạy lại đã kiểm lại đúng chỗ đó
                                     (cùng nguồn + trang + viewport + browser, element/check còn được đo).
                                     Không phủ (browser không mở được, bỏ bước CMS/flow, check bị blocked…)
                                     → giữ fixed, liệt kê ở "Chưa verify được" kèm lý do.
  status closed/verified + key lỗi lại → reopened (regression)
  bug do tester tạo (chrome/manual) → liệt kê để tester verify bằng Claude in Chrome
  key mới chưa có trong tracker     → newBugs (bug phát sinh sau khi dev sửa)
"""
import argparse, json, os, sys
for _s in (sys.stdout, sys.stderr):  # console Windows (cp1252/cp932) không in được tiếng Việt
    _s.reconfigure(encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("--tracker", required=True)
ap.add_argument("--rerun", required=True)
ap.add_argument("--pages", help="Chỉ xét các page này (khi chạy lại một phần)")
ap.add_argument("--chrome-results", help="chrome_results.json của Pha 2 (kết quả verify bug manual/chrome)")
a = ap.parse_args()

tracker = json.load(open(a.tracker, encoding="utf-8"))
tbugs = tracker["bugs"] if isinstance(tracker, dict) else tracker
rerun = json.load(open(a.rerun, encoding="utf-8"))
pages = set(a.pages.split(",")) if a.pages else {b["page"] for b in rerun["bugs"]} | {b.get("page") for b in tbugs}
now = {b["key"]: b for b in rerun["bugs"] if b.get("source") == "auto"}
known = {b["key"] for b in tbugs}

cov = rerun.get("coverage")


def infer_check(b):
    """Bug cũ (trước khi có field check) → đoán nguồn từ prop/type/group."""
    if b.get("prop") == "flow" or b.get("type") == "logic":
        src = "flow"
    elif b.get("type") == "cms":
        src = "cms"
    elif b.get("group") == "responsive":
        src = "responsive"
    else:
        src = "measure"
    vps = {"common": ["sp", "pc"], "sp": ["sp"], "pc": ["pc"]}.get(b.get("group"), [])
    return {"source": src, "page": b.get("page"), "widths": b.get("viewports", []), "browsers": b.get("browsers", []),
            "runs": [[v, br] for v in vps for br in b.get("browsers", [])]}


def not_covered(b):
    """None nếu lần chạy lại đã kiểm lại đúng chỗ của bug; ngược lại trả lý do."""
    if cov is None:
        return "bugs.json của lần chạy lại không có coverage (make_bugs.py bản cũ) — chạy lại make_bugs.py"
    c = b.get("check") or infer_check(b)
    src, page = c.get("source"), c.get("page")
    mine = [x for x in cov if x.get("source") == src and x.get("page") == page]
    if not mine:
        return f"lần chạy lại không chạy {src} cho trang {page}"
    if src == "cms":
        return None
    if src == "responsive":
        widths = {w for x in mine for w in x.get("widths", [])}
        brs = {br for x in mine for br in x.get("browsers", [])}
        miss_b = sorted(set(c.get("browsers", [])) - brs)
        miss_w = sorted(set(c.get("widths", [])) - widths)
        if miss_b:
            return f"responsive chưa chạy được trên {', '.join(miss_b)}"
        if miss_w:
            return f"responsive chưa quét width {', '.join(map(str, miss_w[:5]))}{'…' if len(miss_w) > 5 else ''}"
        return None
    for vp, br in c.get("runs", []):
        runs = [x for x in mine if x.get("viewportName") == vp and x.get("browser") == br]  # flow riêng + page_checks
        if not runs:
            return f"{src} chưa chạy {vp.upper()} trên {br}"
        if src == "measure" and c.get("element") and not any(c["element"] in x.get("elements", []) for x in runs):
            return f"element {c['element']} không còn trong spec / không đo được ({vp.upper()}, {br})"
        if src == "flow" and not any(b["key"] in x.get("passed", []) for x in runs):
            return f"check không pass ở {vp.upper()}, {br} (bị blocked/needs-chrome hoặc không còn trong flow)"
    return None


updates, manual, still_open, unverified = [], [], [], []
for b in tbugs:
    if b.get("page") not in pages:
        continue
    st = b.get("status")
    if b.get("source") != "auto":
        if st == "fixed":
            manual.append(b)
        continue
    hit = now.get(b["key"])
    if st == "fixed":
        if hit:
            updates.append({"key": b["key"], "status": "reopened", "comment": f"Verify NG — vẫn lỗi.\n{hit.get('actual','')}"})
        elif (why := not_covered(b)) is None:
            updates.append({"key": b["key"], "status": "verified", "comment": "Verify OK — chạy lại tự động không còn lỗi."})
        else:
            unverified.append((b, why))
    elif st in ("verified", "closed") and hit:
        updates.append({"key": b["key"], "status": "reopened", "comment": f"Regression — lỗi xuất hiện lại.\n{hit.get('actual','')}"})
    elif st in ("open", "new", "reopened", "in-progress") and hit:
        still_open.append(b)

# Pha 2: verify tasks done in Claude in Chrome
if a.chrome_results and os.path.exists(a.chrome_results):
    cr = json.load(open(a.chrome_results, encoding="utf-8"))
    done = set()
    for t in cr.get("results", []):
        if t.get("bugKey") and t.get("status") in ("pass", "fail"):
            st = "verified" if t["status"] == "pass" else "reopened"
            updates.append({"key": t["bugKey"], "status": st, "comment": f"Verify trên Chrome {'OK' if st == 'verified' else 'NG'}. {t.get('note', '')}".strip()})
            done.add(t["bugKey"])
    manual = [b for b in manual if b["key"] not in done]

new_bugs = [b for k, b in now.items() if k not in known]
for m in rerun["bugs"]:
    if m.get("source") != "auto" and m["key"] not in known:
        new_bugs.append(m)

base = os.path.dirname(a.rerun)
json.dump({"project": rerun.get("project"), "bugPrefix": rerun.get("bugPrefix"), "run": rerun.get("run"),
           "updates": updates, "bugs": new_bugs}, open(os.path.join(base, "verify.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

code = {b["key"]: b.get("code", b["key"]) for b in tbugs}
md = [f"# Verify report — run {rerun.get('run')}", "",
      f"- Verified OK: **{sum(u['status']=='verified' for u in updates)}**",
      f"- Reopened (fix chưa đạt / regression): **{sum(u['status']=='reopened' for u in updates)}**",
      f"- Chưa verify được (lần chạy lại không kiểm lại chỗ đó, giữ `fixed`): **{len(unverified)}**",
      f"- Bug tester tạo đang `fixed` → tester verify bằng Claude in Chrome: **{len(manual)}**",
      f"- Bug mới phát sinh: **{len(new_bugs)}**",
      f"- Vẫn đang mở (dev chưa fix): {len(still_open)}", ""]
md.append("## Reopened")
md += [f"- {code[u['key']]}: {u['comment'].splitlines()[0]}" for u in updates if u["status"] == "reopened"] or ["- (không)"]
md.append("\n## Chưa verify được — chạy bổ sung rồi so lại")
md += [f"- {b.get('code', b['key'])}: {b.get('title')} — {why}" for b, why in unverified] or ["- (không)"]
md.append("\n## Chuyển tester verify (Claude in Chrome)")
md += [f"- {b.get('code')}: {b.get('title')} — {b.get('path')}" for b in manual] or ["- (không)"]
md.append("\n## Bug mới")
md += [f"- [{b.get('group')}/{b.get('severity')}] {b.get('page')} · {b.get('title')}" for b in new_bugs] or ["- (không)"]
open(os.path.join(base, "verify_report.md"), "w", encoding="utf-8").write("\n".join(md))
print("\n".join(md[:8]))
