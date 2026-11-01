// src/features/shipments/statusMachine.js  (dueño: P1)
// Única puerta para cambiar el estado de un envío. Las reglas viven en objetos de
// configuración, así la app y las pruebas usan exactamente las mismas.
// Cada cambio escribe el envío y su evento en una sola transacción (todo o nada).
import { FAIL_REASONS, MAX_ATTEMPTS, MIN_DESCRIPTION_LENGTH, STATUS, UNASSIGNED_REASON } from '../../constants';
import { doc, getDoc } from 'firebase/firestore';
import { USE_MOCKS, db } from '../../lib/firebase';
import { NOW, commitOps } from '../../lib/writer';
import { mockDb } from '../../mocks';
import { getCurrentGps } from '../evidence/getCurrentGps';
import { uploadEvidence } from '../evidence/uploadEvidence';
import { getShipment } from './shipmentsService';

export const TRANSITIONS = {
  pendiente: ['asignado'],
  asignado: ['en_ruta', 'pendiente'], // pendiente: solo replanRoutes (liberar de una ruta no iniciada)
  en_ruta: ['entregado', 'no_entregado'],
  no_entregado: ['asignado', 'devuelto', 'pendiente'],
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
 * @returns {Promise<{ status: string, gps: { lat, lng, accuracyM } | null }>} estado final
 *   (entregado | no_entregado | devuelto) y el GPS guardado (S4-14: corrección de ubicación al entregar)
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
  return { status, gps };
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
 * Pasa a asignado los envíos de una ruta recién creada (la llama createRoute de P2).
 * Acepta pendientes y no_entregado con 1 intento fallido (reintento).
 * Si se pasa `route`, el documento routes/{routeId} se crea en la misma escritura:
 * o se guardan la ruta y la asignación juntas, o no se guarda nada (sin rutas huérfanas).
 * @param {{ routeId: string, stops: Array<{ shipmentId, seq, etaMin }>, driverId?: string,
 *   route?: object, unassigned?: Array<{ shipmentId: string, reason: string }> }} args
 *   route: campos del documento de la ruta, sin id ni createdAt
 *   unassigned: pedidos que el optimizador no pudo meter; su unassignedReason se escribe en la misma
 *   escritura (S4-07). Los que sí entran a la ruta quedan con unassignedReason null.
 */
export async function assignToRoute({ routeId, stops, driverId = null, route, unassigned = [] }) {
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
      shipmentUpdate(s, {
        status: STATUS.ASIGNADO,
        routeId,
        stopSequence: st.seq,
        etaMin: st.etaMin,
        unassignedReason: null,
        updatedAt: NOW,
      }),
      event(s, s.status, STATUS.ASIGNADO, { driverId }),
    ];
  });
  const left = await Promise.all(unassigned.map((u) => fresh(u.shipmentId)));
  if (unassigned.some((u) => !Object.values(UNASSIGNED_REASON).includes(u.reason)))
    throw new Error('Motivo de sin asignar desconocido');
  unassigned.forEach((u, i) => ops.push(shipmentUpdate(left[i], { unassignedReason: u.reason, updatedAt: NOW })));
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

/**
 * Reprograma un no entregado con 1 intento a otra fecha (S4-04): vuelve a pendiente, sin ruta,
 * conserva los intentos y deja un evento "reprogramado". Así el reintento de ayer aparece hoy.
 * @param {string} id
 * @param {string} newDate  'AAAA-MM-DD'
 */
export async function reprogramShipment(id, newDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate ?? '')) throw new Error('Fecha inválida');
  const s = await fresh(id);
  if (s.status !== STATUS.NO_ENTREGADO || s.attempts !== 1)
    throw new Error(
      `Solo se reprograma un no entregado con 1 intento (${s.code}: ${s.status}, ${s.attempts} intentos)`,
    );
  await commitOps([
    shipmentUpdate(s, {
      status: STATUS.PENDIENTE,
      scheduledDate: newDate,
      routeId: null,
      stopSequence: null,
      etaMin: null,
      unassignedReason: null,
      updatedAt: NOW,
    }),
    event(s, s.status, STATUS.PENDIENTE, {
      kind: 'reprogramado',
      attempt: s.attempts,
      description: `Reprogramado al ${newDate}`,
    }),
  ]);
  return { status: STATUS.PENDIENTE };
}

/**
 * "Pasar a otro día" (C44): pedidos pendientes y sin ruta que no cupieron pasan a una fecha
 * posterior, sin motivo de sin asignar, con un evento "reprogramado". Todos o ninguno.
 * @param {string[]} ids
 * @param {string} newDate  'AAAA-MM-DD', posterior a la fecha de cada pedido
 * @returns {Promise<{ moved: number }>}
 */
