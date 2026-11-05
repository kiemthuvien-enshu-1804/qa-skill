#!/usr/bin/env python3
"""Gom kết quả 1 lần chạy (measure/responsive + manual_bugs.json) thành bugs.json để import vào Bug Tracker.

Usage:
  python3 make_bugs.py --run runs/<id> [--config qa-config.json] [--manual runs/<id>/manual_bugs.json]

Output:
  runs/<id>/bugs.json        — schema tracker (import trực tiếp)
  runs/<id>/upload/*.png     — ảnh đã đổi tên ngắn, chọn cùng lúc với bugs.json khi import
  runs/<id>/summary.md       — tóm tắt theo nhóm common / SP / PC / responsive
"""
import argparse, glob, hashlib, json, os, shutil
from collections import defaultdict

PROP_VI = {
    "x": "vị trí X", "y": "vị trí Y", "width": "width", "height": "height", "fontSize": "font-size",
    "fontWeight": "font-weight", "lineHeight": "line-height", "letterSpacing": "letter-spacing",
    "paddingTop": "padding-top", "paddingRight": "padding-right", "paddingBottom": "padding-bottom",
    "paddingLeft": "padding-left", "gap": "gap", "borderRadius": "border-radius", "borderWidth": "border-width",
    "opacity": "opacity", "color": "màu chữ", "backgroundColor": "màu nền", "borderColor": "màu viền",
    "fontFamily": "font-family", "textAlign": "text-align", "text": "nội dung text", "missing": "thiếu element",
    "horizontal-scroll": "xuất hiện scroll ngang", "overflow-viewport": "tràn ra ngoài màn hình",
    "text-clipped": "text bị cắt", "text-ellipsis": "text bị rút gọn (…)", "broken-image": "ảnh lỗi",
    "tap-target": "vùng chạm quá nhỏ", "console-error": "lỗi console JS", "http-error": "request lỗi",
}
SEV_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}


def key(*parts):
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:10]


