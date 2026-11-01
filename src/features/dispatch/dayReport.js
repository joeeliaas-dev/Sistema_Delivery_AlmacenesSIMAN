// src/features/dispatch/dayReport.js  (dueño: P2)
// Reporte del día (app/despacho/reporte.js): totales por estado y motivo, una fila por motorista y las
// hojas del Excel. Cálculos puros, sin React ni Firestore, para probarlos con Jest. Solo lectura.
// Las horas salen de routeTimes (P1, C42), las mismas que ven el despacho y el teléfono.
import { FAIL_REASONS, STATUS, UNASSIGNED_REASON } from '../../constants';
import { routeTimes } from '../../lib/eta';
import { REASON_LABEL, formatClock, routeProgress, routeStageLabel, savedKm, waitingOf } from './dispatchMath';

export const WAITING = 'espera'; // sin asignar porque la ruta de su zona ya salió
const UNASSIGNED_LABEL = { ...REASON_LABEL, [WAITING]: 'Espera otra ruta (la de su zona ya salió)' };
const OTHER = 'Otro motivo';
const STATUS_TEXT = {
  [STATUS.PENDIENTE]: 'Pendiente',
  [STATUS.ASIGNADO]: 'Asignado',
  [STATUS.EN_RUTA]: 'En ruta',
  [STATUS.ENTREGADO]: 'Entregado',
  [STATUS.NO_ENTREGADO]: 'No entregado',
  [STATUS.DEVUELTO]: 'Devuelto',
};

const indexBy = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const round1 = (n) => Math.round((n ?? 0) * 10) / 10;

/** Cuenta por clave en el orden dado; lo que no esté en el orden va al final con su nombre. */
function countBy(keys, order) {
  const counts = new Map(order.map((k) => [k, 0]));
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 0).map(([key, count]) => ({ key, count }));
}

/**
 * En qué renglón del reporte cae un pedido (uno solo):
 *   entregado | no_entregado | devuelto | sin_asignar (con motivo o esperando otra ruta) | pendiente
 * Pendiente = abierto en una ruta o nuevo, todavía sin rutear.
 */
export function reportStage(s, waitingIds = new Set()) {
  if (s.status === STATUS.ENTREGADO) return 'entregado';
  if (s.status === STATUS.DEVUELTO) return 'devuelto';
  if (s.status === STATUS.NO_ENTREGADO) return 'no_entregado';
  if (!s.routeId && (s.unassignedReason || waitingIds.has(s.id))) return 'sin_asignar';
  return 'pendiente';
}

/**
 * @param {{ shipments: object[], routes: object[], drivers?: object[], zones?: object[], date: string, now?: Date }} args
 * @returns {{ date: string, total: number, entregados: number, devueltos: number, pendientes: number,
 *   noEntregados: { total: number, byReason: Array<{ key: string, label: string, count: number }> },
 *   sinAsignar: { total: number, byReason: Array<{ key: string, label: string, count: number }> },
 *   drivers: Array<{ routeId: string, code: string, driverName: string, stage: string, done: number, total: number,
 *     totalKm: number, savedKm: number, end: string|null }>,
 *   rows: Array<{ code: string, customer: string, zone: string, route: string, driver: string, status: string,
 *     reason: string, time: string }> }}
 */
