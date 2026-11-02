// src/features/driver/outboxMath.js (dueño: P3)
// Textos del aviso "sin señal" del motorista, a partir de la bandeja de P1 (useOutbox) y de si el
// teléfono tiene conexión. Sin React.

const plural = (n) => `${n} ${n === 1 ? 'entrega' : 'entregas'}`;

/**
 * Aviso de arriba del motorista, o null si no hay nada que decir.
 * @param {{ items: Array<{ error: string|null }>, sending: boolean }} outbox
 * @param {boolean} online
 * @returns {{ tone: 'warning'|'info', text: string, canSend: boolean }|null}
 */
export function outboxNotice(outbox, online) {
  const pending = (outbox?.items ?? []).filter((x) => !x.error).length;
  if (outbox?.sending) return { tone: 'info', text: `Enviando ${plural(pending)} guardadas…`, canSend: false };
  if (!online && pending)
    return {
      tone: 'warning',
      text: `Sin señal · ${plural(pending)} por enviar. Se envían solas cuando vuelva la señal.`,
      canSend: false,
    };
  if (!online) return { tone: 'warning', text: 'Sin señal. Lo que registre se guarda en el teléfono.', canSend: false };
  if (pending) return { tone: 'info', text: `${plural(pending)} por enviar`, canSend: true };
  return null;
}

/** Las que no se pudieron enviar por otro motivo (no la señal): "SIM-0419: El pedido ya no existe". */
export const failedItems = (outbox) => (outbox?.items ?? []).filter((x) => x.error);
