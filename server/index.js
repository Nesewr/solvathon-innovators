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
const GEMINI_KEY = ENV('GEMINI_API_KEY'), GEMINI_MODEL = ENV('GEMINI_MODEL', 'gemini-3.5-flash-lite'), GOOGLE_CLIENT_ID = ENV('GOOGLE_CLIENT_ID');
const ORIGINS = ENV('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
const DB_FILE = path.resolve(__dirname, ENV('DB_FILE', './db.json'));
const REQUIRE_LOGIN = ENV('REQUIRE_LOGIN', '0') === '1';   // 1이면 글·댓글·투표·분실물·오답노트 쓰기에 로그인 필수
const ALLOW_DEMO_LOGIN = ENV('ALLOW_DEMO_LOGIN', '1') === '1';
const ALLOW_RESET = ENV('ALLOW_RESET', '1') === '1';
const SEED = ENV('SEED', '1') === '1';                      // 0이면 빈 데이터로 시작
const ADMINS = ENV('ADMIN_EMAILS', '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);   // 운영자 이메일 목록

/* ---------- 저장소: Firestore(서비스 계정이 있으면) 또는 JSON 파일 ---------- */
const COLS = ['posts', 'comments', 'lost', 'notes', 'votes', 'profiles', 'sessions', 'analysis', 'reports'];
let db = Object.fromEntries(COLS.map(c => [c, {}]));
let fsdb = null;                                   // Firestore 핸들 (없으면 파일 모드)
function loadServiceAccount() {
  const file = ENV('FIREBASE_SERVICE_ACCOUNT_FILE', path.join(__dirname, 'firebase.json'));
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('[firestore] 키 파일 읽기 실패', e.message); }
  if (ENV('FIREBASE_SERVICE_ACCOUNT')) { try { return JSON.parse(ENV('FIREBASE_SERVICE_ACCOUNT')); } catch (e) { console.error('[firestore] FIREBASE_SERVICE_ACCOUNT 파싱 실패', e.message); } }
  return null;
}
async function initFirestore() {
  const sa = loadServiceAccount(); if (!sa) return false;
  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
  fsdb = admin.firestore(); fsdb.settings({ ignoreUndefinedProperties: true });
  const snaps = await Promise.all(COLS.map(c => fsdb.collection(c).get()));
  snaps.forEach((snap, i) => { db[COLS[i]] = {}; snap.forEach(d => db[COLS[i]][d.id] = d.data()); });
  console.log('[firestore] 연결됨 project=' + sa.project_id + ' ' + COLS.map(c => `${c}:${Object.keys(db[c]).length}`).join(' '));
  return true;
}
// 파일 모드 저장
const load = () => { try { const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); COLS.forEach(c => db[c] = d[c] || {}); return true; } catch { return false; } };
let saveTimer = null; const save = () => { if (fsdb) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db), () => { }), 300); };
// 공통 쓰기 (메모리 + Firestore)
const slim = obj => { let o = obj; if (JSON.stringify(o).length > 900000 && Array.isArray(o.images) && o.images.length > 1) o = { ...o, images: o.images.slice(0, 1) }; if (JSON.stringify(o).length > 900000 && (o.imageDataUrl || (o.images || []).length)) return { ...o, imageDataUrl: null, images: [], imageDropped: true }; return o; };   // Firestore 문서 1MB 제한
function put(col, id, obj) { obj = slim(obj); db[col][id] = obj; if (fsdb) fsdb.collection(col).doc(String(id)).set(obj).catch(e => console.error('[firestore] 저장 실패', col, id, e.message)); else save(); return obj; }
function del(col, id) { delete db[col][id]; if (fsdb) fsdb.collection(col).doc(String(id)).delete().catch(e => console.error('[firestore] 삭제 실패', col, id, e.message)); else save(); }
async function clearCol(col) { if (fsdb) { const snap = await fsdb.collection(col).get(); const b = fsdb.batch(); snap.forEach(d => b.delete(d.ref)); await b.commit(); } db[col] = {}; save(); }
const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

