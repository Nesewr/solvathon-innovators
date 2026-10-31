"""브라우저에서 수집한 JSON을 POST로 받아 data/raw.json 에 저장하는 임시 서버."""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "data" / "raw.json"
class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get("content-length", 0)); body = self.rfile.read(n)
        data = json.loads(body)
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(f"saved {len(data)}".encode())
        print(f"saved {len(data)} posts", flush=True)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8766), H).serve_forever()
