/* Controlador principal: barra de herramientas, diálogos, filtros, teclado y refresco de vistas */
const App = (() => {
  const options = { critical: true, baseline: false };
  const filter = { text: '', resource: '', critical: false };
  const $ = id => document.getElementById(id);
  let toastTimer = null;

  // ---------- filas visibles (esquema contraído + filtros) ----------
  function visibleRows() {
    const { project, computed } = Store; const tasks = project.tasks, ol = computed.outline, C = computed.C;
    const n = tasks.length; const show = new Array(n).fill(true);
    const active = filter.text || filter.resource || filter.critical;
    if (active) {
      const q = filter.text.toLowerCase();
      const match = new Array(n).fill(false);
      for (let i = 0; i < n; i++) {
        const t = tasks[i];
        let ok = !q || t.name.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q);
        if (ok && filter.resource) ok = t.resources.includes(filter.resource);
        if (ok && filter.critical) ok = C[i].critical && !ol.isSummary[i];
        if (ok && !(ol.isSummary[i] && (filter.resource || filter.critical))) match[i] = true;
      }
      for (let i = 0; i < n; i++) if (match[i]) { let p = ol.parent[i]; while (p >= 0) { match[p] = true; p = ol.parent[p]; } }
      for (let i = 0; i < n; i++) show[i] = match[i];
    }
    for (let i = 0; i < n; i++) { let p = ol.parent[i]; while (p >= 0) { if (tasks[p].collapsed) { show[i] = false; break; } p = ol.parent[p]; } }
    return [...Array(n).keys()].filter(i => show[i]);
  }

  function refresh(type) {
    if (type === 'selection') { Table.updateSelection(); Gantt.updateSelection(); updateButtons(); return; }
    const rows = visibleRows();
    Table.render(rows);
    Gantt.render(rows);
    renderStatus();
    $('projectName').value = Store.project.name;
    updateButtons();
    renderResourceFilter();
  }
  function updateButtons() {
    $('btnUndo').disabled = !Store.canUndo; $('btnRedo').disabled = !Store.canRedo;
    const has = Store.selection.length > 0;
    ['btnDelete', 'btnIndent', 'btnOutdent', 'btnUp', 'btnDown', 'btnInfo', 'btnUnlink'].forEach(id => $(id).disabled = !has);
    $('btnLink').disabled = Store.selection.length < 2;
  }
  function renderStatus() {
    const { project, computed } = Store; const C = computed.C, ol = computed.outline;
    const leaves = project.tasks.filter((t, i) => !ol.isSummary[i]).length;
    const crit = C.filter((c, i) => c.critical && !ol.isSummary[i]).length;
    const done = project.tasks.length ? Math.round(project.tasks.reduce((s, t, i) => ol.isSummary[i] ? s : s + (+t.progress || 0) * Math.max(Scheduler.dur(t), 1), 0) / (project.tasks.reduce((s, t, i) => ol.isSummary[i] ? s : s + Math.max(Scheduler.dur(t), 1), 0) || 1)) : 0;
    $('statusbar').innerHTML = `<span>Inicio <b>${U.fmt(computed.projStart)}</b></span><span>Fin <b>${U.fmt(computed.projFinish)}</b></span><span>Duración <b>${computed.duration} días laborables</b></span>`
      + `<span>Tareas <b>${leaves}</b> (${project.tasks.length - leaves} resúmenes)</span><span>Críticas <b>${crit}</b></span><span>Avance <b>${done}%</b></span>`
      + (project.baselineDate ? `<span>Línea base <b>${U.fmt(U.toDay(project.baselineDate))}</b></span>` : '')
      + (computed.errors ? `<span class="warn">⚠ ${computed.errors} tarea(s) con dependencias circulares</span>` : '')
      + `<span class="spacer"></span><span>Guardado automático en este navegador</span>`;
  }
  function renderResourceFilter() {
    const sel = $('filterResource'); const cur = sel.value;
    sel.innerHTML = '<option value="">Todos los responsables</option>' + Store.project.resources.map(r => `<option value="${r.id}">${U.esc(r.name)}</option>`).join('');
    sel.value = Store.project.resources.some(r => r.id === cur) ? cur : '';
    filter.resource = sel.value;
  }

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }

  // ---------- operaciones sobre tareas ----------
  function insertAt() { const idx = Store.selectedIndices(); return idx.length ? Store.blockEnd(idx[idx.length - 1]) : Store.project.tasks.length; }
  function addTask(opts = {}) {
    const idx = Store.selectedIndices(); const at = insertAt();
    const ref = idx.length ? Store.project.tasks[idx[idx.length - 1]] : null;
    const level = ref ? (Store.computed.outline.isSummary[idx[idx.length - 1]] && !ref.collapsed ? ref.level + 1 : ref.level) : 1;
    const t = Store.newTask(Object.assign({ level, name: opts.milestone ? 'Nuevo hito' : 'Nueva tarea' }, opts));
    Store.mutate(p => { p.tasks.splice(at, 0, t); });
    Store.select(t.id);
    Table.scrollToRow(at);
    Table.editSelectedName();
  }
  function deleteSelected() {
    const idx = Store.selectedIndices(); if (!idx.length) return;
    Store.mutate(p => {
      const rm = new Set(); for (const i of idx) for (let j = i; j < Store.blockEnd(i); j++) rm.add(p.tasks[j].id);
      p.tasks = p.tasks.filter(t => !rm.has(t.id));
    });
    const tasks = Store.project.tasks; const ni = Math.min(idx[0], tasks.length - 1);
    Store.select(ni >= 0 ? tasks[ni].id : []);
  }
  function indent(delta) {
    const idx = Store.selectedIndices(); if (!idx.length) return;
    Store.mutate(p => {
      const done = new Set();
      for (const i of idx) {
        if (done.has(i)) continue;
        if (delta > 0 && (i === 0 || p.tasks[i].level > p.tasks[i - 1].level)) continue;
        if (delta < 0 && p.tasks[i].level <= 1) continue;
        for (let j = i; j < Store.blockEnd(i); j++) { p.tasks[j].level += delta; done.add(j); }
      }
    });
  }
  function move(dir) {
    const idx = Store.selectedIndices(); if (idx.length !== 1) { toast('Selecciona una sola tarea para moverla'); return; }
    const i = idx[0], end = Store.blockEnd(i);
    Store.mutate(p => {
      const block = p.tasks.splice(i, end - i);
      let at;
      if (dir < 0) { at = i - 1; if (at < 0) at = 0; }
      else { if (i >= p.tasks.length) at = p.tasks.length; else { let j = i + 1; while (j < p.tasks.length && p.tasks[j].level > p.tasks[i].level) j++; at = j; } }
      p.tasks.splice(at, 0, ...block);
    });
    const ni = Store.indexOf(Store.selection[0]); Table.scrollToRow(ni);
  }
  function addLink(predId, succId, type = 'FS', lag = 0) {
    const a = Store.indexOf(predId), b = Store.indexOf(succId); if (a < 0 || b < 0 || a === b) return false;
    if (Store.isAncestor(a, b) || Store.isAncestor(b, a)) { toast('No se puede vincular una tarea con su propio resumen'); return false; }
    const succ = Store.project.tasks[b];
    if (succ.predecessors.some(p => p.id === predId)) return false;
    if (Store.project.tasks[a].predecessors.some(p => p.id === succId)) { toast('Ese vínculo crearía una dependencia circular'); return false; }
    Store.mutate(p => { p.tasks[b].predecessors.push({ id: predId, type, lag }); });
    if (Store.computed.C[b].error) { Store.undo(); toast('Ese vínculo crearía una dependencia circular'); return false; }
    return true;
  }
  function linkSelected() {
    const idx = Store.selectedIndices(); if (idx.length < 2) return;
    let n = 0; for (let k = 1; k < idx.length; k++) if (addLink(Store.project.tasks[idx[k - 1]].id, Store.project.tasks[idx[k]].id)) n++;
    if (n) toast(`${n} vínculo(s) creado(s)`);
  }
  function unlinkSelected() {
    const idx = Store.selectedIndices(); if (!idx.length) return;
    const ids = new Set(idx.map(i => Store.project.tasks[i].id));
    Store.mutate(p => {
      if (idx.length === 1) { p.tasks[idx[0]].predecessors = []; for (const t of p.tasks) t.predecessors = t.predecessors.filter(x => !ids.has(x.id)); }
      else for (const i of idx) p.tasks[i].predecessors = p.tasks[i].predecessors.filter(x => !ids.has(x.id));
    });
  }
  function saveBaseline() {
    Store.mutate(p => { const C = Store.computed.C; p.tasks.forEach((t, i) => { t.baseline = { start: U.fromDay(C[i].es), finish: U.fromDay(C[i].ef) }; }); p.baselineDate = U.fromDay(U.today()); });
    options.baseline = true; $('chkBaseline').checked = true; refresh(); toast('Línea base guardada');
  }
  function setCollapsedAll(v) { Store.mutate(p => { const ol = Store.computed.outline; p.tasks.forEach((t, i) => { if (ol.isSummary[i]) t.collapsed = v; }); }); }

  // ---------- diálogo de tarea ----------
  function openTaskDialog(id) {
    const i = Store.indexOf(id); if (i < 0) return;
    const { project, computed } = Store; const t = project.tasks[i]; const c = computed.C[i]; const sum = computed.outline.isSummary[i];
    Store.select(id);
    const dlg = $('dlgTask');
    $('tName').value = t.name; $('tDuration').value = t.milestone ? 0 : t.duration; $('tDuration').disabled = sum;
    $('tMilestone').checked = t.milestone; $('tMilestone').disabled = sum;
    $('tConstraint').value = (t.constraint || {}).type || 'ASAP'; $('tConstraint').disabled = sum;
    $('tConstraintDate').value = (t.constraint || {}).date || ''; $('tConstraintDate').disabled = sum;
    $('tProgress').value = t.progress || 0; $('tProgress').disabled = sum;
    $('tNotes').value = t.notes || '';
    $('tComputed').innerHTML = `<span>Comienzo <b>${U.fmt(c.es)}</b></span><span>Fin <b>${U.fmt(c.ef)}</b></span><span>Comienzo límite <b>${U.fmt(c.ls)}</b></span><span>Fin límite <b>${U.fmt(c.lf)}</b></span><span>Holgura total <b>${c.slack} d</b></span>${c.critical ? '<span style="color:#dc2626">● Crítica</span>' : ''}${t.baseline ? `<span>Línea base ${U.fmt(U.toDay(t.baseline.start))} → ${U.fmt(U.toDay(t.baseline.finish))}</span>` : ''}`;
    // predecesoras
    const tb = $('tPredTable').querySelector('tbody');
    const candidates = project.tasks.map((x, k) => ({ x, k })).filter(({ x, k }) => k !== i && !Store.isAncestor(k, i) && !Store.isAncestor(i, k));
    const predRow = (p = { id: candidates[0] && candidates[0].x.id, type: 'FS', lag: 0 }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><select class="p-id">${candidates.map(({ x, k }) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${k + 1} · ${U.esc(x.name)}</option>`).join('')}</select></td>`
        + `<td><select class="p-type"><option value="FS">Fin a Comienzo (FC)</option><option value="SS">Comienzo a Comienzo (CC)</option><option value="FF">Fin a Fin (FF)</option><option value="SF">Comienzo a Fin (CF)</option></select></td>`
        + `<td><input class="p-lag" type="number" step="1" value="${p.lag | 0}"></td><td><button type="button" class="link p-del" title="Quitar">✕</button></td>`;
      tr.querySelector('.p-type').value = p.type; tr.querySelector('.p-del').onclick = () => tr.remove(); tb.appendChild(tr);
    };
    tb.innerHTML = ''; t.predecessors.forEach(p => predRow(p));
    $('tAddPred').onclick = () => { if (candidates.length) predRow(); else toast('No hay otras tareas que puedan ser predecesoras'); };
    $('tAddPred').disabled = !candidates.length;
    // responsables
    const chips = $('tResources');
    chips.innerHTML = project.resources.map(r => `<label class="${t.resources.includes(r.id) ? 'on' : ''}"><input type="checkbox" value="${r.id}" ${t.resources.includes(r.id) ? 'checked' : ''}><span class="res-chip" style="background:${r.color};color:#fff;border-radius:8px;padding:0 6px">${U.esc(r.name)}</span></label>`).join('') || '<span style="color:#6b7280">No hay responsables definidos. Créalos en «👥 Responsables».</span>';
    chips.querySelectorAll('input').forEach(ch => ch.onchange = () => ch.parentElement.classList.toggle('on', ch.checked));
    const form = dlg.querySelector('form');
    form.onsubmit = ev => {
      ev.preventDefault();
      const preds = [...tb.querySelectorAll('tr')].map(tr => ({ id: tr.querySelector('.p-id').value, type: tr.querySelector('.p-type').value, lag: parseInt(tr.querySelector('.p-lag').value, 10) || 0 }));
      const seen = new Set(); const uniq = preds.filter(p => !seen.has(p.id) && seen.add(p.id));
      Store.mutate(p => {
        const x = p.tasks[i];
        x.name = $('tName').value.trim() || x.name; x.notes = $('tNotes').value;
        x.resources = [...chips.querySelectorAll('input:checked')].map(ch => ch.value);
        if (!sum) {
          x.milestone = $('tMilestone').checked; const d = parseInt($('tDuration').value, 10); x.duration = x.milestone ? 0 : (isNaN(d) ? x.duration : Math.max(1, d));
          x.progress = U.clamp(parseInt($('tProgress').value, 10) || 0, 0, 100);
          const ct = $('tConstraint').value, cd = $('tConstraintDate').value;
          x.constraint = ct === 'ASAP' || !cd ? { type: 'ASAP', date: null } : { type: ct, date: cd };
        }
        x.predecessors = uniq;
      });
      if (Store.computed.C[i].error) toast('Atención: la tarea tiene una dependencia circular');
      dlg.close();
    };
    $('tCancel').onclick = () => dlg.close();
    dlg.showModal(); $('tName').focus();
  }

  // ---------- diálogo de responsables ----------
  function openResources() {
    const dlg = $('dlgResources'); const tb = $('rTable').querySelector('tbody');
    const row = r => { const tr = document.createElement('tr'); tr.dataset.id = r.id; tr.innerHTML = `<td><input class="r-name" value="${U.esc(r.name)}"></td><td><input class="r-role" value="${U.esc(r.role || '')}" placeholder="Rol / equipo"></td><td><input class="r-color" type="color" value="${r.color}"></td><td><button type="button" class="link r-del">✕</button></td>`; tr.querySelector('.r-del').onclick = () => tr.remove(); tb.appendChild(tr); };
    tb.innerHTML = ''; Store.project.resources.forEach(row);
    $('rAdd').onclick = () => { const r = Store.newResource({ name: '' }); r.color = U.PALETTE[tb.children.length % U.PALETTE.length]; row(r); tb.lastElementChild.querySelector('.r-name').focus(); };
    dlg.querySelector('form').onsubmit = ev => {
      ev.preventDefault();
      const list = [...tb.querySelectorAll('tr')].map(tr => ({ id: tr.dataset.id, name: tr.querySelector('.r-name').value.trim(), role: tr.querySelector('.r-role').value.trim(), color: tr.querySelector('.r-color').value })).filter(r => r.name);
      const ids = new Set(list.map(r => r.id));
      Store.mutate(p => { p.resources = list; for (const t of p.tasks) t.resources = t.resources.filter(id => ids.has(id)); });
      dlg.close();
    };
    $('rCancel').onclick = () => dlg.close();
    dlg.showModal();
  }

  // ---------- diálogo de proyecto ----------
  function openSettings() {
    const dlg = $('dlgSettings'); const p = Store.project;
    $('pName').value = p.name; $('pStart').value = p.start;
    $('pWorkDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" value="${d}" ${p.calendar.workDays.includes(d) ? 'checked' : ''}>${U.DAYS_LONG[d].slice(0, 3)}</label>`).join('');
    $('pHolidays').value = p.calendar.holidays.join('\n');
    dlg.querySelector('form').onsubmit = ev => {
      ev.preventDefault();
      const wd = [...$('pWorkDays').querySelectorAll('input:checked')].map(i => +i.value);
      if (!wd.length) { toast('Debe haber al menos un día laborable'); return; }
      const hol = $('pHolidays').value.split(/\s+/).map(s => s.trim()).filter(s => U.toDay(s) != null);
      Store.mutate(x => { x.name = $('pName').value.trim() || x.name; if (U.toDay($('pStart').value) != null) x.start = $('pStart').value; x.calendar = { workDays: wd, holidays: hol }; });
      dlg.close();
    };
    $('pReset').onclick = () => { if (confirm('¿Crear un proyecto nuevo en blanco? El actual se puede recuperar con Deshacer o desde una exportación JSON.')) { Store.mutate(() => Store.blank('Nuevo proyecto')); Store.select([]); dlg.close(); } };
    $('pCancel').onclick = () => dlg.close();
    dlg.showModal();
  }

  // ---------- teclado ----------
  function onKey(e) {
    if (Table.isEditing || e.target.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); Store.redo(); return; }
    const tasks = Store.project.tasks; const idx = Store.selectedIndices();
    switch (e.key) {
      case 'Insert': e.preventDefault(); addTask(); break;
      case 'Delete': e.preventDefault(); deleteSelected(); break;
      case 'Tab': e.preventDefault(); indent(e.shiftKey ? -1 : 1); break;
      case 'Enter': if (idx.length) { e.preventDefault(); openTaskDialog(tasks[idx[0]].id); } break;
      case 'F2': if (idx.length) { e.preventDefault(); Table.editSelectedName(); } break;
      case 'ArrowDown': case 'ArrowUp': {
        e.preventDefault(); const rows = visibleRows(); if (!rows.length) break;
        const cur = idx.length ? rows.indexOf(e.key === 'ArrowDown' ? idx[idx.length - 1] : idx[0]) : -1;
        const nk = U.clamp(cur + (e.key === 'ArrowDown' ? 1 : -1), 0, rows.length - 1);
        const id = tasks[rows[nk]].id; e.shiftKey ? Store.selectRange(id) : Store.select(id); Table.scrollToRow(rows[nk]); break;
      }
      case 'ArrowLeft': case 'ArrowRight': if (idx.length === 1 && Store.computed.outline.isSummary[idx[0]] && !ctrl) { e.preventDefault(); const v = e.key === 'ArrowLeft'; if (tasks[idx[0]].collapsed !== v) Store.mutate(p => { p.tasks[idx[0]].collapsed = v; }); } break;
    }
  }

  // ---------- arranque ----------
  function init() {
    Store.load();
    Table.init(); Gantt.init();
    Store.subscribe(refresh);

    $('projectName').addEventListener('change', e => Store.mutate(p => { p.name = e.target.value.trim() || p.name; }));
    $('btnUndo').onclick = () => Store.undo(); $('btnRedo').onclick = () => Store.redo();
    $('btnAddTask').onclick = () => addTask(); $('btnAddMilestone').onclick = () => addTask({ milestone: true, duration: 0 });
    $('btnInfo').onclick = () => { const idx = Store.selectedIndices(); if (idx.length) openTaskDialog(Store.project.tasks[idx[0]].id); };
    $('btnDelete').onclick = deleteSelected;
    $('btnIndent').onclick = () => indent(1); $('btnOutdent').onclick = () => indent(-1);
    $('btnUp').onclick = () => move(-1); $('btnDown').onclick = () => move(1);
    $('btnLink').onclick = linkSelected; $('btnUnlink').onclick = unlinkSelected;
    $('chkCritical').onchange = e => { options.critical = e.target.checked; refresh(); };
    $('chkBaseline').onchange = e => { options.baseline = e.target.checked; refresh(); };
    $('btnBaseline').onclick = saveBaseline;
    $('zoom').onchange = e => { Gantt.setZoom(e.target.value); refresh(); Gantt.scrollToDay(Store.computed.projStart); };
    $('btnToday').onclick = () => Gantt.scrollToDay(U.today());
    $('btnResources').onclick = openResources; $('btnSettings').onclick = openSettings;
    $('btnImport').onclick = () => $('fileImport').click();
    $('fileImport').onchange = e => { if (e.target.files[0]) Exporters.importFile(e.target.files[0]); e.target.value = ''; };
    $('btnExport').onclick = e => { e.stopPropagation(); $('exportMenu').classList.toggle('open'); };
    document.addEventListener('click', () => $('exportMenu').classList.remove('open'));
    $('exportMenu').addEventListener('click', e => {
      const k = e.target.dataset.export; if (!k) return; const rows = visibleRows();
      ({ json: Exporters.json, csv: Exporters.csv, xml: Exporters.mspXML, svg: () => Exporters.svg(rows), png: () => Exporters.png(rows), print: Exporters.print })[k]();
    });
    $('filterText').oninput = e => { filter.text = e.target.value.trim(); refresh(); };
    $('filterResource').onchange = e => { filter.resource = e.target.value; refresh(); };
    $('filterCritical').onchange = e => { filter.critical = e.target.checked; refresh(); };
    $('btnExpandAll').onclick = () => setCollapsedAll(false); $('btnCollapseAll').onclick = () => setCollapsedAll(true);

    // sincronización de scroll vertical entre tabla y Gantt
    const gp = $('gridPane'), ga = $('ganttPane'); let lock = false;
    gp.addEventListener('scroll', () => { if (lock) return; lock = true; ga.scrollTop = gp.scrollTop; lock = false; });
    ga.addEventListener('scroll', () => { if (lock) return; lock = true; gp.scrollTop = ga.scrollTop; lock = false; });
    // divisor redimensionable
    const sp = $('splitter'); let sx = null, sw = 0;
    sp.addEventListener('mousedown', e => { sx = e.clientX; sw = gp.offsetWidth; e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (sx == null) return; gp.style.width = Math.max(200, sw + e.clientX - sx) + 'px'; });
    window.addEventListener('mouseup', () => { if (sx != null) { sx = null; refresh(); } });
    window.addEventListener('resize', () => refresh());
    window.addEventListener('beforeprint', () => refresh());
    document.addEventListener('keydown', onKey);

    refresh();
    Gantt.scrollToDay(Store.computed.projStart);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { options, filter, refresh, visibleRows, toast, addTask, deleteSelected, indent, move, addLink, linkSelected, unlinkSelected, saveBaseline, openTaskDialog, openResources, openSettings };
})();