def figma_url(file_key, node):
    if not (file_key and node):
        return None
    return f"https://www.figma.com/design/{file_key}/?node-id={str(node).replace(':', '-')}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--config", default="qa-config.json")
    ap.add_argument("--manual")
    a = ap.parse_args()
    cfg = json.load(open(a.config, encoding="utf-8"))
    fg = cfg.get("figma", {})
    file_key = fg.get("fileKey")
    if not file_key and fg.get("url"):  # chỉ khai báo link chung → lấy fileKey (hoặc branchKey) từ link
        import re
        m = re.search(r"figma\.com/(?:design|file)/([0-9A-Za-z]+)(?:/branch/([0-9A-Za-z]+))?", fg["url"])
        file_key = m and (m.group(2) or m.group(1))
    up_dir = os.path.join(a.run, "upload")
    os.makedirs(up_dir, exist_ok=True)

    def stash(path):
        if not path or not os.path.exists(path):
            return None
        name = key(path) + ".png"
        shutil.copyfile(path, os.path.join(up_dir, name))
        return name

    bugs = []
    # ---- pixel/spec findings: merge SP + PC of the same element/prop → "common"
    by_elem = defaultdict(list)
    for f in glob.glob(os.path.join(a.run, "measure.*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for x in d["findings"]:
            x["_url"] = d["url"]
            x["_fileKey"] = (d.get("figma") or {}).get("fileKey") or file_key
            by_elem[x["elementKey"]].append(x)
    for ek, items in by_elem.items():
        vps = sorted({i["viewportName"] for i in items})
        group = "common" if set(vps) >= {"sp", "pc"} else vps[0]
        first = items[0]
        label = PROP_VI.get(first["prop"], first["prop"])
        lines = []
        for vp in vps:
            it = [i for i in items if i["viewportName"] == vp][0]
            lines.append(f"[{vp.upper()} {it['viewport']}px] Figma: {it['expected']} / Thực tế: {it['actual']}")
        bugs.append({
            "key": ek, "source": "auto", "group": group, "page": first["page"], "path": first["path"], "url": first["_url"],
            "title": f"{first['label']} — " + ("không có trên trang (Figma có)" if first["prop"] == "missing" else f"{label} sai so với Figma"),
            "type": first["type"], "severity": min((i["severity"] for i in items), key=lambda s: SEV_ORDER.get(s, 9)),
            "viewports": sorted({i["viewport"] for i in items}), "browsers": sorted({i["browser"] for i in items}),
            "element": first["selector"] or first["element"], "prop": first["prop"],
            "expected": " | ".join(f"{i['viewportName'].upper()}: {i['expected']}" for i in items if i["browser"] == items[0]["browser"]),
            "actual": "\n".join(lines),
            "figma": {"fileKey": first["_fileKey"], "nodeId": first.get("figmaNodeId"), "url": figma_url(first["_fileKey"], first.get("figmaNodeId"))},
            "screenshots": [s for s in {stash(i.get("screenshot")) for i in items} if s][:3],
            "steps": f"Mở {first['_url']} ở width {', '.join(str(v) for v in sorted({i['viewport'] for i in items}))}px, kiểm tra {first['selector'] or first['element']}",
        })

    # ---- responsive issues
    for f in glob.glob(os.path.join(a.run, "responsive.*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for x in d["issues"]:
            if x.get("type") == "env":
                continue
            ws = x.get("widths") or []
            rng = f"{ws[0]}–{ws[-1]}px" if len(ws) > 1 else (f"{ws[0]}px" if ws else "")
            label = PROP_VI.get(x["prop"], x["prop"])
            bugs.append({
                "key": x["key"], "source": "auto", "group": "responsive", "page": x["page"], "path": x["path"], "url": None,
                "title": f"{x.get('element') or x['page']} — {label} ({rng})" + (f" chỉ trên {', '.join(x['browsers'])}" if x.get("browserSpecific") else ""),
                "type": x.get("type", "responsive"), "severity": x["severity"], "viewports": ws, "browsers": x["browsers"],
                "element": x.get("element"), "prop": x["prop"], "expected": x.get("expected", ""), "actual": x.get("actual", ""),
                "figma": None, "screenshots": [s for s in (stash(p) for p in x.get("shots", [])) if s][:3],
                "steps": f"Mở {x['path']} ở width {rng} trên {', '.join(x['browsers'])}",
            })

    # ---- CMS data findings (data is the same on SP/PC → common)
    for f in glob.glob(os.path.join(a.run, "cms.*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for x in d["findings"]:
            bugs.append({
                "key": x["key"], "source": "auto", "group": "common", "page": x["page"], "path": x["path"], "url": x.get("url"),
                "title": f"Dữ liệu CMS — {x['label']} khác với {d.get('cms', 'CMS')}", "type": "cms", "severity": x["severity"],
                "viewports": [x["viewport"]], "browsers": [x["browser"]], "element": x.get("where"), "prop": x["prop"],
                "expected": f"{d.get('cms', 'CMS')}: {x['expected']}", "actual": f"Trang: {x['actual']}", "figma": None,
                "screenshots": [s for s in [stash(x.get("screenshot"))] if s],
                "steps": f"So dữ liệu API {d.get('cms', 'CMS')} với {x.get('where') or x['path']}",
            })

    # ---- logic flows (Playwright, Pha 1): fail → bug; merge same check over viewports/browsers
    flows = defaultdict(list)
    for f in glob.glob(os.path.join(a.run, "flow.*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for c in d.get("checks", []):
            if c.get("status") == "fail":
                c["_page"], c["_path"], c["_url"] = d["page"], d["path"], d.get("url")
                flows[c["key"]].append(c)
    for k, cs in flows.items():
        c = cs[0]
        vps = sorted({x["viewportName"] for x in cs})
        bugs.append({
            "key": k, "source": "auto", "group": c.get("group") or ("common" if set(vps) >= {"sp", "pc"} else vps[0]),
            "page": c["_page"], "path": c["_path"], "url": c["_url"], "title": c["name"], "type": "logic",
            "severity": c.get("severity", "high"), "viewports": sorted({x["viewport"] for x in cs}), "browsers": sorted({x["browser"] for x in cs}),
            "element": None, "prop": "flow", "expected": c.get("expected", ""), "actual": c.get("actual", ""), "figma": None,
            "screenshots": [s for s in {stash(x.get("screenshot")) for x in cs} if s][:3], "steps": "\n".join(c.get("steps", [])),
        })

    # ---- manual bugs + Claude in Chrome bugs (Pha 2) — same schema, screenshots as paths
    manual_lists = []
    manual = a.manual or os.path.join(a.run, "manual_bugs.json")
    if os.path.exists(manual):
        manual_lists.append(("manual", json.load(open(manual, encoding="utf-8"))))
    chrome = os.path.join(a.run, "chrome_results.json")
    if os.path.exists(chrome):
        cr = json.load(open(chrome, encoding="utf-8"))
        manual_lists.append(("chrome", [b for t in cr.get("results", []) for b in t.get("bugs", [])]))
    for src, lst in manual_lists:
        for m in lst:
            m.setdefault("source", src)
            m.setdefault("key", key(m.get("page"), m.get("title")))
            m["screenshots"] = [s for s in (stash(p) for p in m.get("screenshots", [])) if s]
            bugs.append(m)

    bugs.sort(key=lambda b: (["common", "sp", "pc", "responsive"].index(b["group"]) if b["group"] in ["common", "sp", "pc", "responsive"] else 9,
                             b.get("page") or "", SEV_ORDER.get(b.get("severity"), 9)))
    out = {"project": cfg["project"], "bugPrefix": cfg.get("bugPrefix", "BUG"), "run": os.path.basename(a.run.rstrip("/")), "bugs": bugs}
    json.dump(out, open(os.path.join(a.run, "bugs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    md = [f"# QA run {out['run']} — {cfg['project']}", ""]
    for g, title in [("common", "Chung SP + PC"), ("sp", "Chỉ SP"), ("pc", "Chỉ PC"), ("responsive", "Responsive")]:
        gb = [b for b in bugs if b["group"] == g]
        md.append(f"## {title} ({len(gb)})")
        md += [f"- [{b['severity']}·{b.get('type','')}·{b.get('source')}] {b['page']} · {b['title']}" for b in gb] or ["- (không có)"]
        md.append("")
    open(os.path.join(a.run, "summary.md"), "w", encoding="utf-8").write("\n".join(md))
    print(f"[bugs] {len(bugs)} bugs → {os.path.join(a.run, 'bugs.json')} (ảnh: {up_dir})")


if __name__ == "__main__":
    main()
