/* 커뮤니티 (Reddit 구조): 게시판 / 정렬 / 투표 / 글 상세 / 대댓글 / 공유 */
const Community = {
  open: null, community: '', sort: 'hot', replyTo: null, photos: [],
  init() {
    this.$ = id => document.getElementById(id);
    const form = this.$('postForm');
    this.$('postPhoto').onchange = async e => {
      for (const f of [...e.target.files].slice(0, 2 - this.photos.length)) { try { this.photos.push(await U.resizeImage(f)); } catch (err) { App.toast(err.message, 'error'); } }
      this.renderPhotoPick(); e.target.value = '';
    };
    this.$('postNewBtn').onclick = () => { if (Auth.gate()) return; this.fillCommunitySelect(); form.classList.toggle('hidden'); if (this.community && !this.community.startsWith('__')) this.$('rCommunitySelect').value = this.community; form.title.focus(); };
    this.$('postCancel').onclick = () => { form.reset(); form.classList.add('hidden'); };
    this.$('rSearch').oninput = () => this.renderList();
    this.$('rSort').querySelectorAll('button').forEach(b => b.onclick = () => { this.sort = b.dataset.s; this.renderList(); });
    this.fillCommunitySelect();
    form.onsubmit = e => {
      e.preventDefault(); const f = new FormData(form);
      const p = Store.push('posts', { id: U.uid(), createdAt: new Date().toISOString(), author: App.user(), authorTag: App.userTag(), community: f.get('community'), title: f.get('title').trim(), body: f.get('body').trim(), images: this.photos.slice(0, 2), score: 1 });
      this.setVote(p.id, 1); form.reset(); form.classList.add('hidden'); this.photos = []; this.renderPhotoPick(); App.toast('글을 올렸습니다.'); App.go('community', p.id);
    };
  },
  fillCommunitySelect() {
    const sel = this.$('rCommunitySelect'), list = this.communities();
    if (sel.options.length !== list.length) { const cur = sel.value; sel.innerHTML = list.map(c => `<option value="${c.id}">${c.icon} ${U.esc(c.name)}</option>`).join(''); if (cur && list.some(c => c.id === cur)) sel.value = cur; }
  },
  renderPhotoPick() { this.$('postPhotoPreview').innerHTML = this.photos.map((src, i) => `<span><img src="${src}" alt=""><button type="button" class="link" onclick="Community.photos.splice(${i},1);Community.renderPhotoPick()">제거</button></span>`).join(''); },
  togglePin(id) { const p = this.posts().find(x => x.id === id); if (!p || !Auth.isAdmin()) return; Store.update('posts', id, { pinned: !p.pinned, pinnedAt: !p.pinned ? new Date().toISOString() : null }); App.toast(!p.pinned ? '공지로 고정했습니다.' : '고정을 해제했습니다.'); this.renderDetail(); },
  pinnedPosts() { return this.posts().filter(p => p.pinned).sort((a, b) => (b.pinnedAt || '') > (a.pinnedAt || '') ? 1 : -1); },
  render(force) {
    if (force) { this.open = null; }
    this.open = App.sub || null;
    this.renderSidebar(); this.renderAbout(); this.renderAdmin();
    if (this.open) { this.renderDetail(); } else { this.$('postDetail').classList.add('hidden'); this.renderList(); }
  },

  // ----- 데이터 -----
  COMMUNITIES: [
    { id: 'study', name: '공부·입시', desc: '내신, 모의고사, 공부법, 입시 정보를 나누는 곳', icon: '📚' },
    { id: 'qna', name: '질문', desc: '모르는 문제, 학교 생활 궁금한 것 무엇이든', icon: '❓' },
    { id: 'school', name: '학교생활', desc: '급식, 행사, 동아리, 학교 소식', icon: '🏫' },
    { id: 'free', name: '자유', desc: '가벼운 이야기, 추천, 잡담', icon: '💬' }
  ],
  communities() { return this.COMMUNITIES; },
  cinfo(id) { return this.communities().find(c => c.id === id) || { id, name: id, icon: '💬', desc: '' }; },
  posts() { const b = Auth.blocked(); return Store.get('posts', []).filter(p => !b.has(p.author)); },
  comments(postId) { const b = Auth.blocked(); return Store.get('comments', []).filter(c => c.postId === postId && !b.has(c.author)); },
  myVotes() { const v = Store.get('votes', {}); return v[App.user()] || {}; },
  setVote(id, dir) {
    const all = Store.get('votes', {}), me = App.user(); all[me] = all[me] || {};
    const prev = all[me][id] || 0, next = prev === dir ? 0 : dir; all[me][id] = next;
    const delta = next - prev;
    const post = this.posts().find(p => p.id === id);
    if (post) Store.update('posts', id, { score: (post.score || 0) + delta });
    else { const c = Store.get('comments', []).find(c => c.id === id); if (c) Store.update('comments', id, { score: (c.score || 0) + delta }); }
    Store.set('votes', all);
  },
  hot(p) { const hours = (Date.now() - new Date(p.createdAt)) / 36e5; return (p.score || 0) / Math.pow(hours + 2, 1.3); },
  sorted(list) {
    const s = this.sort;
    return [...list].sort((a, b) => s === 'new' ? (a.createdAt < b.createdAt ? 1 : -1) : s === 'top' ? (b.score || 0) - (a.score || 0) : this.hot(b) - this.hot(a));
  },

  // ----- 동작 -----
  pickCommunity(id) { this.community = id; App.go('community'); this.render(); },
  vote(e, id, dir) { e.stopPropagation(); if (Auth.gate()) return; this.setVote(id, dir); this.open ? this.renderDetail() : this.renderList(); },
  show(id) { App.go('community', id); },
  back() { App.go('community'); },
  share(e, id) {
    e.stopPropagation(); const url = location.origin + location.pathname + '#community/' + id;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => App.toast('링크를 복사했습니다.')).catch(() => prompt('링크', url));
  },
  comment(e, postId, parentId) {
    e.preventDefault(); if (Auth.gate()) return; const body = e.target.body.value.trim(); if (!body) return;
    Store.push('comments', { id: U.uid(), postId, parentId: parentId || null, createdAt: new Date().toISOString(), author: App.user(), authorTag: App.userTag(), body, score: 0 });
    this.replyTo = null; this.renderDetail();
  },
  reply(id) { this.replyTo = this.replyTo === id ? null : id; this.renderDetail(); },
  del(id) {
    if (!confirm('글을 삭제할까요?')) return;
    Store.remove('posts', id); Store.set('comments', Store.get('comments', []).filter(c => c.postId !== id)); App.go('community');
  },
  delComment(id) { if (confirm('댓글을 삭제할까요?')) { Store.update('comments', id, { body: '[삭제된 댓글]', deleted: true }); this.renderDetail(); } },

  // ----- 렌더 -----
  voteBox(id, score, horizontal) {
    const v = this.myVotes()[id] || 0;
    return `<div class="r-vote ${horizontal ? 'h' : ''}">
      <button class="${v === 1 ? 'up' : ''}" onclick="Community.vote(event,'${id}',1)" title="추천">▲</button>
      <b>${score || 0}</b>
      <button class="${v === -1 ? 'down' : ''}" onclick="Community.vote(event,'${id}',-1)" title="비추천">▼</button></div>`;
  },
  renderSidebar() {
    this.fillCommunitySelect();
    const loading = typeof API !== 'undefined' && API.loading();
    const counts = {}; this.posts().forEach(p => counts[p.community] = (counts[p.community] || 0) + 1);
    this.$('rCommunities').innerHTML = this.communities().map(c => `<button class="r-navbtn ${this.community === c.id ? 'active' : ''}" onclick="Community.pickCommunity('${c.id}')">${c.icon} ${U.esc(c.name)}<span class="muted small">${loading ? '…' : (counts[c.id] || 0)}</span></button>`).join('');
    document.querySelectorAll('.r-left .r-nav:first-child .r-navbtn').forEach(b => b.classList.toggle('active', b.dataset.c === this.community));
  },
  async renderAdmin() {
    const box = this.$('rAdmin'); if (!Auth.isAdmin() || !(typeof API !== 'undefined' && API.ready)) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden'); box.innerHTML = `<div class="eyebrow">운영</div><p class="small muted">불러오는 중…</p>`;
    try {
      const list = await API.reports(); const open = list.filter(r => r.status === 'open');
      box.innerHTML = `<div class="row between"><div class="eyebrow" style="margin:0">🛡 운영</div><span class="tag ${open.length ? 'red' : ''}">신고 ${open.length}</span></div>
        <div class="adm-list">${open.length ? open.slice(0, 8).map(r => `
          <div class="adm-item">
            <div class="small"><b>${U.esc(r.reason)}</b> · ${{ posts: '글', comments: '댓글', lost: '분실물' }[r.targetType]} · ${U.fmtDate(r.createdAt)}</div>
            <div class="small muted">${U.esc(r.snapshot.author)}: "${U.esc(r.snapshot.text).slice(0, 50)}"${r.detail ? ` — ${U.esc(r.detail)}` : ''}${r.exists ? '' : ' (이미 삭제됨)'}</div>
            <div class="row" style="gap:4px;margin-top:4px">
              ${r.exists ? `<button class="link" onclick="Community.adminOpen('${r.targetType}','${r.targetId}','${r.snapshot.postId || ''}')">보기</button><button class="link" onclick="Community.adminDelete('${r.id}','${r.targetType}','${r.targetId}')">삭제</button>` : ''}
              <button class="link" onclick="Community.adminBan('${r.id}','${U.esc(r.snapshot.author)}')">작성자 정지</button>
              <button class="link" onclick="Community.adminResolve('${r.id}','무시')">무시</button></div>
          </div>`).join('') : '<p class="small muted" style="margin:8px 0 0">처리할 신고가 없습니다.</p>'}</div>
        <button class="ghost small" style="margin-top:8px" onclick="Community.adminUsers()">사용자 목록·정지 해제</button>`;
    } catch (e) { box.innerHTML = `<div class="eyebrow">운영</div><p class="small" style="color:var(--error)">${U.esc(e.message)}</p>`; }
  },
  adminOpen(type, id, postId) { if (type === 'lost') { App.go('lost'); setTimeout(() => Lost.locate(id), 200); } else App.go('community', type === 'comments' ? postId : id); },
  async adminDelete(reportId, type, id) {
    if (!confirm('이 글을 삭제하고 신고를 처리할까요?')) return;
    if (type === 'comments') Store.update('comments', id, { body: '[운영자가 삭제한 댓글]', deleted: true });
    else { Store.remove(type, id); if (type === 'posts') Store.set('comments', Store.get('comments', []).filter(c => c.postId !== id)); }
    try { await API.resolveReport(reportId, '삭제'); } catch { }
    App.toast('삭제하고 신고를 처리했습니다.'); this.render();
  },
  async adminBan(reportId, nick) {
    if (!confirm(`${nick}님을 정지할까요? 정지되면 글·댓글·분실물을 쓸 수 없습니다.`)) return;
    try { await API.ban(nick, true); if (reportId) await API.resolveReport(reportId, '정지'); App.toast(`${nick}님을 정지했습니다.`); } catch (e) { App.toast(e.message, 'error'); }
    this.renderAdmin();
  },
  async adminResolve(reportId, action) { try { await API.resolveReport(reportId, action); } catch (e) { App.toast(e.message, 'error'); } this.renderAdmin(); },
  async adminUsers() {
    try {
      const users = await API.users(); const box = this.$('rAdmin');
      box.innerHTML = `<div class="row between"><div class="eyebrow" style="margin:0">🛡 사용자 ${users.length}</div><button class="link" onclick="Community.renderAdmin()">← 신고로</button></div>
        <div class="adm-list">${users.map(u => `<div class="adm-item row between" style="gap:6px"><span class="small">${U.esc(u.nickname)} <span class="tag">${u.isAdmin ? '운영자' : u.role === 'teacher' ? '교사' : (u.grade || '') + '학년'}</span>${u.banned ? '<span class="tag red">정지</span>' : ''}</span>
          ${u.isAdmin ? '' : `<button class="link" onclick="Community.adminToggleBan('${U.esc(u.nickname)}',${!u.banned})">${u.banned ? '정지 해제' : '정지'}</button>`}</div>`).join('')}</div>`;
    } catch (e) { App.toast(e.message, 'error'); }
  },
  async adminToggleBan(nick, banned) { try { await API.ban(nick, banned); App.toast(banned ? `${nick}님을 정지했습니다.` : `${nick}님 정지를 해제했습니다.`); } catch (e) { App.toast(e.message, 'error'); } this.adminUsers(); },
  renderAbout() {
    const c = this.community && !this.community.startsWith('__') ? this.cinfo(this.community) : null;
    if (this.community === '__hot') { const total = this.posts().length, members = new Set(this.posts().map(p => p.author)).size; this.$('rAbout').innerHTML = `<div class="eyebrow">이번 주 인기</div><h3>🔥 추천 TOP</h3><p class="small muted" style="margin:8px 0">최근 7일 동안 올라온 글 가운데 추천을 많이 받은 순서입니다. 공지는 제외.</p><div class="r-stats"><div><b>${total}</b><span>글</span></div><div><b>${members}</b><span>참여자</span></div></div>`; return; }
    const total = this.posts().length, members = new Set(this.posts().map(p => p.author)).size;
    this.$('rAbout').innerHTML = c
      ? `<div class="eyebrow">게시판 소개</div><h3>${c.icon} ${U.esc(c.name)}</h3><p class="small muted" style="margin:8px 0">${U.esc(c.desc)}</p>
         <div class="r-stats"><div><b>${this.posts().filter(p => p.community === c.id).length}</b><span>글</span></div><div><b>${members}</b><span>참여자</span></div></div>
         <button class="primary" style="width:100%" onclick="document.getElementById('postNewBtn').click()">이 게시판에 글쓰기</button>`
      : `<div class="eyebrow">중산 커뮤니티</div><h3>🏠 홈</h3><p class="small muted" style="margin:8px 0">중산고 학생들이 공부·학교생활 이야기를 나누는 곳. 닉네임으로만 활동합니다.</p>
         <div class="r-stats"><div><b>${total}</b><span>글</span></div><div><b>${members}</b><span>참여자</span></div></div>
         <button class="primary" style="width:100%" onclick="document.getElementById('postNewBtn').click()">글쓰기</button>`;
  },
  renderList() {
    if (typeof API !== 'undefined' && API.loading()) { this.$('postList').classList.remove('hidden'); this.$('postList').innerHTML = `<div class="empty loading"><span class="spinner"></span>서버에서 불러오는 중…</div>`; return; }
    const q = this.$('rSearch').value.trim().toLowerCase(), c = this.community;
    let list = this.posts().filter(p => (!c || c.startsWith('__') || p.community === c) && (!q || (p.title + ' ' + p.body).toLowerCase().includes(q)));
    const sortBar = this.$('rSort');
    if (c === '__hot') {   // 이번 주 인기: 최근 7일 글을 추천순으로, 정렬 탭 대신 안내
      const week = Date.now() - 7 * 864e5;
      list = list.filter(p => new Date(p.createdAt) >= week && !p.pinned).sort((a, b) => (b.score || 0) - (a.score || 0) || (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10);
      sortBar.innerHTML = '<span class="small" style="padding:6px 10px;font-weight:700">🔥 이번 주 추천 TOP 10 — 최근 7일 글 중 추천이 많은 순</span>';
      const el = this.$('postList'); el.classList.remove('hidden');
      if (!list.length) { el.innerHTML = '<div class="empty">이번 주에 올라온 글이 아직 없어요.</div>'; return; }
      el.innerHTML = list.map((p, i) => this.postCard(p, i + 1)).join(''); return;
    }
    if (!sortBar.querySelector('button')) sortBar.innerHTML = '<button data-s="hot">🔥 인기</button><button data-s="new">🕒 최신</button><button data-s="top">⬆ 추천</button>', sortBar.querySelectorAll('button').forEach(b => b.onclick = () => { this.sort = b.dataset.s; this.renderList(); });
    sortBar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.s === this.sort));
    list = [...list.filter(p => p.pinned).sort((a, b) => (b.pinnedAt || '') > (a.pinnedAt || '') ? 1 : -1), ...this.sorted(list.filter(p => !p.pinned))];
    const el = this.$('postList'); el.classList.remove('hidden');
    if (!list.length) { el.innerHTML = `<div class="empty">글이 없어요. 첫 글을 올려 보세요.</div>`; return; }
    el.innerHTML = list.map(p => this.postCard(p)).join('');
  },
  postCard(p, rank) {
    const ci = this.cinfo(p.community), n = this.comments(p.id).length;
    return `<article class="r-post ${p.pinned ? 'pinned' : ''}" onclick="Community.show('${p.id}')">
        ${rank ? `<div class="r-rank">${rank}</div>` : ''}
        ${this.voteBox(p.id, p.score)}
        <div class="r-body">
          <div class="r-meta">${p.pinned ? '<span class="tag dark">📌 공지</span>' : ''}<span class="r-flair">${ci.icon} ${U.esc(ci.name)}</span><span>${U.esc(p.author)}</span>${p.authorTag ? `<span class="tag green">${U.esc(p.authorTag)}</span>` : ''}<span>·</span><span>${U.fmtDate(p.createdAt)}</span></div>
          <h3 class="r-title">${U.esc(p.title)}</h3>
          <p class="r-preview">${U.esc(p.body).slice(0, 180)}${p.body.length > 180 ? '…' : ''}</p>
          ${(p.images || []).length ? `<div class="photos">${p.images.map(src => `<img class="photo-thumb" src="${src}" alt="">`).join('')}</div>` : ''}
          <div class="r-actions"><span>💬 댓글 ${n}</span><button onclick="Community.share(event,'${p.id}')">↗ 공유</button>${p.author !== App.user() ? `<button onclick="event.stopPropagation();Auth.report('posts','${p.id}')">⚑ 신고</button>` : ''}</div>
        </div></article>`;
  },
  renderDetail() {
    const box = this.$('postDetail'), p = this.posts().find(x => x.id === this.open);
    if (!p) { box.classList.add('hidden'); this.open = null; this.renderList(); return; }
    this.$('postList').classList.add('hidden'); box.classList.remove('hidden');
    const ci = this.cinfo(p.community), me = App.user(), all = this.comments(p.id);
    const tree = (parentId, depth) => all.filter(c => (c.parentId || null) === parentId).sort((a, b) => (b.score || 0) - (a.score || 0) || (a.createdAt < b.createdAt ? -1 : 1)).map(c => `
      <div class="r-comment" style="margin-left:${Math.min(depth, 6) * 22}px">
        <div class="r-cmeta"><b>${U.esc(c.author)}</b>${c.authorTag ? `<span class="tag green">${U.esc(c.authorTag)}</span>` : ''}<span>·</span><span>${U.fmtDate(c.createdAt)}</span></div>
        <div class="r-ctext ${c.deleted ? 'muted' : ''}">${U.md(c.body)}</div>
        <div class="r-cactions">${this.voteBox(c.id, c.score, true)}
          <button onclick="Community.reply('${c.id}')">↩ 답글</button>
          ${c.author === me && !c.deleted ? `<button onclick="Community.delComment('${c.id}')">삭제</button>` : ''}
          ${c.author !== me && !c.deleted ? `<button onclick="Auth.report('comments','${c.id}')">⚑ 신고</button>` : ''}
          ${Auth.isAdmin() && c.author !== me && !c.deleted ? `<button class="adm" onclick="Community.delComment('${c.id}')">🛡 삭제</button>` : ''}</div>
        ${this.replyTo === c.id ? `<form class="r-replyform" onsubmit="Community.comment(event,'${p.id}','${c.id}')"><textarea name="body" rows="2" required placeholder="${U.esc(c.author)}님에게 답글"></textarea><div class="actions" style="margin-top:6px"><button class="primary small">답글 달기</button><button type="button" class="ghost small" onclick="Community.reply(null)">취소</button></div></form>` : ''}
        ${tree(c.id, depth + 1)}
      </div>`).join('');
    box.innerHTML = `
      <button class="link" onclick="Community.back()" style="margin-bottom:8px">← ${ci.icon} ${U.esc(ci.name)} 목록으로</button>
      <article class="r-post detail">
        ${this.voteBox(p.id, p.score)}
        <div class="r-body">
          <div class="r-meta">${p.pinned ? '<span class="tag dark">📌 공지</span>' : ''}<span class="r-flair">${ci.icon} ${U.esc(ci.name)}</span><span>${U.esc(p.author)}</span>${p.authorTag ? `<span class="tag green">${U.esc(p.authorTag)}</span>` : ''}<span>·</span><span>${U.fmtDate(p.createdAt)}</span></div>
          <h2 class="r-title">${U.esc(p.title)}</h2>
          <div class="post-body">${U.md(p.body)}</div>
          ${(p.images || []).length ? `<div class="photos">${p.images.map(src => `<img src="${src}" alt="" onclick="window.open(this.src)" style="cursor:zoom-in">`).join('')}</div>` : ''}
          <div class="r-actions"><span>💬 댓글 ${all.length}</span><button onclick="Community.share(event,'${p.id}')">↗ 공유</button>
            ${p.author === me ? `<button onclick="Community.del('${p.id}')">🗑 삭제</button>` : `<button onclick="Auth.report('posts','${p.id}')">⚑ 신고</button><button onclick="Auth.block('${U.esc(p.author)}')">🚫 ${U.esc(p.author)} 차단</button>`}
            ${Auth.isAdmin() ? `<button class="adm" onclick="Community.togglePin('${p.id}')">📌 ${p.pinned ? '고정 해제' : '공지로 고정'}</button>` : ''}
            ${Auth.isAdmin() && p.author !== me ? `<button class="adm" onclick="Community.del('${p.id}')">🛡 운영자 삭제</button>` : ''}</div>
        </div></article>
      <form class="card" style="margin-top:12px" onsubmit="Community.comment(event,'${p.id}',null)">
        <div class="eyebrow">${U.esc(me)}(으)로 댓글 쓰기</div>
        <textarea name="body" rows="3" required placeholder="생각을 나눠 주세요"></textarea>
        <div class="actions"><button class="primary">댓글 달기</button></div></form>
      <div class="r-comments">${all.length ? tree(null, 0) : '<div class="empty">첫 댓글을 남겨 보세요.</div>'}</div>`;
    window.scrollTo(0, 0);
  }
};
