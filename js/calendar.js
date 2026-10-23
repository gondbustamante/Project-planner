/* Calendario laboral: días laborables de la semana + festivos */
class WorkCalendar {
  constructor(workDays, holidays) {
    this.workSet = new Set((workDays && workDays.length) ? workDays : [1, 2, 3, 4, 5]);
    this.holidays = new Set((holidays || []).map(U.toDay).filter(d => d != null));
  }
  isWork(n) { return this.workSet.has(U.dow(n)) && !this.holidays.has(n); }
  /** Primer día laborable >= n */
  next(n) { let g = 0; while (!this.isWork(n) && g++ < 400) n++; return n; }
  /** Último día laborable <= n */
  prev(n) { let g = 0; while (!this.isWork(n) && g++ < 400) n--; return n; }
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
}
