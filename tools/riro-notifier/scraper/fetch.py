"""
리로스쿨(중산고)에서 게시글을 모아 data/raw.json 에 저장한다.

비밀번호를 코드에 넣지 않는다. 대신 Playwright 브라우저 프로필(.browser_profile)을
프로젝트 폴더에 유지해서, 처음 한 번만 브라우저 창에서 직접 로그인하면
그 뒤로는 저장된 로그인 세션을 재사용한다.

수집 대상
- 공지사항      board.php?db=1001
- 가정통신문    board_msg.php?db=1901
- 신청게시판    lecture.php?db=1704  (카테고리 하나가 활동 하나)
- 경시대회      portfolio.php?db=1554

주의: 리로스쿨은 주소 형식이 조금만 달라도(예: club=index 누락) '에러페이지'를 돌려준다.
또 서버에 부담을 주지 않도록 요청 사이에 DELAY 초를 쉰다.

실행:  python3 scraper/fetch.py
옵션:  --pages 3   공지/가정통신문에서 읽을 페이지 수 (기본 2)
       --full      이미 저장된 글도 본문을 다시 받는다
"""
import argparse
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv
import os

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright 가 없습니다.  pip3 install playwright && python3 -m playwright install chromium")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw.json"
PROFILE = ROOT / ".browser_profile"
BASE = "https://jungsan.riroschool.kr"
load_dotenv(ROOT / ".env")
RIRO_ID = os.getenv("RIRO_ID", "").strip()
RIRO_PW = os.getenv("RIRO_PW", "").strip()
DELAY = 1.5  # 요청 사이 대기(초)
MAX_AGE_DAYS = 60  # 이보다 오래된 글은 더 이상 수집하지 않는다
CUTOFF = (date.today() - timedelta(days=MAX_AGE_DAYS)).isoformat()


def too_old(posted: str | None) -> bool:
    return bool(posted) and posted[:10] < CUTOFF


