#!/usr/bin/env python3
"""Figma REST helper (cần FIGMA_TOKEN = personal access token, quyền file_content:read, file_comments:read).

  python3 figma_api.py png      --file <fileKey> --node 12018:30142 --out specs/news.sp.png [--scale 1]
  python3 figma_api.py spec     --file <fileKey> --node 12018:30142 --page news --vp sp --out specs/news.sp.json
  python3 figma_api.py comments --file <fileKey> [--node 12018:30142] --out specs/comments.json

`spec` sinh BẢN NHÁP spec từ cây node: mọi TEXT + node có fill/stroke/radius/auto-layout, toạ độ tính theo frame
(frame width = viewport). Sau đó Claude gán `selector` cho từng element (đọc DOM) — element không có selector
sẽ được tìm theo `text`.
"""
import argparse, json, os, re, sys, urllib.request, urllib.parse

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
    # Comment gắn vào node con nên không lọc theo frame ở đây; Claude lọc theo node id thuộc frame (get_metadata).
    out = [{"id": c["id"], "message": c["message"], "node": (c.get("client_meta") or {}).get("node_id"),
            "resolved": bool(c.get("resolved_at")), "author": c["user"]["handle"], "at": c["created_at"]} for c in data]
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"[figma] {len(out)} comments → {a.out}")


def cmd_spec(a):
    doc = get(f"/files/{a.file}/nodes?ids={urllib.parse.quote(a.node)}&geometry=paths")["nodes"][a.node]["document"]
    fb = doc["absoluteBoundingBox"]
    elements, seen = [], {}

    def walk(n, depth=0):
        if not n.get("visible", True):
            return
        bb = n.get("absoluteBoundingBox")
        if bb and n["id"] != doc["id"]:
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
                elements.append(el)
        for c in n.get("children", []):
            walk(c, depth + 1)

    walk(doc)
    spec = {"page": a.page, "viewportName": a.vp, "frameWidth": fb["width"], "frameHeight": fb["height"],
            "figma": {"fileKey": a.file, "nodeId": a.node, "name": doc["name"]},
            "note": "Gán selector cho element quan trọng; xoá element trang trí không cần đo.", "elements": elements}
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump(spec, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"[figma] spec nháp {len(elements)} elements (frame {fb['width']}×{fb['height']}) → {a.out}")


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
for name in ("png", "spec", "comments", "frames"):
    p = sub.add_parser(name)
    p.add_argument("--file", required=name != "frames"); p.add_argument("--node"); p.add_argument("--out", required=True)
    p.add_argument("--scale", default="1"); p.add_argument("--page"); p.add_argument("--vp", default="pc")
    p.add_argument("--mcp", help="frames: file kết quả get_metadata của Figma MCP (khi không có FIGMA_TOKEN)")
a = ap.parse_args()
{"png": cmd_png, "spec": cmd_spec, "comments": cmd_comments, "frames": cmd_frames}[a.cmd](a)