export async function postponeShipments(ids, newDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate ?? '')) throw new Error('Fecha inválida');
  const list = await Promise.all([...new Set(ids)].map((id) => fresh(id)));
  const bad = list.filter((s) => s.status !== STATUS.PENDIENTE || s.routeId || !(newDate > s.scheduledDate));
  if (bad.length)
    throw new Error(
      `No se pueden pasar al ${newDate}: ${bad.map((s) => `${s.code} (${s.routeId ? 'en ruta' : s.status})`).join(', ')}`,
    );
  // Lotes de 150 pedidos (300 escrituras): lejos del límite de 500 de una transacción
  for (let i = 0; i < list.length; i += 150) {
    await commitOps(
      list.slice(i, i + 150).flatMap((s) => [
        shipmentUpdate(s, { scheduledDate: newDate, unassignedReason: null, updatedAt: NOW }),
        event(s, s.status, STATUS.PENDIENTE, {
          kind: 'reprogramado',
          attempt: s.attempts,
          description: `Pasado al ${newDate}: no cupo en ningún vehículo el ${s.scheduledDate}`,
        }),
      ]),
    );
  }
  return { moved: list.length };
}

/**
 * Vuelve a planificar rutas que todavía no han iniciado (S4-07 reemplazo y S4-08 mover parada),
 * todo en una sola escritura:
 *   - routes: cada ruta se crea si no existe o se reemplaza si sigue 'asignada' (si ya inició, error)
 *   - stops: pendientes y reintentos pasan a asignado; los que ya estaban asignados solo cambian
 *     de ruta, orden y ETA
 *   - released: envíos asignados que salen de su ruta y vuelven a pendiente, sin ruta
 *   - unassigned: el motivo de los que no entraron (quedan o vuelven a pendiente)
 * @param {{ routes: Array<{ routeId: string, route: object, stops: Array<{ shipmentId, seq, etaMin }> }>,
 *   released?: string[], unassigned?: Array<{ shipmentId: string, reason: string }>, driverId?: string }} args
 * @returns {Promise<{ assigned: number, released: number }>}
 */
export async function replanRoutes({ routes, released = [], unassigned = [], driverId = null }) {
  if (unassigned.some((u) => !Object.values(UNASSIGNED_REASON).includes(u.reason)))
    throw new Error('Motivo de sin asignar desconocido');
  const existing = await Promise.all(routes.map((r) => getRoute(r.routeId)));
  existing.forEach((cur, i) => {
    if (cur && cur.status !== 'asignada')
      throw new Error(`La ${cur.code ?? routes[i].routeId} ya inició; no se puede cambiar`);
  });

  const reasonOf = new Map(unassigned.map((u) => [u.shipmentId, u.reason]));
  const ids = [
    ...new Set([...routes.flatMap((r) => r.stops.map((st) => st.shipmentId)), ...released, ...reasonOf.keys()]),
  ];
  const byId = Object.fromEntries((await Promise.all(ids.map((id) => fresh(id)))).map((s) => [s.id, s]));

  const ops = [];
  routes.forEach((r, i) => {
    const data = { ...r.route, stops: r.route.stops ?? r.stops, status: 'asignada' };
    if (existing[i]) {
      ops.push({
        kind: 'update',
        col: 'routes',
        id: r.routeId,
        data,
        expect: { field: 'status', value: 'asignada', error: `La ruta ${r.routeId} ya inició en otro dispositivo` },
      });
    } else {
      ops.push({
        kind: 'create',
        col: 'routes',
        id: r.routeId,
        data: { ...data, createdAt: NOW },
        existsError: `La ruta ${r.routeId} ya existe`,
      });
    }
  });

  const placed = new Set();
  for (const r of routes) {
    for (const st of r.stops) {
      const s = byId[st.shipmentId];
      placed.add(s.id);
      const seat = {
        routeId: r.routeId,
        stopSequence: st.seq,
        etaMin: st.etaMin,
        unassignedReason: null,
        updatedAt: NOW,
      };
      if (s.status === STATUS.ASIGNADO) ops.push(shipmentUpdate(s, seat));
      else if (
        canTransition(s.status, STATUS.ASIGNADO) &&
        !(s.status === STATUS.NO_ENTREGADO && s.attempts >= MAX_ATTEMPTS)
      ) {
        ops.push(shipmentUpdate(s, { ...seat, status: STATUS.ASIGNADO }));
        ops.push(event(s, s.status, STATUS.ASIGNADO, { driverId }));
      } else throw new Error(`No se puede asignar ${s.code} (${s.status})`);
    }
  }
  for (const id of released) {
    if (placed.has(id)) continue;
    const s = byId[id];
    if (s.status !== STATUS.ASIGNADO) throw new Error(`Solo se libera un envío asignado (${s.code}: ${s.status})`);
    ops.push(
      shipmentUpdate(s, {
        status: STATUS.PENDIENTE,
        routeId: null,
        stopSequence: null,
        etaMin: null,
        unassignedReason: reasonOf.get(id) ?? null,
        updatedAt: NOW,
      }),
    );
    ops.push(event(s, s.status, STATUS.PENDIENTE, { kind: 'liberado', driverId, attempt: s.attempts }));
    placed.add(id);
  }
  for (const [id, reason] of reasonOf) {
    if (placed.has(id)) continue;
    ops.push(shipmentUpdate(byId[id], { unassignedReason: reason, updatedAt: NOW }));
  }
  await commitOps(ops);
  return { assigned: routes.reduce((n, r) => n + r.stops.length, 0), released: released.length };
}

async function getRoute(id) {
  if (USE_MOCKS) return mockDb.get('routes', id);
  const snap = await getDoc(doc(db, 'routes', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}
