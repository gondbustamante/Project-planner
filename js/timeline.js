/* Escala de tiempo (resumen del proyecto): barras e hitos elegidos, etiquetas y eje de fechas configurables */
const Timeline = (() => {
  let el;
  const PAL = ['#3b7dd8', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c'];
  const MS_COLOR = '#111827';
  const UNITS = { auto: 'Automática', week: 'Semanas', month: 'Meses', quarter: 'Trimestres', year: 'Años' };

  function init() {
    el = document.getElementById('timeline');
    el.addEventListener('click', e => { const g = e.target.closest('[data-i]'); if (g) { Table.setActive(+g.dataset.i, 'name'); Gantt.scrollToTask(+g.dataset.i); } });
    el.addEventListener('dblclick', e => { const lb = e.target.closest('[data-label]'); const g = e.target.closest('[data-i]'); App.openTimelineDialog(lb ? 'labels' : 'items', g ? Store.project.tasks[+g.dataset.i].id : null); });
  }

  /** ¿Se muestra la tarea? La elección explícita manda; si no, la regla automática (fases de nivel 1 e hitos) */
  function isShown(t, s = Store.project.timeline) {
    const it = s.items[t.id];
    if (it && typeof it.show === 'boolean') return it.show;
    return t.milestone ? s.autoMilestones : s.autoPhases && t.level === 1;
  }
  /** Colores por defecto: las barras toman la paleta en el orden de la tabla y los hitos el negro */
  function defaultColors(s = Store.project.timeline) {
    const m = new Map(); let k = 0;
    for (const t of Store.project.tasks) { if (t.milestone) m.set(t.id, MS_COLOR); else if (isShown(t, s)) m.set(t.id, PAL[k++ % PAL.length]); else m.set(t.id, PAL[k % PAL.length]); }
    return m;
  }
  /** Texto legible (oscuro o blanco) sobre un color de fondo */
  function ink(hex) { const n = parseInt(String(hex).slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111827' : '#fff'; }
  const short = d => { const p = U.parts(d); return `${U.pad(p.d)}/${U.pad(p.m + 1)}`; };

  /** Rango de fechas del eje: automático (proyecto + etiquetas) o personalizado */
  function axisRange(s) {
    const { computed } = Store;
    if (s.range === 'custom') { const a = U.toDay(s.start), b = U.toDay(s.finish); if (a != null && b != null && b > a) return { lo: a, hi: b + 1 }; }
    let lo = computed.projStart, hi = computed.projFinish;
    for (const l of s.labels) { const d = U.toDay(l.date); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    lo -= 3; hi = Math.max(hi + 3, lo + 14);
    return { lo, hi };
  }

  function axisSVG(lo, hi, x, H, unit) {
    let s = '';
    const tick = (a, b, txt) => { const xa = x(a), xb = x(b); s += `<line x1="${xa}" y1="0" x2="${xa}" y2="${H}" stroke="#eceff3"/>`; if (xb - xa > txt.length * 6 + 6) s += `<text x="${(xa + xb) / 2}" y="12" text-anchor="middle" style="fill:#6b7280">${txt}</text>`; };
    const step = (start, next, label) => { let d = start; while (d < hi) { const n = next(d); tick(Math.max(d, lo), Math.min(n, hi), label(d)); d = n; } };
    const p0 = U.parts(lo);
    if (unit === 'week') { let d = lo; while (U.dow(d) !== 1) d--; step(d, d => d + 7, d => { const p = U.parts(d); return `${p.d} ${U.MONTHS[p.m]}`; }); }
    else if (unit === 'month') step(Date.UTC(p0.y, p0.m, 1) / U.MS, d => { const p = U.parts(d); return Date.UTC(p.y, p.m + 1, 1) / U.MS; }, d => { const p = U.parts(d); return `${U.MONTHS[p.m]} ${String(p.y).slice(2)}`; });
    else if (unit === 'quarter') step(Date.UTC(p0.y, Math.floor(p0.m / 3) * 3, 1) / U.MS, d => { const p = U.parts(d); return Date.UTC(p.y, p.m + 3, 1) / U.MS; }, d => { const p = U.parts(d); return `T${Math.floor(p.m / 3) + 1} ${String(p.y).slice(2)}`; });
    else step(Date.UTC(p0.y, 0, 1) / U.MS, d => Date.UTC(U.parts(d).y + 1, 0, 1) / U.MS, d => String(U.parts(d).y));
    return s;
  }

  /** Dibuja la escala de tiempo con el ancho dado; la usan la vista y las exportaciones */
  function build(W, forExport = false) {
    const { project, computed } = Store; const tasks = project.tasks, C = computed.C, s = project.timeline;
    const L = 10, R = 10;
    const { lo, hi } = axisRange(s);
    const x = d => L + (d - lo) / (hi - lo) * (W - L - R);
    const cx = v => U.clamp(v, L, W - R);
    const inRange = (a, b) => b >= lo && a < hi;
    const defs = defaultColors(s);
    const colorOf = t => (s.items[t.id] && s.items[t.id].color) || defs.get(t.id);
    const labelOf = t => (s.items[t.id] && s.items[t.id].label) || t.name;
    let unit = s.unit;
    if (!UNITS[unit] || unit === 'auto') { const pxd = (W - L - R) / (hi - lo); unit = pxd * 7 >= 90 ? 'week' : pxd * 30 >= 34 ? 'month' : pxd * 91 >= 34 ? 'quarter' : 'year'; }

    const shown = tasks.map((t, i) => i).filter(i => isShown(tasks[i], s));
    const bars = shown.filter(i => !tasks[i].milestone && inRange(C[i].es, C[i].ef)).sort((a, b) => C[a].es - C[b].es || a - b);
    const ms = shown.filter(i => tasks[i].milestone && inRange(C[i].es, C[i].es)).sort((a, b) => C[a].es - C[b].es);
    const labels = s.labels.map(l => ({ ...l, d: U.toDay(l.date) })).filter(l => l.d >= lo && l.d < hi).sort((a, b) => a.d - b.d);

    // carriles: etiquetas arriba, barras sin solaparse y hitos abajo (dos carriles alternos si están próximos)
    const lblLane = []; { let lastX = -1e4, lane = 0; for (const l of labels) { const px = x(l.d); lane = px - lastX < 150 ? (lane + 1) % 2 : 0; lastX = px; lblLane.push(lane); } }
    const lblLanes = labels.length ? Math.min(2, Math.max(...lblLane) + 1) : 0;
    const barTop = 20 + lblLanes * 18 + (lblLanes ? 2 : 0);
    const laneEnd = []; const laneOf = new Map();
    for (const i of bars) { const a = cx(x(C[i].es)); let k = laneEnd.findIndex(e => e < a - 2); if (k < 0) { k = laneEnd.length; laneEnd.push(0); } laneEnd[k] = Math.max(cx(x(C[i].ef + 1)), a + 3); laneOf.set(i, k); }
    const PH = 22, PG = 3, lanes = laneEnd.length;
    const msY = barTop + lanes * (PH + PG) + (lanes ? 10 : 8);
    const empty = !bars.length && !ms.length && !labels.length;
    const H = empty ? 44 : msY + (ms.length ? 2 * 16 : 0) + 4;

    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
    out += axisSVG(lo, hi, x, H, unit) + `<line x1="0" y1="16.5" x2="${W}" y2="16.5" stroke="#d4d8de"/>`;
    if (empty) out += `<text x="${W / 2}" y="34" text-anchor="middle" style="fill:#6b7280">${forExport ? 'Escala de tiempo vacía' : 'Escala de tiempo vacía · haz doble clic para elegir tareas, hitos y etiquetas'}</text>`;

    labels.forEach((l, n) => {
      const px = x(l.d), y = 20 + lblLane[n] * 18, w = Math.min(l.text.length * 6.2 + 12, 220);
      const left = px + w > W - R ? px - w : px;
      out += `<g class="tl-label" data-label="${l.id}"><line x1="${px}" y1="${y}" x2="${px}" y2="${H}" stroke="${l.color}" stroke-dasharray="3 3"/>`
        + `<rect x="${left}" y="${y}" width="${w}" height="15" rx="3" fill="${l.color}"/><text x="${left + 6}" y="${y + 11}" style="fill:${ink(l.color)}">${U.esc(l.text.length > 34 ? l.text.slice(0, 33) + '…' : l.text)}</text>`
        + `<title>${U.esc(l.text)} · ${U.fmt(l.d)}</title></g>`;
    });

    for (const i of bars) {
      const t = tasks[i], c = C[i]; const a = cx(x(c.es)), b = Math.max(cx(x(c.ef + 1)), a + 3); const y = barTop + laneOf.get(i) * (PH + PG), h = PH;
      const col = colorOf(t), fg = ink(col);
      out += `<g class="tl-bar" data-i="${i}"><rect x="${a}" y="${y}" width="${b - a}" height="${h}" rx="3" fill="${col}"><title>${U.esc(labelOf(t))}\n${U.fmt(c.es)} → ${U.fmt(c.ef)}${t.progress ? ' · ' + t.progress + '%' : ''}</title></rect>`;
      if (s.showProgress && t.progress > 0) out += `<rect x="${a}" y="${y + h - 4}" width="${(b - a) * Math.min(t.progress, 100) / 100}" height="4" fill="${fg === '#fff' ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.25)'}"/>`;
      const name = labelOf(t), dates = `${short(c.es)} – ${short(c.ef)}`;
      const maxChars = Math.floor((b - a - 8) / 6.2);
      const txt = s.showDates && maxChars >= name.length + dates.length + 3 ? `${name} · ${dates}` : name;
      if (maxChars > 3) out += `<text x="${a + 6}" y="${y + 15}" style="fill:${fg}" font-weight="600">${U.esc(txt.length > maxChars ? txt.slice(0, maxChars - 1) + '…' : txt)}</text>`;
      out += '</g>';
    }

    let lastX = -1000, lane = 0;
    for (const i of ms) {
      const t = tasks[i], c = C[i]; const px = x(c.es); lane = px - lastX < 160 ? (lane + 1) % 2 : 0; lastX = px; const y = msY + lane * 16;
      const custom = s.items[t.id] && s.items[t.id].color;
      const col = custom || (c.critical && App.options.critical ? '#d93025' : MS_COLOR);
      const txt = labelOf(t) + (s.showDates ? ' · ' + U.fmt(c.es) : '');
      out += `<g class="tl-bar" data-i="${i}"><polygon points="${px},${y - 5} ${px + 5},${y} ${px},${y + 5} ${px - 5},${y}" fill="${col}"/>${px + 8 + txt.length * 6 > W - R ? `<text x="${px - 8}" y="${y + 4}" text-anchor="end" style="fill:#374151">` : `<text x="${px + 8}" y="${y + 4}" style="fill:#374151">`}${U.esc(txt)}</text><title>${U.esc(labelOf(t))} · ${U.fmt(c.es)}</title></g>`;
    }

    const td = U.today(); if (s.showToday && td >= lo && td < hi) out += `<line x1="${x(td)}" y1="16" x2="${x(td)}" y2="${H}" stroke="#ef4444" stroke-dasharray="4 3"/><text x="${x(td) + 3}" y="${H - 4}" style="fill:#ef4444">hoy</text>`;
    out += '</svg>';
    return { svg: out, width: W, height: H };
  }
  function render() {
    if (!App.options.timeline) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const { svg, height } = build(el.clientWidth || 1000);
    el.style.height = height + 'px'; el.innerHTML = svg;
  }
  /** SVG autónomo (estilos incluidos) para exportar; con cabecera opcional de proyecto y fechas */
  function exportSVG(W = 1600, withTitle = true) {
    const { project, computed } = Store; const tl = build(W, true); const head = withTitle ? 46 : 0;
    const style = `<style>text{font-family:Segoe UI,system-ui,Arial,sans-serif;font-size:11px;fill:#1f2430}</style>`;
    const title = withTitle ? `<text x="10" y="20" style="font-size:16px;font-weight:600">${U.esc(project.name)}</text><text x="10" y="37" style="fill:#6b7280">Escala de tiempo · ${U.fmt(computed.projStart)} → ${U.fmt(computed.projFinish)} · ${computed.duration} días laborables · ${U.fmt(U.today())}</text>` : '';
    const h = head + tl.height;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">${style}<rect width="100%" height="100%" fill="#fff"/>${title}<g transform="translate(0,${head})">${tl.svg}</g></svg>`, width: W, height: h };
  }
  return { init, render, build, exportSVG, isShown, defaultColors, UNITS, PAL };
})();
