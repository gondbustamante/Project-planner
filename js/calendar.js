/* Calendario laboral: días laborables de la semana + excepciones (festivos, vacaciones, rangos no laborables) */
class WorkCalendar {
  /**
   * @param workDays  días de la semana laborables (0 = domingo … 6 = sábado)
   * @param exceptions lista de 'AAAA-MM-DD' o de objetos {from, to, name, working}
   */
  constructor(workDays, exceptions) {
    this.workSet = new Set((workDays && workDays.length) ? workDays : [1, 2, 3, 4, 5]);
    this.off = new Set();   // días no laborables puntuales
    this.on = new Set();    // días laborables extra (excepción "laborable")
    for (const e of WorkCalendar.normalizeExceptions(exceptions)) {
      const a = U.toDay(e.from), b = U.toDay(e.to);
      if (a == null || b == null) continue;
      for (let d = a; d <= b && d - a < 400; d++) { this.on.delete(d); this.off.delete(d); (e.working ? this.on : this.off).add(d); } // la última excepción prevalece
    }
  }
  static normalizeExceptions(list) {
    return (list || []).map(e => {
      if (typeof e === 'string') return { from: e, to: e, name: '', working: false };
      const from = e.from || e.date || e.to, to = e.to || from;
      return { from, to, name: e.name || '', working: !!e.working };
    }).filter(e => U.toDay(e.from) != null && U.toDay(e.to) != null).map(e => U.toDay(e.to) < U.toDay(e.from) ? { ...e, from: e.to, to: e.from } : e);
  }
  isWork(n) { if (this.on.has(n)) return true; if (this.off.has(n)) return false; return this.workSet.has(U.dow(n)); }
  /** Primer día laborable >= n */
  next(n) { let g = 0; while (!this.isWork(n) && g++ < 800) n++; return n; }
  /** Último día laborable <= n */
  prev(n) { let g = 0; while (!this.isWork(n) && g++ < 800) n--; return n; }
  /** Desplaza k días laborables desde n (n se asume laborable). k puede ser negativo. */
  add(n, k) {
    if (k > 0) { for (let i = 0; i < k; i++) n = this.next(n + 1); }
    else if (k < 0) { for (let i = 0; i < -k; i++) n = this.prev(n - 1); }
    return n;
  }
  /** Nº de días laborables n con a <= n < b (negativo si b < a) */
  count(a, b) {
    if (b < a) return -this.count(b, a);
    let c = 0; for (let n = a; n < b; n++) if (this.isWork(n)) c++;
    return c;
  }
  /** Duración en días laborables del intervalo cerrado [s, f] */
  duration(s, f) { return this.count(s, f + 1); }
  /** ¿Tiene al menos un día laborable a la semana? */
  get hasWorkDays() { return this.workSet.size > 0; }
}

/** Calendario compuesto: un día es laborable solo si lo es en todos los calendarios (proyecto ∩ responsables) */
class CompositeCalendar extends WorkCalendar {
  constructor(cals) {
    super([...cals[0].workSet], []);
    this.cals = cals;
    this.workSet = new Set([...cals[0].workSet].filter(d => cals.every(c => c.workSet.has(d))));
  }
  isWork(n) { return this.cals.every(c => c.isWork(n)); }
}
