# 중산 올인원 — 개발 계획 (2026-10-31)

> README 2·3절의 기획을 "오늘 몇 시에 무엇을 어떻게 만드는가"로 풀어 쓴 문서. 커밋은 매 시간 1회 이상, 15:30 마감.

## 0. 목표 한 줄
15:30까지 GitHub Pages에서 **"문제 입력 → AI 풀이 → 오답노트 자동 저장 → 다시 풀기"**와 **분실물 등록/목록/찾았어요**가 끊김 없이 동작한다. 발표 데모 2분은 이 흐름 그대로다.

## 1. 기술 스택과 제약
| 항목 | 결정 | 이유 |
|---|---|---|
| 프론트 | HTML + CSS + 바닐라 JS, 빌드 없음 | Pages에 바로 배포, 파일 단위 역할 분담 |
| 저장 | `localStorage` (키별 JSON 배열) + 데모 시드 | 서버·DB 없이 완성, 저장소에 키/개인정보 없음 |
| AI | Google Gemini `gemini-2.5-flash` (브라우저 직접 호출, CORS 확인됨) | 텍스트+사진 한 API, 무료 티어 |
| 키 | 설정 모달에서 입력 → `localStorage.settings.apiKey` | 공개 저장소 키 금지 규정 |
| 백업 | 키 없음/호출 실패 시 `data/seed.json`의 예시 풀이 사용 | 발표장 네트워크 장애 대비 |
| 배포 | GitHub Pages, main 브랜치 루트 | 실행 링크 제출 요건 |
| 글꼴 | Pretendard Variable (CDN) → 시스템 sans 폴백 | 한글 가독성, NVIDIA 디자인의 Inter 대체 |

제외: 로그인/회원가입, 서버, 리로스쿨 크롤링, 푸시 알림, 신고/차단.

## 2. 디자인 시스템 (NVIDIA DESIGN.md 기반 변형)
원본: https://getdesign.md/nvidia/design-md — "검은 프레임 + 흰 캔버스 + 단일 강한 녹색 액센트, 2px 각진 기하, 그림자 대신 헤어라인 테두리".

```css
:root{
  --primary:#76b900; --primary-dark:#5a8d00; --on-primary:#000;
  --ink:#000; --body:#1a1a1a; --mute:#757575; --stone:#898989; --ash:#a7a7a7;
  --canvas:#fff; --soft:#f7f7f7; --dark:#000; --elevated:#1a1a1a;
  --hairline:#ccc; --hairline-strong:#5e5e5e;
  --on-dark:#fff; --on-dark-mute:rgba(255,255,255,.7);
  --error:#e52020; --warning:#df6500; --success:#3f8500; --link:#0046a4;
  --r:2px; --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px; --section:64px;
}
```
적용 규칙
- 상단 내비 = `primary-nav`: 검정 배경 64px, 흰 글자 bold, 활성 탭은 글자 아래 3px 녹색 밑줄.
- 모든 버튼/카드/입력은 radius 2px. 그림자 없음. 카드는 1px `--hairline` 테두리 + 좌상단 12px 녹색 `corner-square`.
- 기본 버튼 = `button-primary`(녹색 배경, 검정 글자, 44px, bold). 보조 = `button-outline`(투명, 2px 녹색 테두리). 위험 = 빨강 outline.
- 입력 focus = 2px 녹색 테두리만. placeholder는 `--stone`.
- 섹션 제목 위에 `caption-md`(14px bold uppercase, `--mute`) 아이브로 텍스트. 예: "AI SOLVER", "WRONG-ANSWER NOTE".
- 상태 배지 = `badge-tag`(`--soft` 배경, 14px bold uppercase). "찾는 중" 회색, "찾음" 녹색 글자.
- 풀이 결과 패널은 검정 `cta-strip-dark` 스타일 헤더("풀이 완료") + 흰 본문.
- 모바일: 768px 아래에서 탭을 가로 스크롤, 카드 1열.

## 3. 파일 구조와 담당
```
index.html          레이아웃·탭·설정 모달 (완료)
css/style.css       토큰 + 컴포넌트 + 반응형
js/app.js           Store(localStorage), 라우팅(hash), 데모 계정, 설정, toast, 시드/초기화, 공용 util(esc, fmtDate, md→html)
js/solver.js        입력 폼, 이미지 → base64, Gemini 호출, 폴백, 결과 렌더, notes 저장
js/notes.js         목록(과목 필터·검색), 상세, 풀이 가리기/다시 풀기, 복습 횟수, 삭제
js/lost.js          등록 폼, 목록(상태 필터), 찾았어요/삭제(작성자만)
js/community.js     (선택) 글 목록/상세/작성, 댓글
js/activities.js    (선택) data/activities.json 표시 — 교사 실명 제거본
data/seed.json      데모 계정 2개, 예시 오답 3개, 분실물 3개, 게시글 2개, 폴백 풀이 1개
data/activities.json (선택)
docs/PLAN.md        이 문서
```
개인 참가라 파일 단위 분담은 "시간 분담"으로 README 7절에 기록.

## 4. 데이터 모델 (localStorage 키 `jso:*`)
```js
settings = { user:"김솔버", apiKey:"", model:"gemini-2.5-flash", seeded:true }
notes[]   = { id, createdAt, author, subject, tags[], question, imageDataUrl|null,
              solution(markdown), concept, answer, reviewCount, lastReviewed|null, source:"ai"|"fallback" }
lost[]    = { id, createdAt, author, item, kind:"lost"|"found", place, date, desc, contact, status:"finding"|"found" }
posts[]   = { id, createdAt, author, title, body }
comments[]= { id, postId, createdAt, author, body }
```
id = `Date.now().toString(36)+random`. author = 데모 계정 닉네임(김솔버/이코딩). 이미지는 최대 1024px로 리사이즈 후 JPEG dataURL(용량 제한 5MB 대비).

