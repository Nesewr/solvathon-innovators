/* 로그인: 학교 구글 계정(Google Identity Services) 또는 학교 이메일 직접 입력(데모) → 이메일 규칙으로 역할·학번 자동 인식 → 첫 로그인 초기 설정 */
const Auth = {
  DOMAIN: 'jungsan.hs.kr', clientId: '',
  async init() {
    this.$ = id => document.getElementById(id);
    try { const c = await (await fetch('data/config.json')).json(); this.clientId = c.googleClientId || ''; } catch { }
    if (App.settings().googleClientId) this.clientId = App.settings().googleClientId;
    this.renderHeader();
    this.$('loginClose').onclick = () => this.$('login').classList.add('hidden');
    this.$('login').addEventListener('click', e => { if (e.target === this.$('login')) this.$('login').classList.add('hidden'); });
    this.$('demoLoginForm').onsubmit = e => { e.preventDefault(); const r = this.login(this.$('demoEmail').value.trim(), {}); if (r) this.$('login').classList.add('hidden'); };
    this.$('setupForm').onsubmit = e => this.finishSetup(e);
    this.$('nickRandom').onclick = () => { this.$('setupNick').value = this.randomNick(); };
    const cur = this.current(); if (cur && !cur.setupDone) this.openSetup();
  },

  /* ---------- 이메일 규칙 ---------- */
  parse(email) {
    email = String(email || '').trim().toLowerCase();
    const m = email.match(/^([^@]+)@(.+)$/); if (!m) return { error: '이메일 형식이 아닙니다.' };
    const [, local, domain] = m;
    if (domain !== this.DOMAIN) return { error: `학교 계정(@${this.DOMAIN})만 사용할 수 있습니다.` };
    const st = local.match(/^(\d{2})-(\d)(\d{2})(\d{2})$/);
    if (st) return { email, role: 'student', entryYear: 2000 + +st[1], grade: +st[2], klass: +st[3], number: +st[4], studentId: st[2] + st[3] + st[4] };
    if (/[a-z]/.test(local)) return { email, role: 'teacher' };
    return { error: '학생은 입학년도-학번(예: 26-10302), 선생님은 영문이 포함된 주소여야 합니다.' };
  },
  roleLabel(p) { return p.role === 'teacher' ? '교사' : `${p.grade}학년`; },
  describe(p) { return p.role === 'teacher' ? '선생님 계정' : `${p.entryYear}년 입학 · ${p.grade}학년 ${p.klass}반 ${p.number}번`; },
  randomNick() { const a = ['반짝이는', '졸린', '부지런한', '조용한', '용감한', '궁금한', '느긋한', '재빠른'], b = ['솔버', '코더', '펭귄', '고래', '여우', '다람쥐', '올빼미', '수달']; return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)] + Math.floor(Math.random() * 90 + 10); },

  /* ---------- 세션 / 프로필 ---------- */
  profiles() { return Store.get('profiles', {}); },
  current() { const s = Store.get('session', null); return s ? this.profiles()[s.email] || null : null; },
  login(email, extra) {
    const p = this.parse(email); if (p.error) { App.toast(p.error, 'error'); return null; }
    const all = this.profiles(); const prev = all[p.email] || {};
    all[p.email] = { ...prev, ...p, googleName: extra.name || prev.googleName || '', picture: extra.picture || prev.picture || '', lastLogin: new Date().toISOString(), setupDone: !!prev.setupDone, nickname: prev.nickname || '' };
    Store.set('profiles', all); Store.set('session', { email: p.email });
    this.renderHeader();
    if (!all[p.email].setupDone) this.openSetup(); else { App.toast(`${all[p.email].nickname}님, 다시 오셨네요!`); App.route(true); }
    return all[p.email];
  },
  logout() { Store.set('session', null); this.renderHeader(); App.toast('로그아웃했습니다. 데모 계정으로 전환됩니다.'); App.route(true); },

  /* ---------- 초기 설정 ---------- */
  openSetup() {
    const p = this.current(); if (!p) return;
    this.$('setupSummary').innerHTML = `
      <div class="r-stats"><div><b>${p.role === 'teacher' ? '교사' : '학생'}</b><span>역할</span></div>
      ${p.role === 'student' ? `<div><b>${p.entryYear}</b><span>입학년도</span></div><div><b>${p.grade}-${p.klass}</b><span>학년-반</span></div><div><b>${p.number}번</b><span>번호</span></div>` : ''}</div>
      <p class="small muted">${U.esc(p.email)} 주소에서 자동으로 읽었습니다. 이 정보는 이 기기에만 저장되고 화면에는 닉네임만 보입니다.</p>`;
    this.$('setupNick').value = p.nickname || this.randomNick();
    this.$('setupSubject').value = p.subject || (p.role === 'teacher' ? '수학' : '수학');
    this.$('setup').classList.remove('hidden'); this.$('setupNick').focus();
  },
  finishSetup(e) {
    e.preventDefault(); const p = this.current(); if (!p) return;
    const nick = this.$('setupNick').value.trim();
    if (nick.length < 2 || nick.length > 12) { App.toast('닉네임은 2~12자로 해주세요.', 'error'); return; }
    if (/^\d{2}-?\d{5}$|^\d{5}$/.test(nick)) { App.toast('학번은 닉네임으로 쓸 수 없습니다.', 'error'); return; }
    const taken = Object.values(this.profiles()).some(x => x.email !== p.email && x.nickname === nick);
    if (taken) { App.toast('이미 쓰는 닉네임입니다.', 'error'); return; }
    const all = this.profiles(); all[p.email] = { ...p, nickname: nick, subject: this.$('setupSubject').value, setupDone: true, setupAt: new Date().toISOString() };
    Store.set('profiles', all); this.$('setup').classList.add('hidden'); this.renderHeader();
    if (typeof Solver !== 'undefined') { const sel = document.getElementById('qSubject'); if (sel) sel.value = all[p.email].subject; }
    App.toast(`환영합니다, ${nick}님!`); App.route(true);
  },

  /* ---------- 구글 로그인 ---------- */
  openLogin() {
    this.$('login').classList.remove('hidden'); this.$('demoEmail').value = '';
    const box = this.$('gBtn'); box.innerHTML = '';
    if (!this.clientId) { box.innerHTML = `<p class="small muted">Google 로그인 버튼은 ⚙ 설정에 OAuth Client ID를 넣으면 나타납니다. 지금은 아래에 학교 이메일을 직접 입력해 주세요.</p>`; return; }
    box.innerHTML = `<p class="small muted"><span class="spinner"></span>Google 로그인 불러오는 중…</p>`;
    this.loadGIS().then(() => {
      google.accounts.id.initialize({ client_id: this.clientId, hd: this.DOMAIN, callback: r => this.onGoogle(r), ux_mode: 'popup' });
      box.innerHTML = ''; google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 300, locale: 'ko' });
    }).catch(() => { box.innerHTML = `<p class="small" style="color:var(--error)">Google 로그인 스크립트를 불러오지 못했습니다. 아래 이메일 입력으로 진행해 주세요.</p>`; });
  },
  loadGIS() {
    if (window.google && google.accounts) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  },
  onGoogle(r) {
    try {
      const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(r.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
      if (!payload.email_verified) throw new Error('이메일이 확인되지 않은 계정입니다.');
      const p = this.login(payload.email, { name: payload.name, picture: payload.picture });
      if (p) this.$('login').classList.add('hidden');
    } catch (e) { App.toast('Google 로그인 처리 실패: ' + e.message, 'error'); }
  },

  /* ---------- 상단 표시 ---------- */
  renderHeader() {
    const p = this.current(), el = this.$('authArea');
    if (p && p.setupDone) {
      el.innerHTML = `<div class="who">${p.picture ? `<img src="${p.picture}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${U.esc(p.nickname.slice(0, 1))}</span>`}
        <span class="nick">${U.esc(p.nickname)}</span><span class="tag green">${this.roleLabel(p)}</span></div>
        <button class="icon" title="로그아웃" onclick="Auth.logout()">⎋</button>`;
    } else {
      el.innerHTML = `<button class="ghost small on-dark" onclick="Auth.openLogin()">학교 계정 로그인</button><select id="userSelect" title="데모 계정 전환"></select>`;
      App.renderUsers && App.renderUsers();
    }
  }
};
