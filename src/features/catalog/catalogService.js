// src/features/catalog/catalogService.js  (dueño: P1)
// Zonas, motoristas y depósito. Los listen* devuelven la función para cancelar.
import { collection, getDocs, limit, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const toDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const byId = (a, b) => a.id.localeCompare(b.id);

// onError (opcional): recibe un Error con mensaje listo para mostrar si la lectura falla
const readError = (where_, onError) => (err) => {
  console.error(`[catalog] ${where_}:`, err);
  onError?.(new Error('No se pudieron leer los datos. Revise la conexión e intente de nuevo.'));
};

function listenCollection(name, cb, onError) {
  return onSnapshot(collection(db, name), (snap) => cb(toDocs(snap).sort(byId)), readError(name, onError));
}

/** cb(zones[]) — { id, code, name, color, polygon[{lat,lng}], driverId } */
export const listenZones = (cb, onError) => listenCollection('zones', cb, onError);

/** cb(drivers[]) — { id, name, initials, phone, zoneId, active } */
export const listenDrivers = (cb, onError) => listenCollection('drivers', cb, onError);

/** Depósito SIMAN de salida: { id, name, location{lat,lng}, address } */
export async function getDepot() {
  const snap = await getDocs(query(collection(db, 'depots'), limit(1)));
  return toDocs(snap)[0] ?? null;
}
