#!/usr/bin/env python3
"""Figma REST helper (cần FIGMA_TOKEN = personal access token, quyền file_content:read, file_comments:read).

  python3 figma_api.py png      --file <fileKey> --node 12018:30142 --out specs/news.sp.png [--scale 1]
  python3 figma_api.py spec     --file <fileKey> --node 12018:30142 --page news --vp sp --out specs/news.sp.json
  python3 figma_api.py comments --file <fileKey> [--node 12018:30142] --out specs/comments.json
  python3 figma_api.py pages    --file <fileKey> --out specs/figma-pages.json      # danh sách page (canvas): tìm common_component / StyleGuide
  python3 figma_api.py consistency --specs specs/*.sp.json specs/*.pc.json [--file <fileKey>] [--index specs/_index/*.json]
                                [--common specs/figma-common-components.json] --out specs/figma-conflicts.json

`spec` sinh BẢN NHÁP spec từ cây node: mọi TEXT + node có fill/stroke/radius/auto-layout, toạ độ tính theo frame
(frame width = viewport). Sau đó Claude gán `selector` cho từng element (đọc DOM) — element không có selector
sẽ được tìm theo `text`. Element nằm trong instance có `component` (chuỗi từ instance ngoài cùng → trong cùng):
{family, id, variant, part, partName} — `consistency` dùng để so cùng 1 component giữa component gốc,
các màn khác và SP ↔ PC.
"""
import argparse, json, os, re, sys, urllib.request, urllib.parse
for _s in (sys.stdout, sys.stderr):  # console Windows (cp1252/cp932) không in được tiếng Việt
    _s.reconfigure(encoding="utf-8", errors="replace")

API = "https://api.figma.com/v1"

for _f in (".env.local", ".env"):  # nạp FIGMA_TOKEN từ file env của QA workspace
    if os.path.exists(_f):
        for _l in open(_f, encoding="utf-8"):
            _m = re.match(r"\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$", _l)
            if _m and not _l.lstrip().startswith("#"):
                os.environ.setdefault(_m.group(1), _m.group(2).strip("'\""))


def get(path, raw=False):
    tok = os.environ.get("FIGMA_TOKEN")
    if not tok:
        sys.exit("Thiếu FIGMA_TOKEN (Figma → Settings → Security → Personal access tokens)")
    req = urllib.request.Request(path if path.startswith("http") else API + path, headers={"X-Figma-Token": tok})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    return data if raw else json.loads(data)


def hexcolor(c, opacity=1):
    r, g, b = (round(c[k] * 255) for k in "rgb")
    a = c.get("a", 1) * opacity
    h = f"#{r:02x}{g:02x}{b:02x}"
    return h if a >= 0.99 else f"rgba({r},{g},{b},{round(a, 2)})"


def solid(paints):
    for p in paints or []:
        if p.get("visible", True) and p.get("type") == "SOLID":
            return hexcolor(p["color"], p.get("opacity", 1))
    return None


def slug(s):
    s = re.sub(r"[^\w\-]+", "-", s.strip().lower(), flags=re.U).strip("-")
    return s[:40] or "node"


def cmd_png(a):
    q = urllib.parse.urlencode({"ids": a.node, "format": "png", "scale": a.scale})
    url = get(f"/images/{a.file}?{q}")["images"][a.node]
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    open(a.out, "wb").write(get(url, raw=True))
    print(f"[figma] PNG → {a.out}")


