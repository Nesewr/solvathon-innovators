"""
AI(DeepSeek 등 OpenAI 호환 API)로 각 글을 읽고
"참여하면 학교생활기록부에 실제로 기록되어 이득이 되는가"를 판정한다.

- 입력: data/activities.json (classify.py 결과, 키워드로 1차 걸러진 것)
- 출력: 같은 파일에 각 활동마다 ai 필드를 덧붙인다.
    ai.worth   : true/false   생기부에 실제 도움이 되는지
    ai.score   : 0~100        도움 정도
    ai.record  : ["자율", "진로", ...]  기록될 가능성이 높은 생기부 항목
    ai.reason  : 한 줄 이유
    ai.tip     : 참여할 때 생기부에 잘 남기려면 어떻게 해야 하는지 한 줄
- 한 번 판정한 글은 data/llm_cache.json 에 저장해 두고 다시 묻지 않는다 (비용 절약).

설정은 .env 에서 읽는다: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
실행: python3 scraper/llm_filter.py            (미판정 글만)
      python3 scraper/llm_filter.py --redo     (전부 다시)
"""
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
ACT = ROOT / "data" / "activities.json"
CACHE = ROOT / "data" / "llm_cache.json"
load_dotenv(ROOT / ".env")

BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com")
MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
API_KEY = os.getenv("LLM_API_KEY", "")

SYSTEM = """너는 한국 고등학교 학생부종합전형(학종)에 정통한 진로진학 상담교사다.
학생이 학교 리로스쿨에 올라온 글을 보고 "참여하면 학교생활기록부(생기부)에 실제로 기록되어
대입에 이득이 되는지" 판단하려 한다.

판단 기준 (2024학년도 이후 대입 기준):
- 교내 활동(교내 대회, 학교 주관 캠프·특강·탐구·봉사·동아리·독서토론·학생회 등)은
  창의적 체험활동(자율·동아리·진로·봉사)이나 교과 세부능력특기사항(세특)에 기록될 수 있다.
- 교외 활동(대학·기관 주관 설명회, 외부 캠프, 외부 공모전 수상 등)은 원칙적으로 생기부에
  기록되지 않는다. 단 학교장 승인 후 학교 주관으로 참여하는 경우, 또는 글에 "생기부 기재"가
  명시된 경우는 예외다.
- 학부모 대상 안내, 답안지·시간표·급식·학사일정 같은 단순 공지, 물품 구매 수요조사 등은 이득이 없다.
- 상담 서비스나 자료 제공 안내는 활동이 아니므로 기록되지 않는다.
- 봉사활동은 2024학년도부터 대입에 개인 봉사가 미반영되지만, 학교 교육계획에 따른 봉사는 기록된다.

반드시 아래 JSON 형식으로만 답한다. 다른 말은 쓰지 않는다.
{"worth": true 또는 false, "score": 0~100 정수, "record": ["자율","동아리","진로","봉사","세특","독서","해당없음" 중 해당하는 것들],
 "deadline": "신청 마감일 YYYY-MM-DD (글에서 확실히 알 수 있을 때만, 아니면 null)",
 "grades": [대상 학년 숫자들, 예: [1,2]. 전 학년이면 [1,2,3], 알 수 없으면 []],
 "reason": "한 문장 이유", "tip": "참여한다면 생기부에 잘 남기기 위한 한 문장 조언 (worth가 false면 빈 문자열)"}"""


def key_of(a: dict) -> str:
    raw = f"{a['id']}|{a['title']}|{(a.get('summary') or '')[:300]}"
    return hashlib.sha1(raw.encode()).hexdigest()


