/* 오답노트: 목록(과목 필터·검색) → 상세(풀이 가리기 / 다시 풀기 / 삭제) */
const Notes = {
  open: null, hidden: true,
  init() {
    this.$ = id => document.getElementById(id);
    this.$('nSubjectFilter').onchange = () => this.renderList();
    this.$('nSearch').oninput = () => this.renderList();
  },
  render(force) { if (force) this.open = null; this.renderFilters(); this.renderList(); this.renderDetail(); },
  all() { return Store.get('notes', []); },
  due(n) { const last = n.lastReviewed || n.createdAt; return (Date.now() - new Date(last)) / 864e5 >= 3; },

  renderFilters() {
    const sel = this.$('nSubjectFilter'), cur = sel.value;
    const subs = [...new Set(this.all().map(n => n.subject))];
    sel.innerHTML = `<option value="">모든 과목</option>` + subs.map(s => `<option ${s === cur ? 'selected' : ''}>${U.esc(s)}</option>`).join('');
  },
  renderList() {
    if (typeof API !== 'undefined' && API.loading()) { this.$('nDue').textContent = ''; this.$('notesList').innerHTML = `<div class="empty loading"><span class="spinner"></span>서버에서 불러오는 중…</div>`; return; }
    const sub = this.$('nSubjectFilter').value, q = this.$('nSearch').value.trim().toLowerCase();
    const list = this.all().filter(n => (!sub || n.subject === sub) && (!q || (n.question + ' ' + n.tags.join(' ') + ' ' + (n.concept || '')).toLowerCase().includes(q)));
    const el = this.$('notesList');
    const due = this.all().filter(n => this.due(n)).length;
    this.$('nDue').textContent = due ? `복습할 노트 ${due}개 (3일 이상 안 봄)` : '';
    if (!list.length) { el.innerHTML = `<div class="empty">아직 오답노트가 없어요. <b>AI 문제풀이</b>에서 문제를 풀면 자동으로 쌓입니다.</div>`; return; }
    el.innerHTML = list.map(n => `
      <div class="item" onclick="Notes.show('${n.id}')">
        ${n.imageDataUrl ? `<img class="thumb" src="${n.imageDataUrl}" alt="">` : `<div class="thumb" style="display:grid;place-items:center;background:var(--soft);font-weight:700">${U.esc(n.subject.slice(0, 2))}</div>`}
        <div class="body">
          <div class="title">${U.esc(n.question).slice(0, 90)}${n.question.length > 90 ? '…' : ''}</div>
          <div class="meta"><span class="tag dark">${U.esc(n.subject)}</span>${n.tags.map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}
            ${this.due(n) ? '<span class="tag red">복습할 때</span>' : ''}<span>복습 ${n.reviewCount}회</span><span>${U.fmtDate(n.createdAt)}</span><span>${U.esc(n.author)}</span>
            ${n.source === 'fallback' ? '<span class="tag red">예시 모드</span>' : ''}</div>
        </div>
        <button class="ghost danger small" title="삭제" onclick="event.stopPropagation();Notes.del('${n.id}')">삭제</button></div>`).join('');
  },
  show(id) { this.open = id; this.hidden = true; this.renderDetail(); this.$('noteDetail').scrollIntoView({ behavior: 'smooth' }); },
  close() { this.open = null; this.renderDetail(); },
  toggle() { this.hidden = !this.hidden; this.renderDetail(); },
  review(id) {
    const n = this.all().find(x => x.id === id); if (!n) return;
    Store.update('notes', id, { reviewCount: (n.reviewCount || 0) + 1, lastReviewed: new Date().toISOString() });
    this.hidden = false; App.toast(`복습 ${n.reviewCount + 1}회째! 잘하고 있어요.`); this.renderList(); this.renderDetail();
  },
  del(id) {
    if (!confirm('이 노트를 삭제할까요?')) return;
    Store.remove('notes', id); if (this.open === id) this.open = null; App.toast('노트를 삭제했습니다.'); this.renderFilters(); this.renderList(); this.renderDetail();
  },
  delAll() {
    const list = this.all(); if (!list.length) return;
    if (!confirm(`오답노트 ${list.length}개를 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    list.forEach(n => Store.remove('notes', n.id)); this.open = null; App.toast('오답노트를 모두 삭제했습니다.'); this.renderFilters(); this.renderList(); this.renderDetail();
  },

  renderDetail() {
    const box = this.$('noteDetail'); const n = this.all().find(x => x.id === this.open);
    if (!n) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const blur = this.hidden ? 'blur' : '';
    box.innerHTML = `
      <div class="result-head"><h3>${U.esc(n.subject)} · ${U.fmtDate(n.createdAt)}</h3><div class="row" style="gap:12px"><button class="link" style="color:#ff8a80" onclick="Notes.del('${n.id}')">🗑 삭제</button><button class="link" style="color:var(--on-dark)" onclick="Notes.close()">✕ 닫기</button></div></div>
      <div class="eyebrow">문제</div>
      ${n.imageDataUrl ? `<img class="q-img" src="${n.imageDataUrl}" alt="문제 사진">` : ''}
      <div class="q-text">${U.md(n.question)}</div>
      ${n.recognized ? `<p class="muted small" style="margin-top:8px">사진에서 읽은 문제: ${U.esc(n.recognized)}</p>` : ''}
      <div class="actions">
        <button class="primary" onclick="Notes.review('${n.id}')">${this.hidden ? '다시 풀어봤어요 → 풀이 확인' : '복습 1회 추가'}</button>
        <button class="ghost" onclick="Notes.toggle()">${this.hidden ? '풀이 바로 보기' : '풀이 가리기'}</button>
        <span class="muted small">복습 ${n.reviewCount}회${n.lastReviewed ? ` · 마지막 ${U.fmtDate(n.lastReviewed)}` : ''}${n.model ? ` · ${U.esc(n.model)}` : ''}</span>
      </div>
      <div class="solution ${blur}" style="margin-top:16px">
        <div class="block full"><h4>단계별 풀이</h4><ol class="steps">${(n.steps || []).map(s => `<li>${U.md(s)}</li>`).join('')}</ol></div>
        <div class="block answer"><h4>최종 답</h4><div class="big">${U.md(n.answer)}</div></div>
        <div class="block"><h4>핵심 개념</h4>${U.md(n.concept)}</div>
        ${n.pitfall ? `<div class="block pitfall full"><h4>자주 하는 실수</h4>${U.md(n.pitfall)}</div>` : ''}
      </div>
      <div class="actions">${n.tags.map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}
        <span class="grow"></span><button class="ghost danger small" onclick="Notes.del('${n.id}')">삭제</button></div>`;
  }
};
