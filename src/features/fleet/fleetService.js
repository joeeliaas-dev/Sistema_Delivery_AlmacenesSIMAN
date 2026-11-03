// src/features/fleet/fleetService.js  (dueño: P1)
// Motoristas: crear uno (nombre, zona y turno), cambiar su turno y darlo de baja o de alta.
// El acceso a la app (cuenta y "activar rutero") vive en src/lib/auth.js.
import { commitOps } from '../../lib/writer';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Turno de un motorista ('HH:MM').
 * @param {string} driverId
 * @param {{ shiftStart?: string, shiftEnd?: string }} shift
 */
export async function updateDriverShift(driverId, { shiftStart, shiftEnd }) {
  const data = {};
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

/** Da de baja (o de alta) a un motorista: de baja no recibe ruta. No se borra: su historial se queda. */
export async function setDriverActive(driverId, active) {
  await commitOps([{ kind: 'update', col: 'drivers', id: driverId, data: { active: Boolean(active) } }]);
}

/**
 * Crea un motorista con su zona y turno. id "D…".
 * @param {{ name: string, phone?: string, zoneId: string, shiftStart?: string, shiftEnd?: string }} d
 * @returns {Promise<string>} id
 */
export async function createDriver({ name, phone = null, zoneId, shiftStart = '07:00', shiftEnd = '18:00' }) {
  const clean = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
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
      data: { name: clean, initials, phone: tel, zoneId, active: true, shiftStart, shiftEnd },
      existsError: 'Ya existe un motorista con ese código: intente de nuevo',
    },
  ]);
  return id;
}
