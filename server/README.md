# 중산 올인원 서버

Express + JSON 파일 저장. 네이티브 모듈 없음.

## 로컬 실행
```bash
cd server && npm install && cp .env.example .env   # .env 에 GEMINI_API_KEY 입력(선택)
npm start                                            # http://localhost:8787/api/health
```

## Render 배포 (무료)
1. https://render.com → New → Web Service → 이 GitHub 저장소 연결
2. Root Directory `server`, Build `npm install`, Start `npm start`
3. Environment에 아래 값 입력 (운영 모드 예시)

| 키 | 값 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | 발급 키 | AI 풀이. 없으면 예시 모드 |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | 구글 로그인 버튼. 프론트는 `/api/health`에서 받아감 |
| `REQUIRE_LOGIN` | `1` | 모든 쓰기와 AI 풀이에 로그인 필수, 데모 계정 전환 숨김 |
| `ALLOW_DEMO_LOGIN` | `0` | 이메일 직접 입력 로그인 금지(구글만). 리허설 중엔 `1` |
| `ALLOW_RESET` | `0` | 데이터 초기화 API 금지 |
| `SEED` | `0` | 데모 글 없이 빈 상태로 시작 (`1`이면 예시 글 포함) |
| `ALLOWED_ORIGINS` | `https://nesewr.github.io,http://localhost:8765` | CORS |
4. 배포 주소(예: https://xxx.onrender.com)를 `data/config.json`의 `apiBase`에 넣고 커밋

무료 플랜은 15분 비활성 시 잠들며 첫 요청에 30~60초 걸립니다. 발표 전 `/api/health`를 한 번 열어 깨워 두세요.
파일 저장은 재배포 시 초기화됩니다(데모용).
