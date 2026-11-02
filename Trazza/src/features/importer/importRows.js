// src/features/importer/importRows.js (dueño: P3)
// Cálculos puros de la pantalla Importar pedidos (S4-10), sin React: semáforo, filtros y motivo.
// Las filas son las de validateOrders / resolveLocations (P1): { rowNumber, order, status, errors, warnings }.
import { LOCATION_STATUS, ROW_STATUS } from '../../constants';

/** Filtros del paso Revisar: un chip por color del semáforo. */
export const ROW_FILTERS = [
  { key: ROW_STATUS.VERDE, label: 'Listos', tone: 'success', icon: 'check_circle' },
  { key: ROW_STATUS.AMARILLA, label: 'Revisar dirección', tone: 'warning', icon: 'wrong_location' },
  { key: ROW_STATUS.ROJA, label: 'Con error', tone: 'error', icon: 'error_outline' },
];

/** { verde, amarilla, roja, total, toLoad } — toLoad: las que importOrders carga (todas menos las rojas). */
export function summarizeRows(rows) {
  const c = { verde: 0, amarilla: 0, roja: 0, total: rows.length };
  for (const r of rows) if (c[r.status] !== undefined) c[r.status] += 1;
  return { ...c, toLoad: c.verde + c.amarilla };
}

/** Filas visibles con el filtro elegido (null = todas). */
export const filterRows = (rows, status) => (status ? rows.filter((r) => r.status === status) : rows);

/** Texto de la columna Motivo: errores si es roja; si no, advertencias; vacío si está lista. */
export function rowReason(row) {
  const list = row.status === ROW_STATUS.ROJA ? row.errors : row.warnings;
  return (list ?? []).filter(Boolean).join(' · ');
}

// Error de validación (texto de P1) → palabra corta para la columna Estado. El primero que coincide gana.
const ERROR_WORDS = [
  [/tel[eé]fono/i, 'teléfono'],
  [/ya existe/i, 'ya cargado'],
  [/repetido/i, 'pedido repetido'],
  [/n[uú]mero de pedido/i, 'pedido'],
  [/nombre del cliente/i, 'cliente'],
  [/municipio/i, 'municipio'],
  [/direcci[oó]n/i, 'dirección'],
  [/fecha/i, 'fecha'],
  [/hora/i, 'horario'],
  [/coordenadas|lat y lng/i, 'coordenadas'],
  [/prioridad/i, 'prioridad'],
];
const errorWord = (msg) => ERROR_WORDS.find(([re]) => re.test(msg))?.[1] ?? null;

/**
 * Columna Estado en palabras de bodega: "Listo", "Revisar dirección", "Error: teléfono".
 * Con más de un error: "Error: teléfono +1". El detalle completo va en rowDetail (al tocar).
 */
export function rowStateLabel(row) {
  if (row.status === ROW_STATUS.ROJA) {
    const errors = (row.errors ?? []).filter(Boolean);
    const word = errors.length ? errorWord(errors[0]) : null;
    const more = errors.length > 1 ? ` +${errors.length - 1}` : '';
    return word ? `Error: ${word}${more}` : `Error${more}`;
  }
  if (row.status === ROW_STATUS.AMARILLA) return 'Revisar dirección';
  return 'Listo';
}

/**
 * Detalle que se ve al tocar la fila, una línea por motivo. Los avisos de ubicación pierden el
 * prefijo técnico: "Ubicación: confianza baja" → "Dirección dudosa".
 */
export function rowDetail(row) {
  const list = (row.status === ROW_STATUS.ROJA ? row.errors : row.warnings) ?? [];
  return list.filter(Boolean).map((msg) => {
    const m = /^Ubicación:\s*(.*)$/.exec(msg);
    if (!m) return msg;
    if (/confianza baja/i.test(m[1])) return 'Dirección dudosa';
    if (/^Sin respuesta de Geoapify/i.test(m[1])) return 'No se pudo buscar la dirección';
    return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  });
}

/** Cuántas filas cargadas quedarán para "Revisar ubicaciones". */
export function needsReviewCount(rows) {
  return rows.filter(
    (r) =>
      r.status !== ROW_STATUS.ROJA &&
      [LOCATION_STATUS.REVISAR, LOCATION_STATUS.SIN_UBICACION].includes(r.order?.location?.status),
  ).length;
}

/** "Cargar 1 pedido" / "Cargar 96 pedidos" */
export const loadButtonLabel = (n) => `Cargar ${n} ${n === 1 ? 'pedido' : 'pedidos'}`;

/** "4 con error no se cargan" / "1 con error no se carga" / null */
export const skippedNote = (n) => (n ? `${n} con error no ${n === 1 ? 'se carga' : 'se cargan'}` : null);

/**
 * Día de los pedidos que se cargan (el primero si vienen varios), para llevar la fecha de trabajo
 * a ese día después de importar. Sin filas cargables, la fecha de respaldo.
 */
export function loadedDate(rows, fallback) {
  const dates = rows
    .filter((r) => r.status !== ROW_STATUS.ROJA && r.order?.scheduledDate)
    .map((r) => r.order.scheduledDate)
    .sort();
  return dates[0] ?? fallback;
}