function seed() {
  let s; try { s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8')); } catch { return; }
  const addComments = (postId, list, parentId, d) => (list || []).forEach(c => { const id = uid(); put('comments', id, { id, postId, parentId: parentId || null, createdAt: daysAgo(d), author: c.author, body: c.body, score: c.score || 0, baseScore: c.score || 0 }); addComments(postId, c.replies, id, Math.max(0, d - 0.2)); });
  (s.posts || []).forEach(p => { const id = uid(); put('posts', id, { id, createdAt: daysAgo(p.daysAgo), author: p.author, community: p.community || 'free', title: p.title, body: p.body, score: p.score || 0, baseScore: p.score || 0 }); addComments(id, p.comments, null, Math.max(0, p.daysAgo - 0.3)); });
  (s.lost || []).forEach(l => { const id = uid(); put('lost', id, { id, createdAt: daysAgo(l.daysAgo), ...l }); });
  (s.notes || []).forEach(n => { const id = uid(); put('notes', id, { id, createdAt: daysAgo(n.daysAgo), author: n.author, subject: n.subject, tags: n.tags, question: n.question, imageDataUrl: null, steps: n.steps, answer: n.answer, concept: n.concept, pitfall: n.pitfall, reviewCount: n.reviewCount || 0, lastReviewed: null, source: 'seed' }); });
}

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
const withAdmin = p => p ? { ...p, isAdmin: ADMINS.includes(String(p.email).toLowerCase()) } : p;
const user = req => { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); const s = t && db.sessions[t]; return s ? withAdmin(db.profiles[s.email]) : null; };
const isAdmin = req => { const u = user(req); return !!(u && u.isAdmin); };
const banned = (req, res) => { const u = user(req); if (u && u.banned) { bad(res, 403, '정지된 계정입니다. 운영자에게 문의하세요.'); return true; } return false; };
const bad = (res, code, msg) => res.status(code).json({ error: msg });

app.get('/api/health', (req, res) => res.json({ ok: true, storage: fsdb ? 'firestore' : 'file', ai: !!GEMINI_KEY, google: !!GOOGLE_CLIENT_ID, googleClientId: GOOGLE_CLIENT_ID || '', demoLogin: ALLOW_DEMO_LOGIN, requireLogin: REQUIRE_LOGIN, allowReset: ALLOW_RESET, admins: ADMINS.length, counts: Object.fromEntries(['posts', 'comments', 'lost', 'notes'].map(c => [c, Object.keys(db[c]).length])) }));

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
  const prof = put('profiles', p.email, { ...prev, ...p, ...extra, nickname: prev.nickname || '', setupDone: !!prev.setupDone, subject: prev.subject || '수학', lastLogin: new Date().toISOString() });
  const token = crypto.randomBytes(24).toString('hex'); put('sessions', token, { email: p.email, createdAt: new Date().toISOString() });
  res.json({ token, profile: withAdmin(prof) });
});
app.post('/api/auth/setup', (req, res) => {
  const u = user(req); if (!u) return bad(res, 401, '로그인이 필요합니다.');
  const nick = String(req.body.nickname || '').trim();
  if (nick.length < 2 || nick.length > 12) return bad(res, 400, '닉네임은 2~12자');
  if (/^\d{2}-?\d{5}$|^\d{5}$/.test(nick)) return bad(res, 400, '학번은 닉네임으로 쓸 수 없습니다.');
  if (Object.values(db.profiles).some(x => x.email !== u.email && x.nickname === nick)) return bad(res, 409, '이미 쓰는 닉네임입니다.');
  const track = ['eng', 'sw', 'med', 'hum', 'biz', 'edu', 'art'].includes(req.body.track) ? req.body.track : '', major = String(req.body.major || '').slice(0, 30);
  const prof = put('profiles', u.email, { ...u, nickname: nick, subject: req.body.subject || u.subject, track, major, setupDone: true, setupAt: new Date().toISOString() });
  res.json({ profile: withAdmin(prof) });
});
app.get('/api/me', (req, res) => { const u = user(req); u ? res.json({ profile: u }) : bad(res, 401, '로그인 안 됨'); });
/* 차단 목록(내 화면에서 숨김) */
app.post('/api/auth/block', (req, res) => {
  const u = user(req); if (!u) return bad(res, 401, '로그인이 필요합니다.');
  const nick = String(req.body.nickname || '').trim(); if (!nick || nick === u.nickname) return bad(res, 400, '잘못된 대상');
  const set = new Set(u.blocked || []); req.body.block === false ? set.delete(nick) : set.add(nick);
  const { isAdmin: _a, ...plain } = u; const prof = put('profiles', u.email, { ...plain, blocked: [...set] });
  res.json({ profile: withAdmin(prof) });
});
app.post('/api/auth/logout', (req, res) => { const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (db.sessions[t]) del('sessions', t); res.json({ ok: true }); });

