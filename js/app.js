/* Controlador principal: cinta de opciones, vistas, filtros, menú contextual, diálogos, teclado y refresco */
const App = (() => {
  const options = { critical: true, slack: false, path: false, timeline: true, names: false, resNames: false, blShow: [], blCompare: 0 };
  const filter = { text: '', resource: '', critical: false, incomplete: false, level: 0 };
  const $ = id => document.getElementById(id);
  let toastTimer = null, view = 'gantt', statusHint = '';

  // ---------- filas visibles ----------
  function visibleRows() {
    const { project, computed } = Store; const tasks = project.tasks, ol = computed.outline, C = computed.C;
    const n = tasks.length; const show = new Array(n).fill(true);
    const active = filter.text || filter.resource || filter.critical || filter.incomplete;
    if (active) {
      const q = filter.text.toLowerCase(); const match = new Array(n).fill(false);
      for (let i = 0; i < n; i++) {
        const t = tasks[i];
        let ok = !q || t.name.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q);
        if (ok && filter.resource) ok = t.resources.includes(filter.resource);
        if (ok && filter.critical) ok = C[i].critical && !ol.isSummary[i];
        if (ok && filter.incomplete) ok = (t.progress | 0) < 100 && !ol.isSummary[i];
        if (ok && !(ol.isSummary[i] && (filter.resource || filter.critical || filter.incomplete))) match[i] = true;
      }
      for (let i = 0; i < n; i++) if (match[i]) { let p = ol.parent[i]; while (p >= 0) { match[p] = true; p = ol.parent[p]; } }
      for (let i = 0; i < n; i++) show[i] = match[i];
    }
    for (let i = 0; i < n; i++) { if (filter.level && tasks[i].level > filter.level) show[i] = false; let p = ol.parent[i]; while (p >= 0) { if (tasks[p].collapsed) { show[i] = false; break; } p = ol.parent[p]; } }
    return [...Array(n).keys()].filter(i => show[i]);
  }

  // ---------- refresco ----------
  function refresh(type) {
    if (type === 'selection') { Table.updateSelection(); Gantt.updateSelection(); updateButtons(); return; }
    $('projectName').value = Store.project.name;
    if (view === 'gantt') { const rows = visibleRows(); Table.render(rows); Gantt.render(rows); Timeline.render(); }
    else if (view === 'resources') { Timeline.render(); ResourceView.render(); }
    else { $('timeline').classList.add('hidden'); Reports.render(); }
    renderStatus(); updateButtons(); renderResourceFilter();
    $('saveState').textContent = Store.saved ? 'Guardado automáticamente' : '⚠ No se pudo guardar';
  }
  function updateButtons() {
    $('btnUndo').disabled = !Store.canUndo; $('btnRedo').disabled = !Store.canRedo;
    const n = Store.selection.length, has = n > 0;
    ['btnDelete', 'btnIndent', 'btnOutdent', 'btnUp', 'btnDown', 'btnInfo', 'btnNotes', 'btnUnlink', 'btnScrollTo', 'btnPct0', 'btnPct25', 'btnPct50', 'btnPct75', 'btnPct100'].forEach(id => $(id).disabled = !has);
    $('btnLink').disabled = n < 2;
  }
  function renderStatus() {
    const { project, computed } = Store; const C = computed.C, ol = computed.outline;
    const leaves = project.tasks.filter((t, i) => !ol.isSummary[i]).length;
    const crit = C.filter((c, i) => c.critical && !ol.isSummary[i]).length;
    const w = project.tasks.reduce((s, t, i) => ol.isSummary[i] ? s : s + Math.max(Scheduler.dur(t), 1), 0) || 1;
    const done = Math.round(project.tasks.reduce((s, t, i) => ol.isSummary[i] ? s : s + (+t.progress || 0) * Math.max(Scheduler.dur(t), 1), 0) / w);
    const late = C.filter(c => c.deadlineMissed).length;
    $('statusbar').innerHTML = (statusHint ? `<span><b>${U.esc(statusHint)}</b></span>` : '<span>Listo</span>')
      + `<span>Inicio <b>${U.fmt(computed.projStart)}</b></span><span>Fin <b>${U.fmt(computed.projFinish)}</b></span><span>Duración <b>${computed.duration} d</b></span>`
      + `<span>Tareas <b>${leaves}</b></span><span>Críticas <b>${crit}</b></span><span>Avance <b>${done}%</b></span>`
      + (project.baselines[options.blCompare] ? `<span>Comparando con <b>${Store.BL.name(options.blCompare)}</b>${project.baselines[options.blCompare].date ? ' del ' + U.fmt(U.toDay(project.baselines[options.blCompare].date)) : ''}</span>` : '')
      + (late ? `<span class="warn">⚑ ${late} fecha(s) límite superada(s)</span>` : '')
      + (computed.errors ? `<span class="warn">⚠ ${computed.errors} tarea(s) con dependencias circulares</span>` : '');
  }
  function setStatusHint(s) { statusHint = s; renderStatus(); }
  function renderResourceFilter() {
    const sel = $('filterResource'); const cur = sel.value;
    sel.innerHTML = '<option value="">Todos los responsables</option>' + Store.project.resources.map(r => `<option value="${r.id}">${U.esc(r.name)}</option>`).join('');
    sel.value = Store.project.resources.some(r => r.id === cur) ? cur : ''; filter.resource = sel.value;
  }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }
  function syncZoomUI() { $('zoomSlider').value = Math.round(Gantt.pxDay); const t = Gantt.tier(); $('zoom').value = t; }
  function setView(v) {
    view = v; $('viewGantt').classList.toggle('hidden', v !== 'gantt'); $('viewResources').classList.toggle('hidden', v !== 'resources'); $('viewReport').classList.toggle('hidden', v !== 'report');
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    refresh();
  }

  // ---------- operaciones ----------
  function insertAt() { const idx = Store.selectedIndices(); return idx.length ? Store.blockEnd(idx[idx.length - 1]) : Store.project.tasks.length; }
  function addTask(opts = {}) {
    const idx = Store.selectedIndices(); const at = insertAt();
    const ref = idx.length ? Store.project.tasks[idx[idx.length - 1]] : null;
    const level = ref ? (Store.computed.outline.isSummary[idx[idx.length - 1]] && !ref.collapsed ? ref.level + 1 : ref.level) : 1;
    const t = Store.newTask(Object.assign({ level, name: opts.milestone ? 'Nuevo hito' : 'Nueva tarea' }, opts));
    Store.mutate(p => { p.tasks.splice(at, 0, t); });
    Table.setActive(at, 'name'); Table.editActive();
  }
  function addSummary() {
    const idx = Store.selectedIndices();
    if (!idx.length) { const at = Store.project.tasks.length; const s = Store.newTask({ name: 'Nueva fase', level: 1 }); const c = Store.newTask({ name: 'Nueva tarea', level: 2 }); Store.mutate(p => { p.tasks.push(s, c); }); Table.setActive(at, 'name'); Table.editActive(); return; }
    const first = idx[0], last = Store.blockEnd(idx[idx.length - 1]);
    const level = Store.project.tasks[first].level;
    const s = Store.newTask({ name: 'Nueva fase', level });
    Store.mutate(p => { for (let j = first; j < last; j++) p.tasks[j].level += 1; p.tasks.splice(first, 0, s); });
    Table.setActive(first, 'name'); Table.editActive();
  }
  function deleteSelected() {
    const idx = Store.selectedIndices(); if (!idx.length) return;
    Store.mutate(p => { const rm = new Set(); for (const i of idx) for (let j = i; j < Store.blockEnd(i); j++) rm.add(p.tasks[j].id); p.tasks = p.tasks.filter(t => !rm.has(t.id)); });
    const tasks = Store.project.tasks; const ni = Math.min(idx[0], tasks.length - 1);
    if (ni >= 0) Table.setActive(ni, Table.active.col); else Store.select([]);
  }
  function indent(delta) {
    const idx = Store.selectedIndices(); if (!idx.length) return;
    Store.mutate(p => { const done = new Set(); for (const i of idx) { if (done.has(i)) continue; if (delta > 0 && (i === 0 || p.tasks[i].level > p.tasks[i - 1].level)) continue; if (delta < 0 && p.tasks[i].level <= 1) continue; for (let j = i; j < Store.blockEnd(i); j++) { p.tasks[j].level += delta; done.add(j); } } });
  }
  function move(dir) {
    const idx = Store.selectedIndices(); if (idx.length !== 1) { toast('Selecciona una sola tarea para moverla'); return; }
    const i = idx[0], end = Store.blockEnd(i);
    Store.mutate(p => { const block = p.tasks.splice(i, end - i); let at; if (dir < 0) at = Math.max(0, i - 1); else { if (i >= p.tasks.length) at = p.tasks.length; else { let j = i + 1; while (j < p.tasks.length && p.tasks[j].level > p.tasks[i].level) j++; at = j; } } p.tasks.splice(at, 0, ...block); });
    Table.setActive(Store.indexOf(Store.selection[0]), Table.active.col);
  }
  function addLink(predId, succId, type = 'FS', lag = 0) {
    const a = Store.indexOf(predId), b = Store.indexOf(succId); if (a < 0 || b < 0 || a === b) return false;
    if (Store.isAncestor(a, b) || Store.isAncestor(b, a)) { toast('No se puede vincular una tarea con su propio resumen'); return false; }
    if (Store.project.tasks[b].predecessors.some(p => p.id === predId)) return false;
    if (Store.project.tasks[a].predecessors.some(p => p.id === succId)) { toast('Ese vínculo crearía una dependencia circular'); return false; }
    Store.mutate(p => { p.tasks[b].predecessors.push({ id: predId, type, lag }); });
    if (Store.computed.C[b].error) { Store.undo(); toast('Ese vínculo crearía una dependencia circular'); return false; }
    return true;
  }
  function linkSelected() { const idx = Store.selectedIndices(); if (idx.length < 2) return; let n = 0; for (let k = 1; k < idx.length; k++) if (addLink(Store.project.tasks[idx[k - 1]].id, Store.project.tasks[idx[k]].id)) n++; if (n) toast(`${n} vínculo(s) creado(s)`); }
  function unlinkSelected() {
    const idx = Store.selectedIndices(); if (!idx.length) return; const ids = new Set(idx.map(i => Store.project.tasks[i].id));
    Store.mutate(p => { if (idx.length === 1) { p.tasks[idx[0]].predecessors = []; for (const t of p.tasks) t.predecessors = t.predecessors.filter(x => !ids.has(x.id)); } else for (const i of idx) p.tasks[i].predecessors = p.tasks[i].predecessors.filter(x => !ids.has(x.id)); });
  }
  function setProgress(v) { const idx = Store.selectedIndices(); if (!idx.length) return; Store.mutate(p => { for (const i of idx) if (!Store.computed.outline.isSummary[i]) p.tasks[i].progress = v; else for (let j = i + 1; j < Store.blockEnd(i); j++) p.tasks[j].progress = v; }); }
  // ---------- líneas base ----------
  function setBaselineView(show, compare) {
    options.blShow = [...new Set(show.map(Number))].sort((a, b) => a - b); Store.setPref('blShow', options.blShow);
    if (compare != null) { options.blCompare = +compare; Store.setPref('blCompare', options.blCompare); }
    Table.renderHead(); refresh();
  }
  /** Guarda la planificación actual en la línea base k (todo el proyecto o solo las tareas seleccionadas) */
  function saveBaseline(k = 0, onlySelected = false) {
    const idx = onlySelected ? Store.selectedIndices() : null;
    if (onlySelected && !idx.length) { toast('No hay tareas seleccionadas'); return false; }
    const exists = Store.project.baselines[k];
    if (exists && !onlySelected && !confirm(`«${Store.BL.name(k)}» ya está guardada. ¿Quieres sobrescribirla?`)) return false;
    Store.mutate(p => {
      const C = Store.computed.C; const set = idx ? new Set(idx) : null;
      p.tasks.forEach((t, i) => { if (set && !set.has(i)) return; t.baselines = t.baselines || {}; t.baselines[k] = { start: U.fromDay(C[i].es), finish: U.fromDay(C[i].ef) }; });
      p.baselines[k] = { date: U.fromDay(U.today()) };
    });
    if (!options.blShow.includes(+k)) setBaselineView([...options.blShow, +k]);
    toast(`${Store.BL.name(k)} guardada${onlySelected ? ` para ${idx.length} tarea(s)` : ''}`);
    return true;
  }
  function clearBaseline(k) {
    if (!confirm(`¿Borrar «${Store.BL.name(k)}»?`)) return false;
    Store.mutate(p => { p.tasks.forEach(t => { if (t.baselines) delete t.baselines[k]; }); delete p.baselines[k]; });
    const rest = Store.BL.saved();
    setBaselineView(options.blShow.filter(x => x !== +k), options.blCompare === +k ? (rest[0] ?? 0) : null);
    toast(`${Store.BL.name(k)} borrada`);
    return true;
  }
  function openBaselines() {
    const dlg = $('dlgBaselines'); const tb = $('blTable').querySelector('tbody');
    $('blScope').value = Store.selection.length > 1 ? $('blScope').value : 'all';
    const draw = () => {
      const p = Store.project; let html = '';
      for (let k = 0; k <= Store.BL.MAX; k++) {
        const b = p.baselines[k]; const n = b ? p.tasks.filter(t => t.baselines && t.baselines[k]).length : 0;
        html += `<tr data-k="${k}"><td><input type="checkbox" class="bl-show" ${options.blShow.includes(k) ? 'checked' : ''} ${b ? '' : 'disabled'}></td>`
          + `<td><input type="radio" name="blCompare" class="bl-cmp" ${options.blCompare === k ? 'checked' : ''}></td>`
          + `<td><span style="display:inline-block;width:18px;height:6px;background:${Store.BL.COLORS[k]};vertical-align:middle;margin-right:6px;border-radius:1px"></span>${b ? '<b>' : ''}${Store.BL.name(k)}${b ? '</b>' : ''}</td>`
          + `<td>${b ? (b.date ? U.fmt(U.toDay(b.date)) : 'sí') : '<span class="hint">sin guardar</span>'}</td><td>${b ? n : ''}</td>`
          + `<td style="white-space:nowrap"><button type="button" class="secondary bl-save">${b ? 'Actualizar' : 'Establecer'}</button> ${b ? '<button type="button" class="link bl-del">Borrar</button>' : ''}</td></tr>`;
      }
      tb.innerHTML = html;
      tb.querySelectorAll('tr').forEach(tr => {
        const k = +tr.dataset.k;
        tr.querySelector('.bl-show').onchange = e => setBaselineView(e.target.checked ? [...options.blShow, k] : options.blShow.filter(x => x !== k));
        tr.querySelector('.bl-cmp').onchange = () => setBaselineView(options.blShow, k);
        tr.querySelector('.bl-save').onclick = () => { if (saveBaseline(k, $('blScope').value === 'sel')) draw(); };
        const del = tr.querySelector('.bl-del'); if (del) del.onclick = () => { if (clearBaseline(k)) draw(); };
      });
    };
    draw();
    dlg.querySelector('form').onsubmit = ev => { ev.preventDefault(); dlg.close(); };
    dlg.showModal();
  }
  function setCollapsedAll(v) { Store.mutate(p => { const ol = Store.computed.outline; p.tasks.forEach((t, i) => { if (ol.isSummary[i]) t.collapsed = v; }); }); }
  function scrollToSelected() { const idx = Store.selectedIndices(); if (!idx.length) return; Gantt.scrollToTask(idx[0]); Table.scrollToRow(idx[0]); }

  // ---------- menú contextual ----------
  function showContextMenu(x, y, id) {
    const m = $('ctxMenu'); const has = !!id; const i = has ? Store.indexOf(id) : -1; const sum = has && Store.computed.outline.isSummary[i];
    const items = [
      ['ℹ', 'Información de la tarea…', () => openTaskDialog(id), has, 'Mayús+F2'],
      ['📝', 'Notas…', () => openTaskDialog(id, 'notes'), has],
      null,
      ['＋', 'Insertar tarea', () => addTask(), true, 'Insert'],
      ['◆', 'Insertar hito', () => addTask({ milestone: true, duration: 0 }), true],
      ['▣', 'Insertar resumen sobre la selección', addSummary, true],
      ['🗑', 'Eliminar', deleteSelected, has, 'Supr'],
      null,
      ['⇥', 'Aplicar sangría', () => indent(1), has, 'Alt+Mayús+→'],
      ['⇤', 'Anular sangría', () => indent(-1), has, 'Alt+Mayús+←'],
      [sum && Store.project.tasks[i].collapsed ? '▶' : '▼', sum && Store.project.tasks[i].collapsed ? 'Expandir' : 'Contraer', () => Store.mutate(p => { p.tasks[i].collapsed = !p.tasks[i].collapsed; }), sum],
      null,
      ['🔗', 'Vincular tareas seleccionadas', linkSelected, Store.selection.length > 1, 'Ctrl+F2'],
      ['⛓', 'Desvincular', unlinkSelected, has, 'Ctrl+Mayús+F2'],
      ['✔', 'Marcar 100 % completada', () => setProgress(100), has],
      null,
      ['⌖', 'Desplazarse a la tarea', scrollToSelected, has, 'Ctrl+Mayús+F5'],
    ];
    m.innerHTML = items.map(it => it ? `<button ${it[3] ? '' : 'disabled'}><span>${it[0]}</span>${it[1]}${it[4] ? `<span class="k">${it[4]}</span>` : ''}</button>` : '<hr>').join('');
    let k = 0; m.querySelectorAll('button').forEach(b => { const it = items.filter(Boolean)[k++]; b.onclick = () => { hideContextMenu(); it[2](); }; });
    m.classList.add('open');
    const r = m.getBoundingClientRect(); m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  }
  function hideContextMenu() { $('ctxMenu').classList.remove('open'); }

  // ---------- pestañas genéricas ----------
  function wireTabs(tabsEl, root) {
    tabsEl.querySelectorAll('button').forEach(b => b.onclick = () => showTab(tabsEl, root, b.dataset.tab));
  }
  function showTab(tabsEl, root, name) {
    tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    root.querySelectorAll('.tabpanel').forEach(p => p.classList.toggle('on', p.dataset.tab === name));
  }

  // ---------- diálogo de tarea ----------
  function openTaskDialog(id, tab = 'general') {
    const i = Store.indexOf(id); if (i < 0) return;
    const { project, computed } = Store; const t = project.tasks[i]; const c = computed.C[i]; const sum = computed.outline.isSummary[i];
    const dlg = $('dlgTask'); showTab($('tTabs'), dlg, tab);
    $('tTitle').textContent = `Información de la tarea · ${i + 1}`;
    $('tName').value = t.name; $('tDuration').value = t.milestone ? 0 : t.duration; $('tDuration').disabled = sum;
    $('tMilestone').checked = t.milestone; $('tMilestone').disabled = sum;
    $('tStart').value = U.fromDay(c.es); $('tFinish').value = U.fromDay(c.ef); $('tStart').disabled = sum; $('tFinish').disabled = sum;
    $('tPriority').value = String(t.priority || 500);
    $('tConstraint').value = (t.constraint || {}).type || 'ASAP'; $('tConstraint').disabled = sum;
    $('tConstraintDate').value = (t.constraint || {}).date || ''; $('tConstraintDate').disabled = sum;
    $('tDeadline').value = t.deadline || '';
    $('tProgress').value = t.progress || 0; $('tProgress').disabled = sum;
    $('tNotes').value = t.notes || '';
    $('tIgnoreCal').checked = !!t.ignoreResourceCalendars; $('tIgnoreCal').disabled = sum;
    const withCal = t.resources.map(rid => project.resources.find(r => r.id === rid)).filter(r => r && r.calendar).map(r => r.name);
    $('tComputed').innerHTML = `<span>Comienzo temprano <b>${U.fmt(c.es)}</b></span><span>Fin temprano <b>${U.fmt(c.ef)}</b></span><span>${c.critical ? '<b style="color:#d93025">● Tarea crítica</b>' : ''}</span>`
      + `<span>Comienzo límite <b>${U.fmt(c.ls)}</b></span><span>Fin límite <b>${U.fmt(c.lf)}</b></span><span>Holgura total <b>${c.slack} d</b> · libre <b>${c.freeSlack} d</b></span>`
      + (withCal.length && !t.ignoreResourceCalendars ? `<span style="grid-column:1/-1">Calendario personal de: ${U.esc(withCal.join(', '))}</span>` : '')
      + Store.BL.saved().map(k => { const b = Store.BL.of(t, k); return b ? `<span style="grid-column:1/-1"><span style="display:inline-block;width:12px;height:5px;background:${Store.BL.COLORS[k]};vertical-align:middle;margin-right:4px"></span>${Store.BL.name(k)}: ${U.fmt(U.toDay(b.start))} → ${U.fmt(U.toDay(b.finish))}</span>` : ''; }).join('');
    const tb = $('tPredTable').querySelector('tbody');
    const candidates = project.tasks.map((x, k) => ({ x, k })).filter(({ x, k }) => k !== i && !Store.isAncestor(k, i) && !Store.isAncestor(i, k));
    const predRow = (p = { id: candidates[0] && candidates[0].x.id, type: 'FS', lag: 0 }) => {
      const tr = document.createElement('tr');
      const k = project.tasks.findIndex(x => x.id === p.id);
      tr.innerHTML = `<td class="p-k">${k >= 0 ? k + 1 : ''}</td><td><select class="p-id">${candidates.map(({ x, k }) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${k + 1} · ${U.esc(x.name)}</option>`).join('')}</select></td>`
        + `<td><select class="p-type"><option value="FS">Fin a comienzo (FC)</option><option value="SS">Comienzo a comienzo (CC)</option><option value="FF">Fin a fin (FF)</option><option value="SF">Comienzo a fin (CF)</option></select></td>`
        + `<td><input class="p-lag" type="number" step="1" value="${p.lag | 0}"> </td><td><button type="button" class="link p-del" title="Quitar">✕</button></td>`;
      tr.querySelector('.p-type').value = p.type; tr.querySelector('.p-del').onclick = () => tr.remove();
      tr.querySelector('.p-id').onchange = ev => { tr.querySelector('.p-k').textContent = project.tasks.findIndex(x => x.id === ev.target.value) + 1; };
      tb.appendChild(tr);
    };
    tb.innerHTML = ''; t.predecessors.forEach(p => predRow(p));
    $('tAddPred').onclick = () => { if (candidates.length) predRow(); else toast('No hay otras tareas que puedan ser predecesoras'); };
    $('tAddPred').disabled = !candidates.length;
    const succ = computed.successors[i]; $('tSuccs').textContent = succ.length ? 'Sucesoras: ' + succ.map(s => { const k = Store.indexOf(s.id); return `${k + 1} · ${project.tasks[k].name}`; }).join('; ') : 'Sin sucesoras.';
    const chips = $('tResources');
    chips.innerHTML = project.resources.map(r => `<label class="${t.resources.includes(r.id) ? 'on' : ''}"><input type="checkbox" value="${r.id}" ${t.resources.includes(r.id) ? 'checked' : ''}><span class="res-chip" style="background:${r.color};color:#fff;border-radius:8px;padding:0 6px">${U.esc(r.name)}</span>${r.role ? `<span class="hint">${U.esc(r.role)}</span>` : ''}</label>`).join('') || '<span class="hint">No hay responsables definidos. Créalos en «Proyecto → Responsables».</span>';
    chips.querySelectorAll('input').forEach(ch => ch.onchange = () => ch.parentElement.classList.toggle('on', ch.checked));
    $('tIgnoreCal').parentElement.style.display = withCal.length ? '' : 'none';
    dlg.querySelector('form').onsubmit = ev => {
      ev.preventDefault();
      const preds = [...tb.querySelectorAll('tr')].map(tr => ({ id: tr.querySelector('.p-id').value, type: tr.querySelector('.p-type').value, lag: parseInt(tr.querySelector('.p-lag').value, 10) || 0 }));
      const seen = new Set(); const uniq = preds.filter(p => !seen.has(p.id) && seen.add(p.id));
      const cal = c.cal || computed.cal;
      Store.mutate(p => {
        const x = p.tasks[i];
        x.name = $('tName').value.trim() || x.name; x.notes = $('tNotes').value; x.priority = +$('tPriority').value || 500;
        x.deadline = $('tDeadline').value || null;
        x.resources = [...chips.querySelectorAll('input:checked')].map(ch => ch.value);
        if (!sum) {
          x.milestone = $('tMilestone').checked; const d = parseInt($('tDuration').value, 10); x.duration = x.milestone ? 0 : (isNaN(d) ? x.duration : Math.max(1, d));
          x.progress = U.clamp(parseInt($('tProgress').value, 10) || 0, 0, 100);
          let ct = $('tConstraint').value, cd = $('tConstraintDate').value;
          const ns = U.toDay($('tStart').value), nf = U.toDay($('tFinish').value);
          if (ns != null && ns !== c.es) { ct = ct === 'MSO' ? 'MSO' : 'SNET'; cd = U.fromDay(cal.next(ns)); }
          if (nf != null && nf !== c.ef && !x.milestone && !(ns != null && ns !== c.es)) { const nd = cal.duration(c.es, cal.prev(nf)); if (nd >= 1) x.duration = nd; }
          x.constraint = ct === 'ASAP' || !cd ? { type: 'ASAP', date: null } : { type: ct, date: cd };
          x.ignoreResourceCalendars = $('tIgnoreCal').checked;
        }
        x.predecessors = uniq;
      });
      if (Store.computed.C[i].error) toast('Atención: la tarea tiene una dependencia circular');
      dlg.close();
    };
    $('tCancel').onclick = () => dlg.close();
    dlg.showModal(); if (tab === 'general') $('tName').focus();
  }

  // ---------- responsables ----------
  function openResources() {
    const dlg = $('dlgResources'); const tb = $('rTable').querySelector('tbody');
    const cals = new Map(); const pwd = Store.project.calendar.workDays;
    const row = r => {
      const tr = document.createElement('tr'); tr.dataset.id = r.id; cals.set(r.id, r.calendar ? JSON.parse(JSON.stringify(r.calendar)) : null);
      tr.innerHTML = `<td><input class="r-name" value="${U.esc(r.name)}"></td><td><input class="r-role" value="${U.esc(r.role || '')}" placeholder="Rol / equipo"></td><td><input class="r-color" type="color" value="${r.color}"></td><td><button type="button" class="link r-cal">📅 Editar</button><span class="res-cal"></span></td><td><button type="button" class="link r-del">✕</button></td>`;
      const sum = () => { tr.querySelector('.res-cal').textContent = CalendarEditor.summary(cals.get(r.id), pwd); };
      sum(); tr.querySelector('.r-del').onclick = () => tr.remove();
      tr.querySelector('.r-cal').onclick = () => openResourceCalendar(tr.querySelector('.r-name').value || r.name, cals.get(r.id), c => { cals.set(r.id, c); sum(); });
      tb.appendChild(tr);
    };
    tb.innerHTML = ''; Store.project.resources.forEach(row);
    $('rAdd').onclick = () => { const r = Store.newResource({ name: '' }); r.color = U.PALETTE[tb.children.length % U.PALETTE.length]; row(r); tb.lastElementChild.querySelector('.r-name').focus(); };
    dlg.querySelector('form').onsubmit = ev => {
      ev.preventDefault();
      const list = [...tb.querySelectorAll('tr')].map(tr => ({ id: tr.dataset.id, name: tr.querySelector('.r-name').value.trim(), role: tr.querySelector('.r-role').value.trim(), color: tr.querySelector('.r-color').value, calendar: cals.get(tr.dataset.id) || null })).filter(r => r.name);
      const ids = new Set(list.map(r => r.id));
      Store.mutate(p => { p.resources = list; for (const t of p.tasks) t.resources = t.resources.filter(id => ids.has(id)); });
      dlg.close();
    };
    $('rCancel').onclick = () => dlg.close();
    dlg.showModal();
  }
  function openResourceCalendar(name, cal, onSave) {
    const dlg = $('dlgCalendar'); const box = $('cCalendar');
    $('cTitle').textContent = `Calendario personal · ${name}`;
    $('cCustom').checked = !!cal;
    CalendarEditor.render(box, cal || { workDays: null, exceptions: [] }, { projectWorkDays: Store.project.calendar.workDays, allowInherit: true });
    box.classList.toggle('disabled', !cal);
    $('cCustom').onchange = () => box.classList.toggle('disabled', !$('cCustom').checked);
    dlg.querySelector('form').onsubmit = ev => { ev.preventDefault(); if (!$('cCustom').checked) { onSave(null); dlg.close(); return; } const c = CalendarEditor.read(box); if (!c) { toast('Marca al menos un día laborable o usa los del proyecto'); return; } onSave(c); dlg.close(); };
    $('cCancel').onclick = () => dlg.close();
    dlg.showModal();
  }

  // ---------- proyecto ----------
  function openSettings(tab = 'general') {
    const dlg = $('dlgSettings'); const p = Store.project; const c = Store.computed; showTab($('pTabs'), dlg, tab);
    $('pName').value = p.name; $('pStart').value = p.start; $('pStatusDate').value = p.statusDate || ''; $('pNotes').value = p.notes || '';
    $('pComputed').innerHTML = `<span>Fin previsto <b>${U.fmt(c.projFinish)}</b></span><span>Duración <b>${c.duration} días laborables</b></span><span>Tareas <b>${p.tasks.length}</b></span>`;
    CalendarEditor.render($('pCalendar'), p.calendar, { allowInherit: false });
    dlg.querySelector('form').onsubmit = ev => {
      ev.preventDefault();
      const cal = CalendarEditor.read($('pCalendar')); if (!cal) { toast('Debe haber al menos un día laborable'); showTab($('pTabs'), dlg, 'calendar'); return; }
      Store.mutate(x => { x.name = $('pName').value.trim() || x.name; if (U.toDay($('pStart').value) != null) x.start = $('pStart').value; x.statusDate = $('pStatusDate').value || null; x.notes = $('pNotes').value; x.calendar = cal; });
      dlg.close();
    };
    $('pCancel').onclick = () => dlg.close();
    dlg.showModal();
  }
  function openStats() {
    const { project, computed } = Store; const C = computed.C, ol = computed.outline, cal = computed.cal;
    const leaves = project.tasks.map((t, i) => i).filter(i => !ol.isSummary[i]);
    const w = leaves.reduce((s, i) => s + Math.max(Scheduler.dur(project.tasks[i]), 1), 0) || 1;
    const done = Math.round(leaves.reduce((s, i) => s + (+project.tasks[i].progress || 0) * Math.max(Scheduler.dur(project.tasks[i]), 1), 0) / w);
    let bl = null;
    const blk = options.blCompare; const withBl = project.tasks.map(t => Store.BL.of(t, blk)).filter(Boolean);
    if (withBl.length) { const bs = Math.min(...withBl.map(b => U.toDay(b.start))); const bf = Math.max(...withBl.map(b => U.toDay(b.finish))); bl = { bs, bf, dur: cal.duration(bs, bf) }; }
    const vd = (a, b) => { const v = b >= a ? cal.count(a, b) : -cal.count(b, a); return (v > 0 ? '+' : '') + v + ' d'; };
    const row = (h, a, b, c) => `<div class="h">${h}</div><div>${a}</div><div>${b ?? ''}</div><div>${c ?? ''}</div>`;
    $('statsBody').innerHTML = `<div class="stats">${row('', '<b>Actual</b>', `<b>${Store.BL.name(blk)}</b>`, '<b>Variación</b>')}`
      + row('Comienzo', U.fmt(computed.projStart), bl ? U.fmt(bl.bs) : '—', bl ? vd(bl.bs, computed.projStart) : '')
      + row('Fin', U.fmt(computed.projFinish), bl ? U.fmt(bl.bf) : '—', bl ? vd(bl.bf, computed.projFinish) : '')
      + row('Duración', computed.duration + ' d', bl ? bl.dur + ' d' : '—', bl ? (computed.duration - bl.dur) + ' d' : '')
      + `</div><hr><div class="stats" style="grid-template-columns:auto 1fr">`
      + `<div class="h">Tareas</div><div>${leaves.length} (${project.tasks.length - leaves.length} resúmenes, ${project.tasks.filter(t => t.milestone).length} hitos)</div>`
      + `<div class="h">Completadas</div><div>${leaves.filter(i => (project.tasks[i].progress | 0) >= 100).length} · avance ponderado ${done}%</div>`
      + `<div class="h">Críticas</div><div>${leaves.filter(i => C[i].critical).length}</div>`
      + `<div class="h">Responsables</div><div>${project.resources.length}</div>`
      + `<div class="h">Fechas límite superadas</div><div>${C.filter(c => c.deadlineMissed).length}</div></div>`;
    $('dlgStats').showModal();
  }
  function openColumns() {
    const list = $('colList');
    list.innerHTML = Table.COLS.filter(c => !c.fixed).map(c => `<label><input type="checkbox" value="${c.key}" ${Table.visible.includes(c.key) ? 'checked' : ''}> ${c.label}</label>`).join('');
    const dlg = $('dlgColumns');
    dlg.querySelector('form').onsubmit = ev => { ev.preventDefault(); Table.setVisible([...list.querySelectorAll('input:checked')].map(i => i.value)); dlg.close(); };
    $('colReset').onclick = () => { Table.resetCols(); dlg.close(); };
    dlg.showModal();
  }

  // ---------- archivo / proyectos ----------
  function renderProjects() {
    const tb = $('projTable').querySelector('tbody'); const cur = Store.project.id;
    tb.innerHTML = Store.listProjects().map(p => `<tr ${p.id === cur ? 'style="font-weight:600;background:#e3f1e8"' : ''}><td>${U.esc(p.name)}</td><td>${U.fmt(U.toDay(p.start))}</td><td>${U.fmt(U.toDay(p.finish))}</td><td>${p.tasks}</td><td>${p.modified ? new Date(p.modified).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : ''}</td><td style="white-space:nowrap">${p.id === cur ? '<span class="hint">abierto</span>' : `<button type="button" class="link" data-open="${p.id}">Abrir</button>`} <button type="button" class="link" data-del="${p.id}" title="Eliminar">✕</button></td></tr>`).join('');
    tb.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { Store.openProject(b.dataset.open); showRibbonTab('task'); toast('Proyecto abierto'); });
    tb.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const p = Store.listProjects().find(x => x.id === b.dataset.del); if (!confirm(`¿Eliminar definitivamente «${p.name}»?`)) return; const isCur = b.dataset.del === Store.project.id; Store.deleteProject(b.dataset.del); if (isCur) { const rest = Store.listProjects(); if (rest.length) Store.openProject(rest[0].id); else Store.createProject(); } renderProjects(); });
  }
  function showRibbonTab(name) {
    document.querySelectorAll('#ribbonTabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.toggle('on', p.dataset.panel === name));
    if (name === 'file') renderProjects();
    Store.setPref('tab', name);
  }

  // ---------- teclado ----------
  function onKey(e) {
    if (Table.isEditing || e.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
    if ($('ctxMenu').classList.contains('open') && e.key === 'Escape') { hideContextMenu(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); Store.redo(); return; }
    if (ctrl && (e.key === '+' || e.key === '=')) { e.preventDefault(); Gantt.zoomBy(1.25); return; }
    if (ctrl && e.key === '-') { e.preventDefault(); Gantt.zoomBy(0.8); return; }
    if (view !== 'gantt') return;
    const tasks = Store.project.tasks; const idx = Store.selectedIndices();
    switch (e.key) {
      case 'Insert': e.preventDefault(); addTask(); break;
      case 'Delete': e.preventDefault(); deleteSelected(); break;
      case 'F2':
        e.preventDefault();
        if (e.shiftKey && !ctrl) { if (idx.length) openTaskDialog(tasks[idx[0]].id); }
        else if (ctrl && e.shiftKey) unlinkSelected(); else if (ctrl) linkSelected(); else Table.editActive();
        break;
      case 'F5': if (ctrl && e.shiftKey) { e.preventDefault(); scrollToSelected(); } break;
      case 'Enter': e.preventDefault(); if (idx.length) Table.editActive(); break;
      case 'Tab': e.preventDefault(); Table.moveActive(0, e.shiftKey ? -1 : 1); break;
      case 'ArrowDown': e.preventDefault(); if (e.shiftKey) extendSel(1); else Table.moveActive(1, 0); break;
      case 'ArrowUp': e.preventDefault(); if (e.shiftKey) extendSel(-1); else Table.moveActive(-1, 0); break;
      case 'ArrowLeft': case 'ArrowRight': {
        const right = e.key === 'ArrowRight'; e.preventDefault();
        if (e.altKey && e.shiftKey) indent(right ? 1 : -1);
        else if (e.altKey) { if (idx.length === 1 && Store.computed.outline.isSummary[idx[0]]) { const v = !right; if (tasks[idx[0]].collapsed !== v) Store.mutate(p => { p.tasks[idx[0]].collapsed = v; }); } }
        else Table.moveActive(0, right ? 1 : -1);
        break;
      }
      case 'Home': e.preventDefault(); Table.moveActive(-1e9, 0); break;
      case 'End': e.preventDefault(); Table.moveActive(1e9, 0); break;
      case 'Escape': Store.select([]); break;
      default:
        if (e.key.length === 1 && !ctrl && !e.altKey && idx.length) { e.preventDefault(); Table.editActive(e.key); }
    }
  }
  function extendSel(d) {
    const rows = visibleRows(); const a = Table.active.i; const k = rows.indexOf(a); const nk = U.clamp(k + d, 0, rows.length - 1);
    Table.setActive(rows[nk], Table.active.col, { range: true });
  }

  // ---------- arranque ----------
  function init() {
    Store.load();
    Table.init(); Gantt.init(); Timeline.init(); ResourceView.init(); Reports.init();
    document.querySelectorAll('[data-report]').forEach(b => b.onclick = () => Reports.show(b.dataset.report));
    Store.subscribe(refresh);
    options.blShow = (Store.getPref('blShow', null) || (Store.getPref('opt.baseline', false) ? [0] : [])).map(Number);
    options.blCompare = +Store.getPref('blCompare', 0) || 0;
    ['critical', 'slack', 'path', 'timeline', 'names', 'resNames'].forEach(k => { const el = $('chk' + k[0].toUpperCase() + k.slice(1)); el.checked = Store.getPref('opt.' + k, options[k]); options[k] = el.checked; el.onchange = () => { options[k] = el.checked; Store.setPref('opt.' + k, el.checked); refresh(); }; });
    Gantt.setPxDay(Store.getPref('pxDay', 12));

    document.querySelectorAll('#ribbonTabs button[data-tab]').forEach(b => b.onclick = () => showRibbonTab(b.dataset.tab));
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
    $('projectName').addEventListener('change', e => Store.mutate(p => { p.name = e.target.value.trim() || p.name; }));
    $('btnUndo').onclick = () => Store.undo(); $('btnRedo').onclick = () => Store.redo();
    $('btnAddTask').onclick = () => addTask(); $('btnAddMilestone').onclick = () => addTask({ milestone: true, duration: 0 }); $('btnAddSummary').onclick = addSummary;
    $('btnDelete').onclick = deleteSelected;
    $('btnInfo').onclick = () => { const idx = Store.selectedIndices(); if (idx.length) openTaskDialog(Store.project.tasks[idx[0]].id); };
    $('btnNotes').onclick = () => { const idx = Store.selectedIndices(); if (idx.length) openTaskDialog(Store.project.tasks[idx[0]].id, 'notes'); };
    $('btnScrollTo').onclick = scrollToSelected;
    $('btnIndent').onclick = () => indent(1); $('btnOutdent').onclick = () => indent(-1);
    $('btnUp').onclick = () => move(-1); $('btnDown').onclick = () => move(1);
    $('btnLink').onclick = linkSelected; $('btnUnlink').onclick = unlinkSelected;
    [0, 25, 50, 75, 100].forEach(v => $('btnPct' + v).onclick = () => setProgress(v));
    $('btnBaseline').onclick = openBaselines; $('btnBaselinesView').onclick = openBaselines; $('btnStats').onclick = openStats;
    $('zoom').onchange = e => { Gantt.setZoom(e.target.value); Gantt.scrollToDay(Store.computed.projStart); };
    $('zoomSlider').oninput = e => { Gantt.setPxDay(+e.target.value); Store.setPref('pxDay', +e.target.value); };
    $('btnZoomIn').onclick = () => Gantt.zoomBy(1.25); $('btnZoomOut').onclick = () => Gantt.zoomBy(0.8); $('btnFit').onclick = () => Gantt.fit();
    $('btnToday').onclick = () => Gantt.scrollToDay(U.today());
    $('btnColumns').onclick = openColumns;
    $('btnResources').onclick = openResources; $('btnSettings').onclick = () => openSettings('general'); $('btnCalendar').onclick = () => openSettings('calendar');
    $('btnHelp').onclick = () => $('dlgHelp').showModal();
    $('btnNew').onclick = () => { Store.createProject(); showRibbonTab('task'); openSettings('general'); };
    $('btnDuplicate').onclick = () => { const copy = JSON.parse(JSON.stringify(Store.project)); copy.id = U.uid(); copy.name = copy.name + ' (copia)'; Store.createProject(copy); renderProjects(); toast('Proyecto duplicado'); };
    $('btnImport').onclick = () => $('fileImport').click();
    $('fileImport').onchange = e => { if (e.target.files[0]) Exporters.importFile(e.target.files[0]); e.target.value = ''; };
    document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => { const rows = visibleRows(); ({ json: Exporters.json, csv: Exporters.csv, xml: Exporters.mspXML, svg: () => Exporters.svg(rows), png: () => Exporters.png(rows), print: () => Exporters.print(rows) })[b.dataset.export](); });
    $('filterText').oninput = e => { filter.text = e.target.value.trim(); refresh(); };
    $('filterResource').onchange = e => { filter.resource = e.target.value; refresh(); };
    $('filterCritical').onchange = e => { filter.critical = e.target.checked; refresh(); };
    $('filterIncomplete').onchange = e => { filter.incomplete = e.target.checked; refresh(); };
    $('outlineLevel').onchange = e => { filter.level = +e.target.value; refresh(); };
    $('btnExpandAll').onclick = () => { $('outlineLevel').value = '0'; filter.level = 0; setCollapsedAll(false); };
    wireTabs($('tTabs'), $('dlgTask')); wireTabs($('pTabs'), $('dlgSettings'));
    document.addEventListener('mousedown', e => { if (!e.target.closest('#ctxMenu')) hideContextMenu(); });
    window.addEventListener('blur', hideContextMenu);

    const sync = (a, b) => { let lock = false; a.addEventListener('scroll', () => { if (lock) return; lock = true; b.scrollTop = a.scrollTop; lock = false; }); };
    const gp = $('gridPane'), ga = $('ganttPane'); sync(gp, ga); sync(ga, gp);
    const splitter = (sp, pane) => { let sx = null, sw = 0; sp.addEventListener('mousedown', e => { sx = e.clientX; sw = pane.offsetWidth; e.preventDefault(); }); window.addEventListener('mousemove', e => { if (sx == null) return; pane.style.width = Math.max(200, sw + e.clientX - sx) + 'px'; }); window.addEventListener('mouseup', () => { if (sx != null) { sx = null; refresh(); } }); };
    splitter($('splitter'), gp); splitter($('splitter2'), $('resPane'));
    window.addEventListener('resize', () => refresh());
    window.addEventListener('beforeprint', () => refresh());
    document.addEventListener('keydown', onKey);

    showRibbonTab(Store.getPref('tab', 'task') === 'file' ? 'task' : Store.getPref('tab', 'task'));
    refresh(); syncZoomUI();
    Gantt.scrollToDay(Store.computed.projStart);
    if (Store.project.tasks.length) Table.setActive(0, 'name');
  }

  document.addEventListener('DOMContentLoaded', init);
  return { options, filter, refresh, visibleRows, toast, setStatusHint, syncZoomUI, addTask, addSummary, deleteSelected, indent, move, addLink, linkSelected, unlinkSelected, setProgress, saveBaseline, clearBaseline, openBaselines, setBaselineView, openTaskDialog, openResources, openSettings, openResourceCalendar, showContextMenu, hideContextMenu, setView };
})();
