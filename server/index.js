/* 중산 올인원 서버: Express + JSON 파일 저장. 컬렉션 API / 로그인 / Gemini 프록시 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env 읽기 (dotenv 없이)
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch { }
const ENV = (k, d = '') => (process.env[k] ?? d);
const PORT = +ENV('PORT', 8787), DOMAIN = 'jungsan.hs.kr';
const GEMINI_KEY = ENV('GEMINI_API_KEY'), GEMINI_MODEL = ENV('GEMINI_MODEL', 'gemini-flash-latest'), GOOGLE_CLIENT_ID = ENV('GOOGLE_CLIENT_ID');
const ORIGINS = ENV('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
const DB_FILE = path.resolve(__dirname, ENV('DB_FILE', './db.json'));
const REQUIRE_LOGIN = ENV('REQUIRE_LOGIN', '0') === '1';   // 1이면 글·댓글·투표·분실물·오답노트 쓰기에 로그인 필수
const ALLOW_DEMO_LOGIN = ENV('ALLOW_DEMO_LOGIN', '1') === '1';
const ALLOW_RESET = ENV('ALLOW_RESET', '1') === '1';
const SEED = ENV('SEED', '1') === '1';                      // 0이면 빈 데이터로 시작

/* ---------- 저장소 ---------- */
const COLS = ['posts', 'comments', 'lost', 'notes', 'votes', 'profiles', 'sessions'];
let db = Object.fromEntries(COLS.map(c => [c, {}]));
const load = () => { try { const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); COLS.forEach(c => db[c] = d[c] || {}); return true; } catch { return false; } };
let saveTimer = null; const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db), () => { }), 300); };
const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

function seed() {
  let s; try { s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8')); } catch { return; }
  const addComments = (postId, list, parentId, d) => (list || []).forEach(c => { const id = uid(); db.comments[id] = { id, postId, parentId: parentId || null, createdAt: daysAgo(d), author: c.author, body: c.body, score: c.score || 0 }; addComments(postId, c.replies, id, Math.max(0, d - 0.2)); });
  (s.posts || []).forEach(p => { const id = uid(); db.posts[id] = { id, createdAt: daysAgo(p.daysAgo), author: p.author, community: p.community || 'free', title: p.title, body: p.body, score: p.score || 0 }; addComments(id, p.comments, null, Math.max(0, p.daysAgo - 0.3)); });
  (s.lost || []).forEach(l => { const id = uid(); db.lost[id] = { id, createdAt: daysAgo(l.daysAgo), ...l }; });
  (s.notes || []).forEach(n => { const id = uid(); db.notes[id] = { id, createdAt: daysAgo(n.daysAgo), author: n.author, subject: n.subject, tags: n.tags, question: n.question, imageDataUrl: null, steps: n.steps, answer: n.answer, concept: n.concept, pitfall: n.pitfall, reviewCount: n.reviewCount || 0, lastReviewed: null, source: 'seed' }; });
  save();
}
if (!load() || (SEED && !Object.keys(db.posts).length)) { if (SEED) seed(); else save(); }

/* ---------- 앱 ---------- */
const app = express();
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && (!ORIGINS.length || ORIGINS.includes(o))) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  else if (!ORIGINS.length) res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const user = req => { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const s = t && db.sessions[t]; return s ? db.profiles[s.email] : null; };
const bad = (res, code, msg) => res.status(code).json({ error: msg });

app.get('/api/health', (req, res) => res.json({ ok: true, ai: !!GEMINI_KEY, google: !!GOOGLE_CLIENT_ID, googleClientId: GOOGLE_CLIENT_ID || '', demoLogin: ALLOW_DEMO_LOGIN, requireLogin: REQUIRE_LOGIN, allowReset: ALLOW_RESET, counts: Object.fromEntries(['posts', 'comments', 'lost', 'notes'].map(c => [c, Object.keys(db[c]).length])) }));

