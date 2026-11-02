// src/features/driver/sendOrQueue.js (dueño: P3)
// Enviar una entrega o no entrega, o guardarla en el teléfono si no hay señal (bandeja de P1).
//   - El teléfono ya sabe que no tiene conexión: se guarda de una vez, sin intentar enviar (Firestore no
//     falla sin red: espera, y la pantalla quedaría en "Guardando…").
//   - Se intentó y falló por la señal (isOfflineError de P1): se guarda.
//   - Falló por otro motivo: el error sigue hacia la pantalla.
import { isOfflineError, queueStatusChange } from '../../lib/outbox';

/**
 * @param {{ online: boolean, send: () => Promise<any>, change: object }} p  change: lo que recibe queueStatusChange
 * @returns {Promise<{ queued: boolean, result?: any }>}
 */
export async function sendOrQueue({ online, send, change }) {
  if (!online) {
    await queueStatusChange(change);
    return { queued: true };
  }
  try {
    return { queued: false, result: await send() };
  } catch (err) {
    if (!isOfflineError(err)) throw err;
    await queueStatusChange(change);
    return { queued: true };
  }
}
