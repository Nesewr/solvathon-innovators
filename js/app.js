/* 공용: 저장소(localStorage), 라우팅, 데모 계정, 설정, 시드, 토스트, 유틸 */
const Store = {
  prefix: 'jso:',
  get(key, def) {
    try { const v = localStorage.getItem(this.prefix + key); return v == null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(val)); }
    catch (e) { App.toast('저장 공간이 부족합니다. 오래된 사진이 있는 노트를 지워 주세요.', 'error'); }
    document.dispatchEvent(new CustomEvent('store:change', { detail: { key } }));
  },
  push(key, item) { const arr = this.get(key, []); arr.unshift(item); this.set(key, arr); return item; },
  update(key, id, patch) {
    const arr = this.get(key, []); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return null; arr[i] = { ...arr[i], ...patch }; this.set(key, arr); return arr[i];
  },
  remove(key, id) { this.set(key, this.get(key, []).filter(x => x.id !== id)); },
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
  tabs: ['solver', 'notes', 'lost', 'community'],
  modules() { return [typeof Solver !== 'undefined' && Solver, typeof Notes !== 'undefined' && Notes, typeof Lost !== 'undefined' && Lost, typeof Community !== 'undefined' && Community]; },
  settings() { return Store.get('settings', { user: '김솔버', apiKey: '', model: 'gemini-2.5-flash', seeded: false }); },
  saveSettings(patch) { Store.set('settings', { ...this.settings(), ...patch }); },
  user() { return this.settings().user; },

  async init() {
    try { this.seed = await (await fetch('data/seed.json')).json(); } catch { this.seed = null; }
    if (!this.settings().seeded && this.seed) this.applySeed();
    this.bindNav(); this.bindSettings(); this.renderUsers(); this.updateCounts();
    document.addEventListener('store:change', () => { this.updateCounts(); this.renderUsers(); });
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('scroll', () => document.querySelector('.top').classList.toggle('scrolled', scrollY > 4));
    this.modules().forEach(m => m && m.init && m.init());
    this.route();
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
    s.posts.forEach(p => {
      const id = U.uid(); posts.push({ id, createdAt: U.daysAgoISO(p.daysAgo), author: p.author, title: p.title, body: p.body });
      (p.comments || []).forEach(c => comments.push({ id: U.uid(), postId: id, createdAt: U.daysAgoISO(p.daysAgo - 0.5), author: c.author, body: c.body }));
    });
    Store.set('posts', posts); Store.set('comments', comments);
    this.saveSettings({ seeded: true });
  },

  resetDemo() {
    const keep = this.settings();
    Store.clearAll();
    Store.set('settings', { ...keep, seeded: false });
    if (this.seed) this.applySeed();
    this.toast('데모 데이터를 초기화했습니다.');
    this.route(true);
  },

  bindNav() {
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => this.go(b.dataset.tab)));
  },
  go(tab) { if (location.hash !== '#' + tab) location.hash = tab; else this.route(); },
  route(force) {
    const tab = this.tabs.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'solver';
    this.tabs.forEach(t => document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const mod = this.modules()[this.tabs.indexOf(tab)];
    if (mod && mod.render) mod.render(force);
    window.scrollTo(0, 0);
  },

  renderUsers() {
    const sel = document.getElementById('userSelect'); const users = (this.seed && this.seed.users) || ['김솔버', '이코딩'];
    const cur = this.user();
    sel.innerHTML = users.map(u => `<option ${u === cur ? 'selected' : ''}>${U.esc(u)}</option>`).join('');
    sel.onchange = () => { this.saveSettings({ user: sel.value }); this.toast(`${sel.value} 계정으로 전환`); this.route(true); };
  },
  updateCounts() {
    document.getElementById('notesCount').textContent = Store.get('notes', []).length;
    document.getElementById('lostCount').textContent = Store.get('lost', []).filter(l => l.status === 'finding').length;
  },

  bindSettings() {
    const modal = document.getElementById('settings'), key = document.getElementById('apiKey'), model = document.getElementById('apiModel');
    document.getElementById('settingsBtn').onclick = () => {
      const s = this.settings(); key.value = s.apiKey || ''; model.value = s.model || 'gemini-2.5-flash'; modal.classList.remove('hidden');
    };
    const close = () => {
      this.saveSettings({ apiKey: key.value.trim(), model: model.value }); modal.classList.add('hidden');
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
