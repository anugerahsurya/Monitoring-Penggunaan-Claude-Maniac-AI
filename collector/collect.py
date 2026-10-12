"""
Monitoring Claude — pengumpul data penggunaan Claude Code (by Maniac AI).

Membaca transkrip sesi di ~/.claude/projects/**/*.jsonl (termasuk subagent), meringkasnya
per jam, per sesi, dan per jendela batas 5 jam, lalu mengunggahnya ke Supabase.
Tidak memanggil Claude sama sekali, jadi tidak memakai token.

Pemakaian:
  py collect.py                      unggah ke Supabase (butuh config.json)
  py collect.py --json out.json      simpan ke file JSON saja (untuk pratinjau lokal)
"""
import argparse
import glob
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))

# Harga API per 1 juta token (USD): input, output, cache read.
# Cache write 5 menit = 1,25x input, cache write 1 jam = 2x input.
# Sudah dicocokkan dengan totalCostUSD yang dicatat Claude Code sendiri.
PRICES = {
    "claude-fable-5-1": (10.0, 50.0, 0.25),
    "claude-fable-5": (10.0, 50.0, 1.0),
    "claude-opus-5-5": (4.0, 20.0, 0.20),
    "claude-opus-5": (5.0, 25.0, 0.50),
    "claude-opus-4-8": (5.0, 25.0, 0.50),
    "claude-opus-4-7": (5.0, 25.0, 0.50),
    "claude-opus-4-6": (5.0, 25.0, 0.50),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20),
    "claude-sonnet-5": (2.0, 10.0, 0.20),
    "claude-sonnet-4-6": (3.0, 15.0, 0.30),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-haiku-4-5": (1.0, 5.0, 0.10),
}
WEB_SEARCH_PER_1K = 10.0
WINDOW = timedelta(hours=5)


def cost_of(model, inp, out, cr, cw5, cw1h, web):
    p = PRICES.get(model)
    if not p:
        return 0.0
    i, o, r = p
    return (inp * i + out * o + cr * r + cw5 * i * 1.25 + cw1h * i * 2) / 1e6 + web * WEB_SEARCH_PER_1K / 1000


