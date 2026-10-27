# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx", "pillow", "numpy"]
# ///
"""PROTOTYPE (#46), throwaway: can cloud vision models read handwritten cards?

Reads the saved rig crops (and a few blank ones) through OpenRouter, one request
per card, all in flight at once. The model only returns {text, unreadable}; the
card a reply belongs to is the request it answers. Each read is then checked
against the card's kind, as the Pi would: a read that breaks the kind's rules, or
comes back unreadable, is a read error.

    uv run cloud_read.py runs/A-16-20261025-233100-crops            # every model × prep × prompt
    uv run cloud_read.py <crops> --models gemma --preps clean --prompts kind --limit 5
    uv run cloud_read.py --report runs/cloud-<time>.json            # rebuild the HTML page

Key: OPENROUTER_API_KEY in .env next to this file. Writes runs/cloud-<label>-<time>.{json,html}.
"""

import argparse
import asyncio
import base64
import html
import io
import json
import os
import re
import statistics
import time
from pathlib import Path

import httpx
import numpy as np
from PIL import Image, ImageFilter

from prep import prepare

HERE = Path(__file__).parent

# name -> (OpenRouter model, pinned host, reasoning setting). One host per model,
# no fallbacks, so a config's numbers all come from the same host.
MODELS = {
    "gemma": ("google/gemma-4-31b-it", "deepinfra/fp8", {"enabled": False}),
    "glm": ("z-ai/glm-5.3-flash", "fireworks", {"effort": "minimal"}),  # reasoning can't be turned off on any host
    "qwen": ("qwen/qwen3.7-flash", "alibaba", {"enabled": False}),
    "flash-lite": ("google/gemini-3.5-flash-lite", "google-ai-studio", {"effort": "minimal"}),
    "haiku": ("anthropic/claude-haiku-5.5", "anthropic", {"enabled": False}),
}
NO_SCHEMA = {"qwen"}  # host has no structured outputs: ask for JSON in the prompt and parse it

RULES = ("Copy the handwriting on this card exactly, character for character. "
         "Keep upper and lower case exactly as written. Do not fix spelling and do not change it into a real word. "
         "Gaps between letters don't matter. "
         "If the card is blank or you can't read it, set unreadable to true and text to \"\".")
KIND_HINT = {
    "num": "This card holds a number: digits, maybe a - at the start and one . between digits.",
    "name": "This card holds a variable or function name from code. It may mix upper and lower case (camelCase), "
            "contain digits, _ or . (like p5.circle), and is often not a real word.",
    "str": "This card holds text. _ is written in place of a space, so keep it as _.",
}
JSON_ASK = ' Reply with only JSON: {"text": "...", "unreadable": false}'
SCHEMA = {"type": "json_schema", "json_schema": {"name": "card", "strict": True, "schema": {
    "type": "object", "additionalProperties": False, "required": ["text", "unreadable"],
    "properties": {"text": {"type": "string"}, "unreadable": {"type": "boolean"}}}}}

# What the Pi accepts for each kind (spec, "Handwriting"); gaps are removed first.
VALID = {"num": re.compile(r"-?\d+(\.\d+)?"), "name": re.compile(r"[A-Za-z0-9_.]+"), "str": re.compile(r".*", re.S)}

LOOKALIKE = range(9, 21)  # oO0 … g9q: not real card text
NUM, STR = range(4, 9), {21, 27, 30}  # card index within each U sheet set (id % 100)
TARGET_H = 200  # px; enlarge crops to at least this tall (Claude warns about tiny images)


def kind_of(card_id: int) -> str:
    if card_id < 0:
        return "name"  # blank crops: pretend to be a name card
    i = card_id % 100
    return "num" if i in NUM else "str" if i in STR else "name"


def norm(s: str) -> str:
    return "".join(s.split())


