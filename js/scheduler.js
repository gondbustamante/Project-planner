/* Motor de planificación: esquema (WBS), paso adelante/atrás (CPM), holguras y ruta crítica */
const Scheduler = (() => {
  const LINK_TYPES = ['FS', 'SS', 'FF', 'SF'];

  /** Construye la jerarquía a partir del nivel de esquema de cada tarea (normalizando niveles inválidos). */
  function outline(tasks) {
    const n = tasks.length;
    const parent = new Array(n).fill(-1);
    const children = Array.from({ length: n }, () => []);
    const isSummary = new Array(n).fill(false);
    const wbs = new Array(n);
    const stack = [], counters = [];
    for (let i = 0; i < n; i++) {
      const t = tasks[i];
      let lvl = Math.max(1, t.level | 0);
      lvl = i === 0 ? 1 : Math.min(lvl, tasks[i - 1].level + 1);
      t.level = lvl;
      while (stack.length && tasks[stack[stack.length - 1]].level >= lvl) stack.pop();
      if (stack.length) { const p = stack[stack.length - 1]; parent[i] = p; children[p].push(i); isSummary[p] = true; }
      stack.push(i);
      counters.length = lvl; counters[lvl - 1] = (counters[lvl - 1] || 0) + 1;
      wbs[i] = counters.join('.');
    }
    return { parent, children, isSummary, wbs };
  }

  function dur(t) { return t.milestone ? 0 : Math.max(0, Math.round(+t.duration || 0)); }

  function compute(project) {
    const tasks = project.tasks;
    const n = tasks.length;
    const cal = new WorkCalendar(project.calendar.workDays, project.calendar.exceptions);
    const ol = outline(tasks);
    // Calendarios por tarea: intersección de los calendarios personales de los responsables asignados.
    // Un calendario personal parte del calendario del proyecto y sus propias excepciones prevalecen (como en Project).
    const resCal = new Map();
    for (const r of project.resources) {
      if (!r.calendar) continue;
      resCal.set(r.id, new WorkCalendar(r.calendar.workDays && r.calendar.workDays.length ? r.calendar.workDays : project.calendar.workDays, [...(project.calendar.exceptions || []), ...(r.calendar.exceptions || [])]));
    }
    const calCache = new Map();
    const calendarWarn = new Array(tasks.length).fill(null);
    const calFor = i => {
      const t = tasks[i];
      const ids = t.ignoreResourceCalendars ? [] : (t.resources || []).filter(id => resCal.has(id)).sort();
      if (!ids.length) return cal;
      const key = ids.join('|');
      if (!calCache.has(key)) {
        const comp = new CompositeCalendar(ids.map(id => resCal.get(id)));
        calCache.set(key, comp.hasWorkDays ? comp : null);
      }
      const c = calCache.get(key);
      if (!c) { calendarWarn[i] = 'Los calendarios de los responsables no comparten ningún día laborable; se usa el del proyecto'; return cal; }
      return c;
    };
    const idx = new Map(tasks.map((t, i) => [t.id, i]));
    const projStart = cal.next(U.toDay(project.start) ?? U.today());

    // Saneado de predecesoras: eliminar referencias rotas, a sí misma y duplicadas
    tasks.forEach(t => {
      const seen = new Set();
      t.predecessors = (t.predecessors || []).filter(p => {
        if (!idx.has(p.id) || p.id === t.id || seen.has(p.id)) return false;
        seen.add(p.id); if (!LINK_TYPES.includes(p.type)) p.type = 'FS'; p.lag = Math.round(+p.lag || 0); return true;
      });
    });

    const leavesOf = i => ol.isSummary[i] ? ol.children[i].flatMap(leavesOf) : [i];
    const ancestors = i => { const a = []; let p = ol.parent[i]; while (p >= 0) { a.push(p); p = ol.parent[p]; } return a; };

    // Grafo para orden topológico: hijo -> padre, predecesora -> sucesora (y -> hojas de la sucesora)
    const adj = Array.from({ length: n }, () => new Set());
    const indeg = new Array(n).fill(0);
    const addEdge = (a, b) => { if (a !== b && !adj[a].has(b)) { adj[a].add(b); indeg[b]++; } };
    for (let i = 0; i < n; i++) {
      if (ol.parent[i] >= 0) addEdge(i, ol.parent[i]);
      for (const p of tasks[i].predecessors) {
        const pi = idx.get(p.id);
        addEdge(pi, i);
        for (const l of leavesOf(i)) addEdge(pi, l);
      }
    }
    // Detección de ciclos: se podan fuentes y sumideros; lo que queda forma ciclos
    const inCycle = (() => {
      const alive = new Set([...Array(n).keys()]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const i of [...alive]) {
          const hasIn = [...alive].some(a => a !== i && adj[a].has(i));
          const hasOut = [...adj[i]].some(b => alive.has(b));
          if (!hasIn || !hasOut) { alive.delete(i); changed = true; }
        }
      }
      return alive;
    })();
    // Orden topológico ignorando las aristas que entran en tareas en ciclo
    const deg = new Array(n).fill(0);
    for (let a = 0; a < n; a++) for (const b of adj[a]) if (!inCycle.has(b)) deg[b]++;
    const order = [], q = [];
    for (let i = 0; i < n; i++) if (!deg[i]) q.push(i);
    while (q.length) { const a = q.shift(); order.push(a); for (const b of adj[a]) if (!inCycle.has(b) && --deg[b] === 0) q.push(b); }
    for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);

    const C = tasks.map(() => ({ es: null, ef: null, ls: null, lf: null, slack: 0, critical: false, error: null }));
    const finishOf = (s, d, c = cal) => d <= 0 ? s : c.add(s, d - 1);
    const back = d => -(Math.max(d, 1) - 1);

    const aggregate = i => {
      const kids = ol.children[i].filter(k => C[k].es != null);
      if (!kids.length) return;
      C[i].es = Math.min(...kids.map(k => C[k].es));
      C[i].ef = Math.max(...kids.map(k => C[k].ef));
    };

    // ---- Paso adelante ----
    for (const i of order) {
      const t = tasks[i], c = C[i];
      if (ol.isSummary[i]) { aggregate(i); continue; }
      const d = dur(t);
      const tc = calFor(i);
      let es = projStart;
      const cyc = inCycle.has(i);
      if (!cyc) {
        const deps = [t, ...ancestors(i).map(a => tasks[a])].flatMap(x => x.predecessors);
        for (const p of deps) {
          const pc = C[idx.get(p.id)];
          if (pc.es == null) continue;
          const lag = p.lag | 0;
          let b;
          // Los vínculos se evalúan con el calendario de la sucesora (como en Project)
          switch (p.type) {
            case 'SS': b = tc.add(tc.next(pc.es), lag); break;
            case 'FF': b = tc.add(tc.add(tc.next(pc.ef), lag), back(d)); break;
            case 'SF': b = tc.add(tc.add(tc.next(pc.es), lag - 1), back(d)); break;
            default: b = tc.add(tc.next(pc.ef + 1), lag);
          }
          if (b > es) es = b;
        }
      }
      const cons = t.constraint || { type: 'ASAP' };
      const cd = cons.date ? U.toDay(cons.date) : null;
      if (cons.type === 'SNET' && cd != null) es = Math.max(es, cd);
      if (cons.type === 'MSO' && cd != null) es = cd;
      es = tc.next(es);
      c.es = es; c.ef = finishOf(es, d, tc); c.cal = tc;
      c.error = cyc ? 'Dependencia circular' : calendarWarn[i];
    }
    // Resúmenes de abajo arriba (por si algún hijo quedó fuera de orden)
    const byLevelDesc = [...Array(n).keys()].filter(i => ol.isSummary[i]).sort((a, b) => tasks[b].level - tasks[a].level);
    for (const i of byLevelDesc) aggregate(i);
    for (let i = 0; i < n; i++) if (C[i].es == null) { C[i].es = projStart; C[i].ef = projStart; }

    const projFinish = Math.max(projStart, ...C.map(c => c.ef));

    // ---- Paso atrás (solo hojas; las restricciones a resúmenes se propagan a sus hojas) ----
    const succs = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) for (const p of tasks[i].predecessors) succs[idx.get(p.id)].push({ si: i, type: p.type, lag: p.lag | 0 });
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k];
      if (ol.isSummary[i]) continue;
      const t = tasks[i], c = C[i], d = dur(t), tc = c.cal || cal;
      let lf = projFinish;
      if (!inCycle.has(i)) {
        for (const a of [i, ...ancestors(i)]) {
          for (const s of succs[a]) {
            for (const l of leavesOf(s.si)) {
              const sc = C[l];
              if (sc.ls == null) continue;
              let b;
              const scal = sc.cal || cal; // inversa exacta de las fórmulas del paso adelante
              switch (s.type) {
                case 'SS': b = finishOf(tc.prev(scal.add(sc.ls, -s.lag)), d, tc); break;
                case 'FF': b = tc.prev(scal.add(sc.lf, -s.lag)); break;
                case 'SF': b = finishOf(tc.prev(scal.add(sc.lf, 1 - s.lag)), d, tc); break;
                default: b = tc.prev(scal.add(sc.ls, -s.lag) - 1);
              }
              if (b < lf) lf = b;
            }
          }
        }
      }
      c.lf = tc.prev(lf);
      c.ls = d <= 0 ? c.lf : tc.add(c.lf, -(d - 1));
      c.slack = tc.count(c.es, c.ls);
      c.critical = c.slack <= 0;
    }
    for (const i of byLevelDesc) {
      const kids = ol.children[i];
      C[i].ls = Math.min(...kids.map(k => C[k].ls));
      C[i].lf = Math.max(...kids.map(k => C[k].lf));
      C[i].slack = Math.min(...kids.map(k => C[k].slack));
      C[i].critical = kids.some(k => C[k].critical);
      C[i].error = kids.some(k => C[k].error) ? 'Contiene dependencias circulares' : null;
    }

    // ---- Volcado a las tareas (fechas visibles, duración y avance de resúmenes) ----
    for (let i = 0; i < n; i++) {
      const t = tasks[i], c = C[i];
      t.start = U.fromDay(c.es); t.finish = U.fromDay(c.ef);
      if (ol.isSummary[i]) {
        t.milestone = false;
        t.duration = cal.duration(c.es, c.ef);
        const kids = leavesOf(i);
        const w = kids.reduce((s, k) => s + Math.max(dur(tasks[k]), 1), 0);
        t.progress = Math.round(kids.reduce((s, k) => s + (+tasks[k].progress || 0) * Math.max(dur(tasks[k]), 1), 0) / (w || 1));
      } else if (t.milestone) { t.duration = 0; }
    }

    return { C, outline: ol, cal, projStart, projFinish, idx, leavesOf, ancestors,
      duration: cal.duration(projStart, projFinish), errors: C.filter(c => c.error).length };
  }

  return { compute, outline, LINK_TYPES, dur };
})();
