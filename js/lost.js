/* 분실물 센터: 등록 / 목록(상태 필터) / 찾았어요 / 삭제(작성자만) */
const Lost = {
  init() {
    this.$ = id => document.getElementById(id);
    const form = this.$('lostForm');
    this.$('lostNewBtn').onclick = () => { form.classList.toggle('hidden'); form.date.value = new Date().toISOString().slice(0, 10); form.item.focus(); };
    this.$('lostCancel').onclick = () => { form.reset(); form.classList.add('hidden'); };
    this.$('lFilter').onchange = () => this.render();
    form.onsubmit = e => {
      e.preventDefault(); const f = new FormData(form);
      Store.push('lost', {
        id: U.uid(), createdAt: new Date().toISOString(), author: App.user(),
        item: f.get('item').trim(), kind: f.get('kind') === '주웠어요' ? 'found' : 'lost',
        place: f.get('place').trim(), date: f.get('date'), desc: f.get('desc').trim(), contact: f.get('contact'), status: 'finding'
      });
      form.reset(); form.classList.add('hidden'); this.$('lFilter').value = 'finding';
      App.toast('분실물을 등록했습니다.'); this.render();
    };
  },
  render() {
    const st = this.$('lFilter').value, me = App.user();
    const list = Store.get('lost', []).filter(l => !st || l.status === st);
    const el = this.$('lostList');
    if (!list.length) { el.innerHTML = `<div class="empty">해당하는 분실물이 없어요.</div>`; return; }
    el.innerHTML = list.map(l => `
      <div class="item" style="cursor:default">
        <div class="body">
          <div class="meta" style="margin-bottom:4px">
            <span class="tag ${l.kind === 'found' ? 'green' : ''}">${l.kind === 'found' ? '주웠어요' : '잃어버렸어요'}</span>
            <span class="tag ${l.status === 'found' ? 'green' : 'dark'}">${l.status === 'found' ? '찾음 ✓' : '찾는 중'}</span></div>
          <div class="title" ${l.status === 'found' ? 'style="text-decoration:line-through;color:var(--mute)"' : ''}>${U.esc(l.item)}</div>
          <div class="meta"><span>📍 ${U.esc(l.place)}</span><span>📅 ${U.esc(l.date)}</span><span>${U.esc(l.author)} · ${U.fmtDate(l.createdAt)}</span></div>
          ${l.desc ? `<p class="small" style="margin:6px 0 0">${U.esc(l.desc)}</p>` : ''}
          <p class="small muted" style="margin:4px 0 0">연락: ${U.esc(l.contact)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${l.status === 'finding' ? `<button class="primary small" onclick="Lost.found('${l.id}')">찾았어요</button>` : `<button class="ghost small" onclick="Lost.reopen('${l.id}')">다시 찾는 중</button>`}
          ${l.author === me ? `<button class="ghost danger small" onclick="Lost.del('${l.id}')">삭제</button>` : ''}
        </div></div>`).join('');
  },
  found(id) { Store.update('lost', id, { status: 'found' }); App.toast('찾았다고 표시했습니다. 🎉'); this.render(); },
  reopen(id) { Store.update('lost', id, { status: 'finding' }); this.render(); },
  del(id) { if (confirm('이 글을 삭제할까요?')) { Store.remove('lost', id); this.render(); } }
};
