// src/lib/outbox.js  (dueño: P1) — bandeja de salida del motorista sin señal
// Si una entrega o una no entrega no se puede enviar por falta de conexión, se guarda en el teléfono
// (en web, en el navegador) y se envía sola cuando vuelve la señal: al evento "online" y cada 30 s.
// Lo que falla por otro motivo (p. ej. el despacho cambió ese pedido) queda con su error para quitarlo.
import { useSyncExternalStore } from 'react';
import { getShipment } from '../features/shipments/shipmentsService';
import { changeStatus } from '../features/shipments/statusMachine';

const KEY = 'siman-logistica:bandeja';
const RETRY_MS = 30000;

const storage = (() => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
})();

let state = { items: load(), sending: false };
const listeners = new Set();

function load() {
  try {
    return JSON.parse(storage?.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
function setState(next) {
  state = next;
  try {
    storage?.setItem(KEY, JSON.stringify(state.items));
  } catch {
    // sin espacio: queda en memoria mientras la app esté abierta
  }
  listeners.forEach((l) => l());
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** true si el error fue por falta de conexión (Firestore sin servidor, red caída). */
export function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (['unavailable', 'deadline-exceeded'].includes(err?.code)) return true;
  return /offline|network|sin conexión|failed to fetch|unavailable/i.test(String(err?.message ?? ''));
}

/** Una foto en blob: no sobrevive a recargar la página: se guarda como data URL. */
async function persistable(uri) {
  if (!uri || !String(uri).startsWith('blob:')) return uri;
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Guarda en el teléfono un cambio de estado que no se pudo enviar.
 * @param {{ shipmentId, code, to, payload: { photoUri, signatureBase64?, description, reason? }, driverId }} change
 */
export async function queueStatusChange({ shipmentId, code, to, payload, driverId }) {
  const item = {
    id: `${shipmentId}-${Date.now()}`,
    shipmentId,
    code,
    to,
    driverId,
    payload: { ...payload, photoUri: await persistable(payload?.photoUri) },
    savedAt: new Date().toISOString(),
    error: null,
  };
  setState({ ...state, items: [...state.items.filter((x) => x.shipmentId !== shipmentId), item] });
  return item;
}

/** Lo que está por enviar: { items: [{ id, code, to, savedAt, error }], sending }. */
export const useOutbox = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
/** Lo guardado, fuera de React (servicios y pruebas). */
export const outboxItems = () => state.items;
/** Las paradas guardadas en la bandeja ya cuentan como hechas en la lista del motorista. */
export const queuedShipmentIds = () => new Set(state.items.map((x) => x.shipmentId));

/** Envía lo guardado, en orden. Para al primer fallo por señal; otro error queda en su item. */
export async function flushOutbox() {
  if (state.sending || !state.items.length) return { sent: 0, failed: 0 };
  setState({ ...state, sending: true });
  let sent = 0;
  let failed = 0;
  for (const item of [...state.items]) {
    if (item.error) continue;
    try {
      const shipment = await getShipment(item.shipmentId);
      if (!shipment) throw new Error(`El pedido ${item.code} ya no existe`);
      // Un envío que se cortó por tiempo pudo llegar igual: si ya está en ese estado, no se repite
      const landed = shipment.status === item.to || (item.to === 'no_entregado' && shipment.status === 'devuelto');
      if (!landed) await changeStatus({ shipment, to: item.to, payload: item.payload, driverId: item.driverId });
      sent += 1;
      setState({ ...state, items: state.items.filter((x) => x.id !== item.id) });
    } catch (err) {
      if (isOfflineError(err)) break; // sin señal todavía: se intenta más tarde
      failed += 1;
      setState({ ...state, items: state.items.map((x) => (x.id === item.id ? { ...x, error: err.message } : x)) });
    }
  }
  setState({ ...state, sending: false });
  return { sent, failed };
}

/** Quita un item que no se pudo enviar por otro motivo. */
export function discardQueued(id) {
  setState({ ...state, items: state.items.filter((x) => x.id !== id) });
}

// Reintento automático: al volver la señal y cada 30 s mientras haya algo por enviar
if (typeof window !== 'undefined' && window.addEventListener && !process.env.JEST_WORKER_ID) {
  window.addEventListener('online', () => flushOutbox());
  setInterval(() => {
    if (state.items.some((x) => !x.error)) flushOutbox();
  }, RETRY_MS);
}
