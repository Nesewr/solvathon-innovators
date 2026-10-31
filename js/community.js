/* 커뮤니티(선택): 글 목록 / 작성 / 상세 + 댓글 */
const Community = {
  open: null,
  init() {
    this.$ = id => document.getElementById(id);
    const form = this.$('postForm');
    this.$('postNewBtn').onclick = () => { form.classList.toggle('hidden'); form.title.focus(); };
    this.$('postCancel').onclick = () => { form.reset(); form.classList.add('hidden'); };
    form.onsubmit = e => {
      e.preventDefault(); const f = new FormData(form);
      const p = Store.push('posts', { id: U.uid(), createdAt: new Date().toISOString(), author: App.user(), title: f.get('title').trim(), body: f.get('body').trim() });
      form.reset(); form.classList.add('hidden'); this.open = p.id; App.toast('글을 올렸습니다.'); this.render();
    };
  },
  render(force) { if (force) this.open = null; this.renderList(); this.renderDetail(); },
  posts() { return Store.get('posts', []); },
  comments(postId) { return Store.get('comments', []).filter(c => c.postId === postId).sort((a, b) => a.createdAt < b.createdAt ? -1 : 1); },
  renderList() {
    const el = this.$('postList'), list = this.posts();
    if (!list.length) { el.innerHTML = `<div class="empty">첫 글을 올려 보세요.</div>`; return; }
    el.innerHTML = list.map(p => `
      <div class="item" onclick="Community.show('${p.id}')">
        <div class="body"><div class="title">${U.esc(p.title)}</div>
          <div class="meta"><span>${U.esc(p.author)}</span><span>${U.fmtDate(p.createdAt)}</span><span>💬 ${this.comments(p.id).length}</span></div></div></div>`).join('');
  },
  show(id) { this.open = id; this.renderDetail(); this.$('postDetail').scrollIntoView({ behavior: 'smooth' }); },
  close() { this.open = null; this.renderDetail(); },
  renderDetail() {
    const box = this.$('postDetail'), p = this.posts().find(x => x.id === this.open);
    if (!p) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden'); const me = App.user();
    box.innerHTML = `
      <div class="result-head"><h3>${U.esc(p.title)}</h3><button class="link" style="color:var(--on-dark)" onclick="Community.close()">✕ 닫기</button></div>
      <div class="meta muted small">${U.esc(p.author)} · ${U.fmtDate(p.createdAt)}</div>
      <div class="post-body">${U.md(p.body)}</div>
      ${p.author === me ? `<button class="ghost danger small" onclick="Community.del('${p.id}')">글 삭제</button>` : ''}
      <hr><div class="eyebrow">댓글 ${this.comments(p.id).length}</div>
      ${this.comments(p.id).map(c => `<div class="comment"><div class="meta">${U.esc(c.author)} · ${U.fmtDate(c.createdAt)}</div>${U.md(c.body)}</div>`).join('')}
      <form onsubmit="Community.comment(event,'${p.id}')" class="row" style="margin-top:12px">
        <input name="body" class="grow" required placeholder="${U.esc(me)}으로 댓글 쓰기"><button class="primary">댓글</button></form>`;
  },
  comment(e, postId) {
    e.preventDefault(); const body = e.target.body.value.trim(); if (!body) return;
    Store.push('comments', { id: U.uid(), postId, createdAt: new Date().toISOString(), author: App.user(), body }); this.render();
  },
  del(id) { if (confirm('글을 삭제할까요?')) { Store.remove('posts', id); Store.set('comments', Store.get('comments', []).filter(c => c.postId !== id)); this.open = null; this.render(); } }
};