def cmd_comments(a):
    data = get(f"/files/{a.file}/comments")["comments"]
    # Gộp thành thread: comment gốc + replies (reply thường chốt / đổi quy tắc → đọc reply mới nhất).
    # Comment gắn vào node con nên không lọc theo frame ở đây; Claude lọc theo node id thuộc frame (get_metadata).
    items = {c["id"]: {"id": c["id"], "message": c["message"], "node": (c.get("client_meta") or {}).get("node_id"),
                       "parent": c.get("parent_id") or None, "resolved": bool(c.get("resolved_at")),
                       "author": c["user"]["handle"], "at": c["created_at"]} for c in data}
    threads = []
    for c in sorted(items.values(), key=lambda x: x["at"]):
        if c["parent"] and c["parent"] in items:
            items[c["parent"]].setdefault("replies", []).append({k: c[k] for k in ("id", "message", "author", "at")})
        elif not c["parent"]:
            threads.append(c)
    for t in threads:
        t.pop("parent", None)
        t["replies"] = t.get("replies", [])
        t["latest"] = (t["replies"][-1] if t["replies"] else t)["message"]
    json.dump(threads, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"[figma] {len(threads)} thread ({len(items)} comment, {sum(t['resolved'] for t in threads)} đã resolve) → {a.out}")


VP_SEG = re.compile(r"^(sp|pc|tab|tablet|mobile|desktop)$", re.I)


def family_name(name):
    """Tên component bỏ đoạn SP/PC: 'Common/PC/h2' → 'Common/h2', 'SP/CTA-v1' → 'CTA-v1'."""
    segs = [x.strip() for x in re.split(r"/+", name or "") if x.strip()]
    segs = [x for x in segs if not VP_SEG.match(x)]
    return "/".join(segs) or (name or "").strip()


def extract(doc, comps, sets, styles, origin=None, main=None):
    """Trích element (TEXT + node có fill/stroke/radius/auto-layout) của 1 cây node.
    origin: bbox gốc để tính x/y (frame). main: (family, id, variant) khi doc là component gốc."""
    fb = origin or doc["absoluteBoundingBox"]
    elements, seen = [], {}

    def ctx_of(n):
        cid = n.get("componentId")
        c = comps.get(cid, {})
        setname = sets.get(c.get("componentSetId"), {}).get("name")
        return {"family": family_name(setname or c.get("name") or n["name"]), "id": cid,
                "variant": c.get("name") if setname else None, "remote": bool(c.get("remote")), "root": n["id"]}

    # part = đường tên node tính từ instance (vd "Frame 2371/title"), không dùng node id: instance ↔ component gốc
    # cùng tên con, và component SP / PC riêng (Common/SP/h2, Common/PC/h2) vẫn ghép được nếu đặt tên giống nhau.
    def walk(n, chain, names):
        if not n.get("visible", True):
            return
        if n.get("type") == "INSTANCE":
            chain = chain + [{**ctx_of(n), "d": len(names) - 1}]
        bb = n.get("absoluteBoundingBox")
        if bb and (n["id"] != doc["id"] or main):
            exp = {"x": round(bb["x"] - fb["x"], 1), "y": round(bb["y"] - fb["y"], 1),
                   "width": round(bb["width"], 1), "height": round(bb["height"], 1)}
            keep = False
            if n["type"] == "TEXT":
                st = n.get("style", {})
                exp.update({"fontSize": st.get("fontSize"), "fontWeight": st.get("fontWeight"),
                            "lineHeight": round(st["lineHeightPx"], 2) if st.get("lineHeightPx") else None,
                            "letterSpacing": round(st.get("letterSpacing", 0), 2), "fontFamily": st.get("fontFamily"),
                            "textAlign": {"LEFT": "left", "CENTER": "center", "RIGHT": "right", "JUSTIFIED": "justify"}.get(st.get("textAlignHorizontal")),
                            "color": solid(n.get("fills"))})
                keep = True
            else:
                bg = solid(n.get("fills"))
                if bg: exp["backgroundColor"] = bg; keep = True
                if n.get("cornerRadius"): exp["borderRadius"] = n["cornerRadius"]; keep = True
                if n.get("strokes") and solid(n["strokes"]):
                    exp["borderColor"] = solid(n["strokes"]); exp["borderWidth"] = n.get("strokeWeight"); keep = True
                if n.get("layoutMode") in ("HORIZONTAL", "VERTICAL"):
                    exp.update({"paddingTop": n.get("paddingTop", 0), "paddingRight": n.get("paddingRight", 0),
                                "paddingBottom": n.get("paddingBottom", 0), "paddingLeft": n.get("paddingLeft", 0),
                                "gap": n.get("itemSpacing", 0)})
                    keep = True
                if n.get("opacity", 1) < 1: exp["opacity"] = round(n["opacity"], 2)
            if keep:
                base = slug(n.get("characters", n["name"])[:30] if n["type"] == "TEXT" else n["name"])
                seen[base] = seen.get(base, 0) + 1
                eid = base if seen[base] == 1 else f"{base}-{seen[base]}"
                el = {"id": eid, "label": n["name"], "figmaNodeId": n["id"], "selector": None,
                      "expect": {k: v for k, v in exp.items() if v is not None}}
                if n["type"] == "TEXT":
                    el["text"] = n.get("characters", "")[:120]
                comp = []
                if main:
                    comp.append({"family": main[0], "id": main[1], "variant": main[2],
                                 "part": "/".join(names[1:]), "partName": n["name"]})
                for c in chain:
                    comp.append({"family": c["family"], "id": c["id"], "variant": c["variant"], "remote": c["remote"],
                                 "part": "/".join(names[c["d"] + 1:]), "partName": n["name"]})
                if comp:
                    el["component"] = comp
                st_ids = n.get("styles") or {}
                named = {k: styles[v]["name"] for k, v in st_ids.items() if v in styles}
                if named:
                    el["styles"] = named  # tên text style / color style trong Figma (đối chiếu style guide)
                elements.append(el)
        cnt = {}
        for c in n.get("children", []):
            cnt[c["name"]] = cnt.get(c["name"], 0) + 1
            nm = c["name"] if cnt[c["name"]] == 1 else f"{c['name']}#{cnt[c['name']]}"
            walk(c, chain, names + [nm])

    walk(doc, [], [doc["name"]])
    return elements


