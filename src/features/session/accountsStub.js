// src/features/session/accountsStub.js (dueño: P3) — PROVISIONAL
// listenAccounts(cb, onError) mientras P1 no la deje en src/lib/auth.js (pedida hoy). Misma forma que
// se le pidió: cb([{ uid, email, name, role, driverId, active }]). Cuando exista la de P1, Vehículos y
// turnos la importa de allá y este archivo se borra.
//   Firebase / emuladores: la colección users en tiempo real (el despacho las lee todas).
//   Datos de prueba: las cuentas de prueba y las que crea createDriverAccess (las guarda auth.js en
//   el navegador). setAccessActive de P1 no hace nada con datos de prueba: aquí se recuerda en memoria
//   con markAccess, para que la pantalla se pueda revisar.
import { collection, onSnapshot } from 'firebase/firestore';
import { DEMO_ACCOUNTS } from '../../lib/auth';
import { USE_MOCKS, db } from '../../lib/firebase';

const EXTRA_KEY = 'siman-logistica:cuentas'; // donde auth.js (P1) guarda las cuentas nuevas de prueba
const listeners = new Set();
const inactive = new Set();

const mockList = () => {
  let extra = [];
  try {
    extra = JSON.parse(globalThis.localStorage?.getItem(EXTRA_KEY) ?? '[]');
  } catch {
    extra = [];
  }
  return [...DEMO_ACCOUNTS, ...extra].map((a) => {
    const uid = `demo-${a.email.split('@')[0]}`;
    return { uid, email: a.email, name: a.name, role: a.role, driverId: a.driverId, active: !inactive.has(uid) };
  });
};
const emit = () => listeners.forEach((l) => l(mockList()));

export function listenAccounts(cb, onError) {
  if (USE_MOCKS) {
    listeners.add(cb);
    Promise.resolve().then(() => listeners.has(cb) && cb(mockList()));
    return () => listeners.delete(cb);
  }
  return onSnapshot(
    collection(db, 'users'),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    (err) => {
      console.error('[cuentas] listenAccounts:', err);
      onError?.(new Error('No se pudieron leer los accesos. Revise la conexión e intente de nuevo.'));
    },
  );
}

/** Datos de prueba: avisar que cambió una cuenta (creada, o acceso quitado / devuelto). */
export function markAccess(uid, active) {
  if (!USE_MOCKS) return;
  if (uid && active === false) inactive.add(uid);
  else if (uid) inactive.delete(uid);
  emit();
}