def build_user_prompt(a: dict) -> str:
    parts = [f"게시판: {a.get('board')}", f"제목: {a['title']}"]
    if a.get("posted"):
        parts.append(f"게시일: {a['posted']}")
    if a.get("deadline"):
        parts.append(f"마감(추정): {a['deadline']}")
    if a.get("grades"):
        parts.append(f"대상 학년(추정): {a['grades']}")
    if a.get("info"):
        parts.append(f"신청 정보: {a['info']}")
    if a.get("courses"):
        parts.append("세부 강좌: " + "; ".join(
            f"{c.get('강좌 이름') or c.get('title','')} (학년 {c.get('학년','')}, {c.get('status','')})" for c in a["courses"][:8]))
    if a.get("attachments"):
        parts.append("첨부파일: " + ", ".join(a["attachments"][:5]))
    parts.append("본문: " + (a.get("body") or a.get("summary") or "")[:1500])
    return "\n".join(parts)


def ask(client, a: dict) -> dict:
    resp = client.chat.completions.create(
        model=MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": build_user_prompt(a)}],
    )
    txt = resp.choices[0].message.content.strip()
    try:
        r = json.loads(txt)
    except json.JSONDecodeError:
        r = {"worth": False, "score": 0, "record": [], "reason": "응답 해석 실패: " + txt[:80], "tip": ""}
    return {
        "worth": bool(r.get("worth")),
        "score": int(r.get("score") or 0),
        "record": [x for x in (r.get("record") or []) if x != "해당없음"],
        "deadline": r.get("deadline") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(r.get("deadline") or "")) else None,
        "grades": sorted({int(g) for g in (r.get("grades") or []) if str(g) in "123"}),
        "reason": str(r.get("reason") or "")[:200],
        "tip": str(r.get("tip") or "")[:200],
        "model": MODEL,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="이번에 물어볼 최대 개수 (0=전부)")
    args = ap.parse_args()

    if not API_KEY or API_KEY.startswith("여기에"):
        sys.exit(".env 에 LLM_API_KEY 를 넣어 주세요 (.env.example 참고). 키는 직접 발급해서 넣어야 합니다.")
    from openai import OpenAI
    client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

    data = json.loads(ACT.read_text(encoding="utf-8"))
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() and not args.redo else {}
    asked = 0
    for a in data["activities"]:
        k = key_of(a)
        if k not in cache:
            if args.limit and asked >= args.limit:
                continue
            print(f"AI 판정 중: {a['title'][:45]}", flush=True)
            asked += 1
            try:
                cache[k] = ask(client, a)
            except Exception as e:
                msg = str(e)
                if "402" in msg or "Insufficient Balance" in msg:
                    sys.exit("DeepSeek 잔액이 없습니다. https://platform.deepseek.com 에서 충전한 뒤 다시 실행하세요.")
                if "Connection error" in msg or "APIConnectionError" in type(e).__name__:
                    sys.exit(f"AI 서버({BASE_URL})에 연결할 수 없습니다. 이 네트워크에서 DeepSeek 이 차단됐을 수 있어요. "
                             "다른 와이파이/핫스팟으로 바꾸거나 .env 의 LLM_BASE_URL/LLM_MODEL 을 다른 서비스로 바꿔 보세요.")
                if "401" in msg:
                    sys.exit("API 키가 잘못됐습니다. .env 의 LLM_API_KEY 를 확인하세요.")
                print(f"  실패: {msg[:120]}", flush=True)
                continue
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        a["ai"] = cache[k]
        # AI가 찾은 마감일/학년이 있으면 키워드 추정값보다 우선한다
        if a["ai"].get("deadline"):
            a["deadline"] = a["ai"]["deadline"]
        if a["ai"].get("grades"):
            a["grades"] = a["ai"]["grades"]

    # AI가 이득이라고 본 것을 위로, 그 안에서는 마감 임박순
    data["activities"].sort(key=lambda a: (
        not a.get("ai", {}).get("worth", False),
        -(a.get("ai", {}).get("score", 0)),
        a["deadline"] is None, a["deadline"] or "", a.get("posted") or ""))
    data["ai_model"] = MODEL
    data["ai_judged"] = sum(1 for a in data["activities"] if "ai" in a)
    ACT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    worth = sum(1 for a in data["activities"] if a.get("ai", {}).get("worth"))
    print(f"이번에 {asked}개 질문, 총 {data['ai_judged']}개 판정, 생기부 이득 {worth}개 -> {ACT}")


if __name__ == "__main__":
    main()
