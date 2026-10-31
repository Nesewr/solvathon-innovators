# 중산고 생기부 활동 알리미

리로스쿨(https://jungsan.riroschool.kr)에 올라오는 글 중
참여하면 학교생활기록부(생기부)에 실제로 기록되어 이득이 되는 활동만 골라 보여주는 프로젝트입니다.

## 흐름

```
리로스쿨 ──fetch.py──▶ data/raw.json ──classify.py──▶ data/activities.json ──llm_filter.py──▶ (AI 판정 추가) ──▶ site/index.html
```

1. `scraper/fetch.py`      리로스쿨에서 공지사항, 가정통신문, 신청게시판, 경시대회 글을 모아 `data/raw.json` 저장
2. `scraper/classify.py`   키워드로 1차 분류(대회, 캠프, 탐구, 봉사, 동아리, 독서, 강연)하고 마감일과 대상 학년 추출
3. `scraper/llm_filter.py` DeepSeek 같은 저렴한 AI가 글을 읽고 "진짜 생기부에 기록되어 이득인지" 판정, 이유와 팁 작성
4. `site/index.html`       결과를 마감 임박순으로 보여주는 웹페이지

## 처음 설정 (한 번만)

```bash
pip3 install -r scraper/requirements.txt
python3 -m playwright install chromium
cp .env.example .env      # 그 다음 .env 를 열어 LLM_API_KEY 에 DeepSeek API 키 입력
```

`.env` 의 `RIRO_ID`, `RIRO_PW` 에 리로스쿨 아이디/비밀번호를 넣으면 자동 로그인합니다.
비워두면 `fetch.py` 실행 시 브라우저 창이 뜨고 직접 로그인하면 되며, 세션은 `.browser_profile/` 에 남습니다.
(`.browser_profile/`과 `.env`는 `.gitignore`에 있어 git에 올라가지 않습니다.)

## 매번 실행

`생기부 알리미 실행.command` 를 더블클릭하면 (또는 터미널에서 `python3 scraper/server.py`)
브라우저가 열립니다. 화면의 **리로스쿨 분석하기** 버튼을 누르면
자동 로그인 수집 → 분류 → AI 판정이 차례로 돌고, 끝나면 목록이 새로 뜹니다.
새로 올라온 생기부 이득 활동은 화면 위쪽 초록 상자와 macOS 알림으로 알려줍니다.

수동으로 단계별로 돌리고 싶으면:

```bash
python3 scraper/fetch.py --headless   # 새 글 수집 (이미 본 글은 건너뜀). --headless 빼면 창이 뜸
python3 scraper/classify.py           # 1차 분류
python3 scraper/llm_filter.py         # AI 판정 (이미 판정한 글은 캐시에서 재사용 → 비용 절약)
python3 scraper/run_all.py            # 위 세 개를 한 번에 + 새 활동 알림
```

## 파일 설명

| 파일 | 역할 |
|---|---|
| `scraper/fetch.py` | Playwright로 로그인 세션 유지, 게시판별 파서 (URL 형식은 `club=index&action=list&db=...` 를 지켜야 함. 다르면 리로스쿨이 에러페이지를 줌) |
| `scraper/classify.py` | 키워드 기반 분류 + 마감일/학년 정규식 추출 |
| `scraper/llm_filter.py` | OpenAI 호환 API 호출. `.env`의 `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` 사용. 결과는 `data/llm_cache.json`에 캐시 |
| `scraper/server.py` | 사이트를 띄우고 '분석하기' 버튼 요청을 받아 `run_all.py` 를 실행 |
| `scraper/run_all.py` | 수집→분류→AI 판정 일괄 실행, 새 이득 활동은 `data/new_activities.json` 과 macOS 알림 |
| `scraper/receiver.py` | (개발용) 브라우저에서 수집한 JSON을 받아 저장하는 임시 서버 |
| `site/index.html` | 웹페이지. `data/activities.json`을 읽음 |
| `site/collect.html` | (개발용) 브라우저 수집 데이터를 receiver 로 넘기는 페이지 |

## 리로스쿨 게시판 주소 (중산고)

| 게시판 | 목록 주소 |
|---|---|
| 공지사항 | `/board.php?club=index&action=list&db=1001&page=N` |
| 가정통신문 | `/board_msg.php?club=index&action=list&db=1901&page=N` |
| 신청게시판 | `/lecture.php?club=index&action=list&db=1704&cate=N` (카테고리 하나 = 활동 하나) |
| 경시대회 | `/portfolio.php?db=1554&action=idx` |

## 주의

- 본인 계정으로 본인이 볼 수 있는 글만 정리하는 용도입니다. 다른 학생에게 공개하려면 학교(담당 선생님)에 먼저 확인하세요.
- 리로스쿨 하단에 "무단수집 거부" 문구가 있습니다. 요청 사이에 쉬는 시간을 두어 서버에 부담을 주지 않게 만들어져 있습니다.

## 자동 갱신 (솔버톤 사이트용, 이 맥에서 실행)

`auto_update.py` 가 저장소 `data/activities.json` 의 수집일이 3일 지났으면 본인 리로스쿨 계정(`.env`)으로 다시 수집하고,
교사 실명을 지운 뒤 저장소에 커밋·push 한다. 사이트는 그 파일을 읽는다. `./install_schedule.sh` 로 매일 07:30 launchd 등록.
비밀번호·브라우저 세션은 이 폴더가 아니라 개인 작업 폴더(JUNGSAN_DIR)에만 있다.
