/* Escala de tiempo (resumen del proyecto): fases de nivel 1 e hitos sobre un eje de fechas */
const Timeline = (() => {
  let el;
  function init() { el = document.getElementById('timeline'); el.addEventListener('click', e => { const g = e.target.closest('[data-i]'); if (g) { Table.setActive(+g.dataset.i, 'name'); Gantt.scrollToTask(+g.dataset.i); } }); }
  function render() {
    if (!App.options.timeline) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const { project, computed } = Store; const tasks = project.tasks, C = computed.C, ol = computed.outline;
    const W = el.clientWidth || 1000, L = 10, R = 10;
    const lo = computed.projStart - 3, hi = Math.max(computed.projFinish + 3, lo + 14);
    const x = d => L + (d - lo) / (hi - lo) * (W - L - R);
    // fases en carriles para que no se solapen
    const phases = tasks.map((t, i) => i).filter(i => tasks[i].level === 1 && !tasks[i].milestone).sort((a, b) => C[a].es - C[b].es);
    const laneEnd = []; const laneOf = new Map();
    for (const i of phases) { let k = laneEnd.findIndex(e => e < x(C[i].es) - 2); if (k < 0) { k = laneEnd.length; laneEnd.push(0); } laneEnd[k] = Math.max(x(C[i].ef + 1), x(C[i].es) + 3); laneOf.set(i, k); }
    const lanes = Math.max(laneEnd.length, 1), PH = 22, PG = 3;
    const ms = tasks.map((t, i) => i).filter(i => tasks[i].milestone).sort((a, b) => C[a].es - C[b].es);
    const msLanes = ms.length ? 2 : 0;
    const msY = 20 + lanes * (PH + PG) + 10;
    const H = msY + msLanes * 16 + 4;
    el.style.height = H + 'px';
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
    // eje de meses
    let d = lo; let axis = '';
    while (d < hi) { const p = U.parts(d); const nm = Date.UTC(p.y, p.m + 1, 1) / U.MS; const a = x(d), b = x(Math.min(nm, hi)); axis += `<line x1="${a}" y1="0" x2="${a}" y2="${H}" stroke="#eceff3"/>`; if (b - a > 34) axis += `<text x="${(a + b) / 2}" y="12" text-anchor="middle" fill="#6b7280">${U.MONTHS[p.m]} ${String(p.y).slice(2)}</text>`; d = nm; }
    s += axis + `<line x1="0" y1="16.5" x2="${W}" y2="16.5" stroke="#d4d8de"/>`;
    const PAL = ['#3b7dd8', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c'];
    phases.forEach((i, k) => {
      const c = C[i]; const a = x(c.es), b = Math.max(x(c.ef + 1), a + 3); const y = 20 + laneOf.get(i) * (PH + PG), h = PH;
      s += `<g class="tl-bar" data-i="${i}"><rect x="${a}" y="${y}" width="${b - a}" height="${h}" rx="3" fill="${PAL[k % PAL.length]}"><title>${U.esc(tasks[i].name)}\n${U.fmt(c.es)} → ${U.fmt(c.ef)}</title></rect>`;
      if (tasks[i].progress > 0) s += `<rect x="${a}" y="${y + h - 4}" width="${(b - a) * Math.min(tasks[i].progress, 100) / 100}" height="4" fill="rgba(0,0,0,.35)"/>`;
      const label = tasks[i].name; const maxChars = Math.floor((b - a - 8) / 6.2);
      if (maxChars > 3) s += `<text x="${a + 6}" y="${y + 16}" fill="#fff" font-weight="600">${U.esc(label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label)}</text>`;
      s += '</g>';
    });
    // hitos (dos carriles alternos cuando están próximos)
    let lastX = -1000, lane = 0;
    ms.forEach(i => { const c = C[i]; const cx = x(c.es); lane = cx - lastX < 160 ? (lane + 1) % 2 : 0; lastX = cx; const y = msY + lane * 16;
      s += `<g class="tl-bar" data-i="${i}"><polygon points="${cx},${y - 5} ${cx + 5},${y} ${cx},${y + 5} ${cx - 5},${y}" fill="${C[i].critical && App.options.critical ? '#d93025' : '#111827'}"/><text x="${cx + 8}" y="${y + 4}" fill="#374151">${U.esc(tasks[i].name)} · ${U.fmt(c.es)}</text><title>${U.esc(tasks[i].name)}</title></g>`; });
    const td = U.today(); if (td >= lo && td <= hi) s += `<line x1="${x(td)}" y1="16" x2="${x(td)}" y2="${H}" stroke="#ef4444" stroke-dasharray="4 3"/><text x="${x(td) + 3}" y="${H - 4}" fill="#ef4444">hoy</text>`;
    s += '</svg>';
    el.innerHTML = s;
  }
  return { init, render };
})();
