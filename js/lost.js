/* 분실물 센터: 지도에 핀 찍어 등록 / 층별 지도에 핀 표시 / 목록(상태 필터, 핀 선택) / 찾았어요 / 삭제(작성자만) */
const Lost = {
  activeId: null, pickMap: null, viewMap: null,
  init() {
    this.$ = id => document.getElementById(id);
    const form = this.$('lostForm');
    this.pickMap = FloorMap.create(this.$('lostPickMap'), {
      mode: 'pick', floor: '1F',
      onPick: (floor, x, y, room) => { form.floor.value = floor; form.x.value = x; form.y.value = y; form.room.value = room || ''; this.$('lostPickLabel').textContent = `📍 ${floor}${room ? ' · ' + room : ''}`; }
    });
    this.viewMap = FloorMap.create(this.$('lostMap'), {
      mode: 'view', floor: '1F', pins: [],
      onPin: id => { this.activeId = this.activeId === id ? null : id; this.render(); }
    });
    this.$('lostNewBtn').onclick = () => { if (Auth.gate()) return; form.classList.toggle('hidden'); if (!form.date.value) form.date.value = new Date().toISOString().slice(0, 10); form.item.focus(); };
    this.$('lostCancel').onclick = () => this.resetForm();
    this.$('lFilter').onchange = () => { this.activeId = null; this.render(); };
    this.$('lKind').onchange = () => { this.activeId = null; this.render(); };
    form.onsubmit = e => {
      e.preventDefault(); const f = new FormData(form);
      if (!f.get('x')) { App.toast('지도에서 물건이 있던 자리를 클릭해 핀을 찍어 주세요.', 'error'); this.$('lostPickMap').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      const item = Store.push('lost', {
        id: U.uid(), createdAt: new Date().toISOString(), author: App.user(), authorTag: App.userTag(),
        item: f.get('item').trim(), kind: f.get('kind') === 'found' ? 'found' : 'lost',
        floor: f.get('floor'), x: +f.get('x'), y: +f.get('y'), room: f.get('room') || null, place: f.get('place').trim(), date: f.get('date'),
        desc: f.get('desc').trim(), contact: f.get('contact'), status: 'finding'
      });
      this.resetForm(); this.$('lFilter').value = 'finding'; this.activeId = item.id;
      App.toast('등록 완료. 지도에 핀이 찍혔습니다.'); this.viewMap.setFloor(item.floor); this.render();
    };
  },
  resetForm() {
    const form = this.$('lostForm'); form.reset(); form.classList.add('hidden');
    this.$('lostPickLabel').textContent = '아직 선택 안 함'; this.pickMap.update({ selected: null });
  },
  all() { const b = Auth.blocked(); return Store.get('lost', []).filter(l => !b.has(l.author)); },
  KIND: { lost: ['잃어버렸어요', ''], found: ['주웠어요', 'green'] },
  kindTag(l) { const [label, cls] = this.KIND[l.kind] || this.KIND.lost; return `<span class="tag ${cls}">${label}</span>`; },
  filtered() { const st = this.$('lFilter').value, k = this.$('lKind').value; return this.all().filter(l => (!st || l.status === st) && (!k || (l.kind || 'lost') === k)); },
  render() {
    const pins = this.filtered().filter(l => l.x != null).map(l => ({ id: l.id, floor: l.floor, x: l.x, y: l.y, status: l.status, kind: l.kind || 'lost', label: `${this.KIND[l.kind || 'lost'][0]} · ${l.item}${l.room ? ' · ' + l.room : ''}` }));
    this.viewMap.update({ pins, activeId: this.activeId });
    this.renderList();
  },
  renderList() {
    const me = App.user(), a = this.activeId;
    const list = this.filtered().filter(l => !a || l.id === a);
    const act = a && this.all().find(l => l.id === a);
    this.$('lostFilterLabel').innerHTML = act ? `📍 <b>${U.esc(act.item)}</b> 핀만 보는 중 <button class="link" onclick="Lost.activeId=null;Lost.render()">전체 보기</button>` : `${list.length}건`;
    const el = this.$('lostList');
    if (!list.length) { el.innerHTML = `<div class="empty">해당하는 분실물이 없어요.</div>`; return; }
    el.innerHTML = list.map(l => `
      <div class="item" style="cursor:default${l.id === a ? ';border-color:var(--primary);border-width:2px' : ''}">
        <div class="body">
          <div class="meta" style="margin-bottom:4px">
            ${this.kindTag(l)}
            <span class="tag ${l.status === 'found' ? 'green' : 'dark'}">${l.status === 'found' ? '찾음 ✓' : '찾는 중'}</span></div>
          <div class="title" ${l.status === 'found' ? 'style="text-decoration:line-through;color:var(--mute)"' : ''}>${U.esc(l.item)}</div>
          <div class="meta">
            ${l.x != null ? `<button class="link" onclick="Lost.locate('${l.id}')">📍 ${U.esc(l.floor)}${l.room ? ' · ' + U.esc(l.room) : ''}</button>` : ''}
            ${l.place ? `<span>${U.esc(l.place)}</span>` : ''}<span>📅 ${U.esc(l.date)}</span><span>${U.esc(l.author)}${l.authorTag ? ` <span class="tag green">${U.esc(l.authorTag)}</span>` : ''} · ${U.fmtDate(l.createdAt)}</span></div>
          ${l.desc ? `<p class="small" style="margin:6px 0 0">${U.esc(l.desc)}</p>` : ''}
          <p class="small muted" style="margin:4px 0 0">연락: ${U.esc(l.contact)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${l.status === 'finding' ? `<button class="primary small" onclick="Lost.found('${l.id}')">${l.kind === 'found' ? '주인 찾음' : '찾았어요'}</button>` : `<button class="ghost small" onclick="Lost.reopen('${l.id}')">다시 찾는 중</button>`}
          ${l.author === me ? `<button class="ghost danger small" onclick="Lost.del('${l.id}')">삭제</button>` : `<button class="ghost small" onclick="Auth.report('lost','${l.id}')">⚑ 신고</button>`}
          ${Auth.isAdmin() && l.author !== me ? `<button class="ghost danger small" onclick="Lost.del('${l.id}')">🛡 삭제</button>` : ''}
        </div></div>`).join('');
  },
  locate(id) {
    const l = this.all().find(x => x.id === id); if (!l || l.x == null) return;
    this.activeId = id; this.viewMap.setFloor(l.floor); this.render();
    this.$('lostMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  found(id) { if (Auth.gate()) return; Store.update('lost', id, { status: 'found' }); App.toast('찾았다고 표시했습니다. 🎉'); this.render(); },
  reopen(id) { Store.update('lost', id, { status: 'finding' }); this.render(); },
  del(id) { if (confirm('이 글을 삭제할까요?')) { Store.remove('lost', id); if (this.activeId === id) this.activeId = null; this.render(); } }
};
