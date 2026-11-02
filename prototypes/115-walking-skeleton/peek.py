"""PROTOTYPE (#115): print what the vision service sends, for N seconds."""
import json, socket, sys, time
s = socket.create_connection(("127.0.0.1", 8115)); f = s.makefile(); end = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 10)
for l in f:
    m = json.loads(l)
    if m["type"] == "state":
        print("STATE", m["seq"], f"lag {time.time() - m['t_cap']:.2f}s", [(c["marker"], c.get("hw", {}).get("state", "")) for c in m["cards"]])
    else:
        print("frame", {k: m[k] for k in ("age_s", "search_s", "hw_s", "loop_s", "markers", "cards")})
    if time.time() > end:
        break
