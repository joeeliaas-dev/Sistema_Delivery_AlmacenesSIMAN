import { STATUS } from '../../constants';
import { remainingEtas } from '../../lib/eta';
const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];
export const isClosed = (shipment) => CLOSED.includes(shipment.status);
export function splitStops(route, shipments) {
  const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
  const etas = remainingEtas(route, byId);
  const ordered = [...(route?.stops ?? [])]
    .sort((a, b) => a.seq - b.seq)
    .map((stop) => {
      const shipment = byId[stop.shipmentId] ?? null;
      const moved = !shipment || shipment.routeId !== route.id;
      return {
        ...stop,
        shipment,
        moved,
        closed: moved || isClosed(shipment),
        eta: etas[stop.shipmentId],
      };
    });
  const completed = ordered.filter((s) => s.closed);
  const open = ordered.filter((s) => !s.closed);
  const total = ordered.length;
  const done = completed.length;
  return {
    next: open[0] ?? null,
    remaining: open.slice(1),
    completed,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}
export function formatClock(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) return value;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const itemCount = (shipment) => (shipment.items ?? []).reduce((sum, i) => sum + (i.qty ?? 1), 0);
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
