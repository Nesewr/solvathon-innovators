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

  renderFilters() {
    const sel = this.$('nSubjectFilter'), cur = sel.value;
    const subs = [...new Set(this.all().map(n => n.subject))];
    sel.innerHTML = `<option value="">모든 과목</option>` + subs.map(s => `<option ${s === cur ? 'selected' : ''}>${U.esc(s)}</option>`).join('');
  },
  renderList() {
    const sub = this.$('nSubjectFilter').value, q = this.$('nSearch').value.trim().toLowerCase();
    const list = this.all().filter(n => (!sub || n.subject === sub) && (!q || (n.question + ' ' + n.tags.join(' ') + ' ' + (n.concept || '')).toLowerCase().includes(q)));
    const el = this.$('notesList');
    if (!list.length) { el.innerHTML = `<div class="empty">아직 오답노트가 없어요. <b>AI 문제풀이</b>에서 문제를 풀면 자동으로 쌓입니다.</div>`; return; }
    el.innerHTML = list.map(n => `
      <div class="item" onclick="Notes.show('${n.id}')">
        ${n.imageDataUrl ? `<img class="thumb" src="${n.imageDataUrl}" alt="">` : `<div class="thumb" style="display:grid;place-items:center;background:var(--soft);font-weight:700">${U.esc(n.subject.slice(0, 2))}</div>`}
        <div class="body">
          <div class="title">${U.esc(n.question).slice(0, 90)}${n.question.length > 90 ? '…' : ''}</div>
          <div class="meta"><span class="tag dark">${U.esc(n.subject)}</span>${n.tags.map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}
            <span>복습 ${n.reviewCount}회</span><span>${U.fmtDate(n.createdAt)}</span><span>${U.esc(n.author)}</span>
            ${n.source === 'fallback' ? '<span class="tag red">예시 모드</span>' : ''}</div>
        </div></div>`).join('');
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
    Store.remove('notes', id); this.open = null; App.toast('노트를 삭제했습니다.'); this.renderFilters(); this.renderList(); this.renderDetail();
  },

  renderDetail() {
    const box = this.$('noteDetail'); const n = this.all().find(x => x.id === this.open);
    if (!n) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    const blur = this.hidden ? 'blur' : '';
    box.innerHTML = `
      <div class="result-head"><h3>${U.esc(n.subject)} · ${U.fmtDate(n.createdAt)}</h3><button class="link" style="color:var(--on-dark)" onclick="Notes.close()">✕ 닫기</button></div>
      <div class="eyebrow">문제</div>
      ${n.imageDataUrl ? `<img class="q-img" src="${n.imageDataUrl}" alt="문제 사진">` : ''}
      <div class="q-text">${U.md(n.question)}</div>
      ${n.recognized ? `<p class="muted small" style="margin-top:8px">사진에서 읽은 문제: ${U.esc(n.recognized)}</p>` : ''}
      <div class="actions">
        <button class="primary" onclick="Notes.review('${n.id}')">${this.hidden ? '다시 풀어봤어요 → 풀이 확인' : '복습 1회 추가'}</button>
        <button class="ghost" onclick="Notes.toggle()">${this.hidden ? '풀이 바로 보기' : '풀이 가리기'}</button>
        <span class="muted small">복습 ${n.reviewCount}회${n.lastReviewed ? ` · 마지막 ${U.fmtDate(n.lastReviewed)}` : ''}</span>
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
