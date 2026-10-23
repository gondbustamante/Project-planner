/* Exportación (JSON, CSV, XML de MS Project, SVG, PNG, impresión) e importación (JSON, XML de MS Project) */
const Exporters = (() => {
  const T8 = d => `${d}T08:00:00`, T17 = d => `${d}T17:00:00`;
  const MSP_TYPE = { FF: 0, FS: 1, SF: 2, SS: 3 };
  const MSP_TYPE_INV = { 0: 'FF', 1: 'FS', 2: 'SF', 3: 'SS' };
  const MSP_CONS = { ASAP: 0, MSO: 2, SNET: 4 };

  function json() {
    const p = Store.project;
    U.download(U.safeName(p.name) + '.json', JSON.stringify(p, null, 2), 'application/json');
  }

  function csv() {
    const { project, computed } = Store; const C = computed.C, ol = computed.outline;
    const resById = new Map(project.resources.map(r => [r.id, r]));
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const bls = Store.BL.saved();
    const rows = [['Id', 'EDT', 'Nivel', 'Nombre', 'Duración (días)', 'Comienzo', 'Fin', 'Predecesoras', 'Sucesoras', 'Responsables', '% completado', 'Hito', 'Resumen', 'Crítica', 'Holgura total (días)', 'Holgura libre (días)', 'Comienzo límite', 'Fin límite', 'Fecha límite', 'Restricción', ...bls.flatMap(k => [`Comienzo ${Store.BL.short(k)}`, `Fin ${Store.BL.short(k)}`]), 'Notas']];
    project.tasks.forEach((t, i) => rows.push([i + 1, ol.wbs[i], t.level, t.name, t.duration, U.fmt(C[i].es), U.fmt(C[i].ef), Table.predsToText(t), Table.linkText(computed.successors[i]),
      t.resources.map(id => (resById.get(id) || {}).name).filter(Boolean).join(', '), t.progress || 0, t.milestone ? 'Sí' : 'No', ol.isSummary[i] ? 'Sí' : 'No', C[i].critical ? 'Sí' : 'No', C[i].slack, C[i].freeSlack, U.fmt(C[i].ls), U.fmt(C[i].lf),
      t.deadline ? U.fmt(U.toDay(t.deadline)) : '', t.constraint && t.constraint.type !== 'ASAP' && t.constraint.date ? `${Table.CONS_LABEL[t.constraint.type]} ${U.fmt(U.toDay(t.constraint.date))}` : '',
      ...bls.flatMap(k => { const bl = Store.BL.of(t, k); return bl ? [U.fmt(U.toDay(bl.start)), U.fmt(U.toDay(bl.finish))] : ['', '']; }), t.notes]));
    U.download(U.safeName(project.name) + '.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  function mspXML() {
    const { project, computed } = Store; const C = computed.C, ol = computed.outline;
    const e = U.esc;
    const uidOf = new Map(project.tasks.map((t, i) => [t.id, i + 1]));
    const resUid = new Map(project.resources.map((r, i) => [r.id, i + 1]));
    const hours = d => `PT${d * 8}H0M0S`;
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n`;
    x += `<SaveVersion>14</SaveVersion><Name>${e(U.safeName(project.name))}.xml</Name><Title>${e(project.name)}</Title>`;
    x += `<ScheduleFromStart>1</ScheduleFromStart><StartDate>${T8(U.fromDay(computed.projStart))}</StartDate><FinishDate>${T17(U.fromDay(computed.projFinish))}</FinishDate>`;
    x += `<CalendarUID>1</CalendarUID><DefaultStartTime>08:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>`;
    const WT = '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>';
    const calendarXML = (uid, name, base, workDays, exceptions) => {
      let c = `<Calendar><UID>${uid}</UID><Name>${e(name)}</Name><IsBaseCalendar>${base < 0 ? 1 : 0}</IsBaseCalendar><BaseCalendarUID>${base}</BaseCalendarUID><WeekDays>`;
      if (workDays) for (let d = 1; d <= 7; d++) { const working = workDays.includes(d - 1); c += `<WeekDay><DayType>${d}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>${working ? WT : ''}</WeekDay>`; }
      for (const ex of exceptions) c += `<WeekDay><DayType>0</DayType><DayWorking>${ex.working ? 1 : 0}</DayWorking><TimePeriod><FromDate>${ex.from}T00:00:00</FromDate><ToDate>${ex.to}T23:59:00</ToDate></TimePeriod>${ex.working ? WT : ''}</WeekDay>`;
      c += `</WeekDays><Exceptions>`;
      for (const ex of exceptions) c += `<Exception><Name>${e(ex.name || (ex.working ? 'Laborable' : 'No laborable'))}</Name><TimePeriod><FromDate>${ex.from}T00:00:00</FromDate><ToDate>${ex.to}T23:59:00</ToDate></TimePeriod><DayWorking>${ex.working ? 1 : 0}</DayWorking>${ex.working ? WT : ''}</Exception>`;
      return c + `</Exceptions></Calendar>`;
    };
    x += `<Calendars>` + calendarXML(1, 'Estándar', -1, project.calendar.workDays, project.calendar.exceptions);
    const resCalUid = new Map();
    project.resources.forEach((r, i) => { if (r.calendar) { const uid = 100 + i; resCalUid.set(r.id, uid); x += calendarXML(uid, r.name, 1, r.calendar.workDays, r.calendar.exceptions); } });
    x += `</Calendars>\n<Tasks>`;
    x += `<Task><UID>0</UID><ID>0</ID><Name>${e(project.name)}</Name><Type>1</Type><IsNull>0</IsNull><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel><Start>${T8(U.fromDay(computed.projStart))}</Start><Finish>${T17(U.fromDay(computed.projFinish))}</Finish><Duration>${hours(computed.duration)}</Duration><DurationFormat>7</DurationFormat><Summary>1</Summary><Milestone>0</Milestone><PercentComplete>0</PercentComplete></Task>`;
    project.tasks.forEach((t, i) => {
      const c = C[i]; const uid = i + 1;
      x += `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${e(t.name)}</Name><Type>0</Type><IsNull>0</IsNull><WBS>${ol.wbs[i]}</WBS><OutlineNumber>${ol.wbs[i]}</OutlineNumber><OutlineLevel>${t.level}</OutlineLevel>`;
      x += `<Start>${T8(U.fromDay(c.es))}</Start><Finish>${t.milestone ? T8(U.fromDay(c.ef)) : T17(U.fromDay(c.ef))}</Finish><Duration>${hours(t.duration)}</Duration><DurationFormat>7</DurationFormat>`;
      x += `<Milestone>${t.milestone ? 1 : 0}</Milestone><Summary>${ol.isSummary[i] ? 1 : 0}</Summary><Critical>${c.critical ? 1 : 0}</Critical><PercentComplete>${t.progress || 0}</PercentComplete>`;
      x += `<EarlyStart>${T8(U.fromDay(c.es))}</EarlyStart><EarlyFinish>${T17(U.fromDay(c.ef))}</EarlyFinish><LateStart>${T8(U.fromDay(c.ls))}</LateStart><LateFinish>${T17(U.fromDay(c.lf))}</LateFinish><TotalSlack>${c.slack * 4800}</TotalSlack>`;
      const cons = t.constraint || { type: 'ASAP' };
      x += `<ConstraintType>${MSP_CONS[cons.type] ?? 0}</ConstraintType>${cons.date && cons.type !== 'ASAP' ? `<ConstraintDate>${T8(cons.date)}</ConstraintDate>` : ''}`;
      if (t.notes) x += `<Notes>${e(t.notes)}</Notes>`;
      if (t.deadline) x += `<Deadline>${T17(t.deadline)}</Deadline>`;
      x += `<Priority>${t.priority || 500}</Priority>`;
      if (t.ignoreResourceCalendars) x += `<IgnoreResourceCalendar>1</IgnoreResourceCalendar>`;
      for (const k of Object.keys(t.baselines || {}).map(Number).sort((a, b) => a - b)) { const bl = t.baselines[k]; if (bl && U.toDay(bl.start) != null && U.toDay(bl.finish) != null) x += `<Baseline><Number>${k}</Number><Start>${T8(bl.start)}</Start><Finish>${T17(bl.finish)}</Finish></Baseline>`; }
      for (const p of t.predecessors) { const pu = uidOf.get(p.id); if (pu) x += `<PredecessorLink><PredecessorUID>${pu}</PredecessorUID><Type>${MSP_TYPE[p.type] ?? 1}</Type><CrossProject>0</CrossProject><LinkLag>${(p.lag | 0) * 4800}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`; }
      x += `</Task>`;
    });
    x += `</Tasks>\n<Resources>`;
    project.resources.forEach((r, i) => { x += `<Resource><UID>${i + 1}</UID><ID>${i + 1}</ID><Name>${e(r.name)}</Name><Type>1</Type>${r.role ? `<Group>${e(r.role)}</Group>` : ''}<MaxUnits>1</MaxUnits><CalendarUID>${resCalUid.get(r.id) || 1}</CalendarUID></Resource>`; });
    x += `</Resources>\n<Assignments>`;
    let auid = 1;
    project.tasks.forEach((t, i) => { for (const rid of t.resources) { const ru = resUid.get(rid); if (ru) x += `<Assignment><UID>${auid++}</UID><TaskUID>${i + 1}</TaskUID><ResourceUID>${ru}</ResourceUID><Units>1</Units><PercentWorkComplete>${t.progress || 0}</PercentWorkComplete></Assignment>`; } });
    x += `</Assignments>\n</Project>`;
    U.download(U.safeName(project.name) + '.xml', x, 'application/xml');
  }

  function svg(rows) {
    const { svg } = Gantt.exportSVG(rows);
    U.download(U.safeName(Store.project.name) + '.svg', svg, 'image/svg+xml');
  }
  function png(rows) {
    const { svg, width, height } = Gantt.exportSVG(rows);
    const img = new Image(); const scale = Math.min(2, Math.max(1, 4000 / width));
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => U.download(U.safeName(Store.project.name) + '.png', b), 'image/png');
    };
    img.onerror = () => App.toast('No se pudo generar el PNG; prueba la exportación SVG');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function print(rows) {
    const { project, computed } = Store;
    const { svg, width, height } = Gantt.exportSVG(rows || App.visibleRows());
    const w = window.open('', '_blank');
    if (!w) { App.toast('El navegador ha bloqueado la ventana de impresión'); return; }
    const landscape = width > height * 1.1;
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${U.esc(project.name)}</title>
      <style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}body{font-family:Segoe UI,system-ui,Arial,sans-serif;color:#1f2430;margin:0}
      h1{font-size:18px;margin:0 0 2px}.meta{font-size:11px;color:#6b7280;margin-bottom:8px}svg{width:100%;height:auto;max-height:calc(100vh - 60px)}
      .legend{font-size:10px;color:#6b7280;margin-top:6px;display:flex;gap:14px}.sw{display:inline-block;width:14px;height:8px;vertical-align:middle;margin-right:3px}</style></head><body>
      <h1>${U.esc(project.name)}</h1>
      <div class="meta">Inicio ${U.fmt(computed.projStart)} · Fin ${U.fmt(computed.projFinish)} · ${computed.duration} días laborables · ${project.tasks.length} tareas · impreso el ${U.fmt(U.today())}</div>
      ${svg}
      <div class="legend"><span><span class="sw" style="background:#3b7dd8"></span>Tarea</span><span><span class="sw" style="background:#d93025"></span>Tarea crítica</span><span><span class="sw" style="background:#2b2f36"></span>Resumen</span><span>◆ Hito</span>${Gantt.shownBaselines().map(k => `<span><span class="sw" style="background:${Store.BL.COLORS[k]}"></span>${Store.BL.name(k)}</span>`).join('')}<span>▼ Fecha límite</span></div>
      <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`);
    w.document.close();
  }

  // ---------- importación ----------
  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      try {
        if (/^\s*</.test(text)) importMSP(text); else importJSON(text);
        App.toast('Proyecto importado');
      } catch (err) { console.error(err); App.toast('No se pudo importar: ' + err.message); }
    };
    reader.readAsText(file);
  }
  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.tasks)) throw new Error('el JSON no tiene el formato de Planner');
    Store.mutate(() => Store.normalize(data));
  }
  function importMSP(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.localName !== 'Project') throw new Error('XML no reconocido');
    const g = (el, tag) => { const n = el.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ''; };
    const root = doc.documentElement;
    const p = Store.blank(g(root, 'Title') || g(root, 'Name').replace(/\.xml$/i, '') || 'Proyecto importado');
    const sd = U.toDay(g(root, 'StartDate')); if (sd != null) p.start = U.fromDay(sd);
    const minPerDay = +g(root, 'MinutesPerDay') || 480;
    const parseDur = s => { const m = /^PT(\d+)H(\d+)M(\d+)S$/.exec(s || ''); if (!m) return null; return Math.round(((+m[1] * 60) + +m[2]) / minPerDay); };
    // calendarios: el base del proyecto y los personales de los recursos
    const parseCalendar = cal => {
      const wd = [], ex = []; let hasWeek = false;
      const period = el => { const f = U.toDay(g(el, 'FromDate')), t = U.toDay(g(el, 'ToDate')); return f != null && t != null ? { from: U.fromDay(f), to: U.fromDay(t) } : null; };
      for (const w of cal.getElementsByTagName('WeekDay')) {
        const type = +g(w, 'DayType'), working = g(w, 'DayWorking') === '1';
        if (type >= 1 && type <= 7) { hasWeek = true; if (working) wd.push(type - 1); }
        else if (type === 0) { const pr = period(w); if (pr) ex.push({ ...pr, name: '', working }); }
      }
      for (const x of cal.getElementsByTagName('Exception')) { const pr = period(x); if (!pr) continue; const dup = ex.find(y => y.from === pr.from && y.to === pr.to); if (dup) { if (!dup.name) dup.name = g(x, 'Name'); } else ex.push({ ...pr, name: g(x, 'Name'), working: g(x, 'DayWorking') === '1' }); }
      return { uid: g(cal, 'UID'), base: g(cal, 'BaseCalendarUID'), name: g(cal, 'Name'), workDays: hasWeek ? wd : null, exceptions: ex };
    };
    const calEls = [...root.getElementsByTagName('Calendar')].map(parseCalendar);
    const baseUid = g(root, 'CalendarUID') || '1';
    const baseCal = calEls.find(c => c.uid === baseUid) || calEls.find(c => c.base === '-1') || calEls[0];
    if (baseCal) { if (baseCal.workDays && baseCal.workDays.length) p.calendar.workDays = baseCal.workDays; p.calendar.exceptions = baseCal.exceptions; }
    const calByUid = new Map(calEls.map(c => [c.uid, c]));
    const resources = root.getElementsByTagName('Resources')[0];
    const resMap = new Map();
    if (resources) for (const r of resources.getElementsByTagName('Resource')) {
      const uid = g(r, 'UID'), name = g(r, 'Name'); if (!name || uid === '0') continue;
      const nr = Store.newResource({ name, role: g(r, 'Group') }); nr.color = U.PALETTE[p.resources.length % U.PALETTE.length];
      const rc = calByUid.get(g(r, 'CalendarUID'));
      if (rc && baseCal && rc.uid !== baseCal.uid) {
        const sameDays = !rc.workDays || JSON.stringify(rc.workDays) === JSON.stringify(p.calendar.workDays);
        const own = rc.exceptions.filter(x => !p.calendar.exceptions.some(y => y.from === x.from && y.to === x.to));
        if (!sameDays || own.length) nr.calendar = { workDays: sameDays ? null : rc.workDays, exceptions: own };
      }
      p.resources.push(nr); resMap.set(uid, nr.id);
    }
    const tasksEl = root.getElementsByTagName('Tasks')[0]; if (!tasksEl) throw new Error('el XML no contiene tareas');
    const uidMap = new Map(); const pending = [];
    for (const te of tasksEl.getElementsByTagName('Task')) {
      if (g(te, 'IsNull') === '1') continue;
      const lvl = +g(te, 'OutlineLevel'); if (!lvl) continue; // UID 0 = resumen del proyecto
      const start = U.toDay(g(te, 'Start')), fin = U.toDay(g(te, 'Finish'));
      let dur = parseDur(g(te, 'Duration')); if (dur == null) dur = (start != null && fin != null) ? new WorkCalendar(p.calendar.workDays, p.calendar.exceptions).duration(start, fin) : 1;
      const ms = g(te, 'Milestone') === '1' || dur === 0;
      const t = Store.newTask({ name: g(te, 'Name') || 'Tarea', level: lvl, duration: ms ? 0 : Math.max(1, dur), milestone: ms, progress: +g(te, 'PercentComplete') || 0, notes: g(te, 'Notes'), ignoreResourceCalendars: g(te, 'IgnoreResourceCalendar') === '1', deadline: U.toDay(g(te, 'Deadline')) != null ? U.fromDay(U.toDay(g(te, 'Deadline'))) : null, priority: +g(te, 'Priority') || 500 });
      const ct = +g(te, 'ConstraintType'), cd = U.toDay(g(te, 'ConstraintDate'));
      if (cd != null) { if (ct === 2) t.constraint = { type: 'MSO', date: U.fromDay(cd) }; else if (ct === 4 || ct === 6) t.constraint = { type: 'SNET', date: U.fromDay(cd) }; }
      for (const bl of te.getElementsByTagName('Baseline')) { if (bl.parentNode !== te) continue; const k = parseInt(g(bl, 'Number'), 10) || 0; const bs = U.toDay(g(bl, 'Start')), bf = U.toDay(g(bl, 'Finish')); if (k >= 0 && k <= 10 && bs != null && bf != null) { t.baselines[k] = { start: U.fromDay(bs), finish: U.fromDay(bf) }; if (!p.baselines[k]) p.baselines[k] = { date: null }; } }
      uidMap.set(g(te, 'UID'), t.id);
      for (const pl of te.getElementsByTagName('PredecessorLink')) pending.push({ t, pu: g(pl, 'PredecessorUID'), type: MSP_TYPE_INV[+g(pl, 'Type')] || 'FS', lag: Math.round((+g(pl, 'LinkLag') || 0) / (minPerDay * 10)) });
      p.tasks.push(t);
    }
    for (const x of pending) { const id = uidMap.get(x.pu); if (id) x.t.predecessors.push({ id, type: x.type, lag: x.lag }); }
    const asg = root.getElementsByTagName('Assignments')[0];
    if (asg) for (const a of asg.getElementsByTagName('Assignment')) { const tid = uidMap.get(g(a, 'TaskUID')), rid = resMap.get(g(a, 'ResourceUID')); if (tid && rid) { const t = p.tasks.find(x => x.id === tid); if (t && !t.resources.includes(rid)) t.resources.push(rid); } }
    // Tareas sin predecesoras ni restricción: fijar su fecha de comienzo original para respetar el plan importado
    const summaryIdx = new Set(); p.tasks.forEach((t, i) => { if (p.tasks[i + 1] && p.tasks[i + 1].level > t.level) summaryIdx.add(i); });
    let k = 0;
    for (const te of tasksEl.getElementsByTagName('Task')) { if (g(te, 'IsNull') === '1' || !+g(te, 'OutlineLevel')) continue; const t = p.tasks[k++]; if (!t || summaryIdx.has(k - 1)) continue; const s = U.toDay(g(te, 'Start')); if (s != null && !t.predecessors.length && t.constraint.type === 'ASAP' && s > U.toDay(p.start)) t.constraint = { type: 'SNET', date: U.fromDay(s) }; }
    Store.mutate(() => p);
  }

  return { json, csv, mspXML, svg, png, print, importFile };
})();
