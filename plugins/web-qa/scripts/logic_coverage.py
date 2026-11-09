#!/usr/bin/env python3
"""Độ phủ logic: mỗi nhánh (if / else / biên) của quy tắc trong specs/<page>.logic.json phải có dữ liệu seed + check.

  python logic_coverage.py --page news --run runs/<id> [--logic specs/news.logic.json] [--seed-dir cms-seed]

Đọc:
  specs/<page>.logic.json          quy tắc + nhánh (Claude bóc từ Figma comment / checklist, xem qa-logic-flow mục 0)
  cms-seed/*.applied.json          bài seed đã tạo (key, ok)
  <run>/flow.<page>.*.json         check flow: tên check chứa "[<id nhánh>]"
  <run>/cms.<page>.json            nhánh dùng "check": "cms:<prop>" (vd cms:cms-order)
Ghi:
  <run>/logic.<page>.json + .md    trạng thái từng nhánh + tổng hợp; dùng cho checklist và prompt tester

Trạng thái nhánh:
  pass / fail         có dữ liệu (hoặc noSeed) + check chạy xong ở mọi viewport/browser đã chạy
  no-seed             thiếu bài seed (chưa khai báo, chưa --apply, hoặc PUT lỗi)
  no-check            chưa có check nào mang id nhánh
  manual              tester kiểm (needs-chrome / blocked) hoặc nhánh khai báo "manual"
  ask                 cần hỏi designer / khách (comment mơ hồ, mâu thuẫn)
"""
import argparse, glob, json, os, sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ap = argparse.ArgumentParser()
ap.add_argument("--page", required=True)
ap.add_argument("--run", required=True)
ap.add_argument("--logic")
ap.add_argument("--seed-dir", default="cms-seed")
a = ap.parse_args()

logic_path = a.logic or f"specs/{a.page}.logic.json"
if not os.path.exists(logic_path):
    sys.exit(f"Không có {logic_path} — bóc quy tắc từ Figma comment trước (qa-logic-flow mục 0)")
L = json.load(open(logic_path, encoding="utf-8"))

# ---- seed đã tạo
seeded = {}
for f in glob.glob(os.path.join(a.seed_dir, "*.applied.json")):
    d = json.load(open(f, encoding="utf-8"))
    for it in d.get("items", []):
        seeded[it["key"]] = {"ok": bool(it.get("ok")), "label": it.get("label"), "file": os.path.basename(f), "status": it.get("status")}

# ---- check flow
checks = []
for f in glob.glob(os.path.join(a.run, f"flow.{a.page}.*.json")):
    d = json.load(open(f, encoding="utf-8"))
    checks += d.get("checks", [])
cms_file = os.path.join(a.run, f"cms.{a.page}.json")
cms = json.load(open(cms_file, encoding="utf-8")) if os.path.exists(cms_file) else None


def check_status(bid, spec):
    if isinstance(spec, str) and spec.startswith("cms:"):
        if not cms:
            return "no-check", f"chưa chạy cms_check ({cms_file})", []
        prop = spec[4:]
        bad = [x for x in cms.get("findings", []) if x.get("prop") == prop]
        return ("fail" if bad else "pass"), (bad[0].get("label", "") if bad else ""), []
    mine = [c for c in checks if f"[{bid}]" in c.get("name", "")]
    if not mine:
        return "no-check", "", []
    sts = {c.get("status") for c in mine}
    runs = sorted({f"{c.get('viewportName')}/{c.get('browser')}" for c in mine})
    if "fail" in sts:
        c = next(c for c in mine if c.get("status") == "fail")
        return "fail", c.get("actual", ""), runs
    if sts & {"needs-chrome", "blocked"}:
        c = next(c for c in mine if c.get("status") in ("needs-chrome", "blocked"))
        return "manual", c.get("reason", ""), runs
    if sts == {"na"}:
        return "na", next((c.get("reason", "") for c in mine), ""), runs
    return "pass", "", runs


rows = []
for r in L.get("rules", []):
    for b in r.get("branches", []):
        bid = b["id"]
        row = {"rule": r["id"], "ruleTitle": r.get("title", ""), "branch": bid, "when": b.get("when", ""), "expected": b.get("expected", ""),
               "checklist": b.get("checklist") or r.get("checklist") or [], "source": r.get("source", {})}
        if b.get("ask") or r.get("ask"):
            row.update(status="ask", detail=b.get("ask") or r.get("ask"))
            rows.append(row); continue
        if b.get("manual"):
            row.update(status="manual", detail=f"{b['manual']}: {b.get('reason', '')}")
            rows.append(row); continue
        # dữ liệu
        need = b.get("seed") or []
        need = [need] if isinstance(need, str) else need
        if not need and not b.get("noSeed"):
            row.update(status="no-seed", detail="chưa khai báo bài seed (hoặc noSeed + lý do)")
            rows.append(row); continue
        missing = [k for k in need if not seeded.get(k, {}).get("ok")]
        if missing:
            row.update(status="no-seed", detail="chưa tạo / tạo lỗi: " + ", ".join(missing))
            rows.append(row); continue
        row["seedLabels"] = [seeded[k]["label"] for k in need if seeded.get(k)]
        st, detail, runs = check_status(bid, b.get("check"))
        row.update(status=st, detail=detail, runs=runs)
        rows.append(row)

ORDER = ["fail", "no-seed", "no-check", "ask", "manual", "na", "pass"]
summary = {s: sum(1 for x in rows if x["status"] == s) for s in ORDER}
out = {"page": a.page, "logic": logic_path, "branches": len(rows), "summary": summary, "rows": rows,
       # mục checklist có nhánh chưa phủ / đang fail → không được điền OK
       "checklistBlocked": sorted({json.dumps(c, ensure_ascii=False, sort_keys=True) for x in rows if x["status"] != "pass" and x["status"] != "na" for c in x["checklist"]})}
out["checklistBlocked"] = [json.loads(s) for s in out["checklistBlocked"]]
json.dump(out, open(os.path.join(a.run, f"logic.{a.page}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

VI = {"pass": "Đạt", "fail": "Lỗi", "no-seed": "Thiếu dữ liệu", "no-check": "Thiếu check", "ask": "Cần hỏi designer", "manual": "Tester kiểm", "na": "NA"}
md = [f"# Độ phủ logic — {a.page}", "",
      f"{len(rows)} nhánh: " + ", ".join(f"{VI[s]} {summary[s]}" for s in ORDER if summary[s]), ""]
for s in ORDER:
    sel = [x for x in rows if x["status"] == s]
    if not sel:
        continue
    md += [f"## {VI[s]} ({len(sel)})", "", "| Nhánh | Quy tắc | Khi | Mong đợi | Dữ liệu | Ghi chú |", "|---|---|---|---|---|---|"]
    for x in sel:
        md.append(f"| {x['branch']} | {x['ruleTitle']} | {x['when']} | {x['expected']} | {' '.join(x.get('seedLabels') or [])} | {str(x.get('detail', ''))[:160]} |")
    md.append("")
open(os.path.join(a.run, f"logic.{a.page}.md"), "w", encoding="utf-8").write("\n".join(md))
gaps = summary["no-seed"] + summary["no-check"]
print(f"[logic] {a.page}: {len(rows)} nhánh — " + ", ".join(f"{s} {summary[s]}" for s in ORDER if summary[s])
      + (f" — CÒN {gaps} nhánh chưa phủ" if gaps else "") + f" → {os.path.join(a.run, 'logic.' + a.page + '.md')}")
