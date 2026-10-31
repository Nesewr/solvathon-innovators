/* 서버 연동: 서버가 살아 있으면 localStorage를 캐시로 쓰고 쓰기를 서버에 전달, 주기적으로 당겨옴. 없으면 로컬만 사용 */
const API = {
  base: '', ready: false, health: null, token: null, pollTimer: null, PUBLIC: ['posts', 'comments', 'lost'], PRIVATE: ['notes'],
  async init(config) {
    const s = App.settings(); const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    this.base = (s.apiBase || (local && config.apiBaseLocal) || config.apiBase || '').replace(/\/$/, '');
    this.token = (Store.get('session', null) || {}).token || null;
    if (!this.base) return false;
    this.ready = await this.tryHealth(4000);
    if (this.ready) { await this.pullAll(); this.startPolling(); }
    else this.reconnect();            // 잠든 서버 깨우기: 백그라운드로 계속 시도
    return this.ready;
  },
  async tryHealth(timeout) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
      const r = await fetch(this.base + '/api/health', { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t));
      this.health = await r.json(); return !!this.health.ok;
    } catch { return false; }
  },
  async reconnect() {
    if (this._reconnecting) return; this._reconnecting = true; this.waking = true;
    App.renderServerState && App.renderServerState();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const plan = [5000, 8000, 10000, 15000, 20000, 30000, 30000, 30000];   // 약 2분 30초 집중 시도, 이후 60초마다
    for (let i = 0; ; i++) {
      const interval = plan[Math.min(i, plan.length - 1)], t0 = Date.now();
      if (await this.tryHealth(Math.min(interval, 20000))) {
        this.ready = true; this.waking = false; this._reconnecting = false;
        await this.pullAll(); this.startPolling();
        document.dispatchEvent(new CustomEvent('api:online'));
        return;
      }
      if (i === plan.length - 1) { this.waking = false; App.renderServerState && App.renderServerState(); }   // 표시는 '서버 없음'으로, 시도는 계속
      await sleep(Math.max(1500, (i >= plan.length - 1 ? 60000 : interval) - (Date.now() - t0)));
    }
  },
  headers(json) { const h = {}; if (json) h['Content-Type'] = 'application/json'; if (this.token) h.Authorization = 'Bearer ' + this.token; return h; },
  me() { return App.user(); },
  async req(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: this.headers(!!body), body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && this.token && !path.startsWith('/api/auth/')) {   // 서버 재시작 등으로 세션이 사라짐
      this.token = null; Store.setLocal('session', null);
      if (typeof Auth !== 'undefined') { document.getElementById('setup').classList.add('hidden'); Auth.renderHeader(); App.toast('세션이 끊겨 다시 로그인해 주세요.', 'error'); Auth.openLogin(); }
    }
    if (!r.ok) throw Object.assign(new Error(data.error || ('HTTP ' + r.status)), { status: r.status });
    return data;
  },
  async pullAll() {
    const as = encodeURIComponent(this.me());
    const cols = [...this.PUBLIC, ...this.PRIVATE];
    const results = await Promise.all(cols.map(c => this.req('GET', `/api/c/${c}?as=${as}`).catch(() => null)));
    let changed = false;
    results.forEach((arr, i) => { if (arr && JSON.stringify(arr) !== JSON.stringify(Store.get(cols[i], []))) { Store.setLocal(cols[i], arr); changed = true; } });
    const votes = await this.req('GET', `/api/c/votes?as=${as}`).catch(() => null);
    if (votes) { const all = Store.get('votes', {}); const mine = votes[this.me()] || {}; if (JSON.stringify(all[this.me()] || {}) !== JSON.stringify(mine)) { all[this.me()] = mine; Store.setLocal('votes', all); changed = true; } }
    if (changed) document.dispatchEvent(new CustomEvent('store:refresh'));
  },
  startPolling() {
    clearInterval(this.pollTimer); this.fails = 0;
    this.pollTimer = setInterval(async () => {
      if (document.hidden) return;
      const ok = await this.tryHealth(6000);
      if (ok) { this.fails = 0; this.pullAll(); }
      else if (++this.fails >= 2) { clearInterval(this.pollTimer); this.ready = false; App.renderServerState && App.renderServerState(); App.toast('서버 연결이 끊겼습니다. 다시 연결 중…', 'error'); this.reconnect(); }
    }, 8000);
  },
  // 쓰기 전달 (실패하면 토스트만, 로컬은 유지)
  upsert(col, item) { if (!this.ready || !(this.PUBLIC.includes(col) || this.PRIVATE.includes(col))) return; this.req('PUT', `/api/c/${col}/${item.id}`, item).catch(e => App.toast('서버 저장 실패: ' + e.message, 'error')); },
  remove(col, id) { if (!this.ready || !(this.PUBLIC.includes(col) || this.PRIVATE.includes(col))) return; this.req('DELETE', `/api/c/${col}/${id}?as=${encodeURIComponent(this.me())}`).catch(e => App.toast('서버 삭제 실패: ' + e.message, 'error')); },
  setVotes(me, map) { if (!this.ready) return; this.req('PUT', `/api/c/votes/${encodeURIComponent(me)}`, map).catch(() => { }); },
  async reset() { if (!this.ready) return; await this.req('POST', '/api/admin/reset').catch(e => App.toast('서버 초기화 실패: ' + e.message, 'error')); await this.pullAll(); },
  // 로그인
  async login(body) { const d = await this.req('POST', '/api/auth/login', body); this.token = d.token; return d; },
  async setup(body) { return this.req('POST', '/api/auth/setup', body); },
  async logout() { await this.req('POST', '/api/auth/logout').catch(() => { }); this.token = null; },
  async solve(payload) { return this.req('POST', '/api/solve', payload); },
  async analyze(payload) { return this.req('POST', '/api/activities/analyze', payload); },
  status() { return !this.base ? 'local' : this.ready ? 'online' : this.waking ? 'waking' : 'offline'; }
};
