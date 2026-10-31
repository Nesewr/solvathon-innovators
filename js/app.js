/* 공용: 저장소(localStorage), 라우팅, 데모 계정, 설정, 시드, 토스트, 유틸 */
const Store = {
  prefix: 'jso:',
  get(key, def) {
    try { const v = localStorage.getItem(this.prefix + key); return v == null ? def : JSON.parse(v); }
    catch { return def; }
  },
  setLocal(key, val) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(val)); }
    catch (e) { App.toast('저장 공간이 부족합니다. 오래된 사진이 있는 노트를 지워 주세요.', 'error'); }
    document.dispatchEvent(new CustomEvent('store:change', { detail: { key } }));
  },
  set(key, val) {
    this.setLocal(key, val);
    if (key === 'votes' && typeof API !== 'undefined') { const me = App.user(); API.setVotes(me, (val || {})[me] || {}); }
  },
  push(key, item) { const arr = this.get(key, []); arr.unshift(item); this.setLocal(key, arr); typeof API !== 'undefined' && API.upsert(key, item); return item; },
  update(key, id, patch) {
    const arr = this.get(key, []); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return null; arr[i] = { ...arr[i], ...patch }; this.setLocal(key, arr); typeof API !== 'undefined' && API.upsert(key, arr[i]); return arr[i];
  },
  remove(key, id) { this.setLocal(key, this.get(key, []).filter(x => x.id !== id)); typeof API !== 'undefined' && API.remove(key, id); },
  clearAll() { Object.keys(localStorage).filter(k => k.startsWith(this.prefix)).forEach(k => localStorage.removeItem(k)); }
};

