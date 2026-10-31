"""
data/raw.json (fetch.py가 만든 원본 게시글) 을 읽어서
생기부에 도움이 되는 활동만 골라 data/activities.json 으로 저장한다.

각 활동에는 다음 정보가 붙는다.
- category : 활동 종류 (대회/공모전, 캠프/체험, 탐구/프로젝트, 봉사, 동아리, 독서/토론, 강연/설명회)
- record   : 생기부에서 반영될 수 있는 항목 (자율, 동아리, 진로, 교과세특, 봉사, 독서)
- deadline : 본문에서 찾은 마감일 (YYYY-MM-DD, 없으면 null)
- grades   : 대상 학년 목록 (예: [1, 2]), 못 찾으면 [] (전체로 취급)
"""
import json
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw.json"
OUT = ROOT / "data" / "activities.json"

# 활동 종류별 키워드. 제목+본문에서 하나라도 걸리면 그 종류로 분류한다.
CATEGORY_KEYWORDS = {
    "대회/공모전": ["대회", "공모전", "경시", "올림피아드", "콘테스트", "경진", "챌린지", "선발"],
    "캠프/체험": ["캠프", "체험", "탐방", "견학", "기행", "답사", "워크숍", "워크샵"],
    "탐구/프로젝트": ["탐구", "프로젝트", "연구", "R&E", "실험", "소논문", "과제연구"],
    "봉사": ["봉사", "자원봉사", "멘토링", "도우미", "재능기부"],
    "동아리": ["동아리", "자율동아리", "부원 모집", "동아리 모집"],
    "독서/토론": ["독서", "토론", "북클럽", "독후감", "서평", "디베이트"],
    "강연/설명회": ["강연", "특강", "설명회", "진로 특강", "초청", "박람회", "세미나"],
}

# 활동 종류 -> 생기부 항목
RECORD_MAP = {
    "대회/공모전": ["자율", "진로"],
    "캠프/체험": ["진로", "자율"],
    "탐구/프로젝트": ["교과세특", "진로"],
    "봉사": ["봉사"],
    "동아리": ["동아리"],
    "독서/토론": ["독서", "자율"],
    "강연/설명회": ["진로"],
}

# "신청", "모집" 같은 말이 있으면 참여형 활동일 가능성이 높다.
PARTICIPATION_WORDS = ["신청", "모집", "접수", "참가", "참여", "지원", "희망자"]

# 이런 글은 활동이 아니므로 제외한다.
EXCLUDE_WORDS = ["급식", "식단", "시간표", "정정", "취소", "결과 발표", "수상자 명단", "학사일정", "답안지", "학부모연수", "학부모 신청", "면접 양식", "등·하교", "하교 시간"]


def find_deadline(text: str, posted: str | None) -> str | None:
    """'~9월 30일까지', '9/30(화)까지', '2026.09.30' 같은 표현에서 마감일을 찾는다."""
    year = date.today().year
    if posted and re.match(r"\d{4}", posted):
        year = int(posted[:4])

    patterns = [
        r"(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})",        # 2026.09.30
        r"(\d{1,2})\s?월\s?(\d{1,2})\s?일\s?(?:\([^)]*\))?\s?까지",  # 9월 30일(화)까지
        r"(\d{1,2})\s?/\s?(\d{1,2})\s?(?:\([^)]*\))?\s?까지",     # 9/30(화)까지
        r"~\s?(\d{1,2})\s?[./월]\s?(\d{1,2})",                    # ~9.30, ~9월 30
    ]
    found = []
    for pat in patterns:
        for m in re.finditer(pat, text):
            g = m.groups()
            try:
                if len(g) == 3:
                    d = date(int(g[0]), int(g[1]), int(g[2]))
                else:
                    d = date(year, int(g[0]), int(g[1]))
                found.append(d)
            except ValueError:
                continue
    if not found:
        return None
    # 여러 날짜가 있으면 가장 늦은 날짜를 마감일로 본다.
    return max(found).isoformat()


