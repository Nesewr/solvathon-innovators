/* 층별 지도 컴포넌트: 층 선택 + 교실 클릭(선택) + 분실물 표시(마커) */
const FloorMap = {
  /* create(container, {mode:'pick'|'view', floor, onPick(floor, room), markers:{ 'floor|room': count }, selected:{floor,room}}) */
  create(container, opts) {
    const m = { el: container, opts, floor: opts.floor || '1F' };
    m.render = () => this.render(m);
    m.setFloor = f => { m.floor = f; m.render(); };
    m.update = patch => { Object.assign(m.opts, patch); if (patch.selected && patch.selected.floor) m.floor = patch.selected.floor; m.render(); };
    m.render();
    return m;
  },
  render(m) {
    const f = FLOORS[m.floor], o = m.opts, markers = o.markers || {}, sel = o.selected || {};
    const countOnFloor = fl => Object.entries(markers).filter(([k]) => k.startsWith(fl + '|')).reduce((a, [, v]) => a + v, 0);
    m.el.innerHTML = `
      <div class="map-floors">${FLOOR_ORDER.map(fl => `<button type="button" class="${fl === m.floor ? 'active' : ''}" data-floor="${fl}">${fl}${countOnFloor(fl) ? `<span class="map-count">${countOnFloor(fl)}</span>` : ''}</button>`).join('')}
        <span class="muted small map-hint">${o.mode === 'pick' ? '교실을 클릭하면 위치가 입력됩니다' : '녹색 교실 = 분실물 있음 · 클릭하면 목록 필터'}</span></div>
      <div class="map-view"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.viewBox}">${f.svg}</svg></div>`;
    m.el.querySelectorAll('.map-floors button').forEach(b => b.onclick = () => m.setFloor(b.dataset.floor));
    const svg = m.el.querySelector('svg');
    svg.querySelectorAll('.room').forEach(r => {
      const name = r.dataset.name, key = m.floor + '|' + name, n = markers[key];
      if (n) {
        r.classList.add('has-items');
        const rect = r.querySelector('rect'); if (rect) {
          const x = +rect.getAttribute('x') + +rect.getAttribute('width') - 2, y = +rect.getAttribute('y') + 2;
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'marker'); g.setAttribute('transform', `translate(${x} ${y})`);
          g.innerHTML = `<circle r="7" fill="#76b900" stroke="#000" stroke-width="1.2"/><text y="2.5" font-size="8" font-weight="700" text-anchor="middle" fill="#000">${n}</text>`;
          r.appendChild(g);
        }
      }
      if (sel.floor === m.floor && sel.room === name) r.classList.add('selected');
      r.addEventListener('click', () => {
        if (o.mode === 'pick') { o.selected = { floor: m.floor, room: name }; m.render(); o.onPick && o.onPick(m.floor, name); }
        else { o.onPick && o.onPick(m.floor, name, !!n); }
      });
    });
  }
};
