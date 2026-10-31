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
3. Environment에 `GEMINI_API_KEY`, `ALLOWED_ORIGINS=https://nesewr.github.io,http://localhost:8765` 입력
4. 배포 주소(예: https://xxx.onrender.com)를 `data/config.json`의 `apiBase`에 넣고 커밋

무료 플랜은 15분 비활성 시 잠들며 첫 요청에 30~60초 걸립니다. 발표 전 `/api/health`를 한 번 열어 깨워 두세요.
파일 저장은 재배포 시 초기화됩니다(데모용).