def deadline_from_info(post: dict) -> str | None:
    """신청게시판 '신청 기간 : 2026.07.08(수) 08:00:00 ~ 08.12(수) 23:00:00' 와
    경시대회 '06-24 22:00:00 07-05 23:55:00' 형식에서 마감일을 뽑는다."""
    info = post.get("info") or ""
    # 끝 날짜는 '08.12(수)' 처럼 월.일 이거나 '25(화)' 처럼 일만 있을 수 있다
    m = re.search(r"신청 기간\s*:\s*(\d{4})\.(\d{2})\.(\d{2})[^~]*~\s*(?:(\d{4})\.)?(?:(\d{2})\.)?(\d{1,2})\s*\(", info)
    if m:
        y = int(m.group(4) or m.group(1))
        mo = int(m.group(5) or m.group(2))
        try:
            return date(y, mo, int(m.group(6))).isoformat()
        except ValueError:
            return None
    period = post.get("period") or ""
    ds = re.findall(r"(\d{2})-(\d{2}) \d{2}:\d{2}", period)
    if ds:
        mo, d = ds[-1]
        return date(date.today().year, int(mo), int(d)).isoformat()
    return None


def grades_from_courses(post: dict) -> list[int]:
    g = set()
    for c in post.get("courses") or []:
        for n in re.findall(r"[123]", c.get("학년", "")):
            g.add(int(n))
    return sorted(g)


def find_grades(text: str) -> list[int]:
    grades = set()
    if re.search(r"전\s?학년|전교생|1[,~\-]?\s?2[,~\-]?\s?3\s?학년", text):
        return [1, 2, 3]
    for m in re.finditer(r"([123])\s?학년", text):
        grades.add(int(m.group(1)))
    for m in re.finditer(r"([123])\s?[,·]\s?([123])\s?학년", text):
        grades.add(int(m.group(1)))
        grades.add(int(m.group(2)))
    return sorted(grades)


def classify(post: dict) -> dict | None:
    text = f"{post.get('title', '')}\n{post.get('body', '')}"
    title = post.get("title", "")

    if any(w in title for w in EXCLUDE_WORDS):
        return None

    text += " " + (post.get("info") or "") + " " + " ".join(c.get("강좌 이름", "") for c in post.get("courses") or [])
    categories = [c for c, words in CATEGORY_KEYWORDS.items() if any(w in text for w in words)]
    participatory = any(w in text for w in PARTICIPATION_WORDS) or post.get("board") in ("신청게시판", "경시대회")

    # 활동 키워드도 없고 신청/모집 표현도 없으면 일반 공지로 보고 버린다.
    if not categories and not participatory:
        return None
    if not categories:
        categories = ["기타 참여활동"]

    records = []
    for c in categories:
        for r in RECORD_MAP.get(c, ["자율"]):
            if r not in records:
                records.append(r)

    deadline = deadline_from_info(post) or find_deadline(text, post.get("posted"))
    grades = grades_from_courses(post) or find_grades(text)
    status = post.get("status") or ""
    if not status and post.get("courses"):
        st = {c.get("status") for c in post["courses"]}
        status = "마감" if st and st <= {"마감"} else "접수중"

    return {
        "id": post.get("id"),
        "title": title,
        "url": post.get("url"),
        "board": post.get("board"),
        "posted": post.get("posted"),
        "category": categories[0],
        "categories": categories,
        "record": records,
        "deadline": deadline,
        "grades": grades,
        "status": status,
        "participatory": participatory,
        "summary": re.sub(r"\s+", " ", post.get("body", "")).strip()[:200],
        "body": (post.get("body") or "")[:1500],
        "info": post.get("info", ""),
        "courses": post.get("courses", []),
        "attachments": post.get("attachments", []),
    }


def main():
    if not RAW.exists():
        raise SystemExit(f"{RAW} 가 없습니다. 먼저 fetch.py 를 실행하세요.")
    posts = json.loads(RAW.read_text(encoding="utf-8"))
    activities = [a for a in (classify(p) for p in posts) if a]
    # 마감일을 모르는데 게시한 지 60일 넘은 글은 지난 안내로 보고 뺀다
    cutoff = (date.today() - timedelta(days=60)).isoformat()
    activities = [a for a in activities if a["deadline"] or not a["posted"] or a["posted"][:10] >= cutoff]
    # 마감일이 가까운 순, 마감일 없는 건 뒤로
    activities.sort(key=lambda a: (a["deadline"] is None, a["deadline"] or "", a["posted"] or ""))
    OUT.write_text(json.dumps({
        "generated": date.today().isoformat(),
        "count": len(activities),
        "activities": activities,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"게시글 {len(posts)}개 중 활동 {len(activities)}개 -> {OUT}")


if __name__ == "__main__":
    main()
