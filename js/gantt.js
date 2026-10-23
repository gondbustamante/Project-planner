/* Diagrama de Gantt en SVG: escala temporal de dos niveles, barras, dependencias, holgura, línea base, fecha límite, ruta de tareas e interacción */
const Gantt = (() => {
  const ROW = 28, HEAD = 46;
  const PRESET = { day: 30, week: 12, month: 4, quarter: 1.6 };
  let pxDay = 12;
  let headerEl, bodyEl, pane;
  let range = { start: 0, end: 1 };
  let rowsCache = [];
  let drag = null;
  let MID = 14; // centro vertical de la barra dentro de la fila (se sube cuando se muestran líneas base)

  const x = d => Math.round((d - range.start) * pxDay * 10) / 10;
  const tier = () => pxDay >= 20 ? 'day' : pxDay >= 6 ? 'week' : pxDay >= 2.2 ? 'month' : 'quarter';

  function init() {
    headerEl = document.getElementById('ganttHeader');
    bodyEl = document.getElementById('ganttBody');
    pane = document.getElementById('ganttPane');
    bodyEl.addEventListener('mousedown', onDown);
    bodyEl.addEventListener('dblclick', e => { const g = e.target.closest('[data-id]'); if (g) App.openTaskDialog(g.dataset.id); });
    bodyEl.addEventListener('contextmenu', e => { e.preventDefault(); const g = e.target.closest('g[data-id]'); if (g && !Store.selection.includes(g.dataset.id)) Table.setActive(+g.dataset.i, 'name'); App.showContextMenu(e.clientX, e.clientY, g ? g.dataset.id : null); });
    pane.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX); } }, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function setZoom(z) { if (PRESET[z]) setPxDay(PRESET[z]); }
  function setPxDay(v, anchorDay) {
    const old = pxDay; pxDay = U.clamp(v, 1, 60);
    if (old === pxDay) return;
    Store.setPref('pxDay', pxDay);
    const keep = anchorDay != null ? anchorDay : (pane ? pane.scrollLeft / old + range.start : null);
    App.refresh();
    if (keep != null) pane.scrollLeft = Math.max(0, (keep - range.start) * pxDay - (anchorDay != null ? 0 : 0));
    App.syncZoomUI();
  }
  function zoomBy(f, clientX) {
    let anchor = null;
    if (clientX != null && pane) { const rect = pane.getBoundingClientRect(); anchor = (pane.scrollLeft + clientX - rect.left) / pxDay + range.start; }
    const before = anchor;
    setPxDay(pxDay * f);
    if (before != null) { const rect = pane.getBoundingClientRect(); pane.scrollLeft = Math.max(0, (before - range.start) * pxDay - (clientX - rect.left)); }
  }
  function fit() {
    const { computed } = Store;
    const days = Math.max(14, computed.projFinish - computed.projStart + 14);
    setPxDay((pane.clientWidth - 40) / days);
    pane.scrollLeft = 0;
  }

  function computeRange(rows) {
    const { computed, project } = Store; const C = computed.C;
    let lo = computed.projStart, hi = computed.projFinish;
    const shown = shownBaselines();
    for (const i of rows) { const t = project.tasks[i]; for (const k of shown) { const b = Store.BL.of(t, k); if (!b) continue; const bs = U.toDay(b.start), bf = U.toDay(b.finish); if (bs != null) lo = Math.min(lo, bs); if (bf != null) hi = Math.max(hi, bf); } if (t.deadline) hi = Math.max(hi, U.toDay(t.deadline)); lo = Math.min(lo, C[i].es); hi = Math.max(hi, C[i].ef); }
    const td = U.today(); lo = Math.min(lo, td); hi = Math.max(hi, td);
    const pad = Math.ceil(60 / pxDay);
    lo -= pad; hi += pad * 2;
    while (U.dow(lo) !== 1) lo--;
    const minDays = Math.ceil((pane ? pane.clientWidth : 800) / pxDay);
    if (hi - lo < minDays) hi = lo + minDays;
    range = { start: lo, end: hi };
  }

  // ---------- cabecera de dos niveles ----------
  function headerSVG(width) {
    const { start, end } = range; const t = tier();
    let top = '', bottom = '';
    const line = (x1, y1, y2) => `<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="#d4d8de"/>`;
    const label = (a, b, y, txt, bold) => { if (x(b) - x(a) > txt.length * 5.5 + 6) return `<text x="${(x(a) + x(b)) / 2}" y="${y}" text-anchor="middle" ${bold ? 'font-weight="600"' : ''}>${txt}</text>`; return ''; };
    const months = cb => { let d = start; while (d < end) { const p = U.parts(d); const nm = Date.UTC(p.y, p.m + 1, 1) / U.MS; cb(d, Math.min(nm, end), p); d = nm; } };
    const years = cb => { let d = start; while (d < end) { const p = U.parts(d); const ny = Date.UTC(p.y + 1, 0, 1) / U.MS; cb(d, Math.min(ny, end), p); d = ny; } };
    if (t === 'day') {
      months((a, b, p) => { top += label(a, b, 16, `${U.MONTHS_LONG[p.m]} ${p.y}`, true) + line(x(b), 0, HEAD); });
      for (let d = start; d < end; d++) { const p = U.parts(d); const we = U.dow(d) === 0 || U.dow(d) === 6; bottom += `<text x="${x(d) + pxDay / 2}" y="37" text-anchor="middle" fill="${we ? '#9ca3af' : '#1f2430'}">${pxDay >= 28 ? U.DAYS[U.dow(d)] + ' ' : ''}${p.d}</text>` + line(x(d + 1), 24, HEAD); }
    } else if (t === 'week') {
      months((a, b, p) => { top += label(a, b, 16, `${U.MONTHS_LONG[p.m]} ${p.y}`, true) + line(x(b), 0, HEAD); });
      for (let d = start; d < end; d += 7) { const p = U.parts(d); bottom += `<text x="${x(d) + 3}" y="37">${pxDay >= 9 ? p.d + ' ' + U.MONTHS[p.m] : p.d}</text>` + line(x(d), 24, HEAD); }
    } else if (t === 'month') {
      years((a, b, p) => { top += label(a, b, 16, String(p.y), true) + line(x(b), 0, HEAD); });
      months((a, b, p) => { bottom += label(a, b, 37, pxDay >= 3.2 ? U.MONTHS_LONG[p.m] : U.MONTHS[p.m]) + line(x(b), 24, HEAD); });
    } else {
      years((a, b, p) => { top += label(a, b, 16, String(p.y), true) + line(x(b), 0, HEAD); });
      let d = start; while (d < end) { const p = U.parts(d); const q = Math.floor(p.m / 3); const nq = Date.UTC(p.y, q * 3 + 3, 1) / U.MS; bottom += label(d, Math.min(nq, end), 37, `T${q + 1}`) + line(x(Math.min(nq, end)), 24, HEAD); d = nq; }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEAD}"><rect width="${width}" height="${HEAD}" fill="#f3f4f6"/><line x1="0" y1="24" x2="${width}" y2="24" stroke="#d4d8de"/>${top}${bottom}</svg>`;
  }

  // ---------- ruta de tareas (predecesoras y sucesoras de la selección) ----------
  function taskPath() {
    const { project, computed, selection } = Store; if (!App.options.path || !selection.length) return null;
    const idx = computed.idx; const preds = new Set(), succs = new Set();
    const walkP = id => { const t = project.tasks[idx.get(id)]; if (!t) return; for (const p of t.predecessors) if (!preds.has(p.id)) { preds.add(p.id); walkP(p.id); } };
    const walkS = id => { for (const s of computed.successors[idx.get(id)] || []) if (!succs.has(s.id)) { succs.add(s.id); walkS(s.id); } };
    for (const id of selection) { walkP(id); walkS(id); }
    return { preds, succs, sel: new Set(selection) };
  }

  /** Líneas base que se dibujan: las marcadas en «Mostrar» que existen en el proyecto */
  function shownBaselines() { const saved = new Set(Store.BL.saved()); return (App.options.blShow || []).filter(k => saved.has(+k)).map(Number).sort((a, b) => a - b); }

  // ---------- cuerpo ----------
  function bodySVG(rows, opts) {
    const { project, computed } = Store; const tasks = project.tasks, C = computed.C, ol = computed.outline, cal = computed.cal;
    const width = Math.ceil((range.end - range.start) * pxDay), height = Math.max(rows.length * ROW, 1);
    const sel = new Set(Store.selection);
    const resById = new Map(project.resources.map(r => [r.id, r]));
    const yOf = new Map(rows.map((i, k) => [i, k * ROW]));
    const path = taskPath();
    let bg = '', bars = '', deps = '', labels = '', over = '';
    const t = tier();
    // Geometría de la fila: con líneas base visibles la barra sube y deja debajo una franja para ellas
    const shown = shownBaselines();
    const BY = shown.length ? 4 : 7, BH = shown.length ? 13 : 14; MID = BY + BH / 2;
    const BLY = BY + BH + 1, BLH = shown.length ? Math.max(1.5, Math.min(4, (ROW - BLY - 1 - (shown.length - 1)) / shown.length)) : 0;

    for (let k = 0; k < rows.length; k++) {
      bg += `<rect class="row-sel" data-sel="${tasks[rows[k]].id}" x="0" y="${k * ROW}" width="${width}" height="${ROW}" visibility="${sel.has(tasks[rows[k]].id) ? 'visible' : 'hidden'}"/>`;
      bg += `<line x1="0" y1="${(k + 1) * ROW - .5}" x2="${width}" y2="${(k + 1) * ROW - .5}" stroke="#eceff3"/>`;
    }
    if (pxDay >= 5) {
      for (let d = range.start; d < range.end; d++) if (!cal.isWork(d)) bg += `<rect x="${x(d)}" y="0" width="${pxDay}" height="${height}" fill="#eef0f3"/>`;
      for (const i of rows) { const tc = C[i].cal; if (!tc || tc === cal) continue; const y = yOf.get(i); const lo = Math.max(range.start, C[i].es - 10), hi = Math.min(range.end, C[i].ef + 10); for (let d = lo; d < hi; d++) if (cal.isWork(d) && !tc.isWork(d)) bg += `<rect x="${x(d)}" y="${y + 2}" width="${pxDay}" height="${ROW - 4}" fill="#fde68a" opacity=".55"><title>No laborable para el responsable</title></rect>`; }
    }
    if (t === 'day') { for (let d = range.start; d < range.end; d++) bg += `<line x1="${x(d)}" y1="0" x2="${x(d)}" y2="${height}" stroke="#f1f3f5"/>`; }
    else if (t === 'week') { for (let d = range.start; d < range.end; d += 7) bg += `<line x1="${x(d)}" y1="0" x2="${x(d)}" y2="${height}" stroke="#f1f3f5"/>`; }
    for (let d = range.start; d < range.end; d++) { const p = U.parts(d); if (p.d === 1 && (t !== 'quarter' || p.m % 3 === 0)) bg += `<line x1="${x(d)}" y1="0" x2="${x(d)}" y2="${height}" stroke="#dfe3e8"/>`; }
    const td = U.today(); if (td >= range.start && td <= range.end) bg += `<line class="today" x1="${x(td) + pxDay / 2}" y1="0" x2="${x(td) + pxDay / 2}" y2="${height}"/>`;
    const sd = project.statusDate ? U.toDay(project.statusDate) : null; if (sd != null && sd >= range.start && sd <= range.end) bg += `<line class="status-line" x1="${x(sd) + pxDay / 2}" y1="0" x2="${x(sd) + pxDay / 2}" y2="${height}"/>`;

    for (const i of rows) {
      const tk = tasks[i], c = C[i], y = yOf.get(i), sum = ol.isSummary[i];
      const crit = c.critical && opts.critical && !sum;
      const x1 = x(c.es), x2 = x(c.ef + 1), w = Math.max(x2 - x1, 2);
      let color = sum ? '#2b2f36' : crit ? '#d93025' : '#3b7dd8';
      let stroke = '';
      if (path) { if (path.preds.has(tk.id)) { color = '#d97706'; } else if (path.succs.has(tk.id)) { color = '#7c3aed'; } else if (!path.sel.has(tk.id)) color = sum ? '#9ca3af' : '#b8c4d6'; else stroke = ' stroke="#111" stroke-width="1.5"'; }
      const tip = `<title>${U.esc(tk.name)}\n${U.fmt(c.es)} → ${U.fmt(c.ef)} · ${tk.milestone ? 'hito' : tk.duration + ' días'}${sum ? '' : ' · holgura ' + c.slack + ' d'}${tk.progress ? ' · ' + tk.progress + '%' : ''}${tk.resources.length ? '\n' + tk.resources.map(id => (resById.get(id) || {}).name).filter(Boolean).join(', ') : ''}</title>`;
      let g = `<g class="task-row" data-id="${tk.id}" data-i="${i}">`;
      g += `<rect class="row-hover" x="0" y="${y}" width="${width}" height="${ROW}" fill="transparent"/>`;
      shown.forEach((k, n) => {
        const b = Store.BL.of(tk, k); if (!b) return;
        const bs = U.toDay(b.start), bf = U.toDay(b.finish); if (bs == null || bf == null) return;
        const by = y + BLY + n * (BLH + 1), col = Store.BL.COLORS[k];
        const tipB = `<title>${Store.BL.name(k)}: ${U.fmt(bs)} → ${U.fmt(bf)}</title>`;
        if (bs === bf && tk.milestone) { const cx = x(bs) + pxDay / 2, r = Math.max(BLH, 2.5); g += `<polygon points="${cx},${by - r / 2} ${cx + r},${by + BLH / 2} ${cx},${by + BLH + r / 2} ${cx - r},${by + BLH / 2}" fill="${col}">${tipB}</polygon>`; }
        else g += `<rect x="${x(bs)}" y="${by}" width="${Math.max(x(bf + 1) - x(bs), 2)}" height="${BLH}" fill="${col}">${tipB}</rect>`;
      });
      if (opts.slack && !sum && c.slack > 0 && c.lf > c.ef) {
        g += `<line x1="${x2}" y1="${y + MID}" x2="${x(c.lf + 1)}" y2="${y + MID}" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="3 2"/><line x1="${x(c.lf + 1)}" y1="${y + MID - 6}" x2="${x(c.lf + 1)}" y2="${y + MID + 6}" stroke="#6b7280" stroke-width="1.5"/>`;
      }
      if (sum) {
        const cy = y + BY + 1;
        g += `<path d="M${x1} ${cy - 3} H${x2} V${cy + 4} L${x2 - 5} ${cy + 10} L${x2 - 10} ${cy + 4} H${x1 + 10} L${x1 + 5} ${cy + 10} L${x1} ${cy + 4} Z" fill="${color}">${tip}</path>`;
        if (tk.progress > 0) g += `<rect x="${x1}" y="${cy - 1}" width="${Math.max(w * Math.min(tk.progress, 100) / 100, 0)}" height="3" fill="#9ca3af"/>`;
      } else if (tk.milestone) {
        const cx = x1 + pxDay / 2, cy = y + MID, r = 7;
        g += `<polygon class="bar" points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${crit ? '#d93025' : (path && !path.sel.has(tk.id) && !path.preds.has(tk.id) && !path.succs.has(tk.id)) ? '#9ca3af' : '#111827'}"${stroke}>${tip}</polygon>`;
        g += `<circle class="link-handle" data-end="start" cx="${cx - r - 6}" cy="${cy}" r="4"><title>Arrastra desde el comienzo</title></circle>`;
        g += `<circle class="link-handle" data-end="finish" cx="${cx + r + 6}" cy="${cy}" r="4"><title>Arrastra desde el fin</title></circle>`;
      } else {
        const by = y + BY, bh = BH;
        g += `<rect class="bar" x="${x1}" y="${by}" width="${w}" height="${bh}" rx="2" fill="${color}"${stroke}>${tip}</rect>`;
        if (tk.progress > 0) g += `<rect class="bar" x="${x1 + 1}" y="${by + 5}" width="${Math.max((w - 2) * Math.min(tk.progress, 100) / 100, 0)}" height="${bh - 10}" rx="1" fill="rgba(0,0,0,.45)"/>`;
        g += `<rect class="bar-resize" x="${x1 + w - 6}" y="${by}" width="8" height="${bh}"/>`;
        g += `<circle class="link-handle" data-end="start" cx="${x1 - 7}" cy="${by + bh / 2}" r="4"><title>Arrastra desde el comienzo</title></circle>`;
        g += `<circle class="link-handle" data-end="finish" cx="${x1 + w + 7}" cy="${by + bh / 2}" r="4"><title>Arrastra desde el fin</title></circle>`;
      }
      if (tk.deadline) { const dd = U.toDay(tk.deadline); const dx = x(dd) + pxDay / 2; over += `<path d="M${dx - 5} ${y + 4} h10 l-5 8 z" fill="${c.deadlineMissed ? '#d93025' : '#16a34a'}"><title>Fecha límite ${U.fmt(dd)}${c.deadlineMissed ? ' · superada' : ''}</title></path>`; }
      // Etiqueta junto a la barra: nombre (opcional) y responsables (opcional); los hitos siempre muestran nombre y fecha
      const parts = [];
      if (tk.milestone) parts.push(`${tk.name} · ${U.fmt(c.es)}`);
      else if (opts.names) parts.push(tk.name);
      if (!sum && opts.resNames) parts.push(...tk.resources.map(id => (resById.get(id) || {}).name).filter(Boolean));
      const lbl = parts.join(', ');
      const lx = tk.milestone ? x1 + pxDay / 2 + 16 : x2 + 14;
      const ly = y + (sum ? BY + 5 : MID) + 4;
      if (lbl) labels += `<text x="${lx}" y="${ly}" fill="#374151">${U.esc(lbl)}</text>`;
      g += '</g>';
      bars += g;
    }

    for (const i of rows) {
      const tk = tasks[i];
      for (const p of tk.predecessors) {
        const pi = computed.idx.get(p.id); if (pi == null || !yOf.has(pi)) continue;
        const pc = C[pi], sc = C[i];
        let cls = 'dep';
        if (path) { if ((path.preds.has(p.id) || path.sel.has(p.id)) && (path.preds.has(tk.id) || path.sel.has(tk.id))) cls += ' path-pred'; else if ((path.succs.has(tk.id)) && (path.succs.has(p.id) || path.sel.has(p.id))) cls += ' path-succ'; }
        else if (opts.critical && pc.critical && sc.critical) cls += ' critical';
        const fromRight = p.type === 'FS' || p.type === 'FF', toLeft = p.type === 'FS' || p.type === 'SS';
        const pm = tasks[pi].milestone ? pxDay / 2 - 7 : 0, sm = tk.milestone ? pxDay / 2 - 7 : 0;
        const sx = fromRight ? x(pc.ef + 1) - pm : x(pc.es) + pm; const sy = yOf.get(pi) + (ol.isSummary[pi] ? BY + 1 : MID);
        const ex = toLeft ? x(sc.es) + sm : x(sc.ef + 1) - sm; const ey = yOf.get(i) + (ol.isSummary[i] ? BY + 1 : MID);
        let d; const down = ey > sy;
        if (toLeft) {
          const h = fromRight ? sx + 7 : sx - 7;
          if (ex - 7 >= h) d = `M${sx} ${sy} H${h} V${ey} H${ex}`;
          else { const my = down ? sy + ROW / 2 : sy - ROW / 2; d = `M${sx} ${sy} H${h} V${my} H${ex - 7} V${ey} H${ex}`; }
        } else { const h = fromRight ? Math.max(sx + 7, ex + 7) : sx - 7; d = `M${sx} ${sy} H${h} V${ey} H${ex}`; }
        deps += `<path class="${cls}" d="${d}"/>`;
        const dir = toLeft ? 1 : -1;
        deps += `<polygon class="${cls.replace('dep', 'dep-head')}" points="${ex},${ey} ${ex - 6 * dir},${ey - 3.5} ${ex - 6 * dir},${ey + 3.5}"/>`;
      }
    }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}${deps}${bars}${over}${labels}</svg>`, width, height };
  }

  function render(rows) {
    rowsCache = rows;
    computeRange(rows);
    const { svg, width } = bodySVG(rows, App.options);
    headerEl.innerHTML = headerSVG(width);
    bodyEl.innerHTML = svg;
  }
  function updateSelection() {
    if (App.options.path) { App.refresh(); return; }
    const sel = new Set(Store.selection);
    bodyEl.querySelectorAll('rect[data-sel]').forEach(r => r.setAttribute('visibility', sel.has(r.dataset.sel) ? 'visible' : 'hidden'));
  }
  function scrollToDay(d) { pane.scrollLeft = Math.max(0, x(d) - pane.clientWidth / 3); }
  function scrollToTask(i) { const c = Store.computed.C[i]; if (!c) return; const px = x(c.es); if (px < pane.scrollLeft + 20 || px > pane.scrollLeft + pane.clientWidth - 60) pane.scrollLeft = Math.max(0, px - 80); }

  function exportSVG(rows) {
    computeRange(rows);
    const { project, computed } = Store; const ol = computed.outline;
    const NAMEW = 300, { svg, width, height } = bodySVG(rows, Object.assign({}, App.options));
    const head = headerSVG(width);
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    let names = `<rect width="${NAMEW}" height="${HEAD}" fill="#f3f4f6"/><text x="8" y="29" font-weight="600">${U.esc(project.name)}</text>`;
    rows.forEach((i, k) => { const t = project.tasks[i]; names += `<text x="${8 + (t.level - 1) * 14}" y="${HEAD + k * ROW + 18}" font-weight="${ol.isSummary[i] ? 600 : 400}">${U.esc(computed.outline.wbs[i] + '  ' + t.name)}</text><line x1="0" y1="${HEAD + (k + 1) * ROW - .5}" x2="${NAMEW}" y2="${HEAD + (k + 1) * ROW - .5}" stroke="#eceff3"/>`; });
    const style = `<style>text{font-family:Segoe UI,system-ui,Arial,sans-serif;font-size:11px;fill:#1f2430}.dep{fill:none;stroke:#4b5563;stroke-width:1.2}.dep.critical{stroke:#d93025}.dep-head{fill:#4b5563}.dep-head.critical{fill:#d93025}.dep.path-pred{stroke:#d97706}.dep.path-succ{stroke:#7c3aed}.dep-head.path-pred{fill:#d97706}.dep-head.path-succ{fill:#7c3aed}.today{stroke:#ef4444;stroke-width:1.5;stroke-dasharray:4 3}.status-line{stroke:#16a34a;stroke-dasharray:2 3}.link-handle,.bar-resize{display:none}.row-sel{fill:none}</style>`;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${NAMEW + width}" height="${HEAD + height}" viewBox="0 0 ${NAMEW + width} ${HEAD + height}">${style}<rect width="100%" height="100%" fill="#fff"/><g>${names}</g><line x1="${NAMEW - .5}" y1="0" x2="${NAMEW - .5}" y2="${HEAD + height}" stroke="#d4d8de"/><g transform="translate(${NAMEW},0)">${inner(head)}</g><g transform="translate(${NAMEW},${HEAD})">${inner(svg)}</g></svg>`, width: NAMEW + width, height: HEAD + height };
  }

  // ---------- interacción ----------
  const TYPE_NAME = { FS: 'Fin a comienzo', SS: 'Comienzo a comienzo', FF: 'Fin a fin', SF: 'Comienzo a fin' };
  const TYPE_SHORT = { FS: 'FC', SS: 'CC', FF: 'FF', SF: 'CF' };
  /** Tipo de vínculo según el extremo de origen (predecesora) y el de destino (sucesora) */
  const linkType = (from, to) => from === 'finish' ? (to === 'start' ? 'FS' : 'FF') : (to === 'start' ? 'SS' : 'SF');
  /** Tarea y extremo (comienzo/fin) bajo el puntero durante un arrastre de vínculo */
  function linkTarget(e, fromId) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const g = el && el.closest && el.closest('g[data-id]');
    if (!g || g.dataset.id === fromId || !bodyEl.contains(g)) return null;
    const i = +g.dataset.i; const c = Store.computed.C[i]; const t = Store.project.tasks[i]; if (!c) return null;
    const rect = bodyEl.getBoundingClientRect(); const px = e.clientX - rect.left;
    const row = g.querySelector('.row-hover'); const y = row ? +row.getAttribute('y') : 0;
    const sum = Store.computed.outline.isSummary[i];
    const xs = t.milestone ? x(c.es) + pxDay / 2 - 7 : x(c.es), xf = t.milestone ? x(c.es) + pxDay / 2 + 7 : x(c.ef + 1);
    let end = el.dataset && el.dataset.end;
    if (end !== 'start' && end !== 'finish') end = px < (xs + xf) / 2 ? 'start' : 'finish';
    return { id: g.dataset.id, i, end, px: end === 'start' ? xs : xf, py: y + (sum ? MID - 6 : MID) };
  }
  function onDown(e) {
    if (e.button !== 0) return;
    const g = e.target.closest('g[data-id]'); if (!g) return;
    const id = g.dataset.id, i = +g.dataset.i;
    const { computed } = Store; const c = computed.C[i]; const t = Store.project.tasks[i];
    if (e.shiftKey) Table.setActive(i, 'name', { range: true }); else if (e.ctrlKey || e.metaKey) Table.setActive(i, 'name', { toggle: true }); else if (!Store.selection.includes(id)) Table.setActive(i, 'name');
    if (computed.outline.isSummary[i]) return;
    const rect = bodyEl.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, px: e.clientX - rect.left, py: e.clientY - rect.top };
    if (e.target.classList.contains('link-handle')) {
      const fromEnd = e.target.dataset.end === 'start' ? 'start' : 'finish';
      const hx = +e.target.getAttribute('cx'), hy = +e.target.getAttribute('cy');
      drag = { mode: 'link', id, i, start, fromEnd, line: null, marker: null, target: null }; bodyEl.classList.add('linking');
      const svg = bodyEl.querySelector('svg'); const NS = 'http://www.w3.org/2000/svg';
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', hx); ln.setAttribute('y1', hy); ln.setAttribute('x2', hx); ln.setAttribute('y2', hy); ln.setAttribute('stroke', '#1f4f8f'); ln.setAttribute('stroke-width', '1.5'); ln.setAttribute('stroke-dasharray', '4 3'); ln.style.pointerEvents = 'none'; svg.appendChild(ln); drag.line = ln;
      const mk = document.createElementNS(NS, 'circle'); mk.setAttribute('r', '6'); mk.setAttribute('fill', 'none'); mk.setAttribute('stroke', '#16a34a'); mk.setAttribute('stroke-width', '2.5'); mk.setAttribute('visibility', 'hidden'); mk.style.pointerEvents = 'none'; svg.appendChild(mk); drag.marker = mk;
      App.setStatusHint(`Vincular desde el ${fromEnd === 'start' ? 'comienzo' : 'fin'} de «${t.name}»: suelta sobre el comienzo o el fin de otra tarea`);
    } else if (e.target.classList.contains('bar-resize')) {
      drag = { mode: 'resize', id, i, start, es: c.es, ef: c.ef, el: g.querySelector('rect.bar') };
    } else if (e.target.classList.contains('bar')) {
      drag = { mode: 'move', id, i, start, es: c.es, ef: c.ef, g, moved: false, milestone: t.milestone };
    }
    if (drag) e.preventDefault();
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.start.x;
    if (drag.mode === 'link') {
      const rect = bodyEl.getBoundingClientRect(); drag.line.setAttribute('x2', e.clientX - rect.left); drag.line.setAttribute('y2', e.clientY - rect.top);
      const tg = linkTarget(e, drag.id); drag.target = tg;
      if (tg) {
        drag.marker.setAttribute('cx', tg.px); drag.marker.setAttribute('cy', tg.py); drag.marker.setAttribute('visibility', 'visible');
        const type = linkType(drag.fromEnd, tg.end);
        App.setStatusHint(`${TYPE_NAME[type]} (${TYPE_SHORT[type]}): «${Store.project.tasks[drag.i].name}» → «${Store.project.tasks[tg.i].name}»`);
      } else drag.marker.setAttribute('visibility', 'hidden');
      return;
    }
    const days = Math.round(dx / pxDay);
    if (drag.mode === 'move') { drag.moved = drag.moved || Math.abs(dx) > 3; drag.days = days; drag.g.querySelectorAll('.bar, .link-handle, .bar-resize').forEach(el => el.setAttribute('transform', `translate(${days * pxDay},0)`)); App.setStatusHint(`Mover a: ${U.fmt(drag.es + days)}`); }
    else if (drag.mode === 'resize') { const newEf = Math.max(drag.es, drag.ef + days); drag.newEf = newEf; drag.el.setAttribute('width', Math.max(x(newEf + 1) - x(drag.es), 2)); App.setStatusHint(`Fin: ${U.fmt(newEf)}`); }
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null; bodyEl.classList.remove('linking'); App.setStatusHint('');
    const { computed } = Store; const cal = computed.C[d.i] && computed.C[d.i].cal || computed.cal;
    if (d.mode === 'link') {
      d.line.remove(); d.marker.remove();
      const tg = linkTarget(e, d.id);
      if (tg) {
        const type = linkType(d.fromEnd, tg.end);
        if (App.addLink(d.id, tg.id, type)) App.toast(`Vínculo ${TYPE_NAME[type].toLowerCase()} (${TYPE_SHORT[type]}) creado`);
      }
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

  return { shownBaselines, init, render, updateSelection, setZoom, setPxDay, zoomBy, fit, scrollToDay, scrollToTask, exportSVG, ROW, HEAD, tier, get pxDay() { return pxDay; }, get range() { return range; } };
})();