/* ---------- 컬렉션 ---------- */
const PUBLIC = ['posts', 'comments', 'lost'], PRIVATE = ['notes'];
const who = req => { const u = user(req); return u && u.setupDone ? u.nickname : (REQUIRE_LOGIN ? null : (req.body && req.body.author) || null); }; // 로그인 필수 모드가 아니면 데모 author 허용
const needLogin = (req, res) => { if (REQUIRE_LOGIN) { const u = user(req); if (!u || !u.setupDone) { bad(res, 401, '로그인이 필요합니다.'); return true; } } return false; };
function recomputeScores(onlyIds) {
  const sum = {}; Object.values(db.votes).forEach(map => Object.entries(map).forEach(([id, v]) => sum[id] = (sum[id] || 0) + v));
  for (const col of ['posts', 'comments']) Object.values(db[col]).forEach(x => {
    if (onlyIds && !onlyIds.has(x.id)) return;
    const base = x.baseScore == null ? (x.score || 0) : x.baseScore, score = base + (sum[x.id] || 0);
    if (x.baseScore !== base || x.score !== score) put(col, x.id, { ...x, baseScore: base, score });
  });
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
  if (needLogin(req, res) || banned(req, res)) return;
  const col = req.params.col, id = req.params.id, data = req.body;
  if (col === 'votes') { const u = user(req); const me = u && u.setupDone ? u.nickname : id; const prevMap = db.votes[me] || {}; put('votes', me, data || {}); recomputeScores(new Set([...Object.keys(prevMap), ...Object.keys(data || {})])); return res.json({ ok: true }); }
  if (!PUBLIC.includes(col) && !PRIVATE.includes(col)) return bad(res, 404, '없는 컬렉션');
  if (!data || data.id !== id) return bad(res, 400, 'id 불일치');
  const me = who(req), prev = db[col][id];
  const admin = isAdmin(req);
  if (prev && prev.author !== me && !admin && !(col === 'lost' && Object.keys(data).every(k => prev[k] === data[k] || k === 'status'))) return bad(res, 403, '본인 글만 수정할 수 있습니다.');
  if (!prev && data.author !== me) return bad(res, 403, '작성자가 일치하지 않습니다.');
  if (col === 'posts' || col === 'comments') { put(col, id, { ...data, baseScore: prev ? (prev.baseScore ?? 0) : 0 }); recomputeScores(new Set([id])); } // 점수는 서버의 투표 합으로만 계산
  else put(col, id, { ...prev, ...data });
  res.json({ ok: true, item: db[col][id] });
});
app.delete('/api/c/:col/:id', (req, res) => {
  if (needLogin(req, res)) return;
  const col = req.params.col, id = req.params.id; if (!PUBLIC.includes(col) && !PRIVATE.includes(col)) return bad(res, 404, '없는 컬렉션');
  const prev = db[col][id]; if (!prev) return res.json({ ok: true });
  const u = user(req), me = u && u.setupDone ? u.nickname : req.query.as; if (prev.author !== me && !isAdmin(req)) return bad(res, 403, '본인 글만 삭제할 수 있습니다.');
  del(col, id); if (col === 'posts') Object.values(db.comments).filter(c => c.postId === id).forEach(c => del('comments', c.id));
  res.json({ ok: true });
});
/* ---------- 신고 ---------- */
const REASONS = ['실명·학번·개인정보 노출', '욕설·비방·조롱', '광고·도배', '부적절한 내용', '기타'];
app.post('/api/reports', (req, res) => {
  if (needLogin(req, res) || banned(req, res)) return;
  const { targetType, targetId, reason = '기타', detail = '' } = req.body || {};
  if (!['posts', 'comments', 'lost'].includes(targetType) || !db[targetType][targetId]) return bad(res, 404, '신고 대상이 없습니다.');
  const reporter = who(req); if (!reporter) return bad(res, 401, '로그인이 필요합니다.');
  const dup = Object.values(db.reports).find(r => r.targetId === targetId && r.reporter === reporter && r.status === 'open');
  if (dup) return res.json({ ok: true, item: dup, duplicate: true });
  const t = db[targetType][targetId];
  const rid = uid();
  const item = put('reports', rid, { id: rid, createdAt: new Date().toISOString(), targetType, targetId, reason: REASONS.includes(reason) ? reason : '기타', detail: String(detail).slice(0, 200), reporter, status: 'open',
    snapshot: { author: t.author, text: String(t.title || t.item || t.body || '').slice(0, 120), postId: t.postId || null } });
  res.json({ ok: true, item });
});
app.get('/api/reports', (req, res) => {
  if (!isAdmin(req)) return bad(res, 403, '운영자만 볼 수 있습니다.');
  Object.values(db.reports).forEach(r => { if (r.status === 'open' && !db[r.targetType][r.targetId]) put('reports', r.id, { ...r, status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: 'system', action: '대상 글이 이미 삭제됨' }); });
  const list = Object.values(db.reports).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).map(r => ({ ...r, exists: !!db[r.targetType][r.targetId] }));
  res.json(list);
});
app.patch('/api/reports/:id', (req, res) => {
  if (!isAdmin(req)) return bad(res, 403, '운영자만 처리할 수 있습니다.');
  const r = db.reports[req.params.id]; if (!r) return bad(res, 404, '없는 신고');
  const item = put('reports', r.id, { ...r, status: req.body.status === 'open' ? 'open' : 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: user(req).nickname, action: String(req.body.action || '') });
  res.json({ ok: true, item });
});
/* ---------- 운영자: 정지/해제, 사용자 목록 ---------- */
app.post('/api/admin/ban', (req, res) => {
  if (!isAdmin(req)) return bad(res, 403, '운영자만 할 수 있습니다.');
  const nick = String(req.body.nickname || '').trim(); const target = Object.values(db.profiles).find(p => p.nickname === nick);
  if (!target) return bad(res, 404, '해당 닉네임의 계정이 없습니다.');
  if (ADMINS.includes(String(target.email).toLowerCase())) return bad(res, 400, '운영자는 정지할 수 없습니다.');
  const prof = put('profiles', target.email, { ...target, banned: !!req.body.banned, bannedAt: req.body.banned ? new Date().toISOString() : null });
  res.json({ ok: true, nickname: prof.nickname, banned: !!prof.banned });
});
app.get('/api/admin/users', (req, res) => {
  if (!isAdmin(req)) return bad(res, 403, '운영자만 볼 수 있습니다.');
  res.json(Object.values(db.profiles).filter(p => p.setupDone).map(p => ({ nickname: p.nickname, role: p.role, grade: p.grade || null, banned: !!p.banned, isAdmin: ADMINS.includes(String(p.email).toLowerCase()), lastLogin: p.lastLogin })));
});
app.post('/api/admin/reset', async (req, res) => { if (!ALLOW_RESET) return bad(res, 403, '초기화가 꺼져 있습니다.'); for (const c of ['posts', 'comments', 'lost', 'notes', 'votes']) await clearCol(c); seed(); res.json({ ok: true }); });

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
  const prefs = [GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];  // 무료 플랜: 가벼운 모델 우선
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
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
    try {
      return await fetch(`${G}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 } })
      });
    } catch (e) { return { ok: false, status: 599, text: async () => '응답 지연(25초 초과): ' + e.message }; }   // 지연도 "다음 모델" 사유로 취급
    finally { clearTimeout(t); }
  };
  try {
    let model = modelCache.chosen || GEMINI_MODEL, r = await call(model), tried = [model], body = '';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4 && [404, 400, 503, 429, 599].includes(r.status); i++) {
      body = await r.text().catch(() => '');
      if ((r.status === 503 || r.status === 429) && i === 0) { await sleep(1200); r = await call(model); continue; }   // 일시 과부하 → 같은 모델 1회 재시도
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

/* ---------- 생기부 활동 AI 분석 (희망 계열 기준, 결과 캐시) ---------- */
const analysisCache = {};   // key(track|major) → { at, items }
async function geminiJSON(prompt, maxTokens) {
  const models = [GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest'];
  let lastErr = '';
  for (const model of [...new Set(models)]) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 40000);
    try {
      const r = await fetch(`${G}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: maxTokens || 4096 } })
      });
      if (!r.ok) { lastErr = `${model}: ${r.status}`; continue; }
      const data = await r.json(); const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      return { model, json: JSON.parse(raw.replace(/^```json|```$/g, '').trim()) };
    } catch (e) { lastErr = `${model}: ${e.message}`; } finally { clearTimeout(t); }
  }
  throw new Error(lastErr || '모델 없음');
}
app.post('/api/activities/analyze', async (req, res) => {
  if (needLogin(req, res)) return;
  if (!GEMINI_KEY) return bad(res, 503, '서버에 Gemini 키가 없습니다.');
  const { track = '', major = '', items = [] } = req.body || {};
  if (!Array.isArray(items) || !items.length) return bad(res, 400, '활동 목록이 비어 있습니다.');
  const key = `${track}|${major}`.toLowerCase();
  const cached = analysisCache[key] || (db.analysis && db.analysis[key]);
  if (cached && Date.now() - new Date(cached.at) < 864e5 && cached.ids === items.map(i => i.id).join(',')) return res.json({ cached: true, ...cached });
  const trackName = { eng: '공학·자연과학', sw: '컴퓨터·소프트웨어', med: '의학·보건', hum: '인문·사회', biz: '경영·경제', edu: '교육', art: '예체능' }[track] || '미정';
  const list = items.slice(0, 60).map(i => `- id=${i.id} | ${i.title} | 분류:${i.category || ''} | 생기부:${(i.record || []).join('/')} | 대상:${(i.grades || []).join(',') || '전체'} | ${String(i.summary || i.info || '').slice(0, 120)}`).join('\n');
  const prompt = ['너는 한국 고등학교 진로진학 상담 교사다. 학생의 희망 계열에 맞춰 아래 학교 활동들이 학교생활기록부(생기부)에 실제로 도움이 되는지 판정하라.',
    `학생 희망 계열: ${trackName}${major ? ` (희망 학과·직업: ${major})` : ''}`,
    '각 활동에 대해 JSON 배열로만 답하라: [{"id":"...","score":0~100 정수,"recommend":true/false,"reason":"이 학생에게 도움이 되는/안 되는 이유 1문장","tip":"참여한다면 생기부에 남기기 위한 준비·기록 팁 1문장"}]',
    '기준: 희망 계열과의 관련성, 생기부 기록 영역(진로/교과세특/자율/동아리/봉사), 활동의 깊이(단순 안내문·행정 공지는 낮게). 한국어, 간결하게.',
    '활동 목록:', list].join('\n');
  try {
    const { model, json } = await geminiJSON(prompt, 6000);
    const arr = Array.isArray(json) ? json : (json.items || json.results || []);
    const out = { at: new Date().toISOString(), model, track, major, ids: items.map(i => i.id).join(','), items: arr.map(x => ({ id: String(x.id), score: Math.max(0, Math.min(100, +x.score || 0)), recommend: !!x.recommend, reason: String(x.reason || '').slice(0, 200), tip: String(x.tip || '').slice(0, 200) })) };
    analysisCache[key] = out; if (!db.analysis) db.analysis = {}; put('analysis', key.replace(/[\/]/g, '_') || 'default', out);
    res.json({ cached: false, ...out });
  } catch (e) { bad(res, 502, 'AI 분석 실패: ' + e.message); }
});

app.get('/', (req, res) => res.type('text').send('중산 올인원 API. /api/health 확인'));
(async () => {
  let fsOK = false; try { fsOK = await initFirestore(); } catch (e) { console.error('[firestore] 초기화 실패, 파일 모드로 전환:', e.message); fsdb = null; }
  if (!fsOK) { if (!load()) save(); }
  if (SEED && !Object.keys(db.posts).length) seed();
  app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}  ai=${!!GEMINI_KEY} google=${!!GOOGLE_CLIENT_ID} requireLogin=${REQUIRE_LOGIN} demoLogin=${ALLOW_DEMO_LOGIN} seed=${SEED} storage=${fsdb ? 'firestore' : 'file:' + DB_FILE}`));
})();
