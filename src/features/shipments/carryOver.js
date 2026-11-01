// src/features/shipments/carryOver.js  (dueño: P1)
// "Traer reintentos": los no entregados con 1 intento de días anteriores pasan a pendiente
// en la fecha elegida (reprogramShipment), para entrar a las rutas de ese día.
import { collection, getDocs, query, where } from 'firebase/firestore';
import { STATUS } from '../../constants';
import { USE_MOCKS, db } from '../../lib/firebase';
import { mockDb } from '../../mocks';
import { reprogramShipment } from './statusMachine';

/** Reintentos de días anteriores a la fecha, listos para traer. */
export async function pendingRetries(toDate) {
  const list = USE_MOCKS
    ? mockDb.all('shipments').filter((s) => s.status === STATUS.NO_ENTREGADO)
    : (await getDocs(query(collection(db, 'shipments'), where('status', '==', STATUS.NO_ENTREGADO)))).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
  return list.filter((s) => s.attempts === 1 && s.scheduledDate < toDate);
}

/**
 * @param {string} toDate  'AAAA-MM-DD'
 * @returns {Promise<{ moved: number }>}
 */
export async function carryOverRetries(toDate) {
  const retries = await pendingRetries(toDate);
  for (const s of retries) await reprogramShipment(s.id, toDate);
  return { moved: retries.length };
}
