"""
사이트를 띄우고, 화면의 '분석하기' 버튼이 눌리면 run_all.py 를 실행해 주는 로컬 서버.

  python3 scraper/server.py      → http://localhost:8000/site/ 가 열린다

주소
  GET  /site/, /data/...   프로젝트 파일 그대로 제공
  POST /api/run            분석 시작 (이미 돌고 있으면 무시)
  POST /api/reset          데이터 초기화 (data/*.json 을 data/backup_시각/ 으로 옮김, 시연용)
  GET  /api/status         {"running": bool, "log": [...], "finished": "시각", "ok": bool}
"""
import json
import shutil
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8000
state = {"running": False, "log": [], "finished": None, "ok": None}
lock = threading.Lock()


def run_pipeline():
    with lock:
        state.update(running=True, log=[], finished=None, ok=None)
    proc = subprocess.Popen([sys.executable, str(ROOT / "scraper" / "run_all.py")],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=ROOT)
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            with lock:
                state["log"].append(line[-160:])
    proc.wait()
    with lock:
        state.update(running=False, finished=datetime.now().strftime("%H:%M"), ok=proc.returncode == 0)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):  # 조용히
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/status"):
            with lock:
                return self._json(dict(state))
        if self.path in ("/", ""):
            self.send_response(302); self.send_header("Location", "/site/"); self.end_headers(); return
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/reset":
            with lock:
                if state["running"]:
                    return self._json({"ok": False, "reason": "분석 중에는 초기화할 수 없습니다."})
                data = ROOT / "data"
                files = [f for f in ["raw.json", "activities.json", "new_activities.json", "llm_cache.json"] if (data / f).exists()]
                if files:
                    dest = data / f"backup_{datetime.now():%Y%m%d_%H%M%S}"
                    dest.mkdir()
                    for f in files:
                        shutil.move(str(data / f), str(dest / f))
                state.update(log=[], finished=None, ok=None)
            return self._json({"ok": True, "moved": files})
        if self.path == "/api/run":
            with lock:
                if state["running"]:
                    return self._json({"started": False, "reason": "already running"})
            threading.Thread(target=run_pipeline, daemon=True).start()
            return self._json({"started": True})
        self.send_error(404)

    def end_headers(self):
        if self.path.startswith("/data/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(ROOT)))
    url = f"http://localhost:{PORT}/site/"
    print(f"생기부 알리미 서버 실행 중: {url}  (끄려면 Ctrl+C)", flush=True)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
