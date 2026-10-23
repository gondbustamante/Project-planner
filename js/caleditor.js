/* Editor reutilizable de calendarios (proyecto y responsables): días laborables + excepciones */
const CalendarEditor = (() => {
  const $ = (root, sel) => root.querySelector(sel);

  /** Domingo de Pascua (algoritmo de Meeus) */
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return Math.round(Date.UTC(y, month - 1, day) / U.MS);
  }
  function spainHolidays(y) {
    const fixed = [['01-01', 'Año Nuevo'], ['01-06', 'Epifanía del Señor'], ['05-01', 'Fiesta del Trabajo'], ['08-15', 'Asunción de la Virgen'], ['10-12', 'Fiesta Nacional de España'], ['11-01', 'Todos los Santos'], ['12-06', 'Día de la Constitución'], ['12-08', 'Inmaculada Concepción'], ['12-25', 'Navidad']];
    const list = fixed.map(([md, name]) => ({ from: `${y}-${md}`, to: `${y}-${md}`, name, working: false }));
    const gf = U.fromDay(easter(y) - 2);
    list.push({ from: gf, to: gf, name: 'Viernes Santo', working: false });
    return list.sort((a, b) => a.from.localeCompare(b.from));
  }

  /**
   * @param container elemento donde pintar
   * @param cal {workDays, exceptions}
   * @param opts {projectWorkDays, allowInherit}  allowInherit → ofrece "usar los días laborables del proyecto"
   */
  function render(container, cal, opts = {}) {
    cal = Store.normalizeCalendar(cal, !opts.allowInherit);
    const inherit = opts.allowInherit && !cal.workDays;
    const wd = cal.workDays || opts.projectWorkDays || [1, 2, 3, 4, 5];
    const year = new Date().getFullYear();
    container.innerHTML = `
      <fieldset>
        <legend>Días laborables de la semana</legend>
        ${opts.allowInherit ? `<label class="check inherit"><input type="checkbox" class="c-inherit" ${inherit ? 'checked' : ''}> Usar los días laborables del proyecto (${(opts.projectWorkDays || []).map(d => U.DAYS_LONG[d].slice(0, 3)).join(', ') || '—'})</label>` : ''}
        <div class="weekdays c-days" ${inherit ? 'style="opacity:.5"' : ''}>${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" value="${d}" ${wd.includes(d) ? 'checked' : ''} ${inherit ? 'disabled' : ''}>${U.DAYS_LONG[d].slice(0, 3)}</label>`).join('')}</div>
      </fieldset>
      <fieldset>
        <legend>${opts.allowInherit ? 'Excepciones personales (vacaciones, permisos, días extra)' : 'Festivos y excepciones del proyecto'}</legend>
        <table class="mini c-ex"><thead><tr><th style="width:135px">Desde</th><th style="width:135px">Hasta</th><th>Descripción</th><th style="width:120px">Tipo</th><th style="width:30px"></th></tr></thead><tbody></tbody></table>
        <div class="cal-tools">
          <button type="button" class="secondary c-add">+ Añadir excepción</button>
          ${opts.allowInherit ? '' : `<span class="spacer"></span><input type="number" class="c-year" value="${year}" min="2000" max="2100" style="width:80px" title="Año"> <button type="button" class="secondary c-spain">Añadir festivos nacionales (España)</button>`}
        </div>
        <div class="hint">Un día marcado como «Laborable» cuenta como día de trabajo aunque caiga en fin de semana o festivo. Los rangos incluyen ambos extremos.</div>
      </fieldset>`;
    const tb = $(container, '.c-ex tbody');
    const addRow = (e = { from: '', to: '', name: '', working: false }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input type="date" class="ex-from" value="${e.from || ''}"></td><td><input type="date" class="ex-to" value="${e.to || e.from || ''}"></td><td><input class="ex-name" value="${U.esc(e.name || '')}" placeholder="Festivo, vacaciones…"></td><td><select class="ex-working"><option value="0">No laborable</option><option value="1" ${e.working ? 'selected' : ''}>Laborable</option></select></td><td><button type="button" class="link ex-del" title="Quitar">✕</button></td>`;
      const from = tr.querySelector('.ex-from'), to = tr.querySelector('.ex-to');
      from.addEventListener('change', () => { if (!to.value || to.value < from.value) to.value = from.value; });
      tr.querySelector('.ex-del').onclick = () => tr.remove();
      tb.appendChild(tr); return tr;
    };
    cal.exceptions.forEach(addRow);
    $(container, '.c-add').onclick = () => { const tr = addRow(); tr.querySelector('.ex-from').focus(); };
    const spain = $(container, '.c-spain');
    if (spain) spain.onclick = () => {
      const y = parseInt($(container, '.c-year').value, 10) || year;
      const existing = new Set([...tb.querySelectorAll('tr')].map(tr => tr.querySelector('.ex-from').value));
      let n = 0; for (const h of spainHolidays(y)) if (!existing.has(h.from)) { addRow(h); n++; }
      App.toast(n ? `${n} festivos de ${y} añadidos (revisa los autonómicos y locales)` : `Los festivos de ${y} ya estaban añadidos`);
    };
    const inh = $(container, '.c-inherit');
    if (inh) inh.onchange = () => { const on = inh.checked; $(container, '.c-days').style.opacity = on ? .5 : 1; container.querySelectorAll('.c-days input').forEach(i => i.disabled = on); };
  }

  /** Lee el calendario del editor. Devuelve null si no hay ningún día laborable (inválido). */
  function read(container) {
    const inh = $(container, '.c-inherit');
    const inherit = inh && inh.checked;
    const workDays = inherit ? null : [...container.querySelectorAll('.c-days input:checked')].map(i => +i.value);
    if (!inherit && !workDays.length) return null;
    const exceptions = [...container.querySelectorAll('.c-ex tbody tr')].map(tr => ({ from: tr.querySelector('.ex-from').value, to: tr.querySelector('.ex-to').value || tr.querySelector('.ex-from').value, name: tr.querySelector('.ex-name').value.trim(), working: tr.querySelector('.ex-working').value === '1' }))
      .filter(e => U.toDay(e.from) != null);
    return { workDays, exceptions: WorkCalendar.normalizeExceptions(exceptions).sort((a, b) => a.from.localeCompare(b.from)) };
  }

  /** Resumen corto de un calendario personal para mostrarlo en listas */
  function summary(cal, projectWorkDays) {
    if (!cal) return 'Calendario del proyecto';
    const parts = [];
    if (cal.workDays && cal.workDays.length) parts.push([1, 2, 3, 4, 5, 6, 0].filter(d => cal.workDays.includes(d)).map(d => U.DAYS[d]).join(''));
    const off = cal.exceptions.filter(e => !e.working).length, on = cal.exceptions.filter(e => e.working).length;
    if (off) parts.push(`${off} excepción${off > 1 ? 'es' : ''}`);
    if (on) parts.push(`${on} día${on > 1 ? 's' : ''} extra`);
    return parts.length ? 'Personal: ' + parts.join(' · ') : 'Personal (igual al proyecto)';
  }

  return { render, read, summary, spainHolidays };
})();
