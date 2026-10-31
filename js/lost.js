/* 분실물 센터: 지도에서 위치 선택 → 등록 / 층별 지도에 표시 / 목록(상태·교실 필터) / 찾았어요 / 삭제(작성자만) */
const Lost = {
  roomFilter: null, pickMap: null, viewMap: null,
  init() {
    this.$ = id => document.getElementById(id);
    const form = this.$('lostForm');
    this.pickMap = FloorMap.create(this.$('lostPickMap'), {
      mode: 'pick', floor: '1F',
      onPick: (floor, room) => { form.floor.value = floor; form.room.value = room; this.$('lostPickLabel').textContent = `${floor} · ${room}`; }
    });
    this.viewMap = FloorMap.create(this.$('lostMap'), {
      mode: 'view', floor: '1F',
      onPick: (floor, room, has) => { if (!has) return; this.roomFilter = (this.roomFilter && this.roomFilter.room === room && this.roomFilter.floor === floor) ? null : { floor, room }; this.renderList(); }
    });
    this.$('lostNewBtn').onclick = () => { form.classList.toggle('hidden'); if (!form.date.value) form.date.value = new Date().toISOString().slice(0, 10); form.item.focus(); };
    this.$('lostCancel').onclick = () => this.resetForm();
    this.$('lFilter').onchange = () => { this.roomFilter = null; this.render(); };
    form.onsubmit = e => {
      e.preventDefault(); const f = new FormData(form);
      if (!f.get('room')) { App.toast('지도에서 교실을 클릭해 위치를 골라 주세요.', 'error'); this.$('lostPickMap').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      Store.push('lost', {
        id: U.uid(), createdAt: new Date().toISOString(), author: App.user(),
        item: f.get('item').trim(), kind: f.get('kind') === '주웠어요' ? 'found' : 'lost',
        floor: f.get('floor'), room: f.get('room'), place: f.get('place').trim(), date: f.get('date'),
        desc: f.get('desc').trim(), contact: f.get('contact'), status: 'finding'
      });
      this.resetForm(); this.$('lFilter').value = 'finding'; this.roomFilter = null;
      App.toast('분실물을 등록했습니다. 지도에 표시됩니다.'); this.viewMap.setFloor(f.get('floor')); this.render();
    };
  },
  resetForm() {
    const form = this.$('lostForm'); form.reset(); form.classList.add('hidden');
    this.$('lostPickLabel').textContent = '아직 선택 안 함'; this.pickMap.update({ selected: null });
  },
  all() { return Store.get('lost', []); },
  render() {
    const st = this.$('lFilter').value;
    const markers = {};
    this.all().filter(l => (!st || l.status === st) && l.room).forEach(l => { const k = l.floor + '|' + l.room; markers[k] = (markers[k] || 0) + 1; });
    this.viewMap.update({ markers });
    this.renderList();
  },
  renderList() {
    const st = this.$('lFilter').value, me = App.user(), rf = this.roomFilter;
    const list = this.all().filter(l => (!st || l.status === st) && (!rf || (l.floor === rf.floor && l.room === rf.room)));
    this.$('lostFilterLabel').innerHTML = rf ? `📍 <b>${U.esc(rf.floor)} · ${U.esc(rf.room)}</b> 만 보는 중 <button class="link" onclick="Lost.roomFilter=null;Lost.renderList()">전체 보기</button>` : `${list.length}건`;
    const el = this.$('lostList');
    if (!list.length) { el.innerHTML = `<div class="empty">해당하는 분실물이 없어요.</div>`; return; }
    el.innerHTML = list.map(l => `
      <div class="item" style="cursor:default">
        <div class="body">
          <div class="meta" style="margin-bottom:4px">
            <span class="tag ${l.kind === 'found' ? 'green' : ''}">${l.kind === 'found' ? '주웠어요' : '잃어버렸어요'}</span>
            <span class="tag ${l.status === 'found' ? 'green' : 'dark'}">${l.status === 'found' ? '찾음 ✓' : '찾는 중'}</span></div>
          <div class="title" ${l.status === 'found' ? 'style="text-decoration:line-through;color:var(--mute)"' : ''}>${U.esc(l.item)}</div>
          <div class="meta">
            ${l.room ? `<button class="link" onclick="Lost.locate('${l.id}')">📍 ${U.esc(l.floor)} · ${U.esc(l.room)}</button>` : ''}
            ${l.place ? `<span>${U.esc(l.place)}</span>` : ''}<span>📅 ${U.esc(l.date)}</span><span>${U.esc(l.author)} · ${U.fmtDate(l.createdAt)}</span></div>
          ${l.desc ? `<p class="small" style="margin:6px 0 0">${U.esc(l.desc)}</p>` : ''}
          <p class="small muted" style="margin:4px 0 0">연락: ${U.esc(l.contact)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${l.status === 'finding' ? `<button class="primary small" onclick="Lost.found('${l.id}')">찾았어요</button>` : `<button class="ghost small" onclick="Lost.reopen('${l.id}')">다시 찾는 중</button>`}
          ${l.author === me ? `<button class="ghost danger small" onclick="Lost.del('${l.id}')">삭제</button>` : ''}
        </div></div>`).join('');
  },
  locate(id) {
    const l = this.all().find(x => x.id === id); if (!l || !l.room) return;
    this.roomFilter = { floor: l.floor, room: l.room }; this.viewMap.setFloor(l.floor); this.renderList();
    this.$('lostMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  found(id) { Store.update('lost', id, { status: 'found' }); App.toast('찾았다고 표시했습니다. 🎉'); this.render(); },
  reopen(id) { Store.update('lost', id, { status: 'finding' }); this.render(); },
  del(id) { if (confirm('이 글을 삭제할까요?')) { Store.remove('lost', id); this.render(); } }
};
