// src/features/orders/validateOrders.js  (dueño: P1)
// Reglas de cada columna del Excel (S4-01). Una fila con errores es roja y no se carga;
// con solo advertencias es amarilla; sin nada es verde. Los mensajes dicen qué corregir.
import { DEFAULT_SERVICE_MIN, PRIORITY, ROW_STATUS } from '../../constants';
import { todayISO } from '../../lib/dates';
import { MUNICIPIO_TO_ZONE } from '../zones/municipios';
import { normalizeText, phone8 } from '../geo/normalize';
import { normalizeHeader } from './columns';

const pad = (n) => String(n).padStart(2, '0');
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const str = (v) => (isBlank(v) ? '' : String(v).trim());
const KNOWN_MUNICIPIOS = new Set(Object.keys(MUNICIPIO_TO_ZONE));
const SV = { lat: [13.1, 14.5], lng: [-90.2, -87.6] };

/** Fecha de Excel (Date o número de serie), "AAAA-MM-DD" o "DD/MM/AAAA" → "AAAA-MM-DD" o null. */
export function parseDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return validYmd(+m[3], +m[2], +m[1]);
  return null;
}
function validYmd(y, m, d) {
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Hora de Excel (fracción del día o Date) o "H:MM" → "HH:MM" o null. */
export function parseTime(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const min = Math.round(v * 24 * 60);
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  }
  const m = str(v).match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${pad(+m[1])}:${m[2]}`;
}

/** Número de 0 en adelante, null si está vacío, NaN si no es número. */
function parseNumber(v) {
  if (isBlank(v)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/**
 * @param {Array<object>} rows  salida de parseOrdersFile (llaves = encabezados originales, __row)
 * @param {{ existingOrderIds?: Iterable<string>, today?: string }} [opts]
 * @returns {Array<{ rowNumber: number, order: object, status: 'verde'|'amarilla'|'roja', errors: string[], warnings: string[] }>}
 *   order: { orderNumber, customer{name,phone}, address{text,municipio,reference}, scheduledDate, timeWindow,
 *            priority, packages, serviceMin, location{lat,lng}|null }
 */
export function validateOrders(rows, { existingOrderIds = [], today = todayISO() } = {}) {
  const existing = new Set([...existingOrderIds].map((x) => str(x).toUpperCase()));
  const seen = new Set();

  return rows.map((raw, i) => {
    const r = {};
    for (const [k, v] of Object.entries(raw)) if (k !== '__row') r[normalizeHeader(k)] = v;
    const rowNumber = raw.__row ?? i + 2;
    const errors = [];
    const warnings = [];

    const orderNumber = str(r.pedido);
    if (!orderNumber) errors.push('Falta el número de pedido');
    else if (seen.has(orderNumber.toUpperCase())) errors.push(`Pedido ${orderNumber}: está repetido en el archivo`);
    else if (existing.has(orderNumber.toUpperCase())) errors.push(`Pedido ${orderNumber}: ya existe en Trazza`);
    if (orderNumber) seen.add(orderNumber.toUpperCase());

    const name = str(r.cliente);
    if (!name) errors.push('Falta el nombre del cliente');

    const rawPhone = str(r.telefono);
    const phone = phone8(rawPhone);
    if (!rawPhone) errors.push('Falta el teléfono');
    else if (!phone) errors.push(`Teléfono ${rawPhone}: debe tener 8 dígitos y empezar con 2, 6 o 7`);

    const text = str(r.direccion);
    if (!text) errors.push('Falta la dirección');

    const municipio = str(r.municipio);
    if (!municipio) errors.push('Falta el municipio');
    else if (!KNOWN_MUNICIPIOS.has(normalizeText(municipio)))
      warnings.push(`Municipio "${municipio}" no está en la lista; revise la zona`);

    const date = parseDate(r.fecha);
    if (isBlank(r.fecha)) errors.push('Falta la fecha de entrega');
    else if (!date) errors.push(`Fecha "${str(r.fecha)}": use AAAA-MM-DD o DD/MM/AAAA`);
    else if (date < today) errors.push(`Fecha ${date}: no puede ser anterior a hoy`);

    let timeWindow = null;
    const from = isBlank(r.desde) ? null : parseTime(r.desde);
    const to = isBlank(r.hasta) ? null : parseTime(r.hasta);
    if (!isBlank(r.desde) && !from) errors.push(`Hora desde "${str(r.desde)}": use HH:MM`);
    if (!isBlank(r.hasta) && !to) errors.push(`Hora hasta "${str(r.hasta)}": use HH:MM`);
    if (from || to) {
      const f = from ?? '07:00';
      const t = to ?? '18:00';
      if (f >= t) errors.push(`Horario ${f}–${t}: "desde" debe ser antes que "hasta"`);
      else if (f < '07:00' || t > '18:00') errors.push(`Horario ${f}–${t}: debe estar entre 07:00 y 18:00`);
      else timeWindow = { from: f, to: t };
    }

    const prio = normalizeText(r.prioridad);
    if (prio && prio !== PRIORITY.NORMAL && prio !== PRIORITY.EXPRESS)
      errors.push(`Prioridad "${str(r.prioridad)}": use normal o express`);
    const priority = prio === PRIORITY.EXPRESS ? PRIORITY.EXPRESS : PRIORITY.NORMAL;

    const packages = parseNumber(r.bultos);
    if (Number.isNaN(packages)) errors.push(`Bultos "${str(r.bultos)}": debe ser un número de 0 en adelante`);

    let location = null;
    const hasLat = !isBlank(r.lat);
    const hasLng = !isBlank(r.lng);
    if (hasLat !== hasLng) errors.push('Ponga lat y lng juntas, o deje las dos vacías');
    else if (hasLat) {
      const lat = Number(String(r.lat).replace(',', '.'));
      const lng = Number(String(r.lng).replace(',', '.'));
      if (!(lat >= SV.lat[0] && lat <= SV.lat[1] && lng >= SV.lng[0] && lng <= SV.lng[1]))
        errors.push(`Coordenadas ${str(r.lat)}, ${str(r.lng)}: están fuera de El Salvador`);
      else location = { lat, lng };
    }

    const order = {
      orderNumber,
      customer: { name, phone: phone ? `+503${phone}` : rawPhone },
      address: { text, municipio, reference: str(r.referencia) },
      scheduledDate: date,
      timeWindow,
      priority,
      packages: Number.isFinite(packages) && packages > 0 ? Math.round(packages) : 1,
      serviceMin: DEFAULT_SERVICE_MIN,
      location,
    };
    const status = errors.length ? ROW_STATUS.ROJA : warnings.length ? ROW_STATUS.AMARILLA : ROW_STATUS.VERDE;
    return { rowNumber, order, status, errors, warnings };
  });
}
