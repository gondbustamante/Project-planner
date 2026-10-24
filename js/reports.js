/* Informes: resumen del proyecto, estado para dirección, críticas, retrasadas, próximas, hitos, recursos y variación de línea base */
const Reports = (() => {
  const TYPES = [
    { key: 'overview', label: 'Resumen del proyecto', ico: '📊' },
    { key: 'status', label: 'Informe de estado', ico: '🚦' },
    { key: 'critical', label: 'Tareas críticas', ico: '🔥' },
    { key: 'late', label: 'Tareas retrasadas', ico: '⏰' },
    { key: 'upcoming', label: 'Próximas tareas', ico: '📆' },
    { key: 'milestones', label: 'Hitos', ico: '◆' },
    { key: 'resources', label: 'Carga de recursos', ico: '👥' },
    { key: 'variance', label: 'Variación frente a línea base', ico: '📐' },
  ];
  // Colores: estados (paleta de estado fija, siempre con icono y etiqueta) y series (paleta categórica)
  const ST = {
    done: { c: '#0ca30c', ico: '✔', label: 'Completada' },
    progress: { c: '#2a78d6', ico: '▶', label: 'En curso' },
    notstarted: { c: '#c3c2b7', ico: '○', label: 'No iniciada' },
    late: { c: '#d03b3b', ico: '⚠', label: 'Retrasada' },
  };
  const SERIES = { plan: '#2a78d6', base: '#eb6834', real: '#0b0b0b' };
  const RAG = { green: { c: '#0ca30c', label: 'En plazo', ico: '●' }, amber: { c: '#fab219', label: 'En riesgo', ico: '▲' }, red: { c: '#d03b3b', label: 'Fuera de plazo', ico: '■' } };

  let current = 'overview';
  const opts = { days: 14, resource: '' };
  let el, bodyEl;

  // ---------- datos ----------
  function ctx() {
    const p = Store.project, cp = Store.computed, C = cp.C, ol = cp.outline, cal = cp.cal;
    const sd = p.statusDate ? U.toDay(p.statusDate) : U.today();
    const resById = new Map(p.resources.map(r => [r.id, r]));
    const leaves = p.tasks.map((t, i) => i).filter(i => !ol.isSummary[i]);
    const inFilter = i => !opts.resource || p.tasks[i].resources.includes(opts.resource);
    const weight = i => Math.max(Scheduler.dur(p.tasks[i]), 1);
    const expected = (i, d = sd) => {
      const t = p.tasks[i], c = C[i], tc = c.cal || cal;
      if (t.milestone) return d >= c.es ? 100 : 0;
      if (d < c.es) return 0; if (d >= c.ef) return 100;
      return U.clamp(Math.round(tc.count(c.es, d + 1) / Math.max(t.duration, 1) * 100), 0, 100);
    };
    const blk = App.options.blCompare || 0;
    const blOf = i => Store.BL.of(p.tasks[i], blk);
    const expectedBL = (i, d) => {
      const b = blOf(i); if (!b) return null; const bs = U.toDay(b.start), bf = U.toDay(b.finish);
      if (d < bs) return 0; if (d >= bf) return 100; const tot = Math.max(cal.duration(bs, bf), 1);
      return U.clamp(Math.round(cal.count(bs, d + 1) / tot * 100), 0, 100);
    };
    const pct = i => U.clamp(p.tasks[i].progress | 0, 0, 100);
    const state = i => { const pr = pct(i); if (pr >= 100) return 'done'; if (expected(i) > pr) return 'late'; return pr > 0 ? 'progress' : 'notstarted'; };
    const daysOverdue = i => { const c = C[i]; if (pct(i) >= 100 || c.ef >= sd) return 0; return (c.cal || cal).count(c.ef + 1, sd + 1); };
    const wavg = (idx, f) => { let s = 0, w = 0; for (const i of idx) { const v = f(i); if (v == null) continue; s += v * weight(i); w += weight(i); } return w ? Math.round(s / w) : 0; };
    const varDays = (a, b) => b >= a ? cal.count(a, b) : -cal.count(b, a);
    const names = i => p.tasks[i].resources.map(id => (resById.get(id) || {}).name).filter(Boolean).join(', ');
    return { p, cp, C, ol, cal, sd, resById, leaves, inFilter, weight, expected, expectedBL, blk, blOf, pct, state, daysOverdue, wavg, varDays, names };
  }

  function health(x) {
    const { p, cp, leaves, cal } = x;
    const actual = x.wavg(leaves, x.pct), planned = x.wavg(leaves, i => x.expected(i));
    const late = leaves.filter(i => x.state(i) === 'late');
    const missed = p.tasks.filter((t, i) => x.C[i].deadlineMissed);
    const loads = ResourceView.loads();
    const over = p.resources.filter(r => { const l = loads.get(r.id); return l && [...l.days.values()].some(v => v > 1); });
    const withBl = leaves.filter(i => x.blOf(i));
    let finishVar = null, blFinish = null;
    if (withBl.length) { blFinish = Math.max(...withBl.map(i => U.toDay(x.blOf(i).finish))); finishVar = x.varDays(blFinish, cp.projFinish); }
    const reasons = [];
    if (missed.length) reasons.push(`${missed.length} fecha(s) límite superada(s)`);
    if (finishVar != null && finishVar > 0) reasons.push(`El fin previsto se retrasa ${finishVar} día(s) laborable(s) respecto a ${Store.BL.name(x.blk)}`);
    if (planned - actual > 0) reasons.push(`Avance real ${actual}% frente a ${planned}% planificado a la fecha de estado`);
    if (late.length) reasons.push(`${late.length} tarea(s) retrasada(s), ${late.filter(i => x.C[i].critical).length} de ellas crítica(s)`);
    if (over.length) reasons.push(`${over.length} responsable(s) sobreasignado(s): ${over.map(r => r.name).join(', ')}`);
    if (cp.errors) reasons.push(`${cp.errors} tarea(s) con dependencias circulares`);
    let rag = 'green';
    if (missed.length || (finishVar != null && finishVar > 5) || planned - actual > 15) rag = 'red';
    else if ((finishVar != null && finishVar > 0) || planned - actual > 5 || late.length || over.length) rag = 'amber';
    return { actual, planned, late, missed, over, finishVar, blFinish, rag, reasons, loads };
  }

  // ---------- piezas HTML ----------
  const esc = U.esc;
  const kpi = (label, value, sub, tone) => `<div class="kpi"><div class="kpi-l">${label}</div><div class="kpi-v"${tone ? ` style="color:${tone}"` : ''}>${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
  const badge = s => `<span class="badge"><span class="dot" style="background:${ST[s].c}"></span>${ST[s].ico} ${ST[s].label}</span>`;
  const section = (title, body, note) => `<section class="rsec"><h3>${title}</h3>${body}${note ? `<p class="rnote">${note}</p>` : ''}</section>`;
  const signed = v => v == null ? '' : `${v > 0 ? '▲ +' : v < 0 ? '▼ ' : '= '}${v} d`;
  function table(head, rows, empty = 'No hay elementos.') {
    if (!rows.length) return `<p class="rempty">${empty}</p>`;
    return `<table class="rtable"><thead><tr>${head.map(h => `<th${h.num ? ' class="num"' : ''}>${h.t || h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.id ? ` data-id="${r.id}"` : ''}${r.cls ? ` class="${r.cls}"` : ''}>${r.cells.map((c, k) => `<td${head[k] && head[k].num ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const taskName = (x, i) => `${x.C[i].critical && App.options.critical ? '<span class="crit" title="Crítica">●</span> ' : ''}${x.p.tasks[i].milestone ? '◆ ' : ''}${esc(x.p.tasks[i].name)}`;

  // ---------- gráficos SVG ----------
  /** Barra 100 % apilada con el reparto de tareas por estado (verde y rojo nunca adyacentes) */
  function statesBar(counts) {
    const order = ['done', 'progress', 'notstarted', 'late'];
    const total = order.reduce((s, k) => s + counts[k], 0) || 1, W = 600, H = 26, GAP = 2;
    let xx = 0, seg = '';
    const live = order.filter(k => counts[k]);
    live.forEach((k, n) => {
      const w = counts[k] / total * (W - GAP * (live.length - 1)); const r = 4;
      const first = n === 0, last = n === live.length - 1;
      seg += `<path d="M${xx + (first ? r : 0)} 0 H${xx + w - (last ? r : 0)}${last ? ` Q${xx + w} 0 ${xx + w} ${r} V${H - r} Q${xx + w} ${H} ${xx + w - r} ${H}` : ` V${H}`} H${xx + (first ? r : 0)}${first ? ` Q${xx} ${H} ${xx} ${H - r} V${r} Q${xx} 0 ${xx + r} 0` : ` V0`} Z" fill="${ST[k].c}"><title>${ST[k].label}: ${counts[k]} tarea(s) (${Math.round(counts[k] / total * 100)}%)</title></path>`;
      xx += w + GAP;
    });
    const legend = order.map(k => `<span class="lg"><span class="sw" style="background:${ST[k].c}"></span>${ST[k].ico} ${ST[k].label} <b>${counts[k]}</b></span>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${seg}</svg><div class="legend">${legend}</div>`;
  }

  /** Curva S: % de avance acumulado planificado (programación actual), según línea base, y avance real a la fecha de estado */
  function sCurve(x) {
    const { cp, leaves, sd } = x;
    const lo = cp.projStart, hi = Math.max(cp.projFinish, lo + 7);
    const pts = []; for (let d = lo; d < hi + 7; d += 7) pts.push(Math.min(d, hi)); if (pts[pts.length - 1] !== hi) pts.push(hi);
    const plan = pts.map(d => x.wavg(leaves, i => x.expected(i, d)));
    const hasBl = leaves.some(i => x.blOf(i));
    const base = hasBl ? pts.map(d => x.wavg(leaves.filter(i => x.blOf(i)), i => x.expectedBL(i, d))) : null;
    const actual = x.wavg(leaves, x.pct);
    const W = 640, H = 230, L = 40, R = 12, T = 12, B = 28;
    const X = d => L + (d - lo) / Math.max(hi - lo, 1) * (W - L - R), Y = v => T + (100 - v) / 100 * (H - T - B);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de avance acumulado">`;
    for (const v of [0, 25, 50, 75, 100]) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e7e6e2"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${v}%</text>`;
    let d = lo, lastX = -100; while (d <= hi) { const pr = U.parts(d); const nm = Date.UTC(pr.y, pr.m + 1, 1) / U.MS; const tx = X(d) + 2; if (tx - lastX > 44 && tx < W - R - 20) { s += `<text x="${tx}" y="${H - 8}" class="ax">${U.MONTHS[pr.m]}${pr.m === 0 || d === lo ? ' ' + String(pr.y).slice(2) : ''}</text>`; lastX = tx; } d = nm; }
    const line = (vals, col, dash) => `<polyline fill="none" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round" points="${vals.map((v, k) => `${X(pts[k])},${Y(v)}`).join(' ')}"/>`;
    if (base) s += line(base, SERIES.base, true);
    s += line(plan, SERIES.plan);
    if (sd >= lo && sd <= hi) {
      s += `<line x1="${X(sd)}" x2="${X(sd)}" y1="${T}" y2="${H - B}" stroke="#52514e" stroke-dasharray="3 3"/><text x="${X(sd) + 4}" y="${T + 10}" class="ax">fecha de estado</text>`;
      s += `<circle cx="${X(sd)}" cy="${Y(actual)}" r="5" fill="${SERIES.real}" stroke="#fff" stroke-width="2"><title>Avance real a ${U.fmt(sd)}: ${actual}%</title></circle><text x="${X(sd) + 9}" y="${Y(actual) + 4}" class="lbl">Real ${actual}%</text>`;
    }
    // capa de lectura: una franja por semana con el detalle
    pts.forEach((p0, k) => { const a = k ? (X(pts[k - 1]) + X(p0)) / 2 : L, b = k < pts.length - 1 ? (X(p0) + X(pts[k + 1])) / 2 : W - R; s += `<rect x="${a}" y="${T}" width="${Math.max(b - a, 1)}" height="${H - T - B}" fill="transparent"><title>${U.fmt(p0)}\nPlanificado: ${plan[k]}%${base ? `\n${Store.BL.name(x.blk)}: ${base[k]}%` : ''}</title></rect>`; });
    s += '</svg>';
    const legend = `<div class="legend"><span class="lg"><span class="sw ln" style="background:${SERIES.plan}"></span>Planificado (programación actual)</span>${base ? `<span class="lg"><span class="sw ln dash" style="border-color:${SERIES.base}"></span>${Store.BL.name(x.blk)}</span>` : ''}<span class="lg"><span class="sw dotk"></span>Real a la fecha de estado</span></div>`;
    return s + legend;
  }

  /** Avance por fase: barra con % real y marca del % planificado */
  function phaseBars(x) {
    const { p, C } = x;
    const phases = p.tasks.map((t, i) => i).filter(i => p.tasks[i].level === 1 && x.ol.isSummary[i]);
    if (!phases.length) return '<p class="rempty">No hay fases (tareas de resumen de nivel 1).</p>';
    const rows = phases.map(i => {
      const kids = x.cp.leavesOf(i);
      const a = x.wavg(kids, x.pct), pl = x.wavg(kids, j => x.expected(j));
      return `<div class="hb" data-id="${p.tasks[i].id}"><div class="hb-name" title="${esc(p.tasks[i].name)}">${esc(p.tasks[i].name)}</div><div class="hb-track"><div class="hb-fill" style="width:${a}%;background:${SERIES.plan}" title="Real ${a}%"></div><div class="hb-mark" style="left:${pl}%" title="Planificado ${pl}%"></div></div><div class="hb-val">${a}% <span class="muted">· plan ${pl}%</span></div><div class="hb-dates muted">${U.fmt(C[i].es)} → ${U.fmt(C[i].ef)}</div></div>`;
    }).join('');
    return rows + `<div class="legend"><span class="lg"><span class="sw" style="background:${SERIES.plan}"></span>Avance real</span><span class="lg"><span class="sw mark"></span>Avance planificado a la fecha de estado</span></div>`;
  }

  /** Carga por responsable: días asignados y días sobreasignados */
  function resourceBars(x, loads) {
    const rs = x.p.resources; if (!rs.length) return '<p class="rempty">No hay responsables.</p>';
    const max = Math.max(1, ...rs.map(r => loads.get(r.id).days.size));
    return rs.map(r => {
      const l = loads.get(r.id); const days = l.days.size, over = [...l.days.values()].filter(v => v > 1).length;
      return `<div class="hb hb-res"><div class="hb-name">${esc(r.name)}</div><div class="hb-track"><div class="hb-fill" style="width:${days / max * 100}%;background:${SERIES.plan}" title="${days} día(s) con trabajo asignado"></div>${over ? `<div class="hb-fill over" style="width:${over / max * 100}%;background:${ST.late.c}" title="${over} día(s) con más de una tarea a la vez"></div>` : ''}</div><div class="hb-val">${days} d${over ? ` · <span class="warn">⚠ ${over} d sobreasignados</span>` : ''}</div><div class="hb-dates muted">${l.tasks} tarea(s)</div></div>`;
    }).join('') + `<div class="legend"><span class="lg"><span class="sw" style="background:${SERIES.plan}"></span>Días con trabajo asignado</span><span class="lg"><span class="sw" style="background:${ST.late.c}"></span>⚠ Días con más de una tarea a la vez</span></div>`;
  }

  // ---------- cabecera común ----------
  function header(x, title) {
    const filt = opts.resource ? ` · filtrado por <b>${esc((x.resById.get(opts.resource) || {}).name || '')}</b>` : '';
    return `<header class="rhead"><div><div class="rproj">${esc(x.p.name)}</div><h2>${title}</h2></div><div class="rmeta">Fecha de estado <b>${U.fmt(x.sd)}</b><br>Generado el ${U.fmt(U.today())}${filt}</div></header>`;
  }
  const filtered = (x, idx) => idx.filter(x.inFilter);

  // ---------- informes ----------
  function overview(x) {
    const h = health(x); const { p, cp, leaves, C } = x;
    const counts = { done: 0, progress: 0, notstarted: 0, late: 0 }; leaves.forEach(i => counts[x.state(i)]++);
    const ms = p.tasks.map((t, i) => i).filter(i => p.tasks[i].milestone);
    const nextMs = filtered(x, ms).filter(i => x.pct(i) < 100).sort((a, b) => C[a].es - C[b].es).slice(0, 6);
    const late = filtered(x, h.late).sort((a, b) => x.daysOverdue(b) - x.daysOverdue(a)).slice(0, 6);
    return header(x, 'Resumen del proyecto')
      + `<div class="kpis">${kpi('Comienzo', U.fmt(cp.projStart))}${kpi('Fin previsto', U.fmt(cp.projFinish), h.finishVar != null ? `${signed(h.finishVar)} vs ${Store.BL.short(x.blk)}` : 'sin línea base')}${kpi('Duración', `${cp.duration} d`, 'días laborables')}${kpi('Avance real', `${h.actual}%`, `planificado ${h.planned}%`)}`
      + `${kpi('Tareas', `${counts.done}/${leaves.length}`, 'completadas')}${kpi('Críticas', leaves.filter(i => C[i].critical && x.pct(i) < 100).length, 'pendientes')}${kpi('Retrasadas', counts.late, counts.late ? '⚠ requieren atención' : 'ninguna')}${kpi('Hitos', `${ms.filter(i => x.pct(i) >= 100).length}/${ms.length}`, 'cumplidos')}</div>`
      + `<div class="rgrid2">${section('Avance acumulado', sCurve(x), 'El avance se pondera por la duración de cada tarea.')}${section('Estado de las tareas', statesBar(counts), 'Una tarea está retrasada cuando su % completado es menor que el que debería tener a la fecha de estado.')}</div>`
      + section('Avance por fase', phaseBars(x))
      + `<div class="rgrid2">${section('Próximos hitos', table(['Hito', 'Fecha', { t: 'Holgura', num: true }], nextMs.map(i => ({ id: p.tasks[i].id, cells: [taskName(x, i), U.fmt(C[i].es), `${C[i].slack} d`] })), 'No quedan hitos pendientes.'))}`
      + `${section('Tareas retrasadas', table(['Tarea', 'Responsables', { t: 'Real / esperado', num: true }], late.map(i => ({ id: p.tasks[i].id, cells: [taskName(x, i), esc(x.names(i)), `${x.pct(i)}% / ${x.expected(i)}%`] })), 'No hay tareas retrasadas. ✔'))}</div>`;
  }

  function statusReport(x, forExport) {
    const h = health(x); const { p, C, leaves, sd } = x; const r = RAG[h.rag];
    const win = sd + 14;
    const ms = filtered(x, p.tasks.map((t, i) => i).filter(i => p.tasks[i].milestone && x.pct(i) < 100 && C[i].es <= sd + 30)).sort((a, b) => C[a].es - C[b].es);
    const doing = filtered(x, leaves.filter(i => { const s = x.state(i); return s === 'progress' || (s === 'late' && x.pct(i) > 0); })).sort((a, b) => C[a].ef - C[b].ef);
    const next = filtered(x, leaves.filter(i => x.pct(i) === 0 && C[i].es > sd && C[i].es <= win)).sort((a, b) => C[a].es - C[b].es);
    const done = leaves.filter(i => x.pct(i) >= 100).length;
    const comment = p.statusComment || '';
    const commentHtml = forExport ? (comment ? comment.split(/\n+/).map(l => `<p>${esc(l)}</p>`).join('') : '<p class="rempty">Sin comentarios.</p>') : `<textarea id="rComment" rows="5" placeholder="Resumen de la semana, decisiones necesarias, próximos pasos…">${esc(comment)}</textarea><div class="rnote">Se guarda con el proyecto y aparece en la versión impresa.</div>`;
    const alerts = [...h.reasons];
    const critSoon = leaves.filter(i => C[i].critical && x.pct(i) === 0 && C[i].es > sd && C[i].es <= win);
    if (critSoon.length) alerts.push(`${critSoon.length} tarea(s) crítica(s) comienzan en los próximos 14 días`);
    return header(x, 'Informe de estado')
      + `<div class="rag" style="border-color:${r.c}"><div class="rag-light" style="background:${r.c}"><span>${r.ico}</span></div><div><div class="rag-t">Estado general: ${r.label}</div><div class="muted">Fin previsto ${U.fmt(x.cp.projFinish)}${h.finishVar != null ? ` (${signed(h.finishVar)} frente a ${Store.BL.name(x.blk)})` : ''} · Avance ${h.actual}% (plan ${h.planned}%) · ${done}/${leaves.length} tareas completadas</div></div></div>`
      + section('Comentarios del responsable del proyecto', commentHtml)
      + section('Riesgos y alertas', alerts.length ? `<ul class="alerts">${alerts.map(a => `<li>⚠ ${esc(a)}</li>`).join('')}</ul>` : '<p class="rempty">✔ Sin alertas.</p>', 'Criterio del semáforo: rojo si hay fechas límite superadas, el fin se retrasa más de 5 días respecto a la línea base o el avance va más de 15 puntos por detrás del plan; ámbar si hay cualquier retraso, tareas retrasadas o sobreasignación.')
      + section('Hitos en los próximos 30 días', table(['Hito', 'Fecha', 'Fecha LB', { t: 'Variación', num: true }, 'Estado'], ms.map(i => { const b = x.blOf(i); return { id: p.tasks[i].id, cells: [taskName(x, i), U.fmt(C[i].es), b ? U.fmt(U.toDay(b.finish)) : '—', b ? signed(x.varDays(U.toDay(b.finish), C[i].ef)) : '', badge(x.state(i))] }; }), 'No hay hitos en los próximos 30 días.'))
      + section('Trabajo en curso', table(['Tarea', 'Responsables', 'Fin', { t: '% real', num: true }, { t: '% esperado', num: true }, 'Estado'], doing.map(i => ({ id: p.tasks[i].id, cells: [taskName(x, i), esc(x.names(i)), U.fmt(C[i].ef), `${x.pct(i)}%`, `${x.expected(i)}%`, badge(x.state(i))] })), 'No hay tareas en curso.'))
      + section('Comienzan en los próximos 14 días', table(['Tarea', 'Responsables', 'Comienzo', 'Fin', { t: 'Duración', num: true }], next.map(i => ({ id: p.tasks[i].id, cells: [taskName(x, i), esc(x.names(i)), U.fmt(C[i].es), U.fmt(C[i].ef), `${p.tasks[i].duration} d`] })), 'Ninguna tarea comienza en los próximos 14 días.'));
  }

  function critical(x) {
    const { p, C, leaves } = x;
    const list = filtered(x, leaves.filter(i => C[i].critical && x.pct(i) < 100)).sort((a, b) => C[a].es - C[b].es);
    return header(x, 'Tareas críticas')
      + `<div class="kpis">${kpi('Críticas pendientes', list.length)}${kpi('Fin del proyecto', U.fmt(x.cp.projFinish))}${kpi('Retrasadas', list.filter(i => x.state(i) === 'late').length, 'entre las críticas')}${kpi('Días críticos', list.reduce((s, i) => s + p.tasks[i].duration, 0), 'suma de duraciones')}</div>`
      + section('Ruta crítica pendiente', table(['#', 'Tarea', 'Comienzo', 'Fin', { t: 'Duración', num: true }, 'Responsables', { t: '%', num: true }, { t: 'Holgura', num: true }, 'Estado'], list.map(i => ({ id: p.tasks[i].id, cells: [i + 1, taskName(x, i), U.fmt(C[i].es), U.fmt(C[i].ef), `${p.tasks[i].duration} d`, esc(x.names(i)), `${x.pct(i)}%`, `${C[i].slack} d`, badge(x.state(i))] })), 'No hay tareas críticas pendientes.'), 'Cualquier retraso en estas tareas retrasa el fin del proyecto.');
  }

  function lateReport(x) {
    const { p, C, leaves } = x;
    const list = filtered(x, leaves.filter(i => x.state(i) === 'late')).sort((a, b) => x.daysOverdue(b) - x.daysOverdue(a) || (x.expected(b) - x.pct(b)) - (x.expected(a) - x.pct(a)));
    const overdue = list.filter(i => x.daysOverdue(i) > 0);
    return header(x, 'Tareas retrasadas')
      + `<div class="kpis">${kpi('Retrasadas', list.length, list.length ? '⚠' : '✔ ninguna')}${kpi('Vencidas', overdue.length, 'fin ya superado')}${kpi('Críticas', list.filter(i => C[i].critical).length, 'entre las retrasadas')}${kpi('Fechas límite superadas', p.tasks.filter((t, i) => C[i].deadlineMissed).length)}</div>`
      + section('Detalle', table(['#', 'Tarea', 'Responsables', 'Comienzo', 'Fin', { t: '% real', num: true }, { t: '% esperado', num: true }, { t: 'Días vencida', num: true }], list.map(i => ({ id: p.tasks[i].id, cells: [i + 1, taskName(x, i), esc(x.names(i)), U.fmt(C[i].es), U.fmt(C[i].ef), `${x.pct(i)}%`, `${x.expected(i)}%`, x.daysOverdue(i) ? `${x.daysOverdue(i)} d` : '—'] })), 'No hay tareas retrasadas. ✔'), `«% esperado» es el avance que debería tener cada tarea a la fecha de estado (${U.fmt(x.sd)}) según su programación.`);
  }

  function upcoming(x) {
    const { p, C, leaves, sd } = x; const end = sd + opts.days;
    const list = filtered(x, leaves.filter(i => x.pct(i) < 100 && C[i].es <= end && C[i].ef >= sd)).sort((a, b) => C[a].es - C[b].es || C[a].ef - C[b].ef);
    const wk = d => { let m = d; while (U.dow(m) !== 1) m--; return m; };
    let rows = [], lastW = null;
    for (const i of list) { const w = Math.max(wk(C[i].es), wk(sd)); if (w !== lastW) { rows.push({ cls: 'grp', cells: [`<b>Semana del ${U.fmt(w)}</b>`, '', '', '', '', '', ''] }); lastW = w; } rows.push({ id: p.tasks[i].id, cells: [taskName(x, i), esc(x.names(i)), U.fmt(C[i].es), U.fmt(C[i].ef), `${p.tasks[i].duration} d`, `${x.pct(i)}%`, badge(x.state(i))] }); }
    return header(x, `Próximas tareas · ${opts.days} días`)
      + `<div class="kpis">${kpi('En el periodo', list.length, `${U.fmt(sd)} → ${U.fmt(end)}`)}${kpi('Empiezan', list.filter(i => C[i].es > sd).length, 'en el periodo')}${kpi('Terminan', list.filter(i => C[i].ef <= end).length, 'en el periodo')}${kpi('Críticas', list.filter(i => C[i].critical).length)}</div>`
      + section('Tareas en curso o que comienzan en el periodo', table(['Tarea', 'Responsables', 'Comienzo', 'Fin', { t: 'Duración', num: true }, { t: '%', num: true }, 'Estado'], rows, 'No hay tareas en el periodo.'));
  }

  function milestones(x) {
    const { p, C } = x;
    const list = filtered(x, p.tasks.map((t, i) => i).filter(i => p.tasks[i].milestone)).sort((a, b) => C[a].es - C[b].es);
    const st = i => { if (x.pct(i) >= 100) return '✔ Cumplido'; if (C[i].deadlineMissed) return '⚠ Fecha límite superada'; if (x.state(i) === 'late') return '⚠ Retrasado'; return '○ Pendiente'; };
    return header(x, 'Hitos')
      + `<div class="kpis">${kpi('Hitos', list.length)}${kpi('Cumplidos', list.filter(i => x.pct(i) >= 100).length)}${kpi('Pendientes', list.filter(i => x.pct(i) < 100).length)}${kpi('En la ruta crítica', list.filter(i => C[i].critical).length)}</div>`
      + section('Calendario de hitos', table(['#', 'Hito', 'Fecha', `Fecha ${Store.BL.short(x.blk)}`, { t: 'Variación', num: true }, 'Fecha límite', { t: 'Holgura', num: true }, 'Estado'], list.map(i => { const b = x.blOf(i); return { id: p.tasks[i].id, cells: [i + 1, taskName(x, i), U.fmt(C[i].es), b ? U.fmt(U.toDay(b.finish)) : '—', b ? signed(x.varDays(U.toDay(b.finish), C[i].ef)) : '', p.tasks[i].deadline ? U.fmt(U.toDay(p.tasks[i].deadline)) : '—', `${C[i].slack} d`, st(i)] }; }), 'El proyecto no tiene hitos.'));
  }

  function resources(x) {
    const { p, C, leaves, sd } = x; const loads = ResourceView.loads();
    const rs = opts.resource ? p.resources.filter(r => r.id === opts.resource) : p.resources;
    const rows = rs.map(r => {
      const mine = leaves.filter(i => p.tasks[i].resources.includes(r.id)); const l = loads.get(r.id);
      const nextT = mine.filter(i => x.pct(i) < 100).sort((a, b) => C[a].es - C[b].es)[0];
      const over = [...l.days.values()].filter(v => v > 1).length;
      return { cells: [`<b>${esc(r.name)}</b>`, esc(r.role || ''), mine.length, mine.filter(i => x.pct(i) > 0 && x.pct(i) < 100).length, mine.filter(i => x.state(i) === 'late').length, `${l.days.size} d`, over ? `<span class="warn">⚠ ${over} d</span>` : '—', nextT != null ? `${esc(p.tasks[nextT].name)} · ${U.fmt(C[nextT].es)}` : '—'] };
    });
    const per = rs.map(r => {
      const mine = leaves.filter(i => p.tasks[i].resources.includes(r.id) && x.pct(i) < 100).sort((a, b) => C[a].es - C[b].es).slice(0, 8);
      return `<div class="rcard"><h4>${esc(r.name)}${r.role ? ` <span class="muted">· ${esc(r.role)}</span>` : ''}</h4>${table(['Tarea', 'Comienzo', 'Fin', { t: '%', num: true }, 'Estado'], mine.map(i => ({ id: p.tasks[i].id, cells: [taskName(x, i), U.fmt(C[i].es), U.fmt(C[i].ef), `${x.pct(i)}%`, badge(x.state(i))] })), 'Sin tareas pendientes.')}</div>`;
    }).join('');
    return header(x, 'Carga de recursos')
      + section('Días asignados por responsable', resourceBars(x, loads))
      + section('Resumen por responsable', table(['Responsable', 'Rol', { t: 'Tareas', num: true }, { t: 'En curso', num: true }, { t: 'Retrasadas', num: true }, { t: 'Días asignados', num: true }, 'Sobreasignado', 'Próxima tarea'], rows, 'No hay responsables.'), 'Sobreasignado: días laborables en los que la persona tiene más de una tarea a la vez.')
      + section('Tareas pendientes por responsable', `<div class="rgrid2">${per}</div>`);
  }

  function variance(x) {
    const { p, C, leaves } = x;
    if (!Store.BL.saved().includes(x.blk)) return header(x, 'Variación frente a línea base') + `<p class="rempty">No hay ninguna «${Store.BL.name(x.blk)}» guardada. Guárdala en Proyecto → Establecer línea base, o elige otra línea base para comparar en ese mismo diálogo.</p>`;
    const list = filtered(x, leaves.filter(i => x.blOf(i))).map(i => { const b = x.blOf(i); return { i, vs: x.varDays(U.toDay(b.start), C[i].es), vf: x.varDays(U.toDay(b.finish), C[i].ef), b }; }).sort((a, b) => b.vf - a.vf || C[a.i].es - C[b.i].es);
    const h = health(x);
    return header(x, `Variación frente a ${Store.BL.name(x.blk)}`)
      + `<div class="kpis">${kpi('Fin del proyecto', U.fmt(x.cp.projFinish), h.blFinish != null ? `${Store.BL.short(x.blk)}: ${U.fmt(h.blFinish)}` : '')}${kpi('Variación del fin', signed(h.finishVar) || '—')}${kpi('Retrasadas vs LB', list.filter(v => v.vf > 0).length, 'fin posterior')}${kpi('Adelantadas vs LB', list.filter(v => v.vf < 0).length, 'fin anterior')}</div>`
      + section('Detalle por tarea', table(['#', 'Tarea', `Comienzo ${Store.BL.short(x.blk)}`, 'Comienzo', { t: 'Var. comienzo', num: true }, `Fin ${Store.BL.short(x.blk)}`, 'Fin', { t: 'Var. fin', num: true }], list.map(v => ({ id: p.tasks[v.i].id, cells: [v.i + 1, taskName(x, v.i), U.fmt(U.toDay(v.b.start)), U.fmt(C[v.i].es), signed(v.vs), U.fmt(U.toDay(v.b.finish)), U.fmt(C[v.i].ef), signed(v.vf)] })), 'Ninguna tarea tiene esta línea base.'), 'Variación en días laborables: ▲ positivo = más tarde que la línea base, ▼ negativo = antes.');
  }

  const BUILDERS = { overview, status: statusReport, critical, late: lateReport, upcoming, milestones, resources, variance };
  function build(type, forExport) { return BUILDERS[type](ctx(), forExport); }

  // ---------- vista ----------
  function init() {
    el = document.getElementById('viewReport'); bodyEl = document.getElementById('reportBody');
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const sel = document.getElementById('rType'); sel.innerHTML = TYPES.map(t => `<option value="${t.key}">${t.ico} ${t.label}</option>`).join('');
    sel.onchange = () => show(sel.value);
    document.getElementById('rDays').onchange = e => { opts.days = +e.target.value; render(); };
    document.getElementById('rRes').onchange = e => { opts.resource = e.target.value; render(); };
    document.getElementById('rStatusDate').onchange = e => { const v = e.target.value; Store.mutate(p => { p.statusDate = v || null; }); };
    document.getElementById('rPrint').onclick = print;
    document.getElementById('rDownload').onclick = download;
    document.getElementById('rBack').onclick = () => App.setView('gantt');
    bodyEl.addEventListener('click', e => { const tr = e.target.closest('[data-id]'); if (!tr) return; const i = Store.indexOf(tr.dataset.id); if (i < 0) return; App.setView('gantt'); Table.setActive(i, 'name'); Gantt.scrollToTask(i); });
    bodyEl.addEventListener('change', e => { if (e.target.id === 'rComment') { const v = e.target.value; Store.mutate(p => { p.statusComment = v; }); App.toast('Comentario guardado'); } });
  }
  function show(type) { if (BUILDERS[type]) current = type; App.setView('report'); }
  function render() {
    const p = Store.project;
    document.getElementById('rType').value = current;
    const rr = document.getElementById('rRes'); rr.innerHTML = '<option value="">Todos los responsables</option>' + p.resources.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); if (!p.resources.some(r => r.id === opts.resource)) opts.resource = ''; rr.value = opts.resource;
    document.getElementById('rDays').value = String(opts.days); document.getElementById('rDaysWrap').style.display = current === 'upcoming' ? '' : 'none';
    document.getElementById('rStatusDate').value = p.statusDate || '';
    const keepScroll = el.querySelector('.report-scroll').scrollTop;
    bodyEl.innerHTML = build(current);
    el.querySelector('.report-scroll').scrollTop = keepScroll;
  }
  function docHTML() {
    const t = TYPES.find(x => x.key === current);
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(Store.project.name)} · ${t.label}</title><style>${CSS}
      body{margin:0;background:#fff;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:#0b0b0b}.report{box-shadow:none;margin:0 auto}
      @page{size:A4;margin:12mm}@media print{.report{padding:0;max-width:none}.rsec,.kpi,.rcard,.rag{break-inside:avoid}tr{break-inside:avoid}}</style></head><body><div class="report">${build(current, true)}</div></body></html>`;
  }
  function print() {
    const w = window.open('', '_blank'); if (!w) { App.toast('El navegador ha bloqueado la ventana de impresión'); return; }
    w.document.write(docHTML().replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body>')); w.document.close();
  }
  function download() { const t = TYPES.find(x => x.key === current); U.download(`${U.safeName(Store.project.name)}_${U.safeName(t.label)}.html`, docHTML(), 'text/html'); }

  const CSS = `
.report{max-width:1040px;margin:18px auto;background:#fcfcfb;padding:28px 34px 36px;box-shadow:0 1px 3px rgba(0,0,0,.12);border-radius:6px;color:#0b0b0b;font-size:13px}
.report .muted{color:#52514e}.report .warn{color:#d03b3b;font-weight:600}
.rhead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid #217346;padding-bottom:10px;margin-bottom:18px}
.rhead h2{margin:2px 0 0;font-size:22px}.rproj{font-size:12px;font-weight:600;color:#217346;text-transform:uppercase;letter-spacing:.05em}.rmeta{text-align:right;font-size:12px;color:#52514e;line-height:1.5}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.kpi{border:1px solid #e7e6e2;border-radius:6px;padding:10px 12px;background:#fff}
.kpi-l{font-size:11px;color:#52514e;text-transform:uppercase;letter-spacing:.04em}.kpi-v{font-size:22px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}.kpi-s{font-size:11.5px;color:#52514e;margin-top:1px}
.rsec{margin:0 0 20px}.rsec h3{font-size:14px;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e7e6e2}.rnote{font-size:11.5px;color:#52514e;margin:6px 0 0}.rempty{color:#52514e;font-style:italic;margin:6px 0}
.rgrid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}.rgrid2>.rsec{min-width:0}
.rtable{width:100%;border-collapse:collapse;font-size:12.5px}.rtable th{text-align:left;font-weight:600;color:#52514e;font-size:11.5px;border-bottom:1px solid #d6d5d0;padding:5px 6px;background:#f5f5f3}
.rtable td{padding:5px 6px;border-bottom:1px solid #eeede9;vertical-align:top}.rtable .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.rtable tr[data-id]{cursor:pointer}.rtable tr[data-id]:hover td{background:#eef4fc}.rtable tr.grp td{background:#f5f5f3;padding-top:7px}
.crit{color:#d03b3b;font-size:10px}.badge{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:12px}.badge .dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.chart{width:100%;display:block}.chart .ax{font-size:10.5px;fill:#52514e}.chart .lbl{font-size:11px;fill:#0b0b0b;font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:12px;color:#0b0b0b}.lg{display:inline-flex;align-items:center;gap:6px}.sw{width:12px;height:12px;border-radius:3px;display:inline-block}
.sw.ln{height:2px;width:18px;border-radius:0}.sw.dash{height:0;width:18px;border-top:2px dashed;background:none!important}.sw.dotk{width:10px;height:10px;border-radius:50%;background:#0b0b0b}.sw.mark{width:2px;height:14px;background:#0b0b0b;border-radius:0}
.hb{display:grid;grid-template-columns:200px 1fr 150px 170px;gap:10px;align-items:center;padding:4px 0}.hb[data-id]{cursor:pointer}.hb-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.hb-track{position:relative;height:14px;background:#eeede9;border-radius:4px;overflow:visible}.hb-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px}.hb-fill.over{top:9px;bottom:0;border-radius:0 0 4px 4px}
.hb-res{grid-template-columns:200px 1fr 230px 90px}.hb-mark{position:absolute;top:-3px;bottom:-3px;width:2px;background:#0b0b0b;margin-left:-1px}.hb-val{font-variant-numeric:tabular-nums;white-space:nowrap}.hb-dates{font-size:11.5px;white-space:nowrap}
.rag{display:flex;gap:16px;align-items:center;border:2px solid;border-radius:8px;padding:14px 16px;margin-bottom:18px;background:#fff}.rag-light{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:18px;flex:none}.rag-t{font-size:18px;font-weight:600;margin-bottom:3px}
.alerts{margin:4px 0;padding-left:18px}.alerts li{margin:3px 0;list-style:none;margin-left:-18px}
.rcard{border:1px solid #e7e6e2;border-radius:6px;padding:10px 12px;background:#fff}.rcard h4{margin:0 0 6px;font-size:13px}
#rComment{width:100%;font:inherit;border:1px solid #d6d5d0;border-radius:4px;padding:8px;resize:vertical;background:#fff}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.rgrid2{grid-template-columns:1fr}.hb{grid-template-columns:120px 1fr 110px}.hb-dates{display:none}}`;

  return { TYPES, init, show, render, build, get current() { return current; } };
})();