/* ---------- 로그인 ---------- */
function parseEmail(email) {
  email = String(email || '').trim().toLowerCase();
  const m = email.match(/^([^@]+)@(.+)$/); if (!m) return { error: '이메일 형식이 아닙니다.' };
  const [, local, domain] = m; if (domain !== DOMAIN) return { error: `학교 계정(@${DOMAIN})만 사용할 수 있습니다.` };
  const st = local.match(/^(\d{2})-(\d)(\d{2})(\d{2})$/);
  if (st) return { email, role: 'student', entryYear: 2000 + +st[1], grade: +st[2], klass: +st[3], number: +st[4], studentId: st[2] + st[3] + st[4] };
  if (/[a-z]/.test(local)) return { email, role: 'teacher' };
  return { error: '학생은 입학년도-학번(예: 26-10302), 선생님은 영문이 포함된 주소여야 합니다.' };
}
app.post('/api/auth/login', async (req, res) => {
  let email, extra = {};
  if (req.body.credential) {
    if (!GOOGLE_CLIENT_ID) return bad(res, 400, '서버에 Google Client ID가 없습니다.');
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(req.body.credential)); const t = await r.json();
    if (!r.ok || t.aud !== GOOGLE_CLIENT_ID || t.email_verified !== 'true') return bad(res, 401, 'Google 토큰 검증 실패');
    email = t.email; extra = { googleName: t.name, picture: t.picture };
  } else {
    if (!ALLOW_DEMO_LOGIN) return bad(res, 403, '이메일 직접 입력 로그인이 꺼져 있습니다. Google 로그인을 사용하세요.');
    email = req.body.email;
  }
  const p = parseEmail(email); if (p.error) return bad(res, 400, p.error);
  const prev = db.profiles[p.email] || {};
  db.profiles[p.email] = { ...prev, ...p, ...extra, nickname: prev.nickname || '', setupDone: !!prev.setupDone, subject: prev.subject || '수학', lastLogin: new Date().toISOString() };
  const token = crypto.randomBytes(24).toString('hex'); db.sessions[token] = { email: p.email, createdAt: new Date().toISOString() }; save();
  res.json({ token, profile: db.profiles[p.email] });
});
app.post('/api/auth/setup', (req, res) => {
  const u = user(req); if (!u) return bad(res, 401, '로그인이 필요합니다.');
  const nick = String(req.body.nickname || '').trim();
  if (nick.length < 2 || nick.length > 12) return bad(res, 400, '닉네임은 2~12자');
  if (/^\d{2}-?\d{5}$|^\d{5}$/.test(nick)) return bad(res, 400, '학번은 닉네임으로 쓸 수 없습니다.');
  if (Object.values(db.profiles).some(x => x.email !== u.email && x.nickname === nick)) return bad(res, 409, '이미 쓰는 닉네임입니다.');
  Object.assign(u, { nickname: nick, subject: req.body.subject || u.subject, setupDone: true, setupAt: new Date().toISOString() }); save();
  res.json({ profile: u });
});
app.get('/api/me', (req, res) => { const u = user(req); u ? res.json({ profile: u }) : bad(res, 401, '로그인 안 됨'); });
app.post('/api/auth/logout', (req, res) => { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); delete db.sessions[t]; save(); res.json({ ok: true }); });

