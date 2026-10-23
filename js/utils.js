/* Utilidades de fechas (días como enteros UTC) y helpers varios */
const U = (() => {
  const MS = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const toDay = s => {
    if (typeof s === 'number') return s;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS);
  };
  const fromDay = n => new Date(n * MS).toISOString().slice(0, 10);
  const dow = n => (((n + 4) % 7) + 7) % 7; // 0 = domingo
  const today = () => { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS); };
  const parts = n => { const d = new Date(n * MS); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
  const fmt = n => { if (n == null) return ''; const p = parts(n); return `${pad(p.d)}/${pad(p.m + 1)}/${p.y}`; };
  const parseUserDate = s => {
    s = String(s || '').trim();
    let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return Math.round(Date.UTC(y, +m[2] - 1, +m[1]) / MS); }
    return toDay(s);
  };
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const download = (name, content, type) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  const safeName = s => (s || 'proyecto').replace(/[^\w\dáéíóúñÁÉÍÓÚÑ -]+/g, '').trim().replace(/\s+/g, '_') || 'proyecto';
  const PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#0d9488'];
  return { MS, pad, toDay, fromDay, dow, today, parts, fmt, parseUserDate, MONTHS, MONTHS_LONG, DAYS, DAYS_LONG, uid, esc, clamp, download, safeName, PALETTE };
})();
