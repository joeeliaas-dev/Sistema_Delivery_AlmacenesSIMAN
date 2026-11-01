// src/features/shipments/statusMachine.js  (dueño: P1)
// Única puerta para cambiar el estado de un envío. Las reglas viven en objetos de
// configuración, así la app y las pruebas usan exactamente las mismas.
// Cada cambio escribe el envío y su evento en una sola transacción (todo o nada).
import { FAIL_REASONS, MAX_ATTEMPTS, MIN_DESCRIPTION_LENGTH, STATUS } from '../../constants';
import { NOW, commitOps } from '../../lib/writer';
import { getCurrentGps } from '../evidence/getCurrentGps';
import { uploadEvidence } from '../evidence/uploadEvidence';
import { getShipment } from './shipmentsService';

export const TRANSITIONS = {
  pendiente: ['asignado'],
  asignado: ['en_ruta'],
  en_ruta: ['entregado', 'no_entregado'],
  no_entregado: ['asignado', 'devuelto'],
};

export const REQUIRED_EVIDENCE = {
  entregado: ['photoUri', 'signatureBase64', 'description'],
  no_entregado: ['reason', 'photoUri', 'description'],
};

const LABELS = { photoUri: 'foto', signatureBase64: 'firma', description: 'descripción', reason: 'motivo' };

export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

function validate(to, payload) {
  const missing = (REQUIRED_EVIDENCE[to] ?? []).filter((f) => !payload[f]);
  if (missing.length) throw new Error(`Falta: ${missing.map((f) => LABELS[f]).join(', ')}`);
  if (payload.description && payload.description.trim().length < MIN_DESCRIPTION_LENGTH)
    throw new Error(`La descripción debe tener al menos ${MIN_DESCRIPTION_LENGTH} caracteres`);
  if (to === STATUS.NO_ENTREGADO && !FAIL_REASONS.includes(payload.reason))
    throw new Error('Elija un motivo de la lista');
}

// Siempre se valida contra el estado guardado, no contra la copia de la pantalla
// (evita dobles toques y pantallas desactualizadas).
async function fresh(shipmentOrId) {
  const id = typeof shipmentOrId === 'string' ? shipmentOrId : shipmentOrId?.id;
  const current = id ? await getShipment(id) : null;
  if (!current) throw new Error(`No existe el envío ${id ?? ''}`.trim());
  return current;
}

// Actualiza el envío solo si sigue en el estado que se leyó (otro teléfono pudo cambiarlo)
const shipmentUpdate = (shipment, data) => ({
  kind: 'update',
  col: 'shipments',
  id: shipment.id,
  data,
  expect: {
    field: 'status',
    value: shipment.status,
    error: `El envío ${shipment.code} cambió de estado en otro dispositivo. Vuelva a abrirlo e intente de nuevo.`,
  },
});

const event = (shipment, fromStatus, toStatus, data) => ({
  kind: 'addEvent',
  shipmentId: shipment.id,
  data: {
    fromStatus,
    toStatus,
    at: NOW,
    driverId: null,
    attempt: shipment.attempts + 1,
    reason: null,
    description: null,
    photoUrl: null,
    signatureUrl: null,
    gps: null,
    ...data,
  },
});

/**
 * Entregado o No entregado, con evidencia. El 2.º fallo pasa solo a devuelto.
 * @returns {Promise<{ status: string }>} estado final: entregado | no_entregado | devuelto
 */