const U = {
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); },
  fmtDate(iso) {
    const d = new Date(iso), now = new Date(), diff = (now - d) / 60000;
    if (diff < 1) return '방금';
    if (diff < 60) return `${Math.floor(diff)}분 전`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`;
    if (diff < 60 * 24 * 7) return `${Math.floor(diff / 1440)}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  },
  tags(str) { return String(str || '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 6); },
  // 아주 작은 마크다운: **굵게**, `코드`, 줄바꿈
  md(s) {
    return U.esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
  }
};

const App = {
  seed: null,
  tabs: ['home', 'solver', 'notes', 'lost', 'community', 'activities'],
  modules() { return [typeof Home !== 'undefined' && Home, typeof Solver !== 'undefined' && Solver, typeof Notes !== 'undefined' && Notes, typeof Lost !== 'undefined' && Lost, typeof Community !== 'undefined' && Community, typeof Activities !== 'undefined' && Activities]; },
  settings() { return Store.get('settings', { user: '김솔버', apiKey: '', model: 'gemini-2.5-flash', seeded: false }); },
  saveSettings(patch) { Store.set('settings', { ...this.settings(), ...patch }); },
  user() { const p = typeof Auth !== 'undefined' && Auth.current(); return p && p.setupDone ? p.nickname : this.settings().user; },
  userTag() { const p = typeof Auth !== 'undefined' && Auth.current(); return p && p.setupDone ? Auth.roleLabel(p) : ''; },

  async init() {
    // 1) 네트워크를 기다리지 않고 바로 화면부터 그린다 (새로고침 때 다른 탭이 비치는 것 방지)
    this.bindNav(); this.bindSettings();
    this.modules().forEach(m => m && m.init && m.init());
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('scroll', () => document.querySelector('.top').classList.toggle('scrolled', scrollY > 4));
    this.route();
    // 2) 데이터·서버 연결
    try { this.seed = await (await fetch('data/seed.json')).json(); } catch { this.seed = null; }
    let config = {}; try { config = await (await fetch('data/config.json', { cache: 'no-store' })).json(); } catch { }
    this.config = config;
    if (/[?&]dev=1/.test(location.search)) this.saveSettings({ dev: true }); if (/[?&]dev=0/.test(location.search)) this.saveSettings({ dev: false });
    this.dev = !!this.settings().dev;
    if (typeof API !== 'undefined') await API.init(config);
    const online = typeof API !== 'undefined' && API.ready;
    if (!online && !this.settings().seeded && this.seed) this.applySeed();
    if (online) this.saveSettings({ seeded: true });
    this.renderServerState();
    document.addEventListener('store:refresh', () => { this.updateCounts(); this.rerender(); });
    document.addEventListener('api:online', async () => {
      this.saveSettings({ seeded: true }); this.renderServerState(); this.toast('서버에 연결됐습니다.');
      if (typeof Auth !== 'undefined') await Auth.onOnline();
      if (typeof Solver !== 'undefined') Solver.renderKeyState(); this.updateCounts(); this.rerender();
    });
    document.addEventListener('store:change', () => { this.updateCounts(); });
    if (typeof Auth !== 'undefined') await Auth.init(); else this.renderUsers();
    this.updateCounts(); this.rerender();
    if (typeof Solver !== 'undefined') Solver.renderKeyState();
  },

  applySeed() {
    const s = this.seed;
    Store.set('notes', s.notes.map(n => ({
      id: U.uid(), createdAt: U.daysAgoISO(n.daysAgo), author: n.author, subject: n.subject, tags: n.tags,
      question: n.question, imageDataUrl: null, steps: n.steps, answer: n.answer, concept: n.concept,
      pitfall: n.pitfall, reviewCount: n.reviewCount || 0, lastReviewed: null, source: 'seed'
    })));
    Store.set('lost', s.lost.map(l => ({ id: U.uid(), createdAt: U.daysAgoISO(l.daysAgo), ...l })));
    const posts = [], comments = [];
    const addComments = (postId, list, parentId, depthDays) => (list || []).forEach(c => {
      const id = U.uid();
      comments.push({ id, postId, parentId: parentId || null, createdAt: U.daysAgoISO(depthDays), author: c.author, body: c.body, score: c.score || 0 });
      addComments(postId, c.replies, id, Math.max(0, depthDays - 0.2));
    });
    s.posts.forEach(p => {
      const id = U.uid();
      posts.push({ id, createdAt: U.daysAgoISO(p.daysAgo), author: p.author, community: p.community || 'free', title: p.title, body: p.body, score: p.score || 0 });
      addComments(id, p.comments, null, Math.max(0, p.daysAgo - 0.3));
    });
    Store.set('posts', posts); Store.set('comments', comments); Store.set('votes', {});
    this.saveSettings({ seeded: true });
  },

  async resetDemo() {
    const keep = this.settings(), session = Store.get('session', null), profiles = Store.get('profiles', {});
    Store.clearAll();
    Store.setLocal('settings', { ...keep, seeded: false }); Store.setLocal('session', session); Store.setLocal('profiles', profiles);
    if (typeof API !== 'undefined' && API.ready) { await API.reset(); this.saveSettings({ seeded: true }); }
    else if (this.seed) this.applySeed();
    this.toast('데모 데이터를 초기화했습니다.');
    this.route(true);
  },
  rerender() { const [name] = location.hash.slice(1).split('/'); const tab = this.tabs.includes(name) ? name : 'home'; const mod = this.modules()[this.tabs.indexOf(tab)]; if (mod && mod.render) mod.render(false); },
  renderServerState() {
    const el = document.getElementById('srvState'); if (!el || typeof API === 'undefined') return;
    const st = API.status(); el.className = 'srv ' + st;
    el.innerHTML = st === 'online' ? '● 서버 연결' : st === 'waking' ? '<span class="spinner sm"></span>서버 깨우는 중…' : st === 'offline' ? '● 서버 없음 · 로컬' : '● 로컬 모드';
    el.title = st === 'online' ? `서버 연결됨${API.health && API.health.ai ? ' · AI 사용 가능' : ''}` : st === 'waking' ? '무료 서버가 잠들어 있어 깨우는 중입니다 (최대 1분). 그동안 쓴 글은 이 브라우저에만 저장됩니다.' : '이 브라우저에만 저장됩니다';
  },

  bindNav() {
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => this.go(b.dataset.tab)));
  },
  go(tab, sub) { const h = '#' + tab + (sub ? '/' + sub : ''); if (location.hash !== h) location.hash = h; else this.route(); },
  route(force) {
    const [name, ...rest] = location.hash.slice(1).split('/');
    const tab = this.tabs.includes(name) ? name : 'home'; this.sub = rest.join('/') || null;
    this.tabs.forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const mod = this.modules()[this.tabs.indexOf(tab)];
    if (mod && mod.render) mod.render(force);
    window.scrollTo(0, 0);
  },

  renderUsers() {
    const sel = document.getElementById('userSelect'); if (!sel) return; const users = (this.seed && this.seed.users) || ['김솔버', '이코딩'];
    const cur = this.user();
    sel.innerHTML = users.map(u => `<option ${u === cur ? 'selected' : ''}>${U.esc(u)}</option>`).join('');
    sel.onchange = () => { this.saveSettings({ user: sel.value }); this.toast(`${sel.value} 계정으로 전환`); this.route(true); };
  },
  updateCounts() {
    document.getElementById('notesCount').textContent = Store.get('notes', []).length;
    document.getElementById('lostCount').textContent = Store.get('lost', []).filter(l => l.status === 'finding').length;
  },

  bindSettings() {
    const modal = document.getElementById('settings'), key = document.getElementById('apiKey'), model = document.getElementById('apiModel'), gcid = document.getElementById('googleClientId'), apiBase = document.getElementById('apiBase');
    document.getElementById('settingsBtn').onclick = () => {
      const s = this.settings(); key.value = s.apiKey || ''; model.value = s.model || 'gemini-2.5-flash'; gcid.value = s.googleClientId || ''; apiBase.value = s.apiBase || '';
      const p = typeof Auth !== 'undefined' && Auth.current(); const acc = document.getElementById('settingsAccount');
      acc.innerHTML = p && p.setupDone
        ? `<div class="card soft" style="margin-bottom:16px"><div class="eyebrow">내 계정</div><b>${U.esc(p.nickname)}</b> <span class="tag green">${Auth.roleLabel(p)}</span><p class="small muted" style="margin:6px 0 10px">${U.esc(Auth.describe(p))}<br>${U.esc(p.email)}</p><div class="actions" style="margin:0"><button type="button" class="ghost small" onclick="document.getElementById('settings').classList.add('hidden');Auth.openSetup()">닉네임·과목 바꾸기</button><button type="button" class="ghost small danger" onclick="document.getElementById('settings').classList.add('hidden');Auth.logout()">로그아웃</button></div></div>`
        : `<div class="card soft" style="margin-bottom:16px"><div class="eyebrow">내 계정</div><p class="small muted" style="margin:0 0 10px">로그인하지 않았습니다. 데모 계정으로 사용 중입니다.</p><button type="button" class="primary small" onclick="document.getElementById('settings').classList.add('hidden');Auth.openLogin()">학교 계정 로그인</button></div>`;
      document.getElementById('devSettings').classList.toggle('hidden', !this.dev);
      modal.classList.remove('hidden');
    };
    const close = () => {
      const prevBase = this.settings().apiBase || ''; this.saveSettings({ apiKey: key.value.trim(), model: model.value, googleClientId: gcid.value.trim(), apiBase: apiBase.value.trim() }); if (apiBase.value.trim() !== prevBase) { this.toast('서버 주소를 바꿨습니다. 새로고침합니다.'); setTimeout(() => location.reload(), 600); } if (typeof Auth !== 'undefined') Auth.clientId = gcid.value.trim() || Auth.clientId; modal.classList.add('hidden');
      typeof Solver !== 'undefined' && Solver.renderKeyState();
    };
    document.getElementById('settingsClose').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('resetDemo').onclick = () => { if (confirm('모든 데모 데이터를 지우고 처음 상태로 돌립니다. 계속할까요?')) { modal.classList.add('hidden'); this.resetDemo(); } };
  },

  toast(msg, type) {
    const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast' + (type === 'error' ? ' error' : '');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.add('hidden'), 3200);
  }
};
