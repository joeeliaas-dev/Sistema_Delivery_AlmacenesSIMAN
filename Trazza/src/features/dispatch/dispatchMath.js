import { MAX_ATTEMPTS, PRIORITY, ROUTE_STATUS, SIN_ZONA, STATUS } from '../../constants';
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
export function dateShiftLabel(dateISO, now = new Date()) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const h = now.getHours();
  const shift = h < 12 ? 'matutino' : h < 18 ? 'vespertino' : 'nocturno';
  return `${DAYS[day.getDay()]} ${d} de ${MONTHS[m - 1]} · Turno ${shift}`;
}
export function shortDate(dateISO) {
  const [, m, d] = dateISO.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}
export function addDays(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
export const isRetry = (s) => s.status === STATUS.NO_ENTREGADO && s.attempts < MAX_ATTEMPTS;
export const isRoutable = (s) => s.status === STATUS.PENDIENTE || isRetry(s);
export function countByStage(shipments) {
  const c = {
    pendientes: 0,
    enRuta: 0,
    entregados: 0,
  };
  for (const s of shipments) {
    if (isRoutable(s)) c.pendientes++;
    else if (s.status === STATUS.ASIGNADO || s.status === STATUS.EN_RUTA) c.enRuta++;
    else if (s.status === STATUS.ENTREGADO) c.entregados++;
  }
  return c;
}
export const matchesPriority = (filter) => (s) => filter === 'todos' || s.priority === filter;
export function splitByZone(shipments) {
  const zoned = [],
    noZone = [];
  for (const s of shipments) (s.zoneId === SIN_ZONA ? noZone : zoned).push(s);
  return {
    zoned,
    noZone,
  };
}
export const itemCount = (s) => (s.items ?? []).reduce((sum, it) => sum + (it.qty ?? 1), 0);
export function shortName(name = '') {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : (first ?? '');
}
export function assignmentLabel(shipment, routesById, driversById) {
  if (!shipment.routeId) return null;
  const route = routesById[shipment.routeId];
  if (!route) return 'Ruta asignada';
  const driver = driversById[route.driverId];
  return driver ? `${route.code} - ${shortName(driver.name)}` : route.code;
}
export const shortCode = (code = '') => code.replace(/^SIM-/, '');
export function toMapStops(shipments, { numbered = false } = {}) {
  return shipments.map((s, i) => ({
    id: s.id,
    location: s.location,
    label: numbered ? String(s.stopSequence ?? i + 1) : shortCode(s.code),
    priority: s.priority ?? PRIORITY.NORMAL,
    status: s.status,
    title: s.customer?.name ?? s.code,
    subtitle: [s.code, s.scheduledTime].filter(Boolean).join(' · '),
  }));
}
export function latestZoneRoute(routes, zoneId) {
  const ms = (v) => (typeof v?.toMillis === 'function' ? v.toMillis() : Date.parse(v) || 0);
  return routes.filter((r) => r.zoneId === zoneId).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0] ?? null;
}
export function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const savedKm = (route) => Math.max(0, (route?.baselineKm ?? 0) - (route?.totalKm ?? 0));
export function kmOptimized(routes) {
  let base = 0,
    total = 0;
  for (const r of routes) {
    base += r.baselineKm ?? 0;
    total += Math.min(r.totalKm ?? 0, r.baselineKm ?? 0);
  }
  const km = routes.reduce((sum, r) => sum + savedKm(r), 0);
  return {
    km,
    pct: base > 0 ? ((base - total) / base) * 100 : 0,
  };
}
const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];
export function routeProgress(route, shipmentsById) {
  const rows = (route?.stops ?? []).map((st) => {
    const shipment = shipmentsById[st.shipmentId] ?? null;
    const moved = !shipment || shipment.routeId !== route.id;
    return {
      ...st,
      shipment,
      moved,
      closed: moved || CLOSED.includes(shipment.status),
    };
  });
  const done = rows.filter((r) => r.closed).length;
  const total = rows.length;
  return {
    rows,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    open: done < total,
  };
}
export function routeStageLabel(route, progress) {
  if (progress.total && !progress.open) return 'Completada';
  return route?.status === ROUTE_STATUS.EN_CURSO ? 'En curso' : 'Asignada';
}
