/* Hoja de tareas: columnas configurables, celda activa, edición al teclado, indicadores */
const Table = (() => {
  const COLS = [
    { key: 'ind', label: '', w: 34, cls: 'c-ind', fixed: true },
    { key: 'id', label: '#', w: 36, cls: 'c-id', fixed: true },
    { key: 'wbs', label: 'EDT', w: 56, cls: 'c-wbs num', def: false },
    { key: 'name', label: 'Nombre de tarea', w: 250, cls: 'c-name', edit: true, def: true },
    { key: 'duration', label: 'Duración', w: 74, cls: 'c-duration num', edit: true, def: true },
    { key: 'start', label: 'Comienzo', w: 98, cls: 'c-start', edit: true, def: true },
    { key: 'finish', label: 'Fin', w: 98, cls: 'c-finish', edit: true, def: true },
    { key: 'preds', label: 'Predecesoras', w: 110, cls: 'c-preds', edit: true, def: true },
    { key: 'succs', label: 'Sucesoras', w: 100, cls: 'c-succs', def: false },
    { key: 'resources', label: 'Responsables', w: 160, cls: 'c-resources', edit: true, def: true },
    { key: 'progress', label: '% compl.', w: 64, cls: 'c-progress num', edit: true, def: true },
    { key: 'slack', label: 'Holgura total', w: 80, cls: 'c-slack num', def: false },
    { key: 'freeSlack', label: 'Holgura libre', w: 80, cls: 'c-freeSlack num', def: false },
    { key: 'ls', label: 'Comienzo límite', w: 98, cls: 'c-ls', def: false },
    { key: 'lf', label: 'Fin límite', w: 98, cls: 'c-lf', def: false },
    { key: 'deadline', label: 'Fecha límite', w: 98, cls: 'c-deadline', edit: true, def: false },
    { key: 'constraint', label: 'Restricción', w: 150, cls: 'c-constraint', def: false },
    { key: 'blStart', label: 'Comienzo LB', w: 98, cls: 'c-blStart', def: false },
    { key: 'blFinish', label: 'Fin LB', w: 98, cls: 'c-blFinish', def: false },
    { key: 'variance', label: 'Variación fin', w: 90, cls: 'c-variance num', def: false },
    { key: 'priority', label: 'Prioridad', w: 70, cls: 'c-priority', def: false },
    { key: 'notes', label: 'Notas', w: 200, cls: 'c-notes', edit: true, def: false },
  ];
  const TYPE_LABEL = { FS: 'FC', SS: 'CC', FF: 'FF', SF: 'CF' };
  const TYPE_PARSE = { FC: 'FS', CC: 'SS', FF: 'FF', CF: 'SF', FS: 'FS', SS: 'SS', SF: 'SF' };
  const CONS_LABEL = { ASAP: 'Lo antes posible', SNET: 'No comenzar antes del', MSO: 'Debe comenzar el' };
  const PRIO = { 300: 'Baja', 500: 'Normal', 700: 'Alta', 900: 'Muy alta' };

  let head, body, pane, editing = null;
  let visible = null, widths = null;   // preferencias
  let active = { i: -1, col: 'name' };
  let rowsCache = [];

  function loadPrefs() {
    visible = Store.getPref('cols', null) || COLS.filter(c => c.fixed || c.def).map(c => c.key);
    widths = Object.assign({}, Store.getPref('colw', {}));
  }
  function cols() { return COLS.filter(c => c.fixed || visible.includes(c.key)); }
  function setVisible(keys) { visible = keys; Store.setPref('cols', keys); renderHead(); App.refresh(); }
  function resetCols() { Store.setPref('cols', null); Store.setPref('colw', {}); loadPrefs(); renderHead(); App.refresh(); }

  // ---------- texto de predecesoras ----------
  function linkText(list) {
    const { project } = Store;
    return list.map(p => {
      const i = project.tasks.findIndex(t => t.id === p.id); if (i < 0) return null;
      let s = String(i + 1);
      if (p.type !== 'FS' || p.lag) s += TYPE_LABEL[p.type];
      if (p.lag) s += (p.lag > 0 ? '+' : '') + p.lag + 'd';
      return s;
    }).filter(Boolean).join('; ');
  }
  const predsToText = task => linkText(task.predecessors);
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

  // ---------- cabecera ----------
  function renderHead() {
    head.innerHTML = '<tr>' + cols().map(c => `<th class="${c.cls.split(' ')[0]}" data-col="${c.key}" style="width:${widths[c.key] || c.w}px;position:sticky">${c.label}<span class="resizer" data-col="${c.key}"></span></th>`).join('') + '</tr>';
  }

  function init() {
    head = document.getElementById('gridHead');
    body = document.getElementById('gridBody');
    pane = document.getElementById('gridPane');
    loadPrefs(); renderHead();
    body.addEventListener('mousedown', onMouseDown);
    body.addEventListener('dblclick', onDblClick);
    body.addEventListener('contextmenu', onContext);
    head.addEventListener('mousedown', onHeadDown);
    pane.tabIndex = 0;
  }

  // ---------- indicadores ----------
  function indicators(t, c, i, sum) {
    const { project } = Store; const out = [];
    if (c.error) out.push(`<span class="ind" title="${U.esc(c.error)}">⚠️</span>`);
    if (!sum && (t.progress | 0) >= 100) out.push('<span class="ind" title="Tarea completada">✅</span>');
    if (t.notes) out.push(`<span class="ind" title="${U.esc(t.notes.slice(0, 200))}">📝</span>`);
    if (!sum && t.constraint && t.constraint.type !== 'ASAP' && t.constraint.date) out.push(`<span class="ind" title="${CONS_LABEL[t.constraint.type]} ${U.fmt(U.toDay(t.constraint.date))}">📌</span>`);
    if (t.deadline) out.push(`<span class="ind" title="Fecha límite ${U.fmt(U.toDay(t.deadline))}${c.deadlineMissed ? ' · ¡superada!' : ''}">${c.deadlineMissed ? '🔴' : '🚩'}</span>`);
    if (!sum && !t.ignoreResourceCalendars && t.resources.some(id => { const r = project.resources.find(x => x.id === id); return r && r.calendar; })) out.push('<span class="ind" title="Programada con el calendario personal de sus responsables">📅</span>');
    return out.join('');
  }

  // ---------- celdas ----------
  function cellHTML(key, t, c, i, sum, ctx) {
    switch (key) {
      case 'ind': return indicators(t, c, i, sum);
      case 'id': return String(i + 1);
      case 'wbs': return ctx.ol.wbs[i];
      case 'name': {
        const caret = sum ? `<span class="caret" data-act="toggle">${t.collapsed ? '▶' : '▼'}</span>` : '<span class="caret empty">·</span>';
        return `<div class="name-wrap"><span class="indent" style="width:${(t.level - 1) * 16}px"></span>${caret}${t.milestone ? '<span class="ms-icon">◆</span>' : ''}<span class="name-text" title="${U.esc(t.name)}">${U.esc(t.name)}</span></div>`;
      }
      case 'duration': return t.milestone ? '0 días' : `${t.duration} día${t.duration === 1 ? '' : 's'}`;
      case 'start': return U.fmt(c.es);
      case 'finish': return U.fmt(c.ef);
      case 'preds': return U.esc(predsToText(t));
      case 'succs': return U.esc(linkText(ctx.successors[i]));
      case 'resources': return t.resources.map(id => ctx.resById.get(id)).filter(Boolean).map(r => `<span class="res-chip" style="background:${r.color}">${U.esc(r.name)}</span>`).join('');
      case 'progress': return (t.progress || 0) + '%';
      case 'slack': return sum ? '' : c.slack + ' d';
      case 'freeSlack': return sum ? '' : c.freeSlack + ' d';
      case 'ls': return U.fmt(c.ls);
      case 'lf': return U.fmt(c.lf);
      case 'deadline': return t.deadline ? U.fmt(U.toDay(t.deadline)) : '';
      case 'constraint': return sum ? '' : (t.constraint && t.constraint.type !== 'ASAP' && t.constraint.date ? `${CONS_LABEL[t.constraint.type]} ${U.fmt(U.toDay(t.constraint.date))}` : CONS_LABEL.ASAP);
      case 'blStart': return t.baseline ? U.fmt(U.toDay(t.baseline.start)) : '';
      case 'blFinish': return t.baseline ? U.fmt(U.toDay(t.baseline.finish)) : '';
      case 'variance': { if (!t.baseline) return ''; const v = ctx.cal.count(U.toDay(t.baseline.finish), c.ef); return (v > 0 ? '+' : '') + v + ' d'; }
      case 'priority': return PRIO[t.priority] || 'Normal';
      case 'notes': return U.esc((t.notes || '').split('\n')[0]);
    }
    return '';
  }

  function render(rows) {
    if (editing) return;
    rowsCache = rows;
    const { project, computed, selection } = Store;
    const tasks = project.tasks, ol = computed.outline, C = computed.C;
    const ctx = { ol, cal: computed.cal, successors: computed.successors, resById: new Map(project.resources.map(r => [r.id, r])) };
    const sel = new Set(selection); const cs = cols();
    let html = '';
    for (const i of rows) {
      const t = tasks[i], c = C[i], sum = ol.isSummary[i];
      const cls = [sum ? 'summary level' + t.level : '', c.critical && App.options.critical ? 'critical' : '', sel.has(t.id) ? 'selected' : '', c.error ? 'error' : '', (t.progress | 0) >= 100 && !sum ? 'done' : ''].filter(Boolean).join(' ');
      html += `<tr data-id="${t.id}" data-i="${i}" class="${cls}">`;
      for (const col of cs) {
        const act = active.i === i && active.col === col.key ? ' active' : '';
        html += `<td class="${col.cls}${act}" data-col="${col.key}">${cellHTML(col.key, t, c, i, sum, ctx)}</td>`;
      }
      html += '</tr>';
    }
    if (!rows.length) html = `<tr class="empty-row"><td colspan="${cs.length}">No hay tareas. Pulsa «＋ Tarea» o la tecla Insert para empezar.</td></tr>`;
    body.innerHTML = html;
  }
  function updateSelection() {
    const sel = new Set(Store.selection);
    body.querySelectorAll('tr[data-id]').forEach(tr => { tr.classList.toggle('selected', sel.has(tr.dataset.id)); });
    body.querySelectorAll('td.active').forEach(td => td.classList.remove('active'));
    const tr = body.querySelector(`tr[data-i="${active.i}"]`); const td = tr && tr.querySelector(`td[data-col="${active.col}"]`);
    if (td) td.classList.add('active');
  }
  function setActive(i, col, opts = {}) {
    if (col && !cols().some(c => c.key === col)) col = 'name';
    active = { i, col: col || active.col };
    const id = Store.project.tasks[i] && Store.project.tasks[i].id;
    if (id && !opts.noSelect) { if (opts.range) Store.selectRange(id); else if (opts.toggle) Store.select(id, { toggle: true }); else Store.select(id); }
    else updateSelection();
    scrollToRow(i);
  }

  // ---------- eventos ----------
  function rowOf(e) { const tr = e.target.closest('tr[data-id]'); return tr ? { tr, id: tr.dataset.id, i: +tr.dataset.i } : null; }
  function onMouseDown(e) {
    if (e.button === 2) return;
    const r = rowOf(e); if (!r) return;
    const td = e.target.closest('td'); const col = td ? td.dataset.col : 'name';
    if (e.target.dataset.act === 'toggle') { e.preventDefault(); Store.mutate(p => { p.tasks[r.i].collapsed = !p.tasks[r.i].collapsed; }); return; }
    if (editing && editing.i === r.i && editing.col === col) return;
    if (e.shiftKey) setActive(r.i, col, { range: true });
    else if (e.ctrlKey || e.metaKey) setActive(r.i, col, { toggle: true });
    else setActive(r.i, col);
    pane.focus({ preventScroll: true });
    e.preventDefault();
  }
  function onDblClick(e) {
    const r = rowOf(e); if (!r) return;
    const td = e.target.closest('td'); const col = td && td.dataset.col;
    if (e.target.dataset.act === 'toggle') return;
    if (!col || col === 'id' || col === 'ind' || col === 'wbs') { App.openTaskDialog(r.id); return; }
    startEdit(r.i, col);
  }
  function onContext(e) {
    const r = rowOf(e); e.preventDefault();
    if (r && !Store.selection.includes(r.id)) setActive(r.i, (e.target.closest('td') || {}).dataset?.col || 'name');
    App.showContextMenu(e.clientX, e.clientY, r ? r.id : null);
  }
  function onHeadDown(e) {
    const rz = e.target.closest('.resizer'); if (!rz) return;
    e.preventDefault();
    const key = rz.dataset.col, th = rz.parentElement, sx = e.clientX, sw = th.offsetWidth;
    const move = ev => { th.style.width = Math.max(30, sw + ev.clientX - sx) + 'px'; };
    const up = ev => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); widths[key] = Math.max(30, sw + ev.clientX - sx); Store.setPref('colw', widths); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  }

  // ---------- edición ----------
  function startEdit(i, col, initialText) {
    const { project, computed } = Store; const t = project.tasks[i]; if (!t) return;
    const sum = computed.outline.isSummary[i];
    const def = COLS.find(c => c.key === col); if (!def || !def.edit) return;
    if (sum && !['name', 'resources', 'notes', 'deadline'].includes(col)) { App.toast('Ese valor se calcula a partir de las subtareas'); return; }
    const tr = body.querySelector(`tr[data-i="${i}"]`); const td = tr && tr.querySelector(`td[data-col="${col}"]`); if (!td) return;
    const resNames = () => t.resources.map(id => (project.resources.find(r => r.id === id) || {}).name).filter(Boolean).join(', ');
    const initial = { name: t.name, duration: t.milestone ? 0 : t.duration, start: U.fmt(computed.C[i].es), finish: U.fmt(computed.C[i].ef), preds: predsToText(t), resources: resNames(), progress: t.progress || 0, deadline: t.deadline ? U.fmt(U.toDay(t.deadline)) : '', notes: t.notes || '' }[col];
    const inp = document.createElement('input'); inp.className = 'inline'; inp.value = initialText != null ? initialText : initial;
    if (col === 'resources') { inp.setAttribute('list', 'resList'); ensureResList(); }
    td.innerHTML = ''; td.appendChild(inp); inp.focus();
    if (initialText == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
    editing = { i, col };
    let done = false;
    const finish = (commit, then) => {
      if (done) return; done = true; editing = null;
      if (commit && inp.value !== String(initial)) applyEdit(i, col, inp.value); else App.refresh();
      if (then) then();
    };
    inp.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true, () => moveActive(ev.shiftKey ? -1 : 1, 0)); }
      else if (ev.key === 'Escape') finish(false);
      else if (ev.key === 'Tab') { ev.preventDefault(); finish(true, () => moveActive(0, ev.shiftKey ? -1 : 1)); }
    });
    inp.addEventListener('blur', () => finish(true));
  }
  function ensureResList() {
    let dl = document.getElementById('resList');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'resList'; document.body.appendChild(dl); }
    dl.innerHTML = Store.project.resources.map(r => `<option value="${U.esc(r.name)}">`).join('');
  }
  function applyEdit(i, col, value) {
    const { computed } = Store; const c = computed.C[i]; const cal = c.cal || computed.cal;
    value = String(value).trim();
    Store.mutate(p => {
      const t = p.tasks[i];
      switch (col) {
        case 'name': if (value) t.name = value; break;
        case 'duration': { const d = parseInt(value, 10); if (!isNaN(d) && d >= 0) { t.duration = d; t.milestone = d === 0; } break; }
        case 'start': { const d = U.parseUserDate(value); if (d != null) t.constraint = { type: 'SNET', date: U.fromDay(cal.next(d)) }; break; }
        case 'finish': { const d = U.parseUserDate(value); if (d != null) { const nd = cal.duration(c.es, cal.prev(d)); if (nd >= 1) { t.duration = nd; t.milestone = false; } else { t.duration = 0; t.milestone = true; } } break; }
        case 'preds': { const r = parsePreds(value, i); t.predecessors = r.preds; if (r.errors.length) App.toast('Predecesoras no reconocidas: ' + r.errors.join(', ')); break; }
        case 'resources': {
          const names = value.split(/[;,]/).map(s => s.trim()).filter(Boolean); t.resources = [];
          for (const nm of names) { let r = p.resources.find(x => x.name.toLowerCase() === nm.toLowerCase()); if (!r) { r = Store.newResource({ name: nm }); r.color = U.PALETTE[p.resources.length % U.PALETTE.length]; p.resources.push(r); } t.resources.push(r.id); }
          break;
        }
        case 'progress': { const v = parseInt(value, 10); if (!isNaN(v)) t.progress = U.clamp(v, 0, 100); break; }
        case 'deadline': { if (!value) t.deadline = null; else { const d = U.parseUserDate(value); if (d != null) t.deadline = U.fromDay(d); } break; }
        case 'notes': t.notes = value; break;
      }
    });
  }

  // ---------- navegación ----------
  function moveActive(dr, dc) {
    const rows = rowsCache; if (!rows.length) return;
    let k = rows.indexOf(active.i); if (k < 0) k = 0;
    const cs = cols().filter(c => !c.fixed).map(c => c.key);
    let ci = cs.indexOf(active.col); if (ci < 0) ci = 0;
    k = U.clamp(k + dr, 0, rows.length - 1); ci = U.clamp(ci + dc, 0, cs.length - 1);
    setActive(rows[k], cs[ci]);
  }
  function editActive(initialText) { if (active.i >= 0) startEdit(active.i, active.col, initialText); }
  function scrollToRow(i) { const tr = body.querySelector(`tr[data-i="${i}"]`); if (tr) tr.scrollIntoView({ block: 'nearest' }); }

  return { COLS, init, render, renderHead, updateSelection, setActive, moveActive, editActive, startEdit, predsToText, linkText, parsePreds, scrollToRow, cols, setVisible, resetCols, get visible() { return visible; }, get active() { return active; }, get isEditing() { return !!editing; }, CONS_LABEL, PRIO };
})();
