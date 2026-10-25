#!/usr/bin/env python3
"""
DigiBara local mod server  (extended edition).

Put this file and modloader.js in your game folder (the one that contains
index.html, js/, runner.data, runner.wasm, game.unx, dynamic_*.yytex), then:

    python serve_mods.py

and open http://localhost:8000

Your original files are never modified.  Defaults = vanilla gameplay.
"""
import datetime
import http.server
import json
import os
import pathlib
import socketserver
import struct
import sys

ROOT     = pathlib.Path(__file__).parent.resolve()
CFG_FILE = ROOT / "mods.json"
PORT     = int(os.environ.get("PORT", "8000"))

DEFAULTS = {
    "level_mult":         1.0,   # milk needed per level  (lower = faster)
    "game_speed":         1,     # time multiplier (1-3600)
    "unlock_patreon":     True,  # inject patreon-bypass flag into save
    "inf_money":          False, # auto-refill money to 1 000 000 every tick
    "inf_tank":           False, # remove tank-size cap  (stored milk never capped)
    "no_offline_penalty": False, # offline time counts at full 1x speed always
    "max_stats":          False, # keep energy/satiety/hygiene/horny at 100
    "remove_char_limit":  True,  # remove import limit on custom characters & unlock all
}


# ── game.unx binary patches ───────────────────────────────────────────────────
LEVEL_A_OFF = 0x1C5E18 + 8       # 0.1   constant
LEVEL_B_OFF = 0x1C5E18 + 0x14    # 0.115 constant
LEVEL_A_VAL = 0.1
LEVEL_B_VAL = 0.11499999999999999

# Custom character limit remover patches in game.unx
# 1. scr_import_custom_character check: jump over "Import limit reached" error
IMPORT_LIMIT_OFF = 1804520
IMPORT_LIMIT_ORIG = bytes.fromhex("0000450700000412")
IMPORT_LIMIT_PATCH = bytes.fromhex("0000000700000412")

# 2. scr_is_imported_character_locked: return 0 (false) immediately
CHAR_LOCKED_OFF = 1860656
CHAR_LOCKED_ORIG = bytes.fromhex("ffff5545151600a0")
CHAR_LOCKED_PATCH = bytes.fromhex("00000f8400005407")

# 3. 20-character import limits in scr_get_locked_imported_character_ids
LIMIT_20_OFFS = [1860544, 1860564, 1860688]


def load_cfg():
    cfg = dict(DEFAULTS)
    try:
        cfg.update(json.loads(CFG_FILE.read_text()))
    except Exception:
        pass
    return cfg


def save_cfg(cfg):
    CFG_FILE.write_text(json.dumps(cfg, indent=2))


def patched_unx(cfg):
    data = bytearray((ROOT / "game.unx").read_bytes())
    try:
        a = struct.unpack_from("<d", data, LEVEL_A_OFF)[0]
        b = struct.unpack_from("<d", data, LEVEL_B_OFF)[0]
        if abs(a - LEVEL_A_VAL) <= 1e-9 and abs(b - LEVEL_B_VAL) <= 1e-9:
            m = float(cfg.get("level_mult", 1.0))
            m = min(max(m, 0.01), 100.0)
            if m != 1.0:
                struct.pack_into("<d", data, LEVEL_A_OFF, LEVEL_A_VAL * m)
                struct.pack_into("<d", data, LEVEL_B_OFF, LEVEL_B_VAL * m)
    except Exception as e:
        print(f"WARNING: level patch error: {e}")

    # Custom character limit remover patch
    if cfg.get("remove_char_limit", True):
        if data[IMPORT_LIMIT_OFF:IMPORT_LIMIT_OFF+8] == IMPORT_LIMIT_ORIG:
            data[IMPORT_LIMIT_OFF:IMPORT_LIMIT_OFF+8] = IMPORT_LIMIT_PATCH
        if data[CHAR_LOCKED_OFF:CHAR_LOCKED_OFF+8] == CHAR_LOCKED_ORIG:
            data[CHAR_LOCKED_OFF:CHAR_LOCKED_OFF+8] = CHAR_LOCKED_PATCH
        for off in LIMIT_20_OFFS:
            if data[off:off+2] == b"\x14\x00":
                data[off:off+2] = (32767).to_bytes(2, "little")

    return bytes(data)


# ── HTTP handler ──────────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def _send(self, body, ctype, code=200):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ── GET ──────────────────────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/__mods/config":
            return self._send(json.dumps(load_cfg()), "application/json")

        if path == "/__mods/patreon_fake":
            future = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650)).strftime("%Y-%m-%d")
            data = {
                "ok": True,
                "found": True,
                "match": True,
                "valid": True,
                "status": "active",
                "tier": "digibara_premium_plus",
                "premium_tier": "digibara_premium_plus",
                "name": "DigiBara VIP",
                "email": "patreon@digibara.mod",
                "next_charge_date": future,
                "patreon_next_charge_date": future,
                "linked_at": "2024-01-01",
                "digibara_premium": True,
                "digibara_premium_plus": True,
                "is_premium": True,
                "is_premium_plus": True
            }
            return self._send(json.dumps(data), "application/json")

        if path == "/__mods/modloader.js":
            return self._send(
                (ROOT / "modloader.js").read_bytes(), "application/javascript"
            )

        if path.endswith("runner.wasm"):
            for cand in (ROOT / "runner.wasm", ROOT / "js" / "runner.wasm"):
                if cand.exists():
                    return self._send(cand.read_bytes(), "application/wasm")

        if path == "/js/htmlgame.js":
            # itch.io anti-hotlink guard – neutralise so game runs locally
            return self._send(b"/* disabled */", "application/javascript")

        if path == "/game.unx":
            return self._send(patched_unx(load_cfg()), "application/octet-stream")

        if path in ("/", "/index.html"):
            html = (ROOT / "index.html").read_text(encoding="utf-8", errors="replace")
            if "modloader.js" not in html:
                tag = '<script src="modloader.js"></script>'
                lower = html.lower()
                i = lower.find("<head>")
                html = (html[: i + 6] + tag + html[i + 6:]) if i >= 0 else tag + html
            return self._send(html.encode("utf-8"), "text/html; charset=utf-8")

        return super().do_GET()

    # ── POST ─────────────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == "/__mods/config":
            n = int(self.headers.get("Content-Length", "0"))
            try:
                incoming = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                return self._send("bad json", "text/plain", 400)

            cfg = load_cfg()
            bool_keys = {"unlock_patreon", "inf_money", "inf_tank",
                         "no_offline_penalty", "max_stats", "remove_char_limit"}
            float_keys = {"level_mult"}
            int_keys   = {"game_speed"}

            for k, v in incoming.items():
                if k in bool_keys:
                    cfg[k] = bool(v)
                elif k in float_keys:
                    cfg[k] = float(v)
                elif k in int_keys:
                    cfg[k] = int(v)

            save_cfg(cfg)
            return self._send(json.dumps(cfg), "application/json")

        self._send("not found", "text/plain", 404)

    def log_message(self, fmt, *args):
        pass   # keep console quiet; remove this line if you want request logs


# ── entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    for need in ("index.html", "game.unx", "runner.data", "modloader.js"):
        if not (ROOT / need).exists():
            sys.exit("Missing %s in %s" % (need, ROOT))
    class ReusableServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    with ReusableServer(("127.0.0.1", PORT), Handler) as srv:
        print("DigiBara mods running: http://localhost:%d  (Ctrl+C to stop)" % PORT)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
