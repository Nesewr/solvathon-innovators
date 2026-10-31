/* 생기부 활동: 리로스쿨에서 모은 활동을 마감 임박순으로 보여줌 (정적 JSON, 교사 실명 제거본) */
const Activities = {
  data: null,
  KW: {
    eng: ['과학', '물리', '화학', '생명', '지구', '수학', '실험', '탐구', '공학', '로봇', '발명', '전람회', 'STEAM', '융합', '천문', '환경', '에너지'],
    sw: ['코딩', '프로그래밍', 'SW', '소프트웨어', '정보과학', '정보올림피아드', 'AI', '인공지능', '데이터', '앱', '해커톤', '솔버톤', '컴퓨터', '디지털', '메이커', '알고리즘'],
    med: ['의학', '보건', '간호', '생명', '의료', '심리', '건강', '헌혈', '봉사', '응급', '약', '생물'],
    hum: ['인문', '역사', '철학', '토론', '독서', '글쓰기', '논술', '사회', '정치', '법', '신문', '문학', '외교', '언어', '영어', '문화', '답사'],
    biz: ['경제', '경영', '창업', '금융', '마케팅', '주식', '기업', '무역', '회계', '광고'],
    edu: ['교육', '멘토', '또래', '튜터', '가르치', '교사', '상담', '학습'],
    art: ['미술', '음악', '체육', '디자인', '공연', '연주', '밴드', '스포츠', '사진', '영상', '축제', '무용', '연극', '오케스트라']
  },
  profile() { const p = typeof Auth !== 'undefined' && Auth.current(); return p && p.setupDone ? p : null; },
  profileChanged() { this.ai = null; this.renderList(); },
  async analyze() {
    if (typeof Auth !== 'undefined' && Auth.gate()) return;
    const serverAI = typeof API !== 'undefined' && API.ready && API.health && API.health.ai;
    if (!serverAI) { App.toast('AI 서버가 준비되지 않아 지금은 규칙 기반 점수만 보여줍니다.', 'error'); return; }
    const p = this.profile(); const btn = this.$('aAnalyze'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>분석 중… (10~30초)';
    try {
      const items = this.data.activities.map(a => ({ id: a.id, title: a.title, category: a.category, record: a.record, grades: a.grades, summary: a.summary, info: a.info }));
      const r = await API.analyze({ track: (p && p.track) || '', major: (p && p.major) || '', items });
      this.ai = Object.fromEntries(r.items.map(x => [x.id, x])); this.aiMeta = r;
      App.toast(r.cached ? 'AI 분석 결과(캐시)를 불러왔습니다.' : `AI 분석 완료 (${r.model})`); this.renderList();
    } catch (e) { App.toast('AI 분석 실패: ' + e.message, 'error'); }
    btn.disabled = false; btn.innerHTML = '✦ AI 분석';
  },
  /* 진로 적합 점수 0~100과 근거 */
  fit(a) {
    const p = this.profile(), reasons = []; let score = 40;
    const text = `${a.title} ${a.category || ''} ${(a.categories || []).join(' ')} ${a.summary || ''} ${a.info || ''}`;
    if (p && p.track && this.KW[p.track]) {
      const hits = this.KW[p.track].filter(k => text.toLowerCase().includes(k.toLowerCase()));
      if (hits.length) { score += Math.min(35, 15 + hits.length * 10); reasons.push(`${Auth.trackName(p.track)} 키워드: ${hits.slice(0, 3).join(', ')}`); }
    }
    if (p && p.major) { const words = p.major.split(/[\s,·/]+/).filter(w => w.length >= 2); const mh = words.filter(w => text.includes(w)); if (mh.length) { score += 15; reasons.push(`희망 학과·직업 "${mh[0]}" 관련`); } }
    const rec = a.record || [];
    if (rec.includes('진로')) { score += 10; reasons.push('생기부 진로 영역'); }
    if (rec.includes('교과세특')) { score += 5; reasons.push('교과세특 기록 가능'); }
    if (p && p.grade && a.grades && a.grades.includes(p.grade)) { score += 5; reasons.push(`${p.grade}학년 대상`); }
    const d = this.dday(a.deadline); if (a.status !== '마감' && d != null && d >= 0 && d <= 14) { score += 5; reasons.push(`마감 ${d === 0 ? '오늘' : 'D-' + d}`); }
    if (a.participatory) score += 5;
    const ai = this.ai && this.ai[a.id];
    if (ai) { score = Math.round(score * 0.4 + ai.score * 0.6); if (ai.recommend) reasons.unshift('AI 추천'); }
    return { score: Math.min(100, score), reasons, ai };
  },
  ai: null,   // { id → {score, recommend, reason, tip} }
  init() {
    this.$ = id => document.getElementById(id);
    this.$('aAnalyze').onclick = () => this.analyze();
    ['aGrade', 'aRecord', 'aCat', 'aSort'].forEach(id => this.$(id).onchange = () => this.renderList());
    this.$('aOpen').onchange = () => this.renderList(); this.$('aSearch').oninput = () => this.renderList();
  },
  async render() {
    if (!this.data) {
      try { this.data = await (await fetch('data/activities.json', { cache: 'no-store' })).json(); } catch { this.data = { activities: [] }; }
      const cats = [...new Set(this.data.activities.map(a => a.category).filter(Boolean))], recs = [...new Set(this.data.activities.flatMap(a => a.record || []))];
      this.$('aCat').innerHTML = '<option value="">모든 분류</option>' + cats.map(c => `<option>${U.esc(c)}</option>`).join('');
      this.$('aRecord').innerHTML = '<option value="">모든 생기부 영역</option>' + recs.map(c => `<option>${U.esc(c)}</option>`).join('');
      const p = typeof Auth !== 'undefined' && Auth.current(); if (p && p.setupDone && p.grade) this.$('aGrade').value = String(p.grade);
      if (this.data.generated) { const days = Math.floor((new Date() - new Date(this.data.generated.slice(0, 10))) / 864e5); this.$('aMeta').textContent = `마지막 수집 ${this.data.generated.slice(0, 10)} (${days === 0 ? '오늘' : days + '일 전'}) · ${this.data.count}건 · 3일 지나면 자동 갱신`; }
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
    const p = this.profile(), fits = new Map(list.map(a => [a.id, this.fit(a)]));
    const sortMode = this.$('aSort').value;
    if (sortMode === 'fit') list.sort((x, y) => (fits.get(y.id).score - fits.get(x.id).score) || (key(x) - key(y))); else list.sort((x, y) => key(x) - key(y));
    this.$('aTrackHint').innerHTML = p && p.track ? `<b>${U.esc(p.nickname)}</b>님의 희망 계열 <b>${U.esc(Auth.trackName(p.track))}</b>${p.major ? ` · ${U.esc(p.major)}` : ''} 기준으로 적합 점수를 매겼습니다.${this.ai ? ` AI 분석 반영됨(${this.aiMeta && this.aiMeta.cached ? '캐시' : this.aiMeta.model}).` : ' "AI 분석"을 누르면 Gemini가 활동별 추천 이유와 팁을 더합니다.'} <button class="link" onclick="Auth.openSetup()">진로 바꾸기</button>`
      : p ? `희망 계열을 설정하면 내 진로에 맞는 활동이 위로 올라옵니다. <button class="link" onclick="Auth.openSetup()">진로 설정하기</button>` : '로그인 후 희망 계열을 설정하면 내 진로에 맞는 활동이 위로 올라옵니다.';
    const el = this.$('aList'); this.$('aCount').textContent = `${list.length}건`;
    if (!list.length) { el.innerHTML = '<div class="empty">조건에 맞는 활동이 없어요. "진행 중만" 체크를 풀면 지난 활동도 보입니다.</div>'; return; }
    el.innerHTML = list.map(a => {
      const d = this.dday(a.deadline), closed = a.status === '마감' || (d != null && d < 0);
      const dd = closed ? '<span class="tag">마감</span>' : d == null ? '<span class="tag">상시</span>' : d === 0 ? '<span class="tag red">오늘 마감</span>' : d <= 3 ? `<span class="tag red">D-${d}</span>` : `<span class="tag green">D-${d}</span>`;
      const f = fits.get(a.id), lv = f.score >= 75 ? 'hi' : f.score >= 55 ? 'mid' : 'lo';
      return `<div class="item act ${closed ? 'closed' : ''}" style="cursor:default">
        <div class="fit ${lv}" title="${U.esc(f.reasons.join(' / ') || '기본 점수')}"><b>${f.score}</b><span>진로 적합</span></div>
        <div class="body">
          <div class="meta" style="margin-bottom:4px">${dd}<span class="tag dark">${U.esc(a.board || '')}</span>${a.category ? `<span class="tag">${U.esc(a.category)}</span>` : ''}${(a.record || []).map(x => `<span class="tag green">생기부 · ${U.esc(x)}</span>`).join('')}</div>
          <div class="title">${U.esc(a.title)}</div>
          <div class="meta">${a.grades && a.grades.length ? `<span>${a.grades.map(x => x + '학년').join('·')}</span>` : '<span>전 학년</span>'}${a.deadline ? `<span>마감 ${U.esc(a.deadline)}</span>` : ''}${a.courses ? `<span>${a.courses.length}개 강좌</span>` : ''}</div>
          ${a.summary ? `<p class="small" style="margin:6px 0 0">${U.esc(a.summary).slice(0, 160)}</p>` : a.info ? `<p class="small muted" style="margin:6px 0 0">${U.esc(a.info).slice(0, 140)}</p>` : ''}
          ${f.reasons.length ? `<p class="small fit-why">✓ ${f.reasons.map(r => U.esc(r)).join(' · ')}</p>` : ''}
          ${f.ai ? `<div class="ai-box"><b>✦ AI</b> ${U.esc(f.ai.reason)}${f.ai.tip ? `<br><span class="muted">팁:</span> ${U.esc(f.ai.tip)}` : ''}</div>` : ''}
        </div>
        <div><a class="ghost small" style="display:inline-flex;align-items:center;text-decoration:none" href="${U.esc(a.url)}" target="_blank" rel="noopener">리로스쿨 ↗</a></div></div>`;
    }).join('');
  }
};
