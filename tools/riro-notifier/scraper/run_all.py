"""
전체 파이프라인을 한 번에 돌리고, 새로 생긴 '생기부 이득' 활동만 알려준다.

순서: fetch.py --headless (자동 로그인 수집) → classify.py → llm_filter.py
결과:
  - 새로 등장한 생기부 이득 활동이 있으면 macOS 알림을 띄우고 data/new_activities.json 에 기록
  - 실행 기록은 data/run.log 에 남김
스케줄 실행은 launchd(setup_schedule.sh)로 등록한다.
"""
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ACT = ROOT / "data" / "activities.json"
NEW = ROOT / "data" / "new_activities.json"
LOG = ROOT / "data" / "run.log"
PY = sys.executable


def log(msg: str):
    line = f"[{datetime.now():%Y-%m-%d %H:%M}] {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(script: str, *args) -> bool:
    r = subprocess.run([PY, str(ROOT / "scraper" / script), *args], capture_output=True, text=True)
    tail = (r.stdout.strip().splitlines() or [""])[-1]
    log(f"{script} {'OK' if r.returncode == 0 else 'FAIL'}: {tail[:120]}")
    if r.returncode != 0:
        log(r.stderr.strip()[-400:])
    return r.returncode == 0


def worth_ids() -> dict:
    if not ACT.exists():
        return {}
    d = json.loads(ACT.read_text(encoding="utf-8"))
    return {a["id"]: a for a in d["activities"] if a.get("ai", {}).get("worth")}


def notify(title: str, body: str):
    """macOS 알림센터. 다른 OS면 그냥 출력만."""
    if sys.platform == "darwin":
        safe = lambda s: s.replace('"', "'")
        subprocess.run(["osascript", "-e", f'display notification "{safe(body)}" with title "{safe(title)}"'], check=False)


def main():
    before = worth_ids()
    ok = run("fetch.py", "--headless")
    if not ok:
        notify("생기부 알리미", "리로스쿨 수집 실패. data/run.log 를 확인하세요.")
        return 1
    run("classify.py")
    run("llm_filter.py")
    after = worth_ids()

    new = [after[i] for i in after if i not in before]
    new.sort(key=lambda a: (a["deadline"] is None, a["deadline"] or ""))
    if new:
        NEW.write_text(json.dumps({"found": datetime.now().isoformat(timespec="minutes"), "activities": new},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
        head = new[0]
        extra = f" 외 {len(new) - 1}건" if len(new) > 1 else ""
        dl = f" (마감 {head['deadline']})" if head.get("deadline") else ""
        notify(f"생기부 이득 활동 {len(new)}건 새로 올라옴", f"{head['title'][:40]}{dl}{extra}")
        log("새 활동: " + " / ".join(a["title"][:30] for a in new))
    else:
        log("새로운 생기부 이득 활동 없음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
