/* 생기부 활동: 리로스쿨에서 모은 활동을 마감 임박순으로 보여줌 (정적 JSON, 교사 실명 제거본) */
const Activities = {
  data: null, f: { grade: '', record: '', cat: '', open: true, q: '' },
  init() {
    this.$ = id => document.getElementById(id);
    ['aGrade', 'aRecord', 'aCat'].forEach(id => this.$(id).onchange = () => this.renderList());
    this.$('aOpen').onchange = () => this.renderList(); this.$('aSearch').oninput = () => this.renderList();
  },
  async render() {
    if (!this.data) {
      try { this.data = await (await fetch('data/activities.json', { cache: 'no-store' })).json(); } catch { this.data = { activities: [] }; }
      const cats = [...new Set(this.data.activities.map(a => a.category).filter(Boolean))], recs = [...new Set(this.data.activities.flatMap(a => a.record || []))];
      this.$('aCat').innerHTML = '<option value="">모든 분류</option>' + cats.map(c => `<option>${U.esc(c)}</option>`).join('');
      this.$('aRecord').innerHTML = '<option value="">모든 생기부 영역</option>' + recs.map(c => `<option>${U.esc(c)}</option>`).join('');
      const p = typeof Auth !== 'undefined' && Auth.current(); if (p && p.setupDone && p.grade) this.$('aGrade').value = String(p.grade);
      this.$('aMeta').textContent = this.data.generated ? `수집 시각 ${this.data.generated.slice(0, 16).replace('T', ' ')} · ${this.data.count}건` : '';
    }
    this.renderList();
  },
  dday(d) { if (!d) return null; const n = Math.ceil((new Date(d) - new Date(new Date().toDateString())) / 864e5); return n; },
  renderList() {
    const g = this.$('aGrade').value, r = this.$('aRecord').value, c = this.$('aCat').value, open = this.$('aOpen').checked, q = this.$('aSearch').value.trim().toLowerCase();
    let list = this.data.activities.filter(a =>
      (!g || !a.grades || !a.grades.length || a.grades.includes(+g)) && (!r || (a.record || []).includes(r)) && (!c || a.category === c) &&
      (!open || (a.status !== '마감' && (this.dday(a.deadline) == null || this.dday(a.deadline) >= 0))) &&
      (!q || (a.title + ' ' + (a.summary || '') + ' ' + (a.info || '')).toLowerCase().includes(q)));
    const key = a => { const d = this.dday(a.deadline); return a.status === '마감' || (d != null && d < 0) ? 1e6 + (d == null ? 0 : -d) : d == null ? 5e5 : d; };
    list.sort((x, y) => key(x) - key(y));
    const el = this.$('aList'); this.$('aCount').textContent = `${list.length}건`;
    if (!list.length) { el.innerHTML = '<div class="empty">조건에 맞는 활동이 없어요. "진행 중만" 체크를 풀면 지난 활동도 보입니다.</div>'; return; }
    el.innerHTML = list.map(a => {
      const d = this.dday(a.deadline), closed = a.status === '마감' || (d != null && d < 0);
      const dd = closed ? '<span class="tag">마감</span>' : d == null ? '<span class="tag">상시</span>' : d === 0 ? '<span class="tag red">오늘 마감</span>' : d <= 3 ? `<span class="tag red">D-${d}</span>` : `<span class="tag green">D-${d}</span>`;
      return `<div class="item act ${closed ? 'closed' : ''}" style="cursor:default">
        <div class="body">
          <div class="meta" style="margin-bottom:4px">${dd}<span class="tag dark">${U.esc(a.board || '')}</span>${a.category ? `<span class="tag">${U.esc(a.category)}</span>` : ''}${(a.record || []).map(x => `<span class="tag green">생기부 · ${U.esc(x)}</span>`).join('')}</div>
          <div class="title">${U.esc(a.title)}</div>
          <div class="meta">${a.grades && a.grades.length ? `<span>${a.grades.map(x => x + '학년').join('·')}</span>` : '<span>전 학년</span>'}${a.deadline ? `<span>마감 ${U.esc(a.deadline)}</span>` : ''}${a.courses ? `<span>${a.courses.length}개 강좌</span>` : ''}</div>
          ${a.summary ? `<p class="small" style="margin:6px 0 0">${U.esc(a.summary).slice(0, 160)}</p>` : a.info ? `<p class="small muted" style="margin:6px 0 0">${U.esc(a.info).slice(0, 140)}</p>` : ''}
        </div>
        <div><a class="ghost small" style="display:inline-flex;align-items:center;text-decoration:none" href="${U.esc(a.url)}" target="_blank" rel="noopener">리로스쿨 ↗</a></div></div>`;
    }).join('');
  }
};
