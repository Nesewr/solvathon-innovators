#!/usr/bin/env python3
"""
생기부 활동 자동 갱신 (이 맥에서 실행).
- 저장소 data/activities.json 의 수집일이 MAX_AGE_DAYS(기본 3일) 지났으면
  리로스쿨 수집 도구(JUNGSAN_DIR, 본인 계정 .env 사용)로 다시 수집 → 교사 실명 제거 → 저장소에 커밋·push.
- 리로스쿨 비밀번호·브라우저 세션은 JUNGSAN_DIR 에만 있고 저장소에는 들어가지 않는다.

사용:  python3 auto_update.py            # 3일 지났을 때만
       python3 auto_update.py --force    # 무조건
       python3 auto_update.py --no-fetch # 수집은 건너뛰고 정제·커밋만
       python3 auto_update.py --no-push  # push 생략
스케줄 등록: ./install_schedule.sh  (매일 07:30 launchd)
"""
import argparse, json, os, re, subprocess, sys
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent                                   # solvathon 저장소 루트
JUNGSAN = Path(os.getenv("JUNGSAN_DIR", str(Path.home() / "Documents" / "jungsan")))
MAX_AGE_DAYS = int(os.getenv("MAX_AGE_DAYS", "3"))
OUT = REPO / "data" / "activities.json"
LOG = JUNGSAN / "data" / "auto_update.log"
PY = sys.executable


def log(msg):
    line = f"[{datetime.now():%Y-%m-%d %H:%M}] {msg}"
    print(line, flush=True)
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        LOG.open("a", encoding="utf-8").write(line + "\n")
    except OSError:
        pass


def age_days():
    try:
        g = json.loads(OUT.read_text(encoding="utf-8")).get("generated")
        return (date.today() - date.fromisoformat(str(g)[:10])).days
    except Exception:
        return 10**6


def sanitize(src: Path, dst: Path) -> bool:
    """교사 실명·본문 제거본을 만들어 dst 에 쓴다. 내용이 바뀌었으면 True."""
    d = json.loads(src.read_text(encoding="utf-8"))
    out = []
    for a in d["activities"]:
        item = {k: a.get(k) for k in ["id", "title", "url", "board", "posted", "category", "categories", "record",
                                      "deadline", "grades", "status", "participatory", "summary", "info"]}
        for k in ["summary", "info", "title"]:
            if item.get(k):
                item[k] = re.sub(r"[가-힣]{2,4}\s?(선생님|교사|샘)(?!실)", r"담당 \1", item[k])
        courses = [{k: v for k, v in c.items() if k != "담당교사"} for c in (a.get("courses") or [])]
        if courses:
            item["courses"] = courses
        if a.get("ai"):                                        # AI 판정(있으면) 중 공개 가능한 필드만
            item["ai"] = {k: a["ai"].get(k) for k in ["worth", "reason", "tip"] if a["ai"].get(k) is not None}
        out.append(item)
    new = json.dumps({"generated": d.get("generated", date.today().isoformat()), "count": len(out), "activities": out,
                      "source": "팀원이 만든 리로스쿨 알리미(tools/riro-notifier)로 수집, 교사 실명 제거"},
                     ensure_ascii=False, indent=1)
    old = dst.read_text(encoding="utf-8") if dst.exists() else ""
    if "담당교사" in new:
        raise RuntimeError("정제 실패: 교사 이름 필드가 남아 있음")
    dst.write_text(new, encoding="utf-8")
    return new != old


def run(cmd, cwd):
    r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    if r.returncode != 0:
        log(f"FAIL {' '.join(map(str, cmd))[:80]} :: {(r.stderr or r.stdout).strip()[-300:]}")
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--no-push", action="store_true")
    ap.add_argument("--with-ai", action="store_true", help="수집 후 llm_filter.py 도 실행 (LLM 키 필요)")
    a = ap.parse_args()

    age = age_days()
    if not a.force and age < MAX_AGE_DAYS:
        log(f"최신 상태 (수집 {age}일 전, 기준 {MAX_AGE_DAYS}일) → 건너뜀")
        return 0
    if not (JUNGSAN / "scraper" / "fetch.py").exists():
        log(f"수집 도구를 찾을 수 없음: {JUNGSAN}"); return 1

    if not a.no_fetch:
        log(f"수집 시작 (마지막 수집 {age}일 전)")
        if not run([PY, "scraper/fetch.py", "--headless"], JUNGSAN):
            return 1
        if not run([PY, "scraper/classify.py"], JUNGSAN):
            return 1
        if a.with_ai:
            run([PY, "scraper/llm_filter.py"], JUNGSAN)

    changed = sanitize(JUNGSAN / "data" / "activities.json", OUT)
    if not changed:
        log("활동 목록 변화 없음 → 커밋 생략"); return 0
    n = json.loads(OUT.read_text(encoding="utf-8"))["count"]
    log(f"정제 완료: {n}건 → {OUT.relative_to(REPO)}")
    if not run(["git", "add", str(OUT.relative_to(REPO))], REPO):
        return 1
    if not run(["git", "commit", "-q", "-m", f"data: 생기부 활동 자동 수집 ({date.today().isoformat()}, {n}건)"], REPO):
        return 1
    if a.no_push:
        log("커밋 완료 (push 생략)"); return 0
    ok = run(["git", "push", "-q", "origin", "main"], REPO)
    log("push 완료" if ok else "push 실패 — 다음 실행 때 다시 시도")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
