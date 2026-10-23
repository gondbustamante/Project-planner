/* Diagrama de Gantt en SVG: escala temporal, barras, hitos, resúmenes, dependencias, línea base e interacción */
const Gantt = (() => {
  const ROW = 30, HEAD = 48;
  const PX = { day: 36, week: 14, month: 4.5 };
  let zoom = 'week', pxDay = PX.week;
  let headerEl, bodyEl, pane;
  let range = { start: 0, end: 1 };
  let rowsCache = [];
  let drag = null;

  const x = d => Math.round((d - range.start) * pxDay * 10) / 10;
  const dayAt = px => Math.floor(px / pxDay) + range.start;

  function init() {
    headerEl = document.getElementById('ganttHeader');
    bodyEl = document.getElementById('ganttBody');
    pane = document.getElementById('ganttPane');
    bodyEl.addEventListener('mousedown', onDown);
    bodyEl.addEventListener('dblclick', e => { const g = e.target.closest('[data-id]'); if (g) App.openTaskDialog(g.dataset.id); });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function setZoom(z) { zoom = z; pxDay = PX[z] || PX.week; }

  function computeRange(rows) {
    const { computed, project } = Store; const C = computed.C;
    let lo = computed.projStart, hi = computed.projFinish;
    for (const i of rows) { const t = project.tasks[i]; if (t.baseline) { const bs = U.toDay(t.baseline.start), bf = U.toDay(t.baseline.finish); if (bs != null) lo = Math.min(lo, bs); if (bf != null) hi = Math.max(hi, bf); } lo = Math.min(lo, C[i].es); hi = Math.max(hi, C[i].ef); }
    const td = U.today(); lo = Math.min(lo, td); hi = Math.max(hi, td);
    lo -= zoom === 'month' ? 31 : 7; hi += zoom === 'month' ? 62 : 21;
    while (U.dow(lo) !== 1) lo--; // alinear a lunes
    const minDays = Math.ceil((pane ? pane.clientWidth : 800) / pxDay);
    if (hi - lo < minDays) hi = lo + minDays;
    range = { start: lo, end: hi };
  }

  // ---------- cabecera ----------
  function headerSVG(width) {
    let top = '', bottom = '';
    const { start, end } = range;
    const line = (x1, y1, y2) => `<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="#d9dde3"/>`;
    if (zoom === 'month') {
      let d = start;
      while (d < end) { const p = U.parts(d); const ny = Date.UTC(p.y + 1, 0, 1) / U.MS; const e = Math.min(ny, end); top += `<text x="${(x(d) + x(e)) / 2}" y="16" text-anchor="middle" font-weight="600">${p.y}</text>` + line(x(e), 0, HEAD); d = ny; }
      d = start;
      while (d < end) { const p = U.parts(d); const nm = Date.UTC(p.y, p.m + 1, 1) / U.MS; const e = Math.min(nm, end); bottom += `<text x="${(x(d) + x(e)) / 2}" y="38" text-anchor="middle">${U.MONTHS[p.m]}</text>` + line(x(e), 24, HEAD); d = nm; }
    } else {
      let d = start;
      while (d < end) { const p = U.parts(d); const nm = Date.UTC(p.y, p.m + 1, 1) / U.MS; const e = Math.min(nm, end); if (x(e) - x(d) > 40) top += `<text x="${(x(d) + x(e)) / 2}" y="16" text-anchor="middle" font-weight="600">${U.MONTHS_LONG[p.m]} ${p.y}</text>`; top += line(x(e), 0, HEAD); d = nm; }
      if (zoom === 'day') { for (let d = start; d < end; d++) { const p = U.parts(d); bottom += `<text x="${x(d) + pxDay / 2}" y="38" text-anchor="middle" fill="${U.dow(d) === 0 || U.dow(d) === 6 ? '#9ca3af' : '#1f2430'}">${p.d}</text>` + line(x(d + 1), 24, HEAD); } }
      else { for (let d = start; d < end; d += 7) { const p = U.parts(d); bottom += `<text x="${x(d) + 3}" y="38">${p.d}</text>` + line(x(d), 24, HEAD); } }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEAD}"><rect width="${width}" height="${HEAD}" fill="#f3f4f6"/><line x1="0" y1="24" x2="${width}" y2="24" stroke="#d9dde3"/>${top}${bottom}</svg>`;
  }

  // ---------- cuerpo ----------
  function bodySVG(rows, opts) {
    const { project, computed, selection } = Store; const tasks = project.tasks, C = computed.C, ol = computed.outline, cal = computed.cal;
    const width = Math.ceil((range.end - range.start) * pxDay), height = Math.max(rows.length * ROW, 1);
    const sel = new Set(selection);
    const resById = new Map(project.resources.map(r => [r.id, r]));
    const yOf = new Map(rows.map((i, k) => [i, k * ROW]));
    let bg = '', bars = '', deps = '', labels = '';

    // Fondo: filas, días no laborables, hoy
    for (let k = 0; k < rows.length; k++) {
      bg += `<rect class="row-sel" data-sel="${tasks[rows[k]].id}" x="0" y="${k * ROW}" width="${width}" height="${ROW}" visibility="${sel.has(tasks[rows[k]].id) ? 'visible' : 'hidden'}"/>`;
      bg += `<line x1="0" y1="${(k + 1) * ROW - .5}" x2="${width}" y2="${(k + 1) * ROW - .5}" stroke="#eceff3"/>`;
    }
    if (pxDay >= 8) {
      for (let d = range.start; d < range.end; d++) if (!cal.isWork(d)) bg += `<rect x="${x(d)}" y="0" width="${pxDay}" height="${height}" fill="#eef0f3"/>`;
      // filas con calendario propio (responsables con calendario personal): sombrear sus días no laborables adicionales
      for (const i of rows) { const tc = C[i].cal; if (!tc || tc === cal) continue; const y = yOf.get(i); const lo = Math.max(range.start, C[i].es - 10), hi = Math.min(range.end, C[i].ef + 10); for (let d = lo; d < hi; d++) if (cal.isWork(d) && !tc.isWork(d)) bg += `<rect x="${x(d)}" y="${y + 2}" width="${pxDay}" height="${ROW - 4}" fill="#fde68a" opacity=".55"><title>No laborable para el responsable</title></rect>`; }
    }
    if (zoom !== 'day') { for (let d = range.start; d < range.end; d++) { const p = U.parts(d); if (p.d === 1) bg += `<line x1="${x(d)}" y1="0" x2="${x(d)}" y2="${height}" stroke="#e3e6eb"/>`; } }
    else { for (let d = range.start; d < range.end; d++) bg += `<line x1="${x(d)}" y1="0" x2="${x(d)}" y2="${height}" stroke="#f1f3f5"/>`; }
    const td = U.today(); if (td >= range.start && td <= range.end) bg += `<line class="today" x1="${x(td) + pxDay / 2}" y1="0" x2="${x(td) + pxDay / 2}" y2="${height}"/>`;

    // Barras
    for (const i of rows) {
      const t = tasks[i], c = C[i], y = yOf.get(i), crit = c.critical && opts.critical;
      const x1 = x(c.es), x2 = x(c.ef + 1), w = Math.max(x2 - x1, 2);
      const color = crit ? '#dc2626' : (ol.isSummary[i] ? '#374151' : '#2563eb');
      let g = `<g class="task-row" data-id="${t.id}" data-i="${i}">`;
      g += `<rect x="0" y="${y}" width="${width}" height="${ROW}" fill="transparent"/>`;
      if (opts.baseline && t.baseline && !ol.isSummary[i]) {
        const bs = U.toDay(t.baseline.start), bf = U.toDay(t.baseline.finish);
        if (bs != null && bf != null) g += `<rect x="${x(bs)}" y="${y + 22}" width="${Math.max(x(bf + 1) - x(bs), 2)}" height="4" rx="1" fill="#9ca3af"/>`;
      }
      if (ol.isSummary[i]) {
        const cy = y + 9;
        g += `<path d="M${x1} ${cy - 4} H${x2} V${cy + 3} L${x2 - 5} ${cy + 9} L${x2 - 10} ${cy + 3} H${x1 + 10} L${x1 + 5} ${cy + 9} L${x1} ${cy + 3} Z" fill="${color}"/>`;
      } else if (t.milestone) {
        const cx = x1 + pxDay / 2, cy = y + ROW / 2, r = 8;
        g += `<polygon class="bar" points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${crit ? '#dc2626' : '#111827'}"/>`;
        g += `<circle class="link-handle" cx="${cx + r + 6}" cy="${cy}" r="4"/>`;
      } else {
        const by = y + 8, bh = 14;
        g += `<rect class="bar" x="${x1}" y="${by}" width="${w}" height="${bh}" rx="3" fill="${color}"/>`;
        if (t.progress > 0) g += `<rect class="bar" x="${x1}" y="${by + 4}" width="${Math.max(w * Math.min(t.progress, 100) / 100, 0)}" height="${bh - 8}" rx="2" fill="rgba(0,0,0,.35)"/>`;
        g += `<rect class="bar-resize" x="${x1 + w - 6}" y="${by}" width="8" height="${bh}"/>`;
        g += `<circle class="link-handle" cx="${x1 + w + 7}" cy="${by + bh / 2}" r="4"/>`;
      }
      // Etiqueta: responsables (o nombre en resúmenes)
      const lbl = ol.isSummary[i] ? '' : t.resources.map(id => (resById.get(id) || {}).name).filter(Boolean).join(', ');
      if (lbl) labels += `<text x="${x2 + (t.milestone ? 20 : 16)}" y="${y + ROW / 2 + 4}" fill="#4b5563">${U.esc(lbl)}</text>`;
      if (t.milestone) labels += `<text x="${x2 + 20 + (lbl ? lbl.length * 6 + 6 : 0)}" y="${y + ROW / 2 + 4}" fill="#6b7280">${U.esc(t.name)} · ${U.fmt(c.es)}</text>`;
      g += '</g>';
      bars += g;
    }

    // Dependencias
    for (const i of rows) {
      const t = tasks[i]; if (!yOf.has(i)) continue;
      for (const p of t.predecessors) {
        const pi = computed.idx.get(p.id); if (pi == null || !yOf.has(pi)) continue;
        const pc = C[pi], sc = C[i];
        const crit = opts.critical && pc.critical && sc.critical;
        const fromRight = p.type === 'FS' || p.type === 'FF';
        const toLeft = p.type === 'FS' || p.type === 'SS';
        const sx = fromRight ? x(pc.ef + 1) : x(pc.es); const sy = yOf.get(pi) + (ol.isSummary[pi] ? 9 : ROW / 2);
        const ex = toLeft ? x(sc.es) : x(sc.ef + 1); const ey = yOf.get(i) + (ol.isSummary[i] ? 9 : ROW / 2);
        const ms = tasks[i].milestone ? pxDay / 2 - 8 : 0; // ajustar al rombo
        const exA = toLeft ? ex + ms : ex - ms;
        let d;
        const down = ey > sy;
        if (toLeft) {
          const h = fromRight ? sx + 8 : sx - 8;
          if (exA - 8 >= h) d = `M${sx} ${sy} H${h} V${ey} H${exA}`;
          else { const my = down ? sy + ROW / 2 : sy - ROW / 2; d = `M${sx} ${sy} H${h} V${my} H${exA - 8} V${ey} H${exA}`; }
        } else {
          const h = fromRight ? Math.max(sx + 8, exA + 8) : sx - 8;
          d = `M${sx} ${sy} H${h} V${ey} H${exA}`;
        }
        const cls = crit ? 'dep critical' : 'dep';
        deps += `<path class="${cls}" d="${d}"/>`;
        const dir = toLeft ? 1 : -1;
        deps += `<polygon class="dep-head${crit ? ' critical' : ''}" points="${exA},${ey} ${exA - 6 * dir},${ey - 3.5} ${exA - 6 * dir},${ey + 3.5}"/>`;
      }
    }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}${deps}${bars}${labels}</svg>`, width, height };
  }

  function render(rows) {
    rowsCache = rows;
    computeRange(rows);
    const { svg, width } = bodySVG(rows, App.options);
    headerEl.innerHTML = headerSVG(width);
    bodyEl.innerHTML = svg;
  }

  function updateSelection() {
    const sel = new Set(Store.selection);
    bodyEl.querySelectorAll('rect[data-sel]').forEach(r => r.setAttribute('visibility', sel.has(r.dataset.sel) ? 'visible' : 'hidden'));
  }

  function scrollToDay(d) { pane.scrollLeft = Math.max(0, x(d) - pane.clientWidth / 3); }

  /** SVG autónomo para exportación (incluye columna de nombres) */
  function exportSVG(rows) {
    computeRange(rows);
    const { project, computed } = Store; const ol = computed.outline;
    const NAMEW = 300, { svg, width, height } = bodySVG(rows, Object.assign({}, App.options));
    const head = headerSVG(width);
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    let names = `<rect width="${NAMEW}" height="${HEAD}" fill="#f3f4f6"/><text x="8" y="30" font-weight="600">${U.esc(project.name)}</text>`;
    rows.forEach((i, k) => { const t = project.tasks[i]; names += `<text x="${8 + (t.level - 1) * 14}" y="${HEAD + k * ROW + 19}" font-weight="${ol.isSummary[i] ? 600 : 400}">${U.esc(computed.outline.wbs[i] + '  ' + t.name)}</text><line x1="0" y1="${HEAD + (k + 1) * ROW - .5}" x2="${NAMEW}" y2="${HEAD + (k + 1) * ROW - .5}" stroke="#eceff3"/>`; });
    const style = `<style>text{font-family:Segoe UI,system-ui,Arial,sans-serif;font-size:11px;fill:#1f2430}.dep{fill:none;stroke:#5b6474;stroke-width:1.2}.dep.critical{stroke:#dc2626}.dep-head{fill:#5b6474}.dep-head.critical{fill:#dc2626}.today{stroke:#ef4444;stroke-width:1.5;stroke-dasharray:4 3}.link-handle,.bar-resize{display:none}.row-sel{fill:none}</style>`;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${NAMEW + width}" height="${HEAD + height}" viewBox="0 0 ${NAMEW + width} ${HEAD + height}">${style}<rect width="100%" height="100%" fill="#fff"/><g>${names}</g><line x1="${NAMEW - .5}" y1="0" x2="${NAMEW - .5}" y2="${HEAD + height}" stroke="#d9dde3"/><g transform="translate(${NAMEW},0)">${inner(head)}</g><g transform="translate(${NAMEW},${HEAD})">${inner(svg)}</g></svg>`, width: NAMEW + width, height: HEAD + height };
  }

  // ---------- interacción ----------
  function onDown(e) {
    if (e.button !== 0) return;
    const g = e.target.closest('g[data-id]'); if (!g) return;
    const id = g.dataset.id, i = +g.dataset.i;
    const { computed } = Store; const c = computed.C[i]; const t = Store.project.tasks[i];
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) { if (!Store.selection.includes(id)) Store.select(id); }
    else if (e.shiftKey) Store.selectRange(id); else Store.select(id, { toggle: true });
    if (computed.outline.isSummary[i]) return;
    const rect = bodyEl.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, px: e.clientX - rect.left, py: e.clientY - rect.top };
    if (e.target.classList.contains('link-handle')) {
      drag = { mode: 'link', id, i, start, line: null }; bodyEl.classList.add('linking');
      const svg = bodyEl.querySelector('svg'); const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', start.px); ln.setAttribute('y1', start.py); ln.setAttribute('x2', start.px); ln.setAttribute('y2', start.py); ln.setAttribute('stroke', '#2563eb'); ln.setAttribute('stroke-dasharray', '4 3'); svg.appendChild(ln); drag.line = ln;
    } else if (e.target.classList.contains('bar-resize')) {
      drag = { mode: 'resize', id, i, start, es: c.es, ef: c.ef, el: g.querySelector('rect.bar') };
    } else if (e.target.classList.contains('bar')) {
      drag = { mode: 'move', id, i, start, es: c.es, ef: c.ef, g, moved: false, dur: Scheduler.dur(t), milestone: t.milestone };
    }
    if (drag) e.preventDefault();
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.start.x;
    if (drag.mode === 'link') { const rect = bodyEl.getBoundingClientRect(); drag.line.setAttribute('x2', e.clientX - rect.left); drag.line.setAttribute('y2', e.clientY - rect.top); return; }
    const days = Math.round(dx / pxDay);
    if (drag.mode === 'move') { drag.moved = drag.moved || Math.abs(dx) > 3; drag.days = days; drag.g.querySelectorAll('.bar, .link-handle, .bar-resize').forEach(el => el.setAttribute('transform', `translate(${days * pxDay},0)`)); }
    else if (drag.mode === 'resize') { const newEf = Math.max(drag.es, drag.ef + days); drag.newEf = newEf; drag.el.setAttribute('width', Math.max(x(newEf + 1) - x(drag.es), 2)); }
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null; bodyEl.classList.remove('linking');
    const { computed } = Store; const cal = computed.cal;
    if (d.mode === 'link') {
      d.line.remove();
      const target = document.elementFromPoint(e.clientX, e.clientY); const g = target && target.closest && target.closest('g[data-id]');
      if (g && g.dataset.id !== d.id) App.addLink(d.id, g.dataset.id);
      return;
    }
    if (d.mode === 'move') {
      if (!d.moved || !d.days) { App.refresh(); return; }
      const ns = d.days > 0 ? cal.next(d.es + d.days) : cal.prev(d.es + d.days);
      Store.mutate(p => { const t = p.tasks[d.i]; t.constraint = { type: 'SNET', date: U.fromDay(ns) }; });
      App.toast(`Restricción «No comenzar antes del ${U.fmt(ns)}» aplicada`);
    } else if (d.mode === 'resize') {
      if (d.newEf == null) { App.refresh(); return; }
      const nd = Math.max(1, cal.duration(d.es, cal.prev(Math.max(d.newEf, d.es))));
      Store.mutate(p => { p.tasks[d.i].duration = nd; p.tasks[d.i].milestone = false; });
    }
  }

  return { init, render, updateSelection, setZoom, scrollToDay, exportSVG, ROW, HEAD, get zoom() { return zoom; } };
})();