def fetch_nodes(file, ids):
    out = {}
    ids = list(ids)
    for i in range(0, len(ids), 40):
        q = urllib.parse.quote(",".join(ids[i:i + 40]))
        out.update(get(f"/files/{file}/nodes?ids={q}")["nodes"])
    return out


def cmd_spec(a):
    r = get(f"/files/{a.file}/nodes?ids={urllib.parse.quote(a.node)}")["nodes"][a.node]
    doc = r["document"]
    fb = doc["absoluteBoundingBox"]
    elements = extract(doc, r.get("components", {}), r.get("componentSets", {}), r.get("styles", {}))
    spec = {"page": a.page, "viewportName": a.vp, "frameWidth": fb["width"], "frameHeight": fb["height"],
            "figma": {"fileKey": a.file, "nodeId": a.node, "name": doc["name"]},
            "note": "Gán selector cho element quan trọng; xoá element trang trí không cần đo. Giữ nguyên `component` để so thông số giữa các nguồn Figma.",
            "elements": elements}
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump(spec, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"[figma] spec nháp {len(elements)} elements (frame {fb['width']}×{fb['height']}) → {a.out}")


def cmd_pages(a):
    doc = get(f"/files/{a.file}?depth=1")["document"]
    try:
        cp = json.load(open("qa-config.json", encoding="utf-8")).get("figma", {}).get("commonPages", {})
    except Exception:
        cp = {}
    pats = {k: re.compile(cp.get(k) or d, re.I) for k, d in (("components", r"common.?component"), ("styleGuide", r"style.?guide"))}
    pages = [{"id": c["id"], "name": c["name"], "role": next((k for k, r in pats.items() if r.search(c["name"])), None)}
             for c in doc.get("children", [])]
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump({"fileKey": a.file, "pages": pages}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    for p in pages:
        print(f"{p['id']}  {p['name']}" + (f"  ← {p['role']}" if p["role"] else ""))
    print(f"[figma] {len(pages)} page → {a.out}")


# ---------- consistency: cùng 1 component có thông số khác nhau giữa các nguồn Figma ----------
STYLE_KEYS = ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "fontFamily", "textAlign", "color",
              "backgroundColor", "borderRadius", "borderColor", "borderWidth",
              "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "gap", "opacity"]


def _same(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 0.5
    return str(a).strip().lower() == str(b).strip().lower()


def _distinct(vals):
    out = []
    for v, at in vals:
        for o in out:
            if _same(o["value"], v):
                o["at"].append(at); break
        else:
            out.append({"value": v, "at": [at]})
    return sorted(out, key=lambda o: -len(o["at"]))


def _comps(el):
    c = el.get("component")
    return [c] if isinstance(c, dict) else (c or [])


def cmd_consistency(a):
    import glob as _glob
    files = [f for pat in (a.specs or []) for f in _glob.glob(pat)]
    index = [f for pat in (a.index or []) for f in _glob.glob(pat)]
    specs = {f: json.load(open(f, encoding="utf-8")) for f in files}
    occ = {}  # (family, part) → [occurrence]

    def add(spec, src, f):
        for el in spec.get("elements", []):
            for c in _comps(el):
                if not c.get("family"):
                    continue
                k = (c["family"], c.get("part") or "")
                occ.setdefault(k, []).append({"src": src, "file": f, "vp": spec.get("viewportName"), "page": spec.get("page"),
                                              "node": el.get("figmaNodeId"), "variant": c.get("variant"), "id": c.get("id"),
                                              "remote": c.get("remote"), "partName": c.get("partName") or el.get("label"),
                                              "expect": el.get("expect", {})})

    for f, sp in specs.items():
        add(sp, "frame", f)
    for f in index:
        add(json.load(open(f, encoding="utf-8")), "screen", f)

    # component gốc: file có sẵn (MCP / lần trước) hoặc lấy qua REST
    common_path = a.common or "specs/figma-common-components.json"
    common = json.load(open(common_path, encoding="utf-8")) if os.path.exists(common_path) else None
    if common is None and a.file and os.environ.get("FIGMA_TOKEN"):
        fam_of, remote = {}, set()
        for (fam, part), lst in occ.items():
            for o in lst:
                if o["id"]:
                    fam_of.setdefault(o["id"], (fam, o["variant"]))
                if o["id"] and o["remote"]:
                    remote.add(o["id"])  # component từ library ngoài: không lấy được từ file này
        ids = [i for i in fam_of if i not in remote]
        nodes = fetch_nodes(a.file, ids) if ids else {}
        els = []
        for cid, r in nodes.items():
            if not r:
                continue
            fam, var = fam_of[cid]
            d = r["document"]
            els += extract(d, r.get("components", {}), r.get("componentSets", {}), r.get("styles", {}),
                           origin=d["absoluteBoundingBox"], main=(fam, cid, var))
        common = {"page": "common", "viewportName": None, "source": "REST", "elements": els}
        os.makedirs(os.path.dirname(common_path) or ".", exist_ok=True)
        json.dump(common, open(common_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"[figma] component gốc: {len(nodes)} component → {common_path}")
    if common:
        add(common, "common", common_path)

    dec_path = a.decisions or "specs/figma-decisions.json"
    decisions = json.load(open(dec_path, encoding="utf-8")) if os.path.exists(dec_path) else {}

    def where(o):
        if o["src"] == "common":
            return f"component gốc{' (' + o['variant'] + ')' if o['variant'] else ''} {o['node']}"
        return f"{o['page']}.{o['vp']} {o['node']}"

    conflicts = []
    for (fam, part), lst in sorted(occ.items()):
        frames = [o for o in lst if o["src"] != "common"]
        if not any(o["src"] == "frame" for o in frames):
            continue  # chỉ báo component có trên trang đang test
        mains = [o for o in lst if o["src"] == "common"]
        part_name = next((o["partName"] for o in lst if o["partName"]), part)
        rec_by_vp = {}
        for prop in STYLE_KEYS:
            for vp in sorted({o["vp"] for o in frames if o["vp"]}):
                fv = [o for o in frames if o["vp"] == vp and prop in o["expect"]]
                if not fv:
                    continue
                variants = {o["variant"] for o in fv}
                mv = [o for o in mains if prop in o["expect"] and (o["variant"] in variants or len(mains) == 1)]
                vals = _distinct([(o["expect"][prop], where(o)) for o in mv + fv])
                main_val = next((o["expect"][prop] for o in mv), None)
                rec = main_val if main_val is not None else (vals[0]["value"] if len(vals) == 1 or len(vals[0]["at"]) > len(vals[1]["at"]) else None)
                rec_by_vp[(prop, vp)] = rec if rec is not None else vals[0]["value"]
                if len(vals) < 2:
                    continue
                key = f"{fam}|{part}|{prop}|{vp}"
                conflicts.append({"key": key, "family": fam, "part": part, "partName": part_name, "prop": prop, "scope": vp,
                                  "kind": "common" if main_val is not None and any(not _same(v["value"], main_val) for v in vals) else "screen",
                                  "values": vals, "recommended": rec,
                                  "reason": "theo component gốc" if main_val is not None else ("giá trị dùng ở nhiều chỗ nhất" if rec is not None else "chưa đủ căn cứ, cần tester chọn"),
                                  "decision": decisions.get(key)})
            if ("sp" in {o["vp"] for o in frames}) and ("pc" in {o["vp"] for o in frames}):
                a_, b_ = rec_by_vp.get((prop, "sp")), rec_by_vp.get((prop, "pc"))
                if a_ is not None and b_ is not None and not _same(a_, b_):
                    key = f"{fam}|{part}|{prop}|sp-pc"
                    var = sorted({str(o["variant"]) for o in frames if o["variant"]})
                    conflicts.append({"key": key, "family": fam, "part": part, "partName": part_name, "prop": prop, "scope": "sp-pc",
                                      "kind": "sp-pc", "values": [{"value": a_, "at": ["SP"]}, {"value": b_, "at": ["PC"]}],
                                      "recommended": "per-frame",
                                      "reason": "SP và PC khác variant, thường là có chủ ý" if len(var) > 1 else "cùng component nhưng SP ≠ PC, xác nhận có chủ ý không",
                                      "decision": decisions.get(key)})
    for i, c in enumerate(conflicts, 1):
        c["no"] = i

    # gắn vào spec: chưa quyết → element.conflicts[prop] = key (measure đánh dấu, bug bị giữ lại); đã quyết → ghi expect
    open_by = {}
    for c in conflicts:
        d = c["decision"]
        val = d.get("value") if isinstance(d, dict) else d
        scopes = ["sp", "pc"] if c["scope"] == "sp-pc" else [c["scope"]]
        for vp in scopes:
            open_by[(c["family"], c["part"], c["prop"], vp)] = (c, val)
    changed = 0
    for f, sp in specs.items():
        vp = sp.get("viewportName")
        for el in sp.get("elements", []):
            el.pop("conflicts", None)
            for comp in _comps(el):
                for prop in STYLE_KEYS:
                    hit = open_by.get((comp.get("family"), comp.get("part") or "", prop, vp))
                    if not hit or prop not in el.get("expect", {}):
                        continue
                    c, val = hit
                    if val is None:
                        if c["scope"] != "sp-pc":
                            el.setdefault("conflicts", {})[prop] = c["key"]
                    elif val != "per-frame" and not _same(el["expect"][prop], val):
                        el["expect"][prop] = val; changed += 1
        json.dump(sp, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump({"at": __import__("datetime").datetime.now().isoformat(timespec="seconds"), "common": common_path if common else None,
               "conflicts": conflicts}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    md_path = re.sub(r"\.json$", "", a.out) + ".md"
    pend = [c for c in conflicts if c["decision"] is None]
    md = ["# Thông số Figma không thống nhất — tester chọn giá trị đúng", "",
          f"Tổng {len(conflicts)} mục, chưa quyết {len(pend)}. Component gốc: {'có' if common else 'không có (chỉ so giữa các màn)'}.",
          "Ghi lựa chọn vào `specs/figma-decisions.json` (`{\"<key>\": {\"value\": <giá trị>, \"by\": \"<tên>\", \"note\": \"…\"}}`; "
          "`\"per-frame\"` = mỗi frame giữ giá trị riêng), rồi chạy lại `consistency`.", ""]
    for title, kinds in [("Khác component gốc (common_component)", {"common"}), ("Khác giữa các màn cùng viewport", {"screen"}),
                         ("Cùng component nhưng SP ≠ PC", {"sp-pc"})]:
        rows = [c for c in conflicts if c["kind"] in kinds]
        md += [f"## {title} ({len(rows)})", ""]
        if not rows:
            md += ["- (không có)", ""]; continue
        md += ["| # | Component · phần | Thuộc tính | Phạm vi | Các giá trị (nơi dùng) | Đề xuất | Đã chọn |", "|---|---|---|---|---|---|---|"]
        for c in rows:
            vals = "<br>".join(f"**{v['value']}** — {', '.join(v['at'][:4])}{' …' if len(v['at']) > 4 else ''}" for v in c["values"])
            d = c["decision"]; dv = (d.get("value") if isinstance(d, dict) else d)
            md.append(f"| {c['no']} | {c['family']} · {c['partName']} | {c['prop']} | {c['scope']} | {vals} | {c['recommended'] if c['recommended'] is not None else '?'} ({c['reason']}) | {dv if d is not None else ''} |")
        md.append("")
    md.append("Key từng mục: xem `key` trong file .json cùng tên.")
    open(md_path, "w", encoding="utf-8").write("\n".join(md))
    print(f"[figma] {len(conflicts)} mục không thống nhất ({len(pend)} chưa quyết), {changed} giá trị spec cập nhật theo quyết định → {a.out}, {md_path}")


def _viewport_widths():
    try:
        vp = json.load(open("qa-config.json", encoding="utf-8")).get("viewports", {})
        return vp.get("sp", {}).get("width", 375), vp.get("pc", {}).get("width", 1536)
    except Exception:
        return 375, 1536


def _tree_from_rest(file, node):
    """Cây {id,type,name,x,y,w,h,children} với x/y tương đối so với node cha (giống output MCP)."""
    if node:
        doc = get(f"/files/{file}/nodes?ids={urllib.parse.quote(node)}&depth=4")["nodes"][node]["document"]
        roots = [doc]
    else:
        roots = get(f"/files/{file}?depth=4")["document"].get("children", [])  # mọi page (canvas)

    def conv(n, pbb):
        bb = n.get("absoluteBoundingBox") or {}
        o = {"id": n["id"], "type": n["type"].lower(), "name": n.get("name", ""),
             "x": (bb.get("x", 0) - pbb.get("x", 0)) if bb else 0, "y": (bb.get("y", 0) - pbb.get("y", 0)) if bb else 0,
             "w": bb.get("width", 0), "h": bb.get("height", 0)}
        o["children"] = [conv(c, bb or pbb) for c in n.get("children", []) if c.get("visible", True)]
        return o
    return [conv(r, {}) for r in roots]


def _tree_from_mcp(path):
    """Đọc file kết quả get_metadata của Figma MCP (XML, hoặc JSON [{type,text}] bọc XML)."""
    raw = open(path, encoding="utf-8").read()
    try:
        raw = "".join(i.get("text", "") for i in json.loads(raw))
    except Exception:
        pass
    root = {"children": []}
    stack = [root]
    for m in re.finditer(r"<(/?)([a-z-]+)([^>]*?)(/?)>", raw):
        close, tag, attrs, selfc = m.groups()
        if close:
            if len(stack) > 1: stack.pop()
            continue
        a = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
        n = {"id": a.get("id"), "type": tag, "name": a.get("name", ""), "x": float(a.get("x", 0) or 0), "y": float(a.get("y", 0) or 0),
             "w": float(a.get("width", 0) or 0), "h": float(a.get("height", 0) or 0), "children": []}
        stack[-1]["children"].append(n)
        if not selfc: stack.append(n)
    return root["children"]


def cmd_frames(a):
    """Liệt kê section → frame SP/PC để Claude ghép với trang. Frame chính = frame có nội dung cao nhất trong section."""
    tree = _tree_from_mcp(a.mcp) if a.mcp else _tree_from_rest(a.file, a.node)
    spw, pcw = _viewport_widths()
    SKIP = re.compile(r"OFComment|^Frame \d+$|^Group \d+$", re.I)

    def kind(n):
        nm = n["name"].strip()
        if round(n["w"]) == spw or re.match(r"SP[/_\s|]", nm, re.I): return "sp"
        if round(n["w"]) == pcw or re.match(r"PC[/_\s|]", nm, re.I): return "pc"
        return None

    def content_h(n):
        return max([n["h"]] + [c["y"] + c["h"] for c in n["children"]])

    sections = []

    def walk(n, trail):
        frames = [c for c in n["children"] if c["type"] == "frame" and not SKIP.search(c["name"]) and kind(c)]
        if frames:
            s = {"section": n.get("name", ""), "id": n.get("id"), "path": " / ".join(trail), "sp": [], "pc": []}
            for f in frames:
                s[kind(f)].append({"id": f["id"], "name": f["name"], "width": round(f["w"]), "height": round(f["h"]),
                                   "contentHeight": round(content_h(f))})
            for k in ("sp", "pc"):
                s[k].sort(key=lambda f: -f["contentHeight"])
                s[k + "Main"] = s[k][0]["id"] if s[k] else None
            sections.append(s)
        for c in n["children"]:
            if c["type"] in ("canvas", "section", "document"):
                walk(c, trail + [c["name"]])

    for r in tree:
        walk(r, [r.get("name", "")])
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump({"fileKey": a.file, "node": a.node, "sections": sections}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    sys.stdout.reconfigure(encoding="utf-8")
    for s in sections:
        print(f"{s['section']}  SP={s['spMain']} ({len(s['sp'])})  PC={s['pcMain']} ({len(s['pc'])})")
    print(f"[figma] {len(sections)} section có frame SP/PC → {a.out}")


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
for name in ("png", "spec", "comments", "frames", "pages", "consistency"):
    p = sub.add_parser(name)
    p.add_argument("--file", required=name not in ("frames", "consistency")); p.add_argument("--node"); p.add_argument("--out", required=True)
    p.add_argument("--specs", nargs="*", help="consistency: spec của trang đang test (sẽ được gắn conflicts / cập nhật theo quyết định)")
    p.add_argument("--index", nargs="*", help="consistency: spec nháp của màn khác, chỉ để so (không sửa)")
    p.add_argument("--common", help="consistency: file component gốc (mặc định specs/figma-common-components.json)")
    p.add_argument("--decisions", help="consistency: file quyết định của tester (mặc định specs/figma-decisions.json)")
    p.add_argument("--scale", default="1"); p.add_argument("--page"); p.add_argument("--vp", default="pc")
    p.add_argument("--mcp", help="frames: file kết quả get_metadata của Figma MCP (khi không có FIGMA_TOKEN)")
a = ap.parse_args()
{"png": cmd_png, "spec": cmd_spec, "comments": cmd_comments, "frames": cmd_frames, "pages": cmd_pages,
 "consistency": cmd_consistency}[a.cmd](a)
