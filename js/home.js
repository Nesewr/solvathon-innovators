/* 홈: 히어로·숫자·기능 카드·최근 글·찾는 중 분실물 */
const Home = {
  init() {
    this.$ = id => document.getElementById(id);
    this.io = ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); this.io.unobserve(e.target); } }), { threshold: .15 }) : null;
  },
  /* 숫자 0 → 목표값 카운트업 */
  countUp(el, to) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 900 + Math.min(600, to * 20);
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  },
  /* 스크롤 등장: 기능 카드·목록·띠에 순차 지연 */
  reveal() {
    const els = [...document.querySelectorAll('#tab-home .features .feature, #tab-home .home-cols > .card, #tab-home .cta-strip, #tab-home .foot')];
    els.forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = (i % 5) * 70 + 'ms'; if (this.io) this.io.observe(el); else el.classList.add('in'); });
  },
  render() {
    const posts = Store.get('posts', []), lost = Store.get('lost', []), notes = Store.get('notes', []), comments = Store.get('comments', []);
    const finding = lost.filter(l => l.status === 'finding'), today = new Date().toDateString();
    const p = typeof Auth !== 'undefined' && Auth.current();
    const hl = this.$('heroLogin'); if (p && p.setupDone) { hl.textContent = `${p.nickname}님, 오늘도 환영해요`; hl.onclick = () => App.go('community'); } else { hl.textContent = '학교 계정으로 시작하기'; hl.onclick = () => Auth.openLogin(); }
    this.$('homeStats').innerHTML = [
      [notes.length, p && p.setupDone ? '내 오답노트' : '오답노트'],
      [finding.length, '찾는 중인 분실물'],
      [posts.length, '커뮤니티 글'],
      [posts.filter(x => new Date(x.createdAt).toDateString() === today).length + comments.filter(x => new Date(x.createdAt).toDateString() === today).length, '오늘 새 글·댓글']
    ].map(([n, l]) => `<div><b data-n="${n}">0</b><span>${l}</span></div>`).join('');
    this.$('homeStats').querySelectorAll('b').forEach(b => this.countUp(b, +b.dataset.n));
    if (!this._revealed) { this._revealed = true; this.reveal(); }
    // 운영자 공지
    const pinned = typeof Community !== 'undefined' ? Community.pinnedPosts() : [];
    this.$('homeNotice').innerHTML = pinned.slice(0, 2).map(x => `<div class="notice-strip" onclick="App.go('community','${x.id}')"><span class="tag" style="background:var(--primary);color:var(--on-primary)">📌 공지</span><span class="t">${U.esc(x.title)}</span><span class="small muted">${U.esc(x.author)} · ${U.fmtDate(x.pinnedAt || x.createdAt)}</span></div>`).join('');
    const cta = this.$('homeCta');
    if (p && p.setupDone) {
      const due = typeof Notes !== 'undefined' ? notes.filter(n => Notes.due(n)).length : 0;
      const todayNew = posts.filter(x => new Date(x.createdAt).toDateString() === today).length;
      const items = [];
      const myFound = lost.filter(l => l.author === p.nickname && l.status === 'found' && l.foundAt && (Date.now() - new Date(l.foundAt)) < 7 * 864e5);
      if (myFound.length) items.push(`<button class="primary" onclick="App.go('lost');setTimeout(()=>{document.getElementById('lFilter').value='found';Lost.render();},150)">🎉 내 분실물 ${myFound.length}건 찾음 처리됨</button>`);
      if (due) items.push(`<button class="ghost on-dark-btn" onclick="App.go('notes')">복습할 오답노트 ${due}개</button>`);
      if (finding.length) items.push(`<button class="ghost on-dark-btn" onclick="App.go('lost')">찾는 중인 분실물 ${finding.length}건</button>`);
      if (todayNew) items.push(`<button class="ghost on-dark-btn" onclick="App.go('community')">오늘 새 글 ${todayNew}개</button>`);
      cta.innerHTML = `<div><h3>${U.esc(p.nickname)}님의 오늘</h3><p class="muted">${items.length ? '확인할 것이 있어요.' : '밀린 일이 없어요. 모르는 문제가 생기면 AI 문제풀이로 오세요.'}</p></div>
        <div class="row">${items.join('') || `<button class="primary" onclick="App.go('solver')">AI 문제 풀기</button>`}</div>`;
    } else {
      cta.innerHTML = `<div><h3>처음 오셨나요?</h3><p class="muted">학교 구글 계정으로 로그인하면 학년·반이 자동으로 설정되고, 닉네임만 화면에 보입니다.</p></div>
        <button class="primary" onclick="Auth.openLogin()">학교 계정 로그인</button>`;
    }
    const cinfo = id => (typeof Community !== 'undefined' ? Community.cinfo(id) : { icon: '', name: id });
    this.$('homePosts').innerHTML = posts.length ? posts.slice(0, 5).map(x => `
      <button class="home-item" onclick="App.go('community','${x.id}')">
        <span class="tag">${cinfo(x.community).icon} ${U.esc(cinfo(x.community).name)}</span>
        <span class="t">${U.esc(x.title)}</span>
        <span class="m">▲ ${x.score || 0} · 💬 ${comments.filter(c => c.postId === x.id).length} · ${U.fmtDate(x.createdAt)}</span></button>`).join('')
      : '<div class="empty">아직 글이 없어요. 첫 글을 올려 보세요.</div>';
    this.$('homeLost').innerHTML = finding.length ? finding.slice(0, 5).map(x => `
      <button class="home-item" onclick="App.go('lost');setTimeout(()=>Lost.locate('${x.id}'),150)">
        ${typeof Lost !== 'undefined' ? Lost.kindTag(x) : ''}
        <span class="t">${U.esc(x.item)}</span>
        <span class="m">📍 ${U.esc(x.floor || '')}${x.room ? ' · ' + U.esc(x.room) : ''} · ${U.fmtDate(x.createdAt)}</span></button>`).join('')
      : '<div class="empty">찾는 중인 분실물이 없어요.</div>';
  }
};
