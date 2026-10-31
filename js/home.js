/* 홈: 히어로·숫자·기능 카드·최근 글·찾는 중 분실물 */
const Home = {
  init() { this.$ = id => document.getElementById(id); },
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
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    const cinfo = id => (typeof Community !== 'undefined' ? Community.cinfo(id) : { icon: '', name: id });
    this.$('homePosts').innerHTML = posts.length ? posts.slice(0, 5).map(x => `
      <button class="home-item" onclick="App.go('community','${x.id}')">
        <span class="tag">${cinfo(x.community).icon} ${U.esc(cinfo(x.community).name)}</span>
        <span class="t">${U.esc(x.title)}</span>
        <span class="m">▲ ${x.score || 0} · 💬 ${comments.filter(c => c.postId === x.id).length} · ${U.fmtDate(x.createdAt)}</span></button>`).join('')
      : '<div class="empty">아직 글이 없어요. 첫 글을 올려 보세요.</div>';
    this.$('homeLost').innerHTML = finding.length ? finding.slice(0, 5).map(x => `
      <button class="home-item" onclick="App.go('lost');setTimeout(()=>Lost.locate('${x.id}'),150)">
        <span class="tag ${x.kind === 'found' ? 'green' : ''}">${x.kind === 'found' ? '주웠어요' : '잃어버렸어요'}</span>
        <span class="t">${U.esc(x.item)}</span>
        <span class="m">📍 ${U.esc(x.floor || '')}${x.room ? ' · ' + U.esc(x.room) : ''} · ${U.fmtDate(x.createdAt)}</span></button>`).join('')
      : '<div class="empty">찾는 중인 분실물이 없어요.</div>';
  }
};