/* ---------- 컬렉션 ---------- */
const PUBLIC = ['posts', 'comments', 'lost'], PRIVATE = ['notes'];
const who = req => { const u = user(req); return u && u.setupDone ? u.nickname : (REQUIRE_LOGIN ? null : (req.body && req.body.author) || null); }; // 로그인 필수 모드가 아니면 데모 author 허용
const needLogin = (req, res) => { if (REQUIRE_LOGIN) { const u = user(req); if (!u || !u.setupDone) { bad(res, 401, '로그인이 필요합니다.'); return true; } } return false; };
function recomputeScores() {
  const sum = {}; Object.values(db.votes).forEach(map => Object.entries(map).forEach(([id, v]) => sum[id] = (sum[id] || 0) + v));
  Object.values(db.posts).forEach(p => { if (p.baseScore == null) p.baseScore = p.score || 0; p.score = p.baseScore + (sum[p.id] || 0); });
  Object.values(db.comments).forEach(c => { if (c.baseScore == null) c.baseScore = c.score || 0; c.score = c.baseScore + (sum[c.id] || 0); });
}
app.get('/api/c/:col', (req, res) => {
  const col = req.params.col; if (!PUBLIC.includes(col) && !PRIVATE.includes(col) && col !== 'votes') return bad(res, 404, '없는 컬렉션');
  if (col === 'votes') { const u = user(req); const me = u && u.setupDone ? u.nickname : req.query.as; return res.json(me ? { [me]: db.votes[me] || {} } : {}); }
  let items = Object.values(db[col]);
  if (PRIVATE.includes(col)) { const u = user(req); const me = u && u.setupDone ? u.nickname : req.query.as; items = me ? items.filter(x => x.author === me) : []; }
  items.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
  res.json(items.map(({ baseScore, ...x }) => x));
});
app.put('/api/c/:col/:id', (req, res) => {
  if (needLogin(req, res)) return;
  const col = req.params.col, id = req.params.id, data = req.body;
  if (col === 'votes') { const u = user(req); const me = u && u.setupDone ? u.nickname : id; db.votes[me] = data || {}; recomputeScores(); save(); return res.json({ ok: true }); }
  if (!PUBLIC.includes(col) && !PRIVATE.includes(col)) return bad(res, 404, '없는 컬렉션');
  if (!data || data.id !== id) return bad(res, 400, 'id 불일치');
  const me = who(req), prev = db[col][id];
  if (prev && prev.author !== me && !(col === 'lost' && Object.keys(data).every(k => prev[k] === data[k] || k === 'status'))) return bad(res, 403, '본인 글만 수정할 수 있습니다.');
  if (!prev && data.author !== me) return bad(res, 403, '작성자가 일치하지 않습니다.');
  if (col === 'posts' || col === 'comments') { db[col][id] = { ...data, baseScore: prev ? (prev.baseScore ?? 0) : 0 }; recomputeScores(); } // 점수는 서버의 투표 합으로만 계산
  else db[col][id] = { ...prev, ...data };
  save(); res.json({ ok: true, item: db[col][id] });
});
app.delete('/api/c/:col/:id', (req, res) => {
  if (needLogin(req, res)) return;
  const col = req.params.col, id = req.params.id; if (!PUBLIC.includes(col) && !PRIVATE.includes(col)) return bad(res, 404, '없는 컬렉션');
  const prev = db[col][id]; if (!prev) return res.json({ ok: true });
  const u = user(req), me = u && u.setupDone ? u.nickname : req.query.as; if (prev.author !== me) return bad(res, 403, '본인 글만 삭제할 수 있습니다.');
  delete db[col][id]; if (col === 'posts') Object.values(db.comments).filter(c => c.postId === id).forEach(c => delete db.comments[c.id]);
  save(); res.json({ ok: true });
});
app.post('/api/admin/reset', (req, res) => { if (!ALLOW_RESET) return bad(res, 403, '초기화가 꺼져 있습니다.'); ['posts', 'comments', 'lost', 'notes', 'votes'].forEach(c => db[c] = {}); seed(); res.json({ ok: true }); });