def levenshtein(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def blank_from(img: Image.Image, seed: int) -> Image.Image:
    """A blank card: the ink of a real crop painted over with a smooth surface fitted to the
    paper, plus noise like the paper's own."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    g = np.asarray(prepare(img, "contrast"))
    keep = np.asarray(Image.fromarray((g < 200).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(11))) == 0
    ys, xs = np.mgrid[: a.shape[0], : a.shape[1]] / max(a.shape)
    terms = np.stack([np.ones_like(xs), xs, ys, xs * ys, xs**2, ys**2], -1)  # paper shading: a smooth surface
    coef = np.linalg.lstsq(terms[keep], a[keep], rcond=None)[0]
    fill = terms @ coef
    noise = np.random.default_rng(seed).normal(0, (a[keep] - fill[keep]).std(), a.shape)
    out = np.where(keep[..., None], a, fill + noise)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))


def enlarge(img: Image.Image) -> Image.Image:
    if img.height >= TARGET_H:
        return img
    s = TARGET_H / img.height
    return img.resize((round(img.width * s), TARGET_H), Image.LANCZOS)


def png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def load_cards(crops: Path) -> list[dict]:
    run = json.loads(Path(str(crops).removesuffix("-crops") + ".json").read_text())
    cards = []
    for r in run["results"]:
        cards.append({"id": r["id"], "want": r["want"], "u_mm": r["u_mm"], "length_u": r["length_u"],
                      "img": Image.open(crops / f"{r['id']}.png").convert("RGB")})
    # Two blanks per U, from a 2U and a 4U card.
    for u in sorted({c["u_mm"] for c in cards}):
        srcs = [c for c in cards if c["u_mm"] == u]
        for n, src in enumerate([min(srcs, key=lambda c: c["length_u"]), max(srcs, key=lambda c: c["length_u"])]):
            cards.append({"id": -(u * 10 + n), "want": "", "u_mm": u, "length_u": src["length_u"],
                          "img": blank_from(src["img"], u * 10 + n)})
    for c in cards:
        c["kind"] = kind_of(c["id"])
        c["real"] = c["id"] >= 0 and c["id"] % 100 not in LOOKALIKE
    return cards


def ink_range(img: Image.Image) -> float:
    g = np.asarray(img.convert("L"), dtype=np.float32)
    return float(np.percentile(g, 75) - np.percentile(g, 1))


BLANK_RANGE = 40  # written crops are 95+ (paper to darkest ink); blank ones are under 5


def prepped(card: dict, how: str) -> Image.Image:
    if how == "raw":
        return enlarge(card["img"])
    if ink_range(card["img"]) < BLANK_RANGE:  # nothing to stretch: cleaning would turn noise into ink
        return enlarge(card["img"].convert("L").convert("RGB"))
    return enlarge(prepare(card["img"], "tight").convert("RGB"))


async def read_one(client: httpx.AsyncClient, sem: asyncio.Semaphore, model: str, img: Image.Image, kind: str, prompt: str) -> dict:
    slug, host, reasoning = MODELS[model]
    text = RULES + (" " + KIND_HINT[kind] if prompt == "kind" else "") + (JSON_ASK if model in NO_SCHEMA else "")
    body = {
        "model": slug,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": text},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{png_b64(img)}"}}]}],
        "temperature": 0,
        "max_tokens": 800,  # room for the models that must reason a little
        "reasoning": reasoning,
        "provider": {"order": [host], "allow_fallbacks": False, "data_collection": "deny"},
    }
    if model not in NO_SCHEMA:
        body["response_format"] = SCHEMA
    async with sem:
        for attempt in range(4):  # retry rate limits and host errors; the time counts the last try only
            t0 = time.perf_counter()
            try:
                r = await client.post("https://openrouter.ai/api/v1/chat/completions", json=body)
                j = r.json()
            except Exception as e:  # noqa: BLE001 - prototype: record and move on
                j = {"error": {"message": repr(e), "code": 0}}
            secs = time.perf_counter() - t0
            if "choices" in j or (j.get("error") or {}).get("code") not in (0, 429, 500, 502, 503, 504):
                break
            await asyncio.sleep(2 * 2**attempt)
    if "choices" not in j:
        return {"error": json.dumps(j.get("error", j))[:300], "secs": secs}
    raw = j["choices"][0]["message"].get("content") or ""
    out = {"raw": raw, "secs": round(secs, 3), "host": j.get("provider"),
           "reasoning_tokens": ((j.get("usage") or {}).get("completion_tokens_details") or {}).get("reasoning_tokens"),
           "cost": (j.get("usage") or {}).get("cost")}
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        parsed = json.loads(m.group(0) if m else raw)
        out["text"], out["unreadable"] = str(parsed.get("text", "")), bool(parsed.get("unreadable", False))
    except (ValueError, AttributeError):
        out["text"], out["unreadable"], out["error"] = "", True, "unparseable reply"
    return out


def score(card: dict, out: dict) -> dict:
    if "text" not in out:
        return {"verdict": "failed"}
    got, want = norm(out["text"]), norm(card["want"])
    if card["id"] < 0:  # blank card: the right answer is "unreadable"
        return {"verdict": "right" if out["unreadable"] or not got else "invented"}
    valid = not out["unreadable"] and VALID[card["kind"]].fullmatch(got) is not None
    if not valid:
        return {"verdict": "read error", "case_ok": got.lower() == want.lower()}
    if got == want:
        return {"verdict": "right"}
    return {"verdict": "case" if got.lower() == want.lower() else "wrong", "edits": levenshtein(got, want)}


async def run(args) -> Path:
    key = next((l.split("=", 1)[1].strip() for l in (HERE / ".env").read_text().splitlines() if l.startswith("OPENROUTER_API_KEY=")), None) \
        if (HERE / ".env").exists() else os.environ.get("OPENROUTER_API_KEY")
    cards = load_cards(Path(args.crops))
    if args.limit:
        cards = cards[: args.limit] + [c for c in cards if c["id"] < 0][:1]
    configs = [(m, p, q) for m in args.models.split(",") for p in args.preps.split(",") for q in args.prompts.split(",")]
    sem = asyncio.Semaphore(args.parallel)
    async with httpx.AsyncClient(timeout=60, headers={"Authorization": f"Bearer {key}", "X-Title": "snapscript #46 prototype"}) as client:
        jobs = [(cfg, c) for cfg in configs for c in cards]
        t0 = time.perf_counter()
        outs = await asyncio.gather(*(read_one(client, sem, cfg[0], prepped(c, cfg[1]), c["kind"], cfg[2]) for cfg, c in jobs))
        print(f"{len(jobs)} requests in {time.perf_counter() - t0:.1f} s")
    results = {f"{m}|{p}|{q}": {} for m, p, q in configs}
    for (cfg, c), out in zip(jobs, outs):
        results["|".join(cfg)][c["id"]] = {**out, **score(c, out)}
    runs = HERE / "runs"
    stem = runs / f"cloud-{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    meta = [{k: v for k, v in c.items() if k != "img"} for c in cards]
    stem.with_suffix(".json").write_text(json.dumps({"args": vars(args), "models": MODELS, "cards": meta, "results": results}, indent=1))
    return stem.with_suffix(".json")


def summary(cards: list[dict], res: dict) -> dict:
    real = [c for c in cards if c["id"] >= 0]
    v = lambda cs: [res[str(c["id"])]["verdict"] if str(c["id"]) in res else res[c["id"]]["verdict"] for c in cs]
    get = lambda c: res.get(str(c["id"])) or res.get(c["id"])
    vs = v(real)
    rc = [c for c in real if c["real"]]
    secs = [get(c)["secs"] for c in cards if "secs" in get(c)]
    blanks = [c for c in cards if c["id"] < 0]
    return {
        "exact": f"{vs.count('right')}/{len(vs)}",
        "ignoring case": f"{vs.count('right') + vs.count('case')}/{len(vs)}",
        "real text, exact": f"{v(rc).count('right')}/{len(rc)}",
        "wrong, not caught": f"{vs.count('wrong') + vs.count('case')}/{len(vs)}",
        "read errors": f"{vs.count('read error')}/{len(vs)}",
        "blanks invented": f"{v(blanks).count('invented')}/{len(blanks)}",
        "failed": vs.count("failed") + v(blanks).count("failed"),
        **{f"exact U={u}": f"{v([c for c in real if c['u_mm'] == u]).count('right')}/{sum(c['u_mm'] == u for c in real)}"
           for u in sorted({c["u_mm"] for c in real})},
        "median s": round(statistics.median(secs), 2) if secs else None,
        "slowest s": round(max(secs), 2) if secs else None,
        "reasoning tok": sum(get(c).get("reasoning_tokens") or 0 for c in cards),
        "hosts": sorted({str(get(c).get("host")) for c in cards}),
    }


def report(path: Path, crops: Path | None = None) -> None:
    d = json.loads(path.read_text())
    cards, results = d["cards"], d["results"]
    crops = crops or Path(d["args"]["crops"])
    imgs = {c["id"]: c["img"] for c in load_cards(crops)}
    sums = {cfg: summary(cards, res) for cfg, res in results.items()}
    for cfg, s in sums.items():
        print(f"{cfg:<28} " + "  ".join(f"{k} {v}" for k, v in s.items() if k != "hosts"))

    def thumb(img: Image.Image) -> str:
        img = img.resize((round(img.width * 80 / img.height), 80), Image.LANCZOS)  # 2× the shown size
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=85)
        return f'<img src="data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}" height="40">'

    colour = {"right": "#c8f0c8", "case": "#fde7a6", "wrong": "#f6b8b8", "invented": "#f6b8b8", "read error": "#d8d8e8", "failed": "#999"}
    keys = list(next(iter(sums.values())).keys())
    h = ["<!doctype html><meta charset=utf-8><title>PROTOTYPE #46 cloud reading</title>",
         "<style>body{font:13px system-ui;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 6px;vertical-align:middle}"
         "th{background:#f4f4f4;position:sticky;top:0}code{font-size:13px}.k{color:#666;font-size:11px}</style>",
         f"<h2>PROTOTYPE #46: cloud reading of handwritten cards</h2><p>{html.escape(path.name)}. One request per card. "
         "Green: right. Yellow: right ignoring case. Red: wrong and not caught (or text invented on a blank card). "
         "Grey-blue: read error (unreadable, or breaks the card kind's rules). Hover a cell for the model's raw reply.</p>",
         "<h3>Summary</h3><table><tr><th>config</th>" + "".join(f"<th>{k}</th>" for k in keys) + "</tr>"]
    for cfg, s in sums.items():
        h.append(f"<tr><td><b>{cfg}</b></td>" + "".join(f"<td>{html.escape(', '.join(v) if isinstance(v, list) else str(v))}</td>" for v in s.values()) + "</tr>")
    h.append("</table><h3>Every card</h3><table><tr><th>card</th><th>raw crop</th><th>cleaned</th>" + "".join(f"<th>{c.replace('|', '<br>')}</th>" for c in results) + "</tr>")
    for c in sorted(cards, key=lambda c: (c["id"] < 0, c["u_mm"], c["id"] % 100 if c["id"] >= 0 else -c["id"])):
        want = "(blank)" if c["id"] < 0 else c["want"]
        row = [f"<td><code>{html.escape(want)}</code><br><span class=k>{c['kind']} · U={c['u_mm']} · {c['length_u']}U{'' if c['real'] or c['id'] < 0 else ' · look-alike'}</span></td>",
               f"<td>{thumb(prepped({'img': imgs[c['id']]}, 'raw'))}</td><td>{thumb(prepped({'img': imgs[c['id']]}, 'clean'))}</td>"]
        for res in results.values():
            o = res.get(str(c["id"])) or {}
            shown = "unreadable" if o.get("unreadable") else o.get("text", o.get("error", "?"))
            row.append(f'<td style="background:{colour.get(o.get("verdict"), "#fff")}" title="{html.escape(str(o.get("raw", o.get("error", ""))))}">'
                       f"<code>{html.escape(shown)}</code> <span class=k>{o.get('secs', '')}s</span></td>")
        h.append("<tr>" + "".join(row) + "</tr>")
    h.append("</table>")
    out = path.with_suffix(".html")
    out.write_text("\n".join(h))
    print(f"wrote {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("crops", nargs="?", default="runs/A-16-20261025-233100-crops")
    ap.add_argument("--models", default=",".join(MODELS))
    ap.add_argument("--preps", default="raw,clean")
    ap.add_argument("--prompts", default="plain,kind")
    ap.add_argument("--label", default="all")
    ap.add_argument("--limit", type=int, help="only the first N cards (plus one blank), for a smoke test")
    ap.add_argument("--parallel", type=int, default=32, help="requests in flight at once")
    ap.add_argument("--report", help="rebuild the HTML page from a saved JSON")
    args = ap.parse_args()
    if args.report:
        report(Path(args.report))
        return
    report(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
