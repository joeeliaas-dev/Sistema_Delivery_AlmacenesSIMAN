// src/features/fleet/fleetService.js  (dueño: P1)
// Vehículos (vehicles/{id}) y vehículo y turno de cada motorista (S4-04 y S4-13); disponibilidad (C49).
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { CAPABILITY, VEHICLE_TYPE } from '../../constants';
import { todayISO } from '../../lib/dates';
import { USE_MOCKS, db } from '../../lib/firebase';
import { commitOps } from '../../lib/writer';
import { mockDb } from '../../mocks';
import { VEHICLE_STATUS } from './availability';

const byId = (a, b) => a.id.localeCompare(b.id);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** cb(vehicles[]) — { id, type, label, maxKg, capabilities[] } */
export function listenVehicles(cb, onError) {
  if (USE_MOCKS) return mockDb.listen('vehicles', (docs) => docs.sort(byId), cb);
  return onSnapshot(
    collection(db, 'vehicles'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byId)),
    (err) => {
      console.error('[fleet] listenVehicles:', err);
      onError?.(new Error('No se pudieron leer los vehículos. Revise la conexión e intente de nuevo.'));
    },
  );
}

/**
 * Crea o cambia un vehículo. Sin id, se genera "V{n}".
 * @param {{ id?, type, label, maxKg, capabilities? }} v
 * @returns {Promise<string>} id
 */
export async function upsertVehicle({ id, type, label, maxKg, capabilities = [] }) {
  if (!Object.values(VEHICLE_TYPE).includes(type)) throw new Error('Elija moto, pick-up o camión');
  if (!String(label ?? '').trim()) throw new Error('Ponga un nombre al vehículo');
  if (!(Number(maxKg) > 0)) throw new Error('Los kg máximos deben ser mayores que 0');
  if (capabilities.some((c) => !Object.values(CAPABILITY).includes(c))) throw new Error('Capacidad desconocida');
  const vid = id ?? `V${Date.now().toString(36).toUpperCase()}`;
  await commitOps([
    {
      kind: 'set',
      col: 'vehicles',
      id: vid,
      data: { type, label: String(label).trim(), maxKg: Number(maxKg), capabilities },
    },
  ]);
  return vid;
}

/**
 * Vehículo y turno de un motorista ('HH:MM').
 * @param {string} driverId
 * @param {{ vehicleId?: string|null, shiftStart?: string, shiftEnd?: string }} setup
 */
export async function updateDriverSetup(driverId, { vehicleId, shiftStart, shiftEnd }) {
  const data = {};
  if (vehicleId !== undefined) data.vehicleId = vehicleId;
  if (shiftStart !== undefined) {
    if (!HHMM.test(shiftStart)) throw new Error(`Inicio de turno "${shiftStart}": use HH:MM`);
    data.shiftStart = shiftStart;
  }
  if (shiftEnd !== undefined) {
    if (!HHMM.test(shiftEnd)) throw new Error(`Fin de turno "${shiftEnd}": use HH:MM`);
    data.shiftEnd = shiftEnd;
  }
  if (data.shiftStart && data.shiftEnd && data.shiftStart >= data.shiftEnd)
    throw new Error('El turno debe empezar antes de terminar');
  await commitOps([{ kind: 'update', col: 'drivers', id: driverId, data }]);
}

// ---------- Disponibilidad y flota (C49) ----------
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function readDoc(col, id) {
  if (USE_MOCKS) return mockDb.get(col, id) ?? null;
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Marca (o quita) que un motorista no trabaja una fecha. Guarda solo las fechas de hoy en adelante (máx. 60). */
export async function setDriverAbsent(driverId, date, absent) {
  if (!DAY.test(date ?? '')) throw new Error('Fecha inválida');
  const driver = await readDoc('drivers', driverId);
  if (!driver) throw new Error(`No existe el motorista ${driverId}`);
  const today = todayISO();
  const dates = new Set((driver.absentDates ?? []).filter((d) => d >= today));
  if (absent) dates.add(date);
  else dates.delete(date);
  const absentDates = [...dates].sort().slice(0, 60);
  await commitOps([{ kind: 'update', col: 'drivers', id: driverId, data: { absentDates } }]);
  return absentDates;
}

/** Vehículo disponible o en taller. Un motorista con su vehículo en taller no sale en Optimizar día. */
export async function setVehicleStatus(vehicleId, status) {
  if (!Object.values(VEHICLE_STATUS).includes(status)) throw new Error('Estado de vehículo desconocido');
  await commitOps([{ kind: 'update', col: 'vehicles', id: vehicleId, data: { status } }]);
}

/** Da de baja (o de alta) a un motorista. No se borra: su historial sigue en las rutas y envíos. */
export async function setDriverActive(driverId, active) {
  await commitOps([{ kind: 'update', col: 'drivers', id: driverId, data: { active: Boolean(active) } }]);
}

/**
 * Crea un motorista. id "D{n}". Con zona (para mostrar y para "Generar ruta de esta zona"), vehículo y turno.
 * @param {{ name: string, phone?: string, zoneId: string, vehicleId?: string|null, shiftStart?: string, shiftEnd?: string }} d
 * @returns {Promise<string>} id
 */
export async function createDriver({ name, phone = null, zoneId, vehicleId = null, shiftStart = '07:00', shiftEnd = '18:00' }) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (clean.length < 3) throw new Error('Escriba el nombre del motorista');
  if (clean.length > 60) throw new Error('El nombre es muy largo (máximo 60 letras)');
  if (!zoneId) throw new Error('Elija la zona del motorista');
  if (!HHMM.test(shiftStart) || !HHMM.test(shiftEnd)) throw new Error('Turno: use HH:MM');
  if (shiftStart >= shiftEnd) throw new Error('El turno debe empezar antes de terminar');
  const tel = phone ? String(phone).replace(/[^\d+]/g, '') : null;
  if (tel && tel.length > 20) throw new Error('Teléfono inválido');
  const initials = clean
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const id = `D${Date.now().toString(36).toUpperCase()}`;
  await commitOps([
    {
      kind: 'create',
      col: 'drivers',
      id,
      data: { name: clean, initials, phone: tel, zoneId, active: true, vehicleId, shiftStart, shiftEnd, absentDates: [] },
      existsError: 'Ya existe un motorista con ese código: intente de nuevo',
    },
  ]);
  return id;
}
