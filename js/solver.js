/* AI 문제풀이: 입력 → Gemini 호출(또는 폴백) → 결과 → 오답노트 자동 저장 */
const Solver = {
  image: null, // dataURL (JPEG, 최대 1024px)
  init() {
    this.$ = id => document.getElementById(id);
    this.$('solveBtn').onclick = () => this.solve();
    this.$('exampleBtn').onclick = () => this.fillExample();
    this.$('qImage').onchange = e => this.pickImage(e.target.files[0]);
    this.$('qImageClear').onclick = () => this.clearImage();
    this.renderKeyState();
  },
  render() { this.renderKeyState(); },
  renderKeyState() {
    const s = App.settings(); const el = this.$('keyState');
    const serverAI = typeof API !== 'undefined' && API.ready && API.health && API.health.ai;
    el.textContent = serverAI ? 'AI 준비됨' : s.apiKey ? `Gemini 연결됨 · ${s.model}` : 'AI 준비 중 → 지금은 예시 풀이로 보여줍니다';
  },
  fillExample() {
    const ex = App.seed && App.seed.example; if (!ex) return;
    this.$('qSubject').value = ex.subject; this.$('qTags').value = ex.tags; this.$('qText').value = ex.text;
    this.$('qText').focus();
  },

  pickImage(file) {
    if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1024, r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      this.image = c.toDataURL('image/jpeg', 0.8); URL.revokeObjectURL(url);
      this.$('qPreview').src = this.image; this.$('qPreview').classList.remove('hidden'); this.$('qImageClear').classList.remove('hidden');
    };
    img.src = url;
  },
  clearImage() { this.image = null; this.$('qImage').value = ''; this.$('qPreview').classList.add('hidden'); this.$('qImageClear').classList.add('hidden'); },

  async solve() {
    const text = this.$('qText').value.trim(), subject = this.$('qSubject').value, tags = U.tags(this.$('qTags').value);
    if (!text && !this.image) { App.toast('문제 텍스트를 적거나 사진을 올려 주세요.', 'error'); this.$('qText').focus(); return; }
    const btn = this.$('solveBtn'); btn.disabled = true;
    const box = this.$('solveResult'); box.classList.remove('hidden');
    box.innerHTML = `<div class="result-head"><h3><span class="spinner"></span>AI가 풀고 있어요…</h3></div><p class="muted">보통 5~15초 걸립니다. 사진이 있으면 조금 더 걸려요.</p>`;
    const s = App.settings(); let result, source = 'ai', note;
    const serverAI = typeof API !== 'undefined' && API.ready && API.health && API.health.ai;
    try {
      if (serverAI) result = await API.solve({ text, subject, image: this.image });
      else if (!s.apiKey) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
      else result = await this.callGemini(s, text, subject, this.image);
    } catch (e) {
      source = 'fallback';
      result = this.fallback(text, subject, tags, e);
    }
    note = {
      id: U.uid(), createdAt: new Date().toISOString(), author: App.user(), authorTag: App.userTag(),
      subject: result.subject || subject, tags: (tags.length ? tags : result.tags || []).slice(0, 6),
      question: text || result.question_text || '(사진 문제)', imageDataUrl: this.image,
      recognized: !text ? result.question_text : null,
      steps: result.steps || [], answer: result.answer || '', concept: result.concept || '', pitfall: result.pitfall || '',
      reviewCount: 0, lastReviewed: null, source
    };
    Store.push('notes', note);
    this.renderResult(note, result._notice);
    btn.disabled = false;
  },

  async callGemini(s, text, subject, image) {
    const prompt = [
      '너는 한국 고등학생을 가르치는 친절한 과목 선생님이다. 아래 문제를 학생이 혼자 이해할 수 있게 단계별로 풀어라.',
      `과목 힌트: ${subject}. 사진이 있으면 사진 속 문제를 먼저 정확히 읽어 question_text에 옮겨 적어라.`,
      '규칙: 한국어. 각 단계는 "무엇을 왜 하는지"를 한두 문장으로. 수식은 유니코드(², √, ×, ÷, −)로 간단히. 답만 주지 말 것.',
      '반드시 JSON만 출력: {"subject":"과목","question_text":"문제 원문","tags":["개념1","개념2"],"steps":["1단계","2단계",...],"answer":"최종 답","concept":"핵심 개념 2~3문장","pitfall":"학생이 자주 하는 실수 1문장"}',
      text ? `\n문제:\n${text}` : '\n문제는 첨부한 사진에 있다.'
    ].join('\n');
    const parts = [{ text: prompt }];
    if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image.split(',')[1] } });
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } })
    }).finally(() => clearTimeout(timer));
    if (!res.ok) { const body = await res.text().catch(() => ''); throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'HTTP', status: res.status, body }); }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    try { return JSON.parse(raw.replace(/^```json|```$/g, '').trim()); }
    catch { throw Object.assign(new Error('PARSE'), { code: 'PARSE', raw }); }
  },

  fallback(text, subject, tags, err) {
    const fb = (App.seed && App.seed.fallback) || {};
    const isExample = text && fb.question_text && text.replace(/\s/g, '') === fb.question_text.replace(/\s/g, '');
    let notice;
    if (err.code === 'NO_KEY') notice = 'AI 서버가 아직 준비되지 않아 예시 풀이를 보여줍니다.';
    else if (err.name === 'AbortError') notice = '응답이 45초 안에 오지 않아 예시 풀이로 대체했습니다.';
    else if (err.status) notice = `AI 서버 오류(${err.message})로 예시 풀이로 대체했습니다.`;
    else if (err.code === 'HTTP') notice = `AI 서버 오류(${err.status})로 예시 풀이로 대체했습니다. ${err.status === 400 || err.status === 403 ? '키가 맞는지 확인해 주세요.' : ''}`;
    else notice = `AI 응답을 해석하지 못해 예시 풀이로 대체했습니다. (${err.message})`;
    if (isExample || !text) return { ...fb, _notice: notice };
    return {
      subject, tags, question_text: text,
      steps: ['(예시 모드) 문제에서 주어진 조건과 구하려는 것을 먼저 구분한다.', '관련 개념과 공식을 떠올려 조건을 식으로 옮긴다.', '식을 정리해 답을 구하고, 단위와 조건에 맞는지 확인한다.'],
      answer: 'AI가 준비되면 같은 문제를 다시 풀어 보세요.',
      concept: '이 노트는 예시 모드로 저장되었습니다. AI가 준비된 뒤 같은 문제를 다시 풀면 새 노트가 생깁니다.',
      pitfall: '', _notice: notice
    };
  },

  renderResult(n, notice) {
    const box = this.$('solveResult');
    box.innerHTML = `
      <div class="result-head"><h3>풀이 완료 · ${U.esc(n.subject)}</h3>
        <button class="link" style="color:var(--green-pale)" onclick="App.go('notes')">오답노트에 저장됨 → 보기</button></div>
      ${notice ? `<p class="small" style="color:var(--warning)"><b>안내</b> ${U.esc(notice)}</p>` : ''}
      ${n.imageDataUrl ? `<img class="q-img" src="${n.imageDataUrl}" alt="문제 사진">` : ''}
      ${n.recognized ? `<div class="block" style="margin-top:12px"><h4>사진에서 읽은 문제</h4><div class="q-text">${U.md(n.recognized)}</div></div>` : ''}
      <div class="solution" style="margin-top:16px">
        <div class="block full"><h4>단계별 풀이</h4><ol class="steps">${n.steps.map(s => `<li>${U.md(s)}</li>`).join('')}</ol></div>
        <div class="block answer"><h4>최종 답</h4><div class="big">${U.md(n.answer)}</div></div>
        <div class="block"><h4>핵심 개념</h4>${U.md(n.concept)}</div>
        ${n.pitfall ? `<div class="block pitfall full"><h4>자주 하는 실수</h4>${U.md(n.pitfall)}</div>` : ''}
      </div>
      <div class="actions">${n.tags.map(t => `<span class="tag">${U.esc(t)}</span>`).join('')}
        <span class="muted small">저장 시각 ${U.fmtDate(n.createdAt)} · ${U.esc(n.author)}</span></div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
