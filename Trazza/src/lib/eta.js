import { STATUS } from '../constants';
const CLOSED = [STATUS.ENTREGADO, STATUS.NO_ENTREGADO, STATUS.DEVUELTO];
export function remainingEtas(route, shipmentsById) {
  const stops = [...(route?.stops ?? [])].sort((a, b) => a.seq - b.seq);
  const isClosed = (st) => {
    const s = shipmentsById[st.shipmentId];
    return !s || s.routeId !== route.id || CLOSED.includes(s.status);
  };
  const base = stops.filter(isClosed).reduce((max, st) => Math.max(max, st.etaMin ?? 0), 0);
  return Object.fromEntries(
    stops.filter((st) => !isClosed(st)).map((st) => [st.shipmentId, Math.max(0, Math.round((st.etaMin ?? 0) - base))]),
  );
}
export function formatEta(min) {
  if (min == null || Number.isNaN(min)) return '';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `~${h}h ${rest}min` : `~${h}h`;
}
