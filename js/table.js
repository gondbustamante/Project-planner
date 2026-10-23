/* Vista de tabla (hoja de tareas) con edición en línea */
const Table = (() => {
  const COLS = [
    { key: 'wbs', label: '#', w: 44, cls: 'c-wbs num' },
    { key: 'name', label: 'Nombre de tarea', w: 280, cls: 'c-name', edit: true },
    { key: 'duration', label: 'Duración', w: 78, cls: 'c-duration num', edit: true },
    { key: 'start', label: 'Comienzo', w: 96, cls: 'c-start num', edit: true },
    { key: 'finish', label: 'Fin', w: 96, cls: 'c-finish num', edit: true },
    { key: 'preds', label: 'Predecesoras', w: 120, cls: 'c-preds', edit: true },
    { key: 'resources', label: 'Responsables', w: 170, cls: 'c-resources', edit: true },
    { key: 'progress', label: '%', w: 50, cls: 'c-progress num', edit: true },
    { key: 'slack', label: 'Holgura', w: 66, cls: 'c-slack num' },
  ];
  let head, body, editing = null;

  const TYPE_LABEL = { FS: 'FC', SS: 'CC', FF: 'FF', SF: 'CF' }; // etiquetas en español (Fin-Comienzo…)
  const TYPE_PARSE = { FC: 'FS', CC: 'SS', FF: 'FF', CF: 'SF', FS: 'FS', SS: 'SS', SF: 'SF' };

  function predsToText(task) {
    const { project } = Store;
    return task.predecessors.map(p => {
      const i = project.tasks.findIndex(t => t.id === p.id); if (i < 0) return null;
      let s = String(i + 1);
      if (p.type !== 'FS' || p.lag) s += TYPE_LABEL[p.type];
      if (p.lag) s += (p.lag > 0 ? '+' : '') + p.lag + 'd';
      return s;
    }).filter(Boolean).join('; ');
  }
  function parsePreds(text, selfIdx) {
    const { project } = Store; const out = []; const errors = [];
    for (const raw of String(text).split(/[;,]/)) {
      const s = raw.trim(); if (!s) continue;
      const m = /^(\d+)\s*(FS|SS|FF|SF|FC|CC|CF)?\s*(?:([+-])\s*(\d+)\s*d?)?$/i.exec(s);
      if (!m) { errors.push(s); continue; }
      const i = +m[1] - 1;
      if (i < 0 || i >= project.tasks.length || i === selfIdx) { errors.push(s); continue; }
      const type = TYPE_PARSE[(m[2] || 'FS').toUpperCase()];
      const lag = m[3] ? (m[3] === '-' ? -1 : 1) * +m[4] : 0;
      if (!out.some(p => p.id === project.tasks[i].id)) out.push({ id: project.tasks[i].id, type, lag });
    }
    return { preds: out, errors };
  }

  function init() {
    head = document.getElementById('gridHead');
    body = document.getElementById('gridBody');
    head.innerHTML = '<tr>' + COLS.map(c => `<th style="width:${c.w}px">${c.label}</th>`).join('') + '</tr>';
    body.addEventListener('click', onClick);
    body.addEventListener('dblclick', onDblClick);
  }

  function render(rows) {
    if (editing) return; // no re-pintar mientras se edita
    const { project, computed, selection } = Store;
    const tasks = project.tasks, ol = computed.outline, C = computed.C;
    const resById = new Map(project.resources.map(r => [r.id, r]));
    const sel = new Set(selection);
    let html = '';
    for (const i of rows) {
      const t = tasks[i], c = C[i], sum = ol.isSummary[i];
      const cls = [sum ? 'summary' : '', c.critical && App.options.critical ? 'critical' : '', sel.has(t.id) ? 'selected' : '', c.error ? 'error' : ''].filter(Boolean).join(' ');
      const caret = sum ? `<span class="caret" data-act="toggle">${t.collapsed ? '▸' : '▾'}</span>` : '<span class="caret empty">·</span>';
      const res = t.resources.map(id => resById.get(id)).filter(Boolean).map(r => `<span class="res-chip" style="background:${r.color}">${U.esc(r.name)}</span>`).join('');
      html += `<tr data-id="${t.id}" data-i="${i}" class="${cls}">`
        + `<td class="c-wbs num" title="${c.error ? U.esc(c.error) : 'Doble clic: información'}">${c.error ? '⚠ ' : ''}${i + 1}</td>`
        + `<td class="c-name" data-col="name"><div class="name-wrap"><span class="indent" style="width:${(t.level - 1) * 16}px"></span>${caret}${t.milestone ? '<span class="ms-icon">◆</span>' : ''}<span class="name-text" title="${U.esc(t.name)}">${U.esc(t.name)}</span></div></td>`
        + `<td class="c-duration num" data-col="duration">${t.milestone ? '0 d' : t.duration + ' d'}</td>`
        + `<td class="c-start num" data-col="start">${U.fmt(c.es)}</td>`
        + `<td class="c-finish num" data-col="finish">${U.fmt(c.ef)}</td>`
        + `<td class="c-preds" data-col="preds">${U.esc(predsToText(t))}</td>`
        + `<td class="c-resources" data-col="resources">${res}</td>`
        + `<td class="c-progress num" data-col="progress">${t.progress || 0}%</td>`
        + `<td class="c-slack num">${sum ? '' : c.slack + ' d'}</td>`
        + '</tr>';
    }
    if (!rows.length) html = `<tr class="empty-row"><td colspan="${COLS.length}">No hay tareas. Pulsa «+ Tarea» o la tecla Insert para empezar.</td></tr>`;
    body.innerHTML = html;
  }

  function updateSelection() {
    const sel = new Set(Store.selection);
    body.querySelectorAll('tr[data-id]').forEach(tr => tr.classList.toggle('selected', sel.has(tr.dataset.id)));
  }

  function rowOf(e) { const tr = e.target.closest('tr[data-id]'); return tr ? { tr, id: tr.dataset.id, i: +tr.dataset.i } : null; }

  function onClick(e) {
    const r = rowOf(e); if (!r) return;
    if (e.target.dataset.act === 'toggle') { Store.mutate(p => { p.tasks[r.i].collapsed = !p.tasks[r.i].collapsed; }); return; }
    if (e.shiftKey) Store.selectRange(r.id);
    else if (e.ctrlKey || e.metaKey) Store.select(r.id, { toggle: true });
    else Store.select(r.id);
  }
  function onDblClick(e) {
    const r = rowOf(e); if (!r) return;
    const td = e.target.closest('td'); const col = td && td.dataset.col;
    if (e.target.dataset.act === 'toggle') return;
    if (!col) { App.openTaskDialog(r.id); return; }
    startEdit(r.i, col, td);
  }

  function startEdit(i, col, td) {
    const { project, computed } = Store; const t = project.tasks[i]; const sum = computed.outline.isSummary[i];
    if (sum && col !== 'name' && col !== 'resources') { App.openTaskDialog(t.id); return; }
    const resNames = () => t.resources.map(id => (project.resources.find(r => r.id === id) || {}).name).filter(Boolean).join(', ');
    const initial = { name: t.name, duration: t.milestone ? 0 : t.duration, start: U.fmt(computed.C[i].es), finish: U.fmt(computed.C[i].ef), preds: predsToText(t), resources: resNames(), progress: t.progress || 0 }[col];
    if (initial === undefined) return;
    const inp = document.createElement('input'); inp.className = 'inline'; inp.value = initial;
    if (col === 'resources') { inp.setAttribute('list', 'resList'); ensureResList(); }
    td.innerHTML = ''; td.appendChild(inp); inp.focus(); inp.select();
    editing = { i, col };
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true; editing = null;
      if (commit) applyEdit(i, col, inp.value); else App.refresh();
    };
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { finish(false); }
      else if (ev.key === 'Tab') { ev.preventDefault(); const next = nextEditable(col, ev.shiftKey); finish(true); if (next) setTimeout(() => { const tr = body.querySelector(`tr[data-i="${i}"]`); const ntd = tr && tr.querySelector(`td[data-col="${next}"]`); if (ntd) startEdit(i, next, ntd); }, 0); }
      ev.stopPropagation();
    });
    inp.addEventListener('blur', () => finish(true));
  }
  function nextEditable(col, back) {
    const keys = COLS.filter(c => c.edit).map(c => c.key); const k = keys.indexOf(col) + (back ? -1 : 1);
    return keys[k] || null;
  }
  function ensureResList() {
    let dl = document.getElementById('resList');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'resList'; document.body.appendChild(dl); }
    dl.innerHTML = Store.project.resources.map(r => `<option value="${U.esc(r.name)}">`).join('');
  }

  function applyEdit(i, col, value) {
    const { computed } = Store; const c = computed.C[i]; const cal = computed.cal;
    value = String(value).trim();
    Store.mutate(p => {
      const t = p.tasks[i];
      switch (col) {
        case 'name': if (value) t.name = value; break;
        case 'duration': { const d = parseInt(value, 10); if (!isNaN(d) && d >= 0) { t.duration = d; t.milestone = d === 0; } break; }
        case 'start': { const d = U.parseUserDate(value); if (d != null) t.constraint = { type: 'SNET', date: U.fromDay(cal.next(d)) }; break; }
        case 'finish': { const d = U.parseUserDate(value); if (d != null) { const nd = cal.duration(c.es, cal.prev(d)); if (nd >= 1) { t.duration = nd; t.milestone = false; } else if (nd === 0 || d < c.es) { t.duration = 0; t.milestone = true; } } break; }
        case 'preds': { const r = parsePreds(value, i); t.predecessors = r.preds; if (r.errors.length) App.toast('Predecesoras no reconocidas: ' + r.errors.join(', ')); break; }
        case 'resources': {
          const names = value.split(/[;,]/).map(s => s.trim()).filter(Boolean); t.resources = [];
          for (const nm of names) { let r = p.resources.find(x => x.name.toLowerCase() === nm.toLowerCase()); if (!r) { r = Store.newResource({ name: nm }); r.color = U.PALETTE[p.resources.length % U.PALETTE.length]; p.resources.push(r); } t.resources.push(r.id); }
          break;
        }
        case 'progress': { const v = parseInt(value, 10); if (!isNaN(v)) t.progress = U.clamp(v, 0, 100); break; }
      }
    });
  }

  function editSelectedName() {
    const idx = Store.selectedIndices(); if (!idx.length) return;
    const tr = body.querySelector(`tr[data-i="${idx[0]}"]`); const td = tr && tr.querySelector('td[data-col="name"]');
    if (td) startEdit(idx[0], 'name', td);
  }
  function scrollToRow(i) { const tr = body.querySelector(`tr[data-i="${i}"]`); if (tr) tr.scrollIntoView({ block: 'nearest' }); }

  return { COLS, init, render, updateSelection, predsToText, parsePreds, editSelectedName, scrollToRow, get isEditing() { return !!editing; } };
})();