export function dayReport({ shipments, routes, drivers = [], zones = [], date, now = new Date() }) {
  const byId = indexBy(shipments);
  const driversById = indexBy(drivers);
  const zonesById = indexBy(zones);
  const routesById = indexBy(routes);
  const waitingIds = new Set(waitingOf(shipments, routes, byId, date).flatMap((g) => g.shipments.map((s) => s.id)));
  const stageOf = new Map(shipments.map((s) => [s.id, reportStage(s, waitingIds)]));
  const inStage = (stage) => shipments.filter((s) => stageOf.get(s.id) === stage);

  const failed = inStage('no_entregado');
  const failKeys = failed.map((s) => (FAIL_REASONS.includes(s.lastFailure?.reason) ? s.lastFailure.reason : OTHER));
  const unassigned = inStage('sin_asignar');
  const unKeys = unassigned.map((s) => (waitingIds.has(s.id) && !s.unassignedReason ? WAITING : s.unassignedReason));

  const times = Object.fromEntries(routes.map((r) => [r.id, routeTimes(r, byId, now)]));
  const driverRows = [...routes]
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'es', { numeric: true }))
    .map((r) => {
      const progress = routeProgress(r, byId);
      return {
        routeId: r.id,
        code: r.code,
        driverName: driversById[r.driverId]?.name ?? r.driverId ?? '',
        stage: routeStageLabel(r, progress),
        done: progress.done,
        total: progress.total,
        totalKm: round1(r.totalKm),
        savedKm: round1(savedKm(r)),
        end: times[r.id].end,
      };
    });

  const hourOf = (s) => {
    if (s.status === STATUS.ENTREGADO) return formatClock(s.lastEvidence?.at);
    if (s.status === STATUS.NO_ENTREGADO || s.status === STATUS.DEVUELTO) return formatClock(s.lastFailure?.at);
    return (s.routeId && times[s.routeId]?.stops[s.id]) || '';
  };
  const reasonOf = (s) => {
    const stage = stageOf.get(s.id);
    if (stage === 'no_entregado' || stage === 'devuelto') return s.lastFailure?.reason ?? '';
    if (stage === 'sin_asignar') return UNASSIGNED_LABEL[s.unassignedReason ?? WAITING] ?? s.unassignedReason;
    return '';
  };
  const rows = [...shipments]
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'es', { numeric: true }))
    .map((s) => {
      const route = routesById[s.routeId];
      return {
        code: s.code,
        customer: s.customer?.name ?? '',
        zone: zonesById[s.zoneId]?.name ?? s.zoneId ?? '',
        route: route?.code ?? '',
        driver: route ? (driversById[route.driverId]?.name ?? route.driverId ?? '') : '',
        status: STATUS_TEXT[s.status] ?? s.status ?? '',
        reason: reasonOf(s),
        time: hourOf(s),
      };
    });

  return {
    date,
    total: shipments.length,
    entregados: inStage('entregado').length,
    devueltos: inStage('devuelto').length,
    pendientes: inStage('pendiente').length,
    noEntregados: {
      total: failed.length,
      byReason: countBy(failKeys, [...FAIL_REASONS, OTHER]).map((r) => ({ ...r, label: r.key })),
    },
    sinAsignar: {
      total: unassigned.length,
      byReason: countBy(unKeys, [...Object.values(UNASSIGNED_REASON), WAITING]).map((r) => ({
        ...r,
        label: UNASSIGNED_LABEL[r.key] ?? r.key,
      })),
    },
    drivers: driverRows,
    rows,
  };
}

/** Las dos hojas del Excel como tablas (filas de celdas): "Resumen" y "Pedidos". */
export function reportSheets(report, dateLabel = report.date) {
  const resumen = [
    ['Reporte del día', dateLabel],
    [],
    ['Pedidos', report.total],
    ['Entregados', report.entregados],
    ['No entregados', report.noEntregados.total],
    ...report.noEntregados.byReason.map((r) => [`   ${r.label}`, r.count]),
    ['Devueltos', report.devueltos],
    ['Pendientes', report.pendientes],
    ['Sin asignar', report.sinAsignar.total],
    ...report.sinAsignar.byReason.map((r) => [`   ${r.label}`, r.count]),
    [],
    ['Motorista', 'Ruta', 'Estado', 'Paradas hechas', 'Paradas', 'Km planeados', 'Ahorra km', 'Fin'],
    ...report.drivers.map((d) => [d.driverName, d.code, d.stage, d.done, d.total, d.totalKm, d.savedKm, d.end ?? '']),
  ];
  const pedidos = [
    ['Código', 'Cliente', 'Zona', 'Ruta', 'Motorista', 'Estado', 'Motivo', 'Hora'],
    ...report.rows.map((r) => [r.code, r.customer, r.zone, r.route, r.driver, r.status, r.reason, r.time]),
  ];
  return { Resumen: resumen, Pedidos: pedidos };
}

/** Ancho de cada columna (en caracteres, como pide SheetJS en '!cols') según su texto más largo. */
export function columnWidths(rows, { min = 8, max = 48 } = {}) {
  const widths = [];
  for (const row of rows)
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? min, String(cell ?? '').length + 2);
    });
  return widths.map((w) => ({ wch: Math.min(max, w ?? min) }));
}

export const reportFileName = (date) => `reporte-${date}.xlsx`;
