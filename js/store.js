/* Estado de la aplicación: proyecto, selección, deshacer/rehacer y persistencia local */
const Store = (() => {
  const KEY = 'planner.project.v1';
  let project = null, computed = null;
  const undoStack = [], redoStack = [], listeners = [];
  let selection = [];
  let anchor = null;

  function newTask(o = {}) {
    return {
      id: U.uid(), name: o.name ?? 'Nueva tarea', level: o.level ?? 1, duration: o.duration ?? (o.milestone ? 0 : 5),
      milestone: !!o.milestone, progress: o.progress ?? 0, predecessors: o.predecessors ?? [], resources: o.resources ?? [],
      constraint: o.constraint ?? { type: 'ASAP', date: null }, notes: o.notes ?? '', collapsed: false, baselines: o.baselines ?? {}, ignoreResourceCalendars: !!o.ignoreResourceCalendars, deadline: o.deadline ?? null, priority: o.priority ?? 500,
      manual: !!o.manual, manualStart: o.manualStart ?? null, start: null, finish: null
    };
  }
  function newResource(o = {}) {
    return { id: U.uid(), name: o.name ?? 'Responsable', role: o.role ?? '', color: o.color ?? U.PALETTE[(project ? project.resources.length : 0) % U.PALETTE.length], calendar: o.calendar ?? null };
  }
  function blank(name) {
    return { version: 2, id: U.uid(), name: name || 'Nuevo proyecto', start: U.fromDay(U.today()), statusDate: null, statusComment: '', notes: '', calendar: { workDays: [1, 2, 3, 4, 5], exceptions: [] }, newTasksManual: false, resources: [], tasks: [], baselines: {}, modified: Date.now() };
  }
  function normalize(p) {
    const b = blank();
    p = Object.assign(b, p || {});
    p.calendar = normalizeCalendar(p.calendar, true);
    if (!Array.isArray(p.resources)) p.resources = [];
    if (!Array.isArray(p.tasks)) p.tasks = [];
    p.resources = p.resources.map(r => { const x = Object.assign(newResource(), r); x.calendar = x.calendar ? normalizeCalendar(x.calendar, false) : null; return x; });
    p.tasks = p.tasks.map(t => {
      const x = Object.assign(newTask(), t);
      // Migración: una única línea base (formato anterior) pasa a ser la «Línea base» (número 0)
      if (!x.baselines || typeof x.baselines !== 'object') x.baselines = {};
      if (x.baseline && !x.baselines[0]) x.baselines[0] = x.baseline;
      delete x.baseline;
      x.manual = !!x.manual; if (U.toDay(x.manualStart) == null) x.manualStart = null;
      return x;
    });
    p.newTasksManual = !!p.newTasksManual;
    if (!p.baselines || typeof p.baselines !== 'object') p.baselines = {};
    if (p.baselineDate && !p.baselines[0]) p.baselines[0] = { date: p.baselineDate };
    delete p.baselineDate;
    // Si hay datos de una línea base pero no su registro, se crea
    for (const t of p.tasks) for (const k of Object.keys(t.baselines)) if (!p.baselines[k]) p.baselines[k] = { date: null };
    if (U.toDay(p.start) == null) p.start = U.fromDay(U.today());
    if (!p.id) p.id = U.uid();
    p.timeline = normalizeTimeline(p.timeline, p.tasks);
    return p;
  }

  /** Configuración de la escala de tiempo: rango y unidad del eje, reglas automáticas, elección por tarea (mostrar, color, texto) y etiquetas libres */
  function normalizeTimeline(tl, tasks) {
    const hex = c => /^#[0-9a-f]{6}$/i.test(c || '');
    tl = Object.assign({ range: 'auto', start: null, finish: null, unit: 'auto', autoPhases: true, autoMilestones: true, showToday: true, showDates: true, showProgress: true, items: {}, labels: [] }, tl && typeof tl === 'object' ? tl : {});
    if (tl.range !== 'custom') tl.range = 'auto';
    tl.start = U.toDay(tl.start) == null ? null : U.fromDay(U.toDay(tl.start));
    tl.finish = U.toDay(tl.finish) == null ? null : U.fromDay(U.toDay(tl.finish));
    for (const k of ['autoPhases', 'autoMilestones', 'showToday', 'showDates', 'showProgress']) tl[k] = !!tl[k];
    const ids = new Set(tasks.map(t => t.id)); const items = {};
    for (const [id, it] of Object.entries(tl.items || {})) {
      if (!ids.has(id) || !it || typeof it !== 'object') continue;
      const x = {}; if (typeof it.show === 'boolean') x.show = it.show; if (hex(it.color)) x.color = it.color; if (it.label) x.label = String(it.label);
      if (Object.keys(x).length) items[id] = x;
    }
    tl.items = items;
    tl.labels = (Array.isArray(tl.labels) ? tl.labels : []).filter(l => l && U.toDay(l.date) != null && String(l.text || '').trim())
      .map(l => ({ id: l.id || U.uid(), date: U.fromDay(U.toDay(l.date)), text: String(l.text).trim(), color: hex(l.color) ? l.color : '#0f766e' }));
    return tl;
  }

  /** Normaliza un calendario: {workDays, exceptions:[{from,to,name,working}]}. Acepta el formato antiguo (holidays: ['AAAA-MM-DD']). */
  function normalizeCalendar(c, isProject) {
    c = c || {};
    const wd = Array.isArray(c.workDays) ? c.workDays.map(Number).filter(d => d >= 0 && d <= 6) : null;
    const ex = WorkCalendar.normalizeExceptions([...(c.exceptions || []), ...(c.holidays || [])]);
    return { workDays: wd && wd.length ? [...new Set(wd)].sort() : (isProject ? [1, 2, 3, 4, 5] : null), exceptions: ex };
  }

  function sample() {
    const p = blank('Lanzamiento producto X');
    project = p;
    const r = (name, role) => { const x = newResource({ name, role }); p.resources.push(x); return x.id; };
    p.calendar.exceptions = [{ from: '2026-11-02', to: '2026-11-02', name: 'Todos los Santos (traslado)', working: false }, { from: '2026-12-07', to: '2026-12-08', name: 'Puente de la Constitución', working: false }, { from: '2026-12-24', to: '2026-12-25', name: 'Navidad', working: false }];
    const ana = r('Ana López', 'PM'), luis = r('Luis Pérez', 'Diseño'), marta = r('Marta Ruiz', 'Desarrollo'), jon = r('Jon Etxeberria', 'QA'), sara = r('Sara Gómez', 'Marketing');
    p.resources[1].calendar = { workDays: null, exceptions: [{ from: '2026-11-16', to: '2026-11-20', name: 'Vacaciones', working: false }] };
    p.resources[2].calendar = { workDays: [1, 2, 3, 4], exceptions: [] };
    const T = [];
    const add = (name, level, duration, opts = {}) => { const t = newTask({ name, level, duration, ...opts }); p.tasks.push(t); T.push(t); return t; };
    const fs = (...ids) => ids.map(i => ({ id: T[i].id, type: 'FS', lag: 0 }));
    add('Fase 1 · Definición', 1, 0);
    add('Kick-off del proyecto', 2, 0, { milestone: true, resources: [ana] });
    add('Recogida de requisitos', 2, 5, { predecessors: fs(1), resources: [ana], progress: 100 });
    add('Análisis de viabilidad', 2, 4, { predecessors: fs(2), resources: [ana, marta], progress: 60 });
    add('Aprobación del alcance', 2, 0, { milestone: true, predecessors: fs(3) });
    add('Fase 2 · Diseño', 1, 0);
    add('Diseño UX', 2, 8, { predecessors: fs(4), resources: [luis] });
    add('Diseño visual', 2, 6, { predecessors: [{ id: T[6].id, type: 'SS', lag: 3 }], resources: [luis] });
    add('Arquitectura técnica', 2, 5, { predecessors: fs(4), resources: [marta] });
    add('Fase 3 · Desarrollo', 1, 0);
    add('Backend', 2, 15, { predecessors: fs(8), resources: [marta] });
    add('Frontend', 2, 12, { predecessors: fs(7, 8), resources: [marta] });
    add('Integración', 2, 4, { predecessors: fs(10, 11), resources: [marta] });
    add('Fase 4 · Pruebas y lanzamiento', 1, 0);
    add('Pruebas QA', 2, 6, { predecessors: fs(12), resources: [jon] });
    add('Corrección de incidencias', 2, 4, { predecessors: fs(14), resources: [marta, jon] });
    add('Plan de comunicación', 2, 10, { predecessors: fs(4), resources: [sara] });
    add('Lanzamiento', 2, 0, { milestone: true, predecessors: fs(15, 16), deadline: '2027-01-29', notes: 'Fecha comprometida con Dirección.' });
    T[2].notes = 'Entrevistas con los 5 clientes clave y el equipo de soporte.';
    p.timeline = normalizeTimeline({ labels: [{ date: '2026-12-15', text: 'Demo a clientes', color: '#0f766e' }] }, p.tasks);
    return p;
  }

  // ---- persistencia multi-proyecto ----
  const LIB = 'planner.projects.v2';
  let library = { current: null, items: {} };
  function readLib() { try { const s = localStorage.getItem(LIB); if (s) library = JSON.parse(s); } catch (e) { /* vacío */ } if (!library.items) library.items = {}; }
  function recompute() { computed = Scheduler.compute(project); }
  function save() {
    project.modified = Date.now();
    library.items[project.id] = project; library.current = project.id;
    try { localStorage.setItem(LIB, JSON.stringify(library)); saved = true; } catch (e) { saved = false; }
  }
  let saved = true;
  function load() {
    readLib();
    let p = null;
    if (library.current && library.items[library.current]) p = library.items[library.current];
    else {
      try { const s = localStorage.getItem(KEY); if (s) { p = JSON.parse(s); localStorage.removeItem(KEY); } } catch (e) { /* ignorar */ }
    }
    project = p ? normalize(p) : sample();
    if (!p) { recompute(); save(); }
    recompute();
  }
  /** Lista de proyectos guardados (resumen) */
  function listProjects() {
    return Object.values(library.items).map(p => ({ id: p.id, name: p.name, start: p.start, tasks: (p.tasks || []).length, modified: p.modified || 0, finish: (p.tasks || []).reduce((m, t) => t.finish > m ? t.finish : m, p.start) })).sort((a, b) => b.modified - a.modified);
  }
  function openProject(id) { const p = library.items[id]; if (!p) return false; undoStack.length = 0; redoStack.length = 0; selection = []; project = normalize(p); recompute(); save(); emit(); return true; }
  function deleteProject(id) { delete library.items[id]; if (library.current === id) library.current = null; try { localStorage.setItem(LIB, JSON.stringify(library)); } catch (e) { /* */ } }
  function createProject(p) { undoStack.length = 0; redoStack.length = 0; selection = []; project = normalize(p || blank()); if (!p) project.id = U.uid(); recompute(); save(); emit(); }
  // ---- preferencias de vista (columnas, zoom…) ----
  const PREF = 'planner.prefs.v1';
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) { prefs = {}; }
  function setPref(k, v) { prefs[k] = v; try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) { /* */ } }
  function getPref(k, d) { return prefs[k] === undefined ? d : prefs[k]; }
  function emit(type = 'data') { listeners.forEach(f => f(type)); }
  function subscribe(f) { listeners.push(f); }

  function snapshot() { return JSON.stringify(project); }
  /** Aplica una mutación con registro de deshacer. fn puede devolver un proyecto nuevo. */
  function mutate(fn) {
    undoStack.push(snapshot()); if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    const r = fn(project);
    if (r && typeof r === 'object') project = normalize(r);
    recompute(); save(); emit();
  }
  function undo() { if (!undoStack.length) return false; redoStack.push(snapshot()); project = normalize(JSON.parse(undoStack.pop())); recompute(); save(); emit(); return true; }
  function redo() { if (!redoStack.length) return false; undoStack.push(snapshot()); project = normalize(JSON.parse(redoStack.pop())); recompute(); save(); emit(); return true; }

  // ---- selección ----
  function select(ids, opts = {}) {
    ids = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    if (opts.toggle) { ids.forEach(id => { const k = selection.indexOf(id); if (k >= 0) selection.splice(k, 1); else selection.push(id); }); }
    else if (opts.add) { ids.forEach(id => { if (!selection.includes(id)) selection.push(id); }); }
    else selection = ids.slice();
    if (ids.length && !opts.keepAnchor) anchor = ids[ids.length - 1];
    emit('selection');
  }
  function selectRange(toId) {
    const tasks = project.tasks;
    const a = tasks.findIndex(t => t.id === anchor), b = tasks.findIndex(t => t.id === toId);
    if (a < 0 || b < 0) return select(toId);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    selection = tasks.slice(lo, hi + 1).map(t => t.id);
    emit('selection');
  }
  const selectedIndices = () => selection.map(id => project.tasks.findIndex(t => t.id === id)).filter(i => i >= 0).sort((a, b) => a - b);
  const taskById = id => project.tasks.find(t => t.id === id);
  const indexOf = id => project.tasks.findIndex(t => t.id === id);

  // ---- utilidades de esquema ----
  /** Índice final (exclusivo) del bloque formado por la tarea i y sus descendientes */
  function blockEnd(i) { const tasks = project.tasks; let j = i + 1; while (j < tasks.length && tasks[j].level > tasks[i].level) j++; return j; }
  function isAncestor(a, b) { const ol = computed.outline; let p = ol.parent[b]; while (p >= 0) { if (p === a) return true; p = ol.parent[p]; } return false; }

  // ---- líneas base (0 = «Línea base», 1..10 = «Línea base 1»…«Línea base 10», como en Project) ----
  const BL = {
    MAX: 10,
    COLORS: ['#9ca3af', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#a16207'],
    name: k => +k === 0 ? 'Línea base' : `Línea base ${k}`,
    short: k => +k === 0 ? 'LB' : `LB${k}`,
    saved: () => Object.keys(project.baselines || {}).map(Number).sort((a, b) => a - b),
    of: (t, k) => (t.baselines && t.baselines[k]) || null,
  };

  return {
    BL,
    get project() { return project; }, get computed() { return computed; }, get selection() { return selection; },
    get canUndo() { return undoStack.length > 0; }, get canRedo() { return redoStack.length > 0; }, get saved() { return saved; },
    listProjects, openProject, deleteProject, createProject, setPref, getPref,
    newTask, newResource, blank, normalize, normalizeCalendar, normalizeTimeline, sample, load, save, recompute, mutate, undo, redo, subscribe, emit,
    select, selectRange, selectedIndices, taskById, indexOf, blockEnd, isAncestor
  };
})();
