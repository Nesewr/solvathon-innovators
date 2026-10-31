/* 층별 지도 컴포넌트: 층 선택 + 좌표 클릭(핀 찍기) + 핀 표시 */
const FloorMap = {
  PIN: (cls, label) => `<g class="pin ${cls}"><path d="M0 0C-6-9-9-13-9-17A9 9 0 1 1 9-17C9-13 6-9 0 0Z"/><circle cy="-17" r="3.4"/>${label ? `<title>${label}</title>` : ''}</g>`,
  /* create(el, { mode:'pick'|'view', floor, pins:[{id,floor,x,y,label,status}], selected:{floor,x,y}, onPick(floor,x,y,room), onPin(id) }) */
  create(el, opts) {
    const m = { el, opts, floor: opts.floor || '1F' };
    m.render = () => this.render(m);
    m.setFloor = f => { if (FLOORS[f]) { m.floor = f; m.render(); } };
    m.update = patch => { Object.assign(m.opts, patch); if (patch.selected && patch.selected.floor) m.floor = patch.selected.floor; m.render(); };
    m.render();
    return m;
  },
  roomAt(svg, x, y) {
    let best = null;
    svg.querySelectorAll('.room').forEach(r => {
      const rc = r.querySelector('rect'); if (!rc) return;
      const rx = +rc.getAttribute('x'), ry = +rc.getAttribute('y'), rw = +rc.getAttribute('width'), rh = +rc.getAttribute('height');
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) best = r.dataset.name;
    });
    return best;
  },
  render(m) {
    const f = FLOORS[m.floor], o = m.opts, pins = (o.pins || []), sel = o.selected;
    const onFloor = fl => pins.filter(p => p.floor === fl).length;
    m.el.innerHTML = `
      <div class="map-floors">${FLOOR_ORDER.map(fl => `<button type="button" class="${fl === m.floor ? 'active' : ''}" data-floor="${fl}">${fl}${onFloor(fl) ? `<span class="map-count">${onFloor(fl)}</span>` : ''}</button>`).join('')}
        <span class="muted small map-hint">${o.mode === 'pick' ? '물건이 있던 자리를 지도에서 클릭하세요' : '<span class="map-legend"><span><i style="background:#76b900"></i>잃어버렸어요</span><span><i style="background:#3f8500"></i>주웠어요</span><span><i style="background:#a7a7a7"></i>해결</span></span>'}</span></div>
      <div class="map-view"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.viewBox}">${f.svg}<g class="pins"></g></svg></div>`;
    m.el.querySelectorAll('.map-floors button').forEach(b => b.onclick = () => m.setFloor(b.dataset.floor));
    const svg = m.el.querySelector('svg'), layer = svg.querySelector('.pins');
    const place = (x, y, html) => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('transform', `translate(${x} ${y})`); g.innerHTML = html; layer.appendChild(g); return g; };
    pins.filter(p => p.floor === m.floor).forEach(p => {
      const g = place(p.x, p.y, this.PIN(p.status === 'found' ? 'done' : (p.kind === 'found' ? 'k-found' : ''), U.esc(p.label || '')));
      if (o.mode === 'view') g.addEventListener('click', e => { e.stopPropagation(); o.onPin && o.onPin(p.id); });
      if (o.activeId === p.id) g.querySelector('.pin').classList.add('active');
    });
    if (sel && sel.floor === m.floor) place(sel.x, sel.y, this.PIN('picked', '선택한 위치'));
    if (o.mode === 'pick') svg.addEventListener('click', e => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const x = Math.round(p.x * 10) / 10, y = Math.round(p.y * 10) / 10, room = this.roomAt(svg, x, y);
      o.selected = { floor: m.floor, x, y, room }; m.render(); o.onPick && o.onPick(m.floor, x, y, room);
    });
  }
};
