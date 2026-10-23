/* Hoja de recursos: carga por responsable y sobreasignación semanal */
const ResourceView = (() => {
  const ROW = 28, HEAD = 46;
  let body, header, chart, pane, gridPane;
  function init() {
    body = document.getElementById('resBody'); header = document.getElementById('resHeader'); chart = document.getElementById('resBodyChart');
    pane = document.getElementById('resChartPane'); gridPane = document.getElementById('resPane');
    body.addEventListener('dblclick', () => App.openResources());
    let lock = false;
    gridPane.addEventListener('scroll', () => { if (lock) return; lock = true; pane.scrollTop = gridPane.scrollTop; lock = false; });
    pane.addEventListener('scroll', () => { if (lock) return; lock = true; gridPane.scrollTop = pane.scrollTop; lock = false; });
  }
  /** Carga diaria de cada responsable: nº de tareas (hoja) activas por día */
  function loads() {
    const { project, computed } = Store; const C = computed.C, ol = computed.outline;
    const out = new Map(project.resources.map(r => [r.id, { days: new Map(), tasks: 0, workDays: 0, first: null, last: null }]));
    project.tasks.forEach((t, i) => {
      if (ol.isSummary[i]) return;
      const c = C[i]; const cal = c.cal || computed.cal;
      for (const rid of t.resources) {
        const L = out.get(rid); if (!L) continue;
        L.tasks++; L.first = L.first == null ? c.es : Math.min(L.first, c.es); L.last = L.last == null ? c.ef : Math.max(L.last, c.ef);
        if (t.milestone) continue;
        for (let d = c.es; d <= c.ef; d++) if (cal.isWork(d)) { L.days.set(d, (L.days.get(d) || 0) + 1); L.workDays++; }
      }
    });
    return out;
  }
  function render() {
    const { project, computed } = Store; const L = loads();
    let html = '';
    project.resources.forEach((r, k) => {
      const l = L.get(r.id); const over = [...l.days.values()].filter(v => v > 1).length;
      html += `<tr><td class="c-id">${k + 1}</td><td><span class="res-chip" style="background:${r.color};color:#fff;border-radius:9px;padding:0 6px">${U.esc(r.name)}</span></td><td>${U.esc(r.role || '')}</td><td>${U.esc(CalendarEditor.summary(r.calendar, project.calendar.workDays))}</td><td class="num">${l.tasks}</td><td class="num">${l.workDays}</td><td class="${over ? 'over' : ''}">${over ? `${over} día${over > 1 ? 's' : ''} ⚠` : 'No'}</td><td>${l.first != null ? U.fmt(l.first) : ''}</td><td>${l.last != null ? U.fmt(l.last) : ''}</td></tr>`;
    });
    if (!project.resources.length) html = '<tr class="empty-row"><td colspan="9">No hay responsables. Doble clic aquí o «Proyecto → Responsables» para crearlos.</td></tr>';
    body.innerHTML = html;
    // gráfico semanal
    const lo0 = computed.projStart - 7, hi0 = computed.projFinish + 7;
    let lo = lo0; while (U.dow(lo) !== 1) lo--;
    const weeks = []; for (let d = lo; d <= hi0; d += 7) weeks.push(d);
    const pw = Math.max(26, Math.floor((pane.clientWidth - 20) / Math.max(weeks.length, 1)));
    const W = weeks.length * pw, H = Math.max(project.resources.length * ROW, 1);
    let hd = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}"><rect width="${W}" height="${HEAD}" fill="#f3f4f6"/><line x1="0" y1="24" x2="${W}" y2="24" stroke="#d4d8de"/>`;
    let lastM = -1;
    weeks.forEach((d, k) => { const p = U.parts(d); if (p.m !== lastM) { hd += `<text x="${k * pw + 3}" y="16" font-weight="600">${U.MONTHS[p.m]} ${p.y}</text>`; lastM = p.m; } hd += `<text x="${k * pw + pw / 2}" y="38" text-anchor="middle">${p.d}</text><line x1="${k * pw}" y1="24" x2="${k * pw}" y2="${HEAD}" stroke="#d4d8de"/>`; });
    hd += '</svg>'; header.innerHTML = hd;
    let bd = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
    project.resources.forEach((r, k) => {
      const l = L.get(r.id); const y = k * ROW;
      bd += `<line x1="0" y1="${y + ROW - .5}" x2="${W}" y2="${y + ROW - .5}" stroke="#eceff3"/>`;
      weeks.forEach((d, j) => {
        let days = 0, over = 0, sum = 0;
        for (let q = d; q < d + 7; q++) { const v = l.days.get(q) || 0; if (v) { days++; sum += v; if (v > 1) over++; } }
        if (!days) return;
        const fill = over ? '#fca5a5' : '#bfdbfe'; const txt = over ? `${sum}` : `${days}`;
        bd += `<rect x="${j * pw + 1}" y="${y + 3}" width="${pw - 2}" height="${ROW - 6}" rx="2" fill="${fill}"><title>${U.esc(r.name)} · semana del ${U.fmt(d)}\n${days} día(s) con trabajo, ${over} con solapamiento</title></rect><text x="${j * pw + pw / 2}" y="${y + ROW / 2 + 4}" text-anchor="middle" fill="#1f2430">${txt}</text>`;
      });
    });
    const td = U.today(); if (td >= lo && td <= hi0 + 7) { const tx = (td - lo) / 7 * pw; bd += `<line x1="${tx}" y1="0" x2="${tx}" y2="${H}" stroke="#ef4444" stroke-dasharray="4 3"/>`; }
    bd += '</svg>'; chart.innerHTML = bd;
  }
  return { init, render, loads };
})();
