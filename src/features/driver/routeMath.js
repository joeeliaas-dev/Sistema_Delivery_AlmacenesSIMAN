// src/features/driver/routeMath.js (dueño: P3)
// Cálculos puros de la Vista motorista, sin React ni Firestore.
import { STATUS } from '../../constants';
import { remainingEtas } from '../../lib/eta';

// Una parada está cerrada cuando su envío ya no se puede volver a intentar en esta ruta.
const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];

export const isClosed = (shipment) => CLOSED.includes(shipment.status);

/**
 * route.stops [{ shipmentId, seq, etaMin }] + envíos de la ruta → lo que pinta la pantalla.
 * Una parada cuyo envío ya no está en esta ruta (pasó a otra como reintento) cuenta como
 * cerrada, igual que N4 y remainingEtas: así "X de N" coincide con el Centro de despacho.
 * Cada parada abierta trae `eta`: minutos que faltan desde la última parada cerrada (N24, C21).
 * @returns {{ next, remaining, completed, done, total, percent }}  cada parada: { ...stop, shipment|null, moved, eta? }
 */
export function splitStops(route, shipments) {
  const byId = Object.fromEntries(shipments.map((s) => [s.id, s]));
  const etas = remainingEtas(route, byId);
  const ordered = [...(route?.stops ?? [])]
    .sort((a, b) => a.seq - b.seq)
    .map((stop) => {
      const shipment = byId[stop.shipmentId] ?? null;
      const moved = !shipment || shipment.routeId !== route.id;
      return { ...stop, shipment, moved, closed: moved || isClosed(shipment), eta: etas[stop.shipmentId] };
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

// Las horas ("Fin", "Llega", lista) salen de routeTimes en src/lib/eta.js (P1, C42).

/** ['la foto', 'la firma', 'la nota'] → "Falta la foto, la firma y la nota"; [] → "". */
export function missingText(missing) {
  if (!missing.length) return '';
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} y ${missing.at(-1)}`;
  return `Falta ${list}`;
}

export const itemCount = (shipment) => (shipment.items ?? []).reduce((sum, i) => sum + (i.qty ?? 1), 0);

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