## 5. AI 호출 규격 (solver.js)
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, 헤더 `x-goog-api-key`.
- parts: `[ {text: 시스템 지시+문제텍스트}, {inline_data:{mime_type, data}} ]`(사진 있을 때).
- `generationConfig.responseMimeType = "application/json"`, 응답 스키마:
```json
{ "subject":"수학", "question_text":"문제 원문(사진이면 인식 결과)", "tags":["미분","극값"],
  "steps":["1단계 ...","2단계 ..."], "answer":"최종 답", "concept":"핵심 개념 2~3줄", "pitfall":"자주 하는 실수" }
```
- 지시문 핵심: 고등학생 눈높이, 한국어, 단계별, 답만 주지 말고 왜 그런지, 수식은 유니코드/간단 표기.
- 실패 처리: 키 없음 → 안내 토스트 + 폴백 풀이. HTTP 오류 → 메시지 표시 + 폴백 제안 버튼. 30초 타임아웃(AbortController).
- 결과는 즉시 `notes`에 저장하고 "오답노트에 저장됨 → 보기" 링크 표시.

## 6. 시간표와 커밋 체크포인트
| 시각 | 할 일 | 커밋 메시지 |
|---|---|---|
| 10:25–10:40 | 계획 문서, css 토큰·컴포넌트 | `docs: 개발 계획`, `feat: 디자인 토큰과 레이아웃` |
| 10:40–11:00 | app.js(Store/라우팅/설정/시드), seed.json, Pages 활성화 | `feat: 저장소·라우팅·데모 데이터` |
| 11:00–12:00 | solver.js: 입력→Gemini→결과→notes 저장, 폴백 | `feat: AI 문제 풀이와 오답노트 저장` |
| 12:00–12:40 | 점심 전 notes.js 목록/상세/다시 풀기 | `feat: 오답노트 목록·상세·다시 풀기` |
| 12:40–13:30 | lost.js 등록/목록/찾았어요 | `feat: 분실물 센터` |
| 13:30–14:15 | 사진 업로드·리사이즈·비전 풀이(선택 1) | `feat: 사진 문제 풀이` |
| 14:15–14:45 | community.js 글/댓글(선택 2), 모바일 점검 | `feat: 커뮤니티 게시판` |
| 14:45–15:00 | 데모 리허설 2회, 버그 수정 | `fix: ...` |
| 15:00–15:30 | README 4~8, 스크린샷 3장, 체크박스 갱신 | `docs: README 4-8과 실행 화면` |
| 15:30 | 커밋 금지. 발표 준비(슬라이드 0~2장) | — |

선택 기능은 14:15에 필수 4개가 모두 체크되지 않으면 건너뛴다.

## 7. 발표 데모 대본 (2분)
1. 설정에서 계정 "김솔버" 확인 (5초)
2. "예시 문제 넣기" → 과목 수학, 태그 자동 → "AI 풀이" 클릭 → 단계별 풀이·핵심 개념·실수 포인트 표시 (40초)
3. "오답노트" 탭 → 방금 문제가 맨 위, 과목 필터 → 상세 → 풀이 가리기 → "다시 풀기" → 복습 횟수 1 증가 (35초)
4. "분실물 센터" → 이코딩으로 전환 → "검정 이어폰 케이스, 3층 과학실" 등록 → 김솔버로 전환 → "찾았어요" (30초)
5. 설정 → "데모 데이터 초기화"로 깨끗한 상태 복구 가능함을 보여줌 (10초)

## 8. 위험과 대응
| 위험 | 대응 |
|---|---|
| 발표장 와이파이로 Gemini 호출 실패 | 폴백 예시 풀이 자동 전환, 미리 저장된 노트 3개로 시나리오 진행 |
| API 키 연령 제한/발급 불가 | 폴백 모드로 전체 데모 가능, README 8절 한계에 기록 |
| localStorage 용량(사진) | 1024px 리사이즈, JPEG 0.8, 노트 50개 초과 시 오래된 이미지 제거 |
| Pages 반영 지연(1~3분) | 15:20 이후 코드 변경 금지, 로컬 `python3 -m http.server`를 백업 시연 |
| 개인정보 실수 | push 전 `grep -nE '실명|학번|010-'` 검사, 커밋 작성자는 GitHub ID |

## 9. 결과 (15:10 기준)
- 필수 4개(AI 풀이, 오답노트 저장·목록, 다시 풀기·삭제, 분실물 지도 핀) 모두 배포 서버에서 동작.
- 계획보다 더 한 것: 학교 구글 계정 로그인, Express + Firestore 공유 서버, Reddit 구조 커뮤니티(사진·공지·이번 주 인기), 생기부 활동 탭(진로 적합 점수·AI 분석), 신고·차단·운영자(정지·광고판), 실제 교표 적용, 홈 애니메이션, 잠든 서버 자동 깨우기.
- 계획에서 뺀 것: 리로스쿨 서버 수집(해외 IP 차단 → 맥 launchd 3일 주기), OAuth 앱 게시(테스트 사용자만).
- 커밋 약 70회, 매시간 1회 이상. 15:30 이후 커밋 없음.