export async function changeStatus({ shipment: given, to, payload = {}, driverId = null }) {
  const shipment = await fresh(given);
  if (!canTransition(shipment.status, to)) throw new Error(`No se puede pasar de ${shipment.status} a ${to}`);
  if (!REQUIRED_EVIDENCE[to]) throw new Error(`Para pasar a ${to} use changeStatusMany o assignToRoute`);
  validate(to, payload);

  const failed = to === STATUS.NO_ENTREGADO;
  const attempt = shipment.attempts + 1; // número de este intento
  const attempts = shipment.attempts + (failed ? 1 : 0);
  const gps = await getCurrentGps();
  // { photoUrl, signatureUrl?, inline? }: con evidencia en Firestore (N35), las imágenes vienen en
  // `inline` y se guardan abajo, en la misma transacción que el cambio de estado
  const { inline, ...files } = await uploadEvidence({
    code: shipment.code,
    attempt,
    photoUri: payload.photoUri,
    signatureBase64: failed ? undefined : payload.signatureBase64,
  });
  const record = { ...files, description: payload.description.trim(), gps, at: new Date().toISOString() };
  const returned = failed && attempts >= MAX_ATTEMPTS;
  const status = returned ? STATUS.DEVUELTO : to;

  const ops = [
    shipmentUpdate(shipment, {
      status,
      attempts,
      updatedAt: NOW,
      ...(failed ? { lastFailure: { ...record, reason: payload.reason } } : { lastEvidence: record }),
    }),
    event(shipment, shipment.status, to, { ...record, at: NOW, driverId, attempt, reason: payload.reason ?? null }),
  ];
  if (returned) ops.push(event(shipment, STATUS.NO_ENTREGADO, STATUS.DEVUELTO, { driverId, attempt, automatic: true }));
  if (inline)
    ops.push({
      kind: 'create',
      col: 'evidence',
      id: inline.id,
      data: { ...inline.data, shipmentId: shipment.id, createdAt: NOW },
      existsError: `Ya existe evidencia del intento ${attempt} de ${shipment.code}`,
    });
  await commitOps(ops);
  return { status };
}

/**
 * Cambio sin evidencia de varios envíos a la vez (Iniciar ruta: asignado → en_ruta).
 * Si alguno no puede cambiar, no se cambia ninguno.
 * @param {{ shipmentIds: string[], to: string, driverId?: string,
 *   routeStatus?: { routeId: string, status: string } }} args
 *   routeStatus: cambia el estado de la ruta en la misma escritura (startRoute de P2)
 */
export async function changeStatusMany({ shipmentIds, to, driverId = null, routeStatus }) {
  if (REQUIRED_EVIDENCE[to]) throw new Error(`Para pasar a ${to} use changeStatus con evidencia`);
  const shipments = await Promise.all(shipmentIds.map(fresh));
  const blocked = shipments.filter((s) => !canTransition(s.status, to));
  if (blocked.length)
    throw new Error(`No se puede pasar a ${to}: ${blocked.map((s) => `${s.code} (${s.status})`).join(', ')}`);

  const ops = shipments.flatMap((s) => [
    shipmentUpdate(s, { status: to, updatedAt: NOW }),
    event(s, s.status, to, { driverId }),
  ]);
  if (routeStatus)
    ops.push({ kind: 'update', col: 'routes', id: routeStatus.routeId, data: { status: routeStatus.status } });
  await commitOps(ops);
  return { count: shipments.length };
}

/**
 * Pasa a asignado los envíos de una ruta recién creada.
 * Acepta pendientes y no_entregado con 1 intento fallido (reintento).
 * Si se pasa `route`, el documento routes/{routeId} se crea en la misma escritura:
 * o se guardan la ruta y la asignación juntas, o no se guarda nada (sin rutas huérfanas).
 * @param {{ routeId: string, stops: Array<{ shipmentId, seq, etaMin }>, driverId?: string,
 *   route?: object }} args  route: campos del documento de la ruta, sin id ni createdAt
 */
export async function assignToRoute({ routeId, stops, driverId = null, route }) {
  const shipments = await Promise.all(stops.map((st) => fresh(st.shipmentId)));
  const blocked = shipments.filter(
    (s) =>
      !canTransition(s.status, STATUS.ASIGNADO) || (s.status === STATUS.NO_ENTREGADO && s.attempts >= MAX_ATTEMPTS),
  );
  if (blocked.length)
    throw new Error(`No se pueden asignar: ${blocked.map((s) => `${s.code} (${s.status})`).join(', ')}`);

  const ops = stops.flatMap((st, i) => {
    const s = shipments[i];
    return [
      shipmentUpdate(s, { status: STATUS.ASIGNADO, routeId, stopSequence: st.seq, etaMin: st.etaMin, updatedAt: NOW }),
      event(s, s.status, STATUS.ASIGNADO, { driverId }),
    ];
  });
  // La ruta solo se crea si no existe: si dos teléfonos la generan a la vez, gana uno
  if (route)
    ops.unshift({
      kind: 'create',
      col: 'routes',
      id: routeId,
      data: { ...route, createdAt: NOW },
      existsError: 'La zona ya tiene una ruta abierta hoy',
    });
  await commitOps(ops);
  return { count: stops.length };
}