def parse_ts(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def project_name(cwd, folder):
    if cwd:
        if "scratch-workspaces" in cwd:
            return "Claude Desktop (scratch)"
        return os.path.basename(cwd.rstrip("\\/")) or cwd
    return folder


def is_human_prompt(d):
    """Pesan user yang benar-benar diketik manusia (bukan tool_result / meta)."""
    if d.get("isMeta") or d.get("isSidechain"):
        return False
    origin = d.get("origin")
    if isinstance(origin, dict):
        return origin.get("kind") == "human"
    c = d.get("message", {}).get("content")
    if isinstance(c, str):
        return not c.startswith("<") or c.startswith(("<command-name>", "<command-message>"))
    if isinstance(c, list):
        return any(isinstance(b, dict) and b.get("type") == "text" for b in c) and not any(
            isinstance(b, dict) and b.get("type") == "tool_result" for b in c
        )
    return False


def read_transcripts(root):
    calls = {}      # message.id -> data (satu respons API bisa tertulis di beberapa baris)
    sessions = {}
    prompts = []    # (datetime, sessionId)
    files = glob.glob(os.path.join(root, "**", "*.jsonl"), recursive=True)
    for f in files:
        folder = os.path.relpath(f, root).split(os.sep)[0]
        is_sub_file = os.sep + "subagents" + os.sep in f
        with open(f, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                sid = d.get("sessionId")
                if not sid:
                    continue
                t = d.get("type")
                s = sessions.setdefault(sid, {
                    "title": None, "project": None, "entry": None, "start": None, "end": None,
                    "prompts": 0, "lines_added": 0, "lines_removed": 0, "compactions": 0,
                    "version": None, "branch": None,
                })
                ts = d.get("timestamp")
                if ts:
                    s["start"] = min(s["start"] or ts, ts)
                    s["end"] = max(s["end"] or ts, ts)
                if d.get("cwd") and s["project"] is None:
                    s["project"] = project_name(d["cwd"], folder)
                if d.get("entrypoint"):
                    s["entry"] = d["entrypoint"]
                if d.get("version"):
                    s["version"] = d["version"]
                if d.get("gitBranch") and d["gitBranch"] != "HEAD":
                    s["branch"] = d["gitBranch"]

                if t in ("custom-title", "ai-title"):
                    title = d.get("customTitle") or d.get("aiTitle") or d.get("title")
                    if title and (t == "custom-title" or not s["title"]):
                        s["title"] = title
                elif t == "cost-state":
                    s["lines_added"] = max(s["lines_added"], d.get("totalLinesAdded") or 0)
                    s["lines_removed"] = max(s["lines_removed"], d.get("totalLinesRemoved") or 0)
                elif t == "system" and d.get("subtype") == "compact_boundary":
                    s["compactions"] += 1
                elif t == "user" and not is_sub_file and ts and is_human_prompt(d):
                    s["prompts"] += 1
                    prompts.append((parse_ts(ts), sid))
                elif t == "assistant":
                    m = d.get("message") or {}
                    u = m.get("usage")
                    model = m.get("model")
                    if not u or not ts or model == "<synthetic>":
                        continue
                    key = m.get("id") or d.get("requestId") or d.get("uuid")
                    cc = u.get("cache_creation") or {}
                    cw_total = u.get("cache_creation_input_tokens") or 0
                    cw1h = cc.get("ephemeral_1h_input_tokens") or 0
                    cw5 = cc.get("ephemeral_5m_input_tokens", cw_total - cw1h) or 0
                    rec = calls.get(key)
                    if rec is None:
                        rec = calls[key] = {
                            "t": parse_ts(ts), "model": model, "sid": sid, "entry": d.get("entrypoint"),
                            "sub": is_sub_file or bool(d.get("isSidechain")), "tools": [],
                        }
                    rec.update(
                        inp=u.get("input_tokens") or 0, out=u.get("output_tokens") or 0,
                        think=(u.get("output_tokens_details") or {}).get("thinking_tokens") or 0,
                        cr=u.get("cache_read_input_tokens") or 0, cw5=cw5, cw1h=cw1h,
                        web=(u.get("server_tool_use") or {}).get("web_search_requests") or 0,
                    )
                    for b in m.get("content") or []:
                        if isinstance(b, dict) and b.get("type") == "tool_use":
                            rec["tools"].append(b.get("name") or "?")
    for c in calls.values():
        c["cost"] = cost_of(c["model"], c["inp"], c["out"], c["cr"], c["cw5"], c["cw1h"], c["web"])
    return len(files), list(calls.values()), sessions, prompts


def aggregate(calls, sessions, prompts):
    hour_of = lambda dt: iso(dt.replace(minute=0, second=0, microsecond=0))
    unknown = "(tidak diketahui)"

    hourly = defaultdict(lambda: defaultdict(float))
    tools = defaultdict(int)
    for c in calls:
        s = sessions[c["sid"]]
        k = (hour_of(c["t"]), s["project"] or unknown, c["model"], c["entry"] or s["entry"] or unknown, c["sub"])
        h = hourly[k]
        h["calls"] += 1
        h["input"] += c["inp"]; h["output"] += c["out"]; h["thinking"] += c["think"]
        h["cache_read"] += c["cr"]; h["cache_write_5m"] += c["cw5"]; h["cache_write_1h"] += c["cw1h"]
        h["web_search"] += c["web"]; h["cost"] += c["cost"]
        for tool in c["tools"]:
            tools[k + (tool,)] += 1
    for t, sid in prompts:
        s = sessions[sid]
        hourly[(hour_of(t), s["project"] or unknown, "", s["entry"] or unknown, False)]["prompts"] += 1

    int_fields = ["calls", "prompts", "input", "output", "thinking", "cache_read", "cache_write_5m",
                  "cache_write_1h", "web_search"]
    hourly_rows = [
        dict(hour=k[0], project=k[1], model=k[2], entry=k[3], subagent=k[4],
             **{f: int(v.get(f, 0)) for f in int_fields}, cost=round(v.get("cost", 0), 6))
        for k, v in hourly.items()
    ]
    tool_rows = [dict(hour=k[0], project=k[1], model=k[2], entry=k[3], subagent=k[4], tool=k[5], count=n)
                 for k, n in tools.items()]

    per_sess = defaultdict(lambda: {"calls": 0, "tokens": 0, "cost": 0.0, "models": set()})
    for c in calls:
        a = per_sess[c["sid"]]
        a["calls"] += 1
        a["tokens"] += c["inp"] + c["out"] + c["cr"] + c["cw5"] + c["cw1h"]
        a["cost"] += c["cost"]
        a["models"].add(c["model"])
    session_rows = []
    for sid, s in sessions.items():
        a = per_sess.get(sid)
        if not a or not s["start"]:
            continue
        session_rows.append(dict(
            session_id=sid, title=s["title"] or "(tanpa judul)", project=s["project"] or unknown,
            entry=s["entry"] or unknown, models=", ".join(sorted(a["models"])),
            started_at=s["start"], ended_at=s["end"], prompts=s["prompts"], calls=a["calls"],
            tokens=a["tokens"], cost=round(a["cost"], 6), lines_added=s["lines_added"],
            lines_removed=s["lines_removed"], compactions=s["compactions"],
            version=s["version"], branch=s["branch"],
        ))

    # Jendela batas 5 jam: dimulai pada jam (dibulatkan ke bawah) dari pesan pertama,
    # berlaku 5 jam; pesan sesudahnya membuka jendela baru.
    events = sorted([(c["t"], "c", c) for c in calls] + [(t, "p", None) for t, _ in prompts], key=lambda e: e[0])
    windows, cur = [], None
    for t, kind, c in events:
        if cur is None or t >= cur["_end"]:
            start = t.replace(minute=0, second=0, microsecond=0)
            cur = {"_start": start, "_end": start + WINDOW, "_last": t, "calls": 0, "prompts": 0,
                   "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost": 0.0}
            windows.append(cur)
        cur["_last"] = t
        if kind == "p":
            cur["prompts"] += 1
        else:
            cur["calls"] += 1
            cur["input"] += c["inp"]; cur["output"] += c["out"]; cur["cache_read"] += c["cr"]
            cur["cache_write"] += c["cw5"] + c["cw1h"]; cur["cost"] += c["cost"]
    window_rows = [dict(started_at=iso(w["_start"]), ends_at=iso(w["_end"]), last_at=iso(w["_last"]),
                        calls=w["calls"], prompts=w["prompts"], input=w["input"], output=w["output"],
                        cache_read=w["cache_read"], cache_write=w["cache_write"], cost=round(w["cost"], 6))
                   for w in windows]
    return hourly_rows, tool_rows, session_rows, window_rows


def upload(cfg, payload):
    url = cfg["supabase_url"].rstrip("/") + "/rest/v1/rpc/ingest_usage"
    body = json.dumps({"p_token": cfg["ingest_token"], "p_hourly": payload["hourly"], "p_tools": payload["tools"],
                       "p_sessions": payload["sessions"], "p_windows": payload["windows"]}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": cfg["supabase_anon_key"], "Authorization": "Bearer " + cfg["supabase_anon_key"],
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Gagal mengunggah ({e.code}): {e.read().decode('utf-8', 'replace')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(os.path.expanduser("~"), ".claude", "projects"))
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--json", help="simpan hasil ke file JSON alih-alih mengunggah")
    ap.add_argument("--member", help="nama anggota (untuk --json; saat unggah, nama diambil dari token)")
    args = ap.parse_args()

    n_files, calls, sessions, prompts = read_transcripts(args.dir)
    hourly, tools, sess, windows = aggregate(calls, sessions, prompts)
    payload = {"hourly": hourly, "tools": tools, "sessions": sess, "windows": windows}
    total = sum(c["cost"] for c in calls)
    print(f"{n_files} file transkrip, {len(calls)} panggilan API, {len(sess)} sesi, "
          f"{len(prompts)} prompt, {len(windows)} jendela 5 jam, estimasi ${total:,.2f}")
    unknown = sorted({c["model"] for c in calls if c["model"] not in PRICES})
    if unknown:
        print("Model tanpa tarif (biaya dihitung 0):", ", ".join(unknown), file=sys.stderr)

    if args.json:
        member = args.member or os.environ.get("USERNAME") or "Saya"
        for rows in payload.values():
            for r in rows:
                r["member"] = member
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        print("Tersimpan:", args.json)
        return

    if not os.path.exists(args.config):
        sys.exit(f"config.json belum ada. Salin config.example.json menjadi config.json lalu isi. ({args.config})")
    with open(args.config, encoding="utf-8") as fh:
        cfg = json.load(fh)
    res = upload(cfg, payload)
    print(f"Terunggah sebagai {res.get('member')}: {res}")


if __name__ == "__main__":
    main()
