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
const LABELS = {
  photoUri: 'foto',
  signatureBase64: 'firma',
  description: 'descripción',
  reason: 'motivo',
};
export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);
function validate(to, payload) {
  const missing = (REQUIRED_EVIDENCE[to] ?? []).filter((f) => !payload[f]);
  if (missing.length) throw new Error(`Falta: ${missing.map((f) => LABELS[f]).join(', ')}`);
  if (payload.description && payload.description.trim().length < MIN_DESCRIPTION_LENGTH)
    throw new Error(`La descripción debe tener al menos ${MIN_DESCRIPTION_LENGTH} caracteres`);
  if (to === STATUS.NO_ENTREGADO && !FAIL_REASONS.includes(payload.reason))
    throw new Error('Elija un motivo de la lista');
}
async function fresh(shipmentOrId) {
  const id = typeof shipmentOrId === 'string' ? shipmentOrId : shipmentOrId?.id;
  const current = id ? await getShipment(id) : null;
  if (!current) throw new Error(`No existe el envío ${id ?? ''}`.trim());
  return current;
}
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
export async function changeStatus({ shipment: given, to, payload = {}, driverId = null }) {
  const shipment = await fresh(given);
  if (!canTransition(shipment.status, to)) throw new Error(`No se puede pasar de ${shipment.status} a ${to}`);
  if (!REQUIRED_EVIDENCE[to]) throw new Error(`Para pasar a ${to} use changeStatusMany o assignToRoute`);
  validate(to, payload);
  const failed = to === STATUS.NO_ENTREGADO;
  const attempt = shipment.attempts + 1;
  const attempts = shipment.attempts + (failed ? 1 : 0);
  const gps = await getCurrentGps();
  const { inline, ...files } = await uploadEvidence({
    code: shipment.code,
    attempt,
    photoUri: payload.photoUri,
    signatureBase64: failed ? undefined : payload.signatureBase64,
  });
  const record = {
    ...files,
    description: payload.description.trim(),
    gps,
    at: new Date().toISOString(),
  };
  const returned = failed && attempts >= MAX_ATTEMPTS;
  const status = returned ? STATUS.DEVUELTO : to;
  const ops = [
    shipmentUpdate(shipment, {
      status,
      attempts,
      updatedAt: NOW,
      ...(failed
        ? {
            lastFailure: {
              ...record,
              reason: payload.reason,
            },
          }
        : {
            lastEvidence: record,
          }),
    }),
    event(shipment, shipment.status, to, {
      ...record,
      at: NOW,
      driverId,
      attempt,
      reason: payload.reason ?? null,
    }),
  ];
  if (returned)
    ops.push(
      event(shipment, STATUS.NO_ENTREGADO, STATUS.DEVUELTO, {
        driverId,
        attempt,
        automatic: true,
      }),
    );
  if (inline)
    ops.push({
      kind: 'create',
      col: 'evidence',
      id: inline.id,
      data: {
        ...inline.data,
        shipmentId: shipment.id,
        createdAt: NOW,
      },
      existsError: `Ya existe evidencia del intento ${attempt} de ${shipment.code}`,
    });
  await commitOps(ops);
  return {
    status,
  };
}
export async function changeStatusMany({ shipmentIds, to, driverId = null, routeStatus }) {
  if (REQUIRED_EVIDENCE[to]) throw new Error(`Para pasar a ${to} use changeStatus con evidencia`);
  const shipments = await Promise.all(shipmentIds.map(fresh));
  const blocked = shipments.filter((s) => !canTransition(s.status, to));
  if (blocked.length)
    throw new Error(`No se puede pasar a ${to}: ${blocked.map((s) => `${s.code} (${s.status})`).join(', ')}`);
  const ops = shipments.flatMap((s) => [
    shipmentUpdate(s, {
      status: to,
      updatedAt: NOW,
    }),
    event(s, s.status, to, {
      driverId,
    }),
  ]);
  if (routeStatus)
    ops.push({
      kind: 'update',
      col: 'routes',
      id: routeStatus.routeId,
      data: {
        status: routeStatus.status,
      },
    });
  await commitOps(ops);
  return {
    count: shipments.length,
  };
}
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
      shipmentUpdate(s, {
        status: STATUS.ASIGNADO,
        routeId,
        stopSequence: st.seq,
        etaMin: st.etaMin,
        updatedAt: NOW,
      }),
      event(s, s.status, STATUS.ASIGNADO, {
        driverId,
      }),
    ];
  });
  if (route)
    ops.unshift({
      kind: 'create',
      col: 'routes',
      id: routeId,
      data: {
        ...route,
        createdAt: NOW,
      },
      existsError: 'La zona ya tiene una ruta abierta hoy',
    });
  await commitOps(ops);
  return {
    count: stops.length,
  };
}