/* ---------- Gemini 프록시 ---------- */
const G = 'https://generativelanguage.googleapis.com/v1beta';
let modelCache = { names: null, at: 0, chosen: null };
async function listModels() {
  if (modelCache.names && Date.now() - modelCache.at < 6e5) return modelCache.names;
  const r = await fetch(`${G}/models?pageSize=200`, { headers: { 'x-goog-api-key': GEMINI_KEY } });
  if (!r.ok) throw new Error(`모델 목록 조회 실패 ${r.status}`);
  const d = await r.json();
  modelCache = { ...modelCache, names: (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')), at: Date.now() };
  return modelCache.names;
}
async function pickModel(exclude) {
  const names = await listModels();
  const ex = new Set(exclude || []);
  const prefs = [GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash'];
  for (const p of prefs) if (names.includes(p) && !ex.has(p)) return p;
  const ok = n => /^gemini/.test(n) && !/tts|image|audio|live|embedding|transcribe|robotics|computer-use|omni|customtools|nano/.test(n) && !ex.has(n);
  const flash = names.filter(n => ok(n) && /flash/.test(n) && !/preview|exp/.test(n)).sort().reverse();
  if (flash.length) return flash[0];
  const any = names.filter(ok).sort().reverse();
  return any[0] || null;
}
app.get('/api/ai/models', async (req, res) => {
  if (!GEMINI_KEY) return bad(res, 503, '서버에 Gemini 키가 없습니다.');
  try { const names = await listModels(); res.json({ configured: GEMINI_MODEL, chosen: modelCache.chosen, available: names }); }
  catch (e) { bad(res, 502, e.message); }
});
app.post('/api/solve', async (req, res) => {
  if (needLogin(req, res)) return;
  if (!GEMINI_KEY) return bad(res, 503, '서버에 Gemini 키가 없습니다.');
  const { text = '', subject = '', image = null } = req.body || {};
  if (!text && !image) return bad(res, 400, '문제가 비어 있습니다.');
  const prompt = ['너는 한국 고등학생을 가르치는 친절한 과목 선생님이다. 아래 문제를 학생이 혼자 이해할 수 있게 단계별로 풀어라.',
    `과목 힌트: ${subject}. 사진이 있으면 사진 속 문제를 먼저 정확히 읽어 question_text에 옮겨 적어라.`,
    '규칙: 한국어. 각 단계는 "무엇을 왜 하는지"를 한두 문장으로. 수식은 유니코드(², √, ×, ÷, −)로 간단히. 답만 주지 말 것.',
    '반드시 JSON만 출력: {"subject":"과목","question_text":"문제 원문","tags":["개념1","개념2"],"steps":["1단계","2단계"],"answer":"최종 답","concept":"핵심 개념 2~3문장","pitfall":"학생이 자주 하는 실수 1문장"}',
    text ? `\n문제:\n${text}` : '\n문제는 첨부한 사진에 있다.'].join('\n');
  const parts = [{ text: prompt }]; if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: String(image).split(',')[1] || image } });
  const call = async model => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 50000);
    try {
      return await fetch(`${G}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } })
      });
    } finally { clearTimeout(t); }
  };
  try {
    let model = modelCache.chosen || GEMINI_MODEL, r = await call(model), tried = [model], body = '';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4 && (r.status === 404 || r.status === 400 || r.status === 503 || r.status === 429); i++) {
      body = await r.text().catch(() => '');
      if ((r.status === 503 || r.status === 429) && i === 0) { await sleep(1500); r = await call(model); continue; }   // 일시 과부하 → 같은 모델 1회 재시도
      const hinted = (body.match(/use\s+models\/([\w.-]+)/i) || [])[1];     // 오류 메시지가 권하는 모델 우선
      const alt = (hinted && !tried.includes(hinted)) ? hinted : await pickModel(tried).catch(() => null);
      if (!alt) break;
      model = alt; tried.push(model); r = await call(model);
    }
    if (!r.ok) { if (!body) body = await r.text().catch(() => ''); return bad(res, 502, `Gemini 오류 ${r.status} (${tried.join(' → ')}) ${body.slice(0, 160)}`); }
    if (tried.length > 1) console.log('[gemini] 모델 대체:', tried.join(' → '));
    modelCache.chosen = model;
    const data = await r.json(); const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const out = JSON.parse(raw.replace(/^```json|```$/g, '').trim()); out._model = model; res.json(out);
  } catch (e) { bad(res, 502, 'Gemini 호출 실패: ' + e.message); }
});

app.get('/', (req, res) => res.type('text').send('중산 올인원 API. /api/health 확인'));
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}  ai=${!!GEMINI_KEY} google=${!!GOOGLE_CLIENT_ID} requireLogin=${REQUIRE_LOGIN} demoLogin=${ALLOW_DEMO_LOGIN} seed=${SEED} db=${DB_FILE}`));
