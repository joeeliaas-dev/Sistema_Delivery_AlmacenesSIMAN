// src/lib/dates.js  (dueño: P1)
const pad = (n) => String(n).padStart(2, '0');

// Fecha local del teléfono en formato de scheduledDate: "2026-10-12"
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