def clean(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


class Riro:
    def __init__(self, context):
        self.ctx = context
        self.n = 0

    def get(self, path: str) -> BeautifulSoup:
        """세션 쿠키를 공유하는 요청. 막히면 60초 쉬고 한 번 더."""
        for attempt in range(2):
            time.sleep(DELAY)
            r = self.ctx.request.get(BASE + path)
            html = r.text()
            self.n += 1
            if "<title>에러페이지</title>" not in html:
                return BeautifulSoup(html, "html.parser")
            if attempt == 0:
                print("  리로스쿨이 잠시 막았습니다. 60초 기다립니다...", flush=True)
                time.sleep(60)
        raise RuntimeError(f"계속 에러페이지가 나옵니다: {path}")

    # ---- 공통: 글 보기 페이지 ----
    def view(self, path: str) -> tuple[str, list[str]]:
        d = self.get(path)
        body = d.select_one(".re_view_con")
        files = [re.sub(r"^\d+\s*\.\s*", "", clean(e.get_text())) for e in d.select(".flex_box_contents")]
        files = [re.sub(r"\s*\[[\d.]+[MK]\]$", "", f) for f in files]
        return clean(body.get_text(" ")) [:3000] if body else "", files


def fetch_notices(riro: Riro, known: dict, pages: int, full: bool) -> list[dict]:
    out = []
    for p in range(1, pages + 1):
        d = riro.get(f"/board.php?db=1001&action=list&page={p}")
        rows = [tr for tr in d.select("table.board_list_table tr") if tr.select_one("td.title a")]
        if not rows:
            break
        stale = fresh = 0
        for tr in rows:
            a = tr.select_one("td.title a")
            m = re.search(r"bL\(1,(\d+),(\d+)\)", a.get("href", ""))
            if not m:
                continue
            uid, inum = m.groups()
            pid = f"notice-{uid}"
            posted = clean(tr.select_one("td.date").get_text()).replace(".", "-")
            if too_old(posted):
                stale += 1; continue
            url = f"{BASE}/board.php?club=index&action=view&db=1001&uid={uid}&inum={inum}"
            if pid in known and not full:
                out.append(known[pid]); continue
            body, files = riro.view(url.replace(BASE, ""))
            fresh += 1
            out.append({"id": pid, "board": "공지사항", "title": clean(a.get_text()), "posted": posted,
                        "url": url, "body": body, "attachments": files})
            print(f"  공지사항: {out[-1]['title'][:40]}", flush=True)
        if stale == len(rows) or (fresh == 0 and not full):
            break  # 전부 오래됐거나 전부 아는 글이면 더 넘길 필요 없음
    return out


def fetch_msgs(riro: Riro, known: dict, pages: int, full: bool) -> list[dict]:
    out, seen = [], set()
    for p in range(1, pages + 1):
        d = riro.get(f"/board_msg.php?club=index&action=list&db=1901&page={p}")
        rows = [tr for tr in d.select("tr") if tr.select_one("a[href*='bL(1']") and not tr.find_parent(class_="depth")]
        new = 0
        for tr in rows:
            a = tr.select_one("a[href*='bL(1']")
            m = re.search(r"bL\(1,(\d+),(\d+)\)", a.get("href", ""))
            if not m:
                continue
            uid, inum = m.groups()
            pid = f"msg-{uid}"
            if pid in seen:
                continue
            seen.add(pid)
            tds = tr.find_all("td")
            posted = clean(tds[-1].get_text())[:10]
            if too_old(posted):
                continue
            url = f"{BASE}/board_msg.php?club=index&action=view&db=1901&uid={uid}&inum={inum}"
            if pid in known and not full:
                out.append(known[pid]); continue
            new += 1
            body, files = riro.view(url.replace(BASE, ""))
            out.append({"id": pid, "board": "가정통신문", "target": clean(tds[2].get_text()) if len(tds) > 2 else "",
                        "title": clean(a.get_text()), "posted": posted,
                        "url": url, "body": body, "attachments": files})
            print(f"  가정통신문: {out[-1]['title'][:40]}", flush=True)
        if new == 0 and not full:
            break  # 이 페이지에 새 글이 없으면 더 넘기지 않음
    return out


def apply_closed(post: dict) -> bool:
    """신청 기간이 끝났고 강좌가 모두 마감이면 다시 볼 필요 없다."""
    m = re.search(r"~\s*(?:(\d{4})\.)?(?:(\d{2})\.)?(\d{1,2})\s*\(", post.get("info") or "")
    m0 = re.search(r"신청 기간\s*:\s*(\d{4})\.(\d{2})\.(\d{2})", post.get("info") or "")
    if not (m and m0):
        return False
    end = f"{m.group(1) or m0.group(1)}-{m.group(2) or m0.group(2)}-{int(m.group(3)):02d}"
    courses = post.get("courses") or []
    return end < date.today().isoformat() and all(c.get("status") == "마감" for c in courses)


def fetch_apply(riro: Riro, known: dict, full: bool) -> list[dict]:
    """신청게시판: 왼쪽 메뉴의 카테고리 하나가 활동 하나. 이미 마감된 건 저장된 걸 재사용."""
    d = riro.get("/lecture.php?club=index&action=list&db=1704&cate=99")
    cates, seen = [], set()
    for el in d.select("[onclick*='lecture.php?db=1704&cate=']"):
        t = clean(el.get_text())
        m = re.search(r"cate=(\d+)", el["onclick"])
        if not m or t.startswith("-") or m.group(1) in seen:
            continue
        seen.add(m.group(1)); cates.append((m.group(1), t))
    out = []
    for cate, title in cates:
        pid = f"apply-{cate}"
        if pid in known and not full and apply_closed(known[pid]):
            out.append(known[pid]); continue
        d = riro.get(f"/lecture.php?club=index&action=list&db=1704&cate={cate}")
        info = clean((d.select_one(".lecture_list_info") or d.new_tag("x")).get_text(" "))
        body = ""
        btn = next((b for b in d.select("button") if "상세보기" in b.get_text()), None)
        if btn:
            m = re.search(r"bL\(1,\s*(\d+),\s*(\d+)\)", btn.get("onclick", ""))
            if m:
                body, _ = riro.view(f"/lecture.php?club=index&action=view&db=1704&cate={cate}&uid={m.group(1)}&inum={m.group(2)}")
        courses = []
        tbl = d.select_one("table.lecture_list_table")
        if tbl:
            heads = [clean(th.get_text()) for th in tbl.select("th")]
            for tr in tbl.select("tr"):
                tds = tr.find_all("td")
                if len(tds) < 5:
                    continue
                c = {h: clean(tds[i].get_text()) for i, h in enumerate(heads) if i < len(tds)}
                lab = tr.select_one(".riro-label")
                c["status"] = clean(lab.get_text()) if lab else ""
                tip = tr.select_one("a[data-tooltip]")
                c["desc"] = clean(re.sub(r"<[^>]+>", " ", tip["data-tooltip"]))[:200] if tip else ""
                courses.append(c)
        out.append({"id": f"apply-{cate}", "board": "신청게시판", "title": title, "posted": None,
                    "url": f"{BASE}/lecture.php?club=index&action=list&db=1704&cate={cate}",
                    "info": info, "body": body, "courses": courses, "attachments": []})
        print(f"  신청게시판: {title[:40]}", flush=True)
    return out


def fetch_contests(riro: Riro, known: dict, full: bool) -> list[dict]:
    d = riro.get("/portfolio.php?db=1554&action=idx")
    out = []
    for tr in d.select("tr"):
        a = tr.select_one("td.tit a.txt")
        if not a:
            continue
        cate = (re.search(r"cate=(\d+)", a.get("href", "")) or [None, ""])[1]
        pid = f"contest-{cate}"
        st = tr.select_one(".rd_status")
        if pid in known and not full and st and clean(st.get_text()) == "마감" and known[pid].get("status") == "마감":
            out.append(known[pid]); continue
        period = next((clean(td.get_text(" ")) for td in tr.find_all("td")
                       if re.search(r"\d{2}-\d{2} \d{2}:\d{2}", td.get_text())), "")
        status = tr.select_one(".rd_status")
        body = ""
        sv = tr.select_one("[onclick*='set_view']")
        if sv:
            q = re.search(r"'(\?[^']+)'", sv["onclick"])
            if q:
                body, _ = riro.view("/portfolio.php" + q.group(1).replace("&amp;", "&"))
        out.append({"id": f"contest-{cate}", "board": "경시대회", "title": clean(a.get_text()),
                    "status": clean(status.get_text()) if status else "", "period": period, "posted": None,
                    "url": f"{BASE}/portfolio.php?club=index&action=list&db=1554&cate={cate}", "body": body, "attachments": []})
        print(f"  경시대회: {out[-1]['title'][:40]}", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=2)
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--headless", action="store_true", help="창 없이 실행 (자동 실행용, .env 에 아이디/비밀번호 필요)")
    args = ap.parse_args()

    known = {}
    if RAW.exists():
        known = {p["id"]: p for p in json.loads(RAW.read_text(encoding="utf-8"))}

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(PROFILE), headless=args.headless, viewport={"width": 1100, "height": 800})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        if "signin" in page.url or page.locator("text=로그인이 필요합니다").count():
            if RIRO_ID and RIRO_PW:
                # .env 에 아이디/비밀번호가 있으면 로그인 폼을 채워서 자동 로그인 시도
                print("자동 로그인 시도 중...", flush=True)
                try:
                    # 리로스쿨 로그인 폼: #id (학교 아이디), #pw (비밀번호)
                    page.locator("#id").wait_for(timeout=10_000)
                    page.locator("#id").fill(RIRO_ID)
                    page.locator("#pw").fill(RIRO_PW)
                    page.locator("#pw").press("Enter")
                    page.wait_for_url(lambda u: "signin" not in u, timeout=20_000)
                    page.wait_for_load_state("networkidle")
                except Exception as e:
                    print(f"자동 로그인 실패({type(e).__name__}). 브라우저 창에서 직접 로그인해 주세요.", flush=True)
            if "signin" in page.url:
                if args.headless:
                    ctx.close()
                    sys.exit("자동 로그인이 안 됐습니다. .env 의 RIRO_ID/RIRO_PW 를 확인하거나, --headless 없이 실행해 직접 로그인하세요.")
                print("브라우저 창에서 리로스쿨에 로그인해 주세요. (최대 5분 기다립니다)", flush=True)
                page.wait_for_url(lambda u: "signin" not in u, timeout=300_000)
            page.wait_for_load_state("networkidle")
        print("로그인 확인. 수집을 시작합니다.", flush=True)

        riro = Riro(ctx)
        posts = []
        posts += fetch_notices(riro, known, args.pages, args.full)
        posts += fetch_msgs(riro, known, args.pages, args.full)
        posts += fetch_apply(riro, known, args.full)
        posts += fetch_contests(riro, known, args.full)
        ctx.close()

    # 이번에 못 본 옛 글도 보존하되, 마감일 없이 오래된 글(공지/가정통신문)은 버린다
    ids = {p["id"] for p in posts}
    posts += [p for pid, p in known.items() if pid not in ids and not too_old(p.get("posted"))]
    RAW.parent.mkdir(exist_ok=True)
    RAW.write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(posts)}개 글 저장 -> {RAW}  (요청 {riro.n}회)")


if __name__ == "__main__":
    main()
