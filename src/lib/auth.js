// src/lib/auth.js  (dueño: P1) — sesión y rol de quien usa la app (C48)
// Correo y contraseña (Firebase Auth); el rol sale de users/{uid}
// ({ role: 'despacho' | 'motorista', driverId, name, email }), que solo P1 crea con su script.
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { EMULATOR_HOST, USE_EMULATORS, app, db, secondaryApp } from './firebase';

export const ROLE = { DESPACHO: 'despacho', MOTORISTA: 'motorista' };

const MESSAGES = {
  'auth/invalid-email': 'El correo no es válido.',
  'auth/missing-password': 'Escriba la contraseña.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/user-disabled': 'Esta cuenta está desactivada. Hable con el despacho.',
  'auth/too-many-requests': 'Demasiados intentos. Espere unos minutos e intente de nuevo.',
  'auth/network-request-failed': 'Sin conexión a internet.',
  'auth/operation-not-allowed': 'El inicio de sesión con correo no está activado en Firebase.',
  'auth/email-already-in-use': 'Ese correo ya tiene una cuenta.',
  'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres.',
};
const authError = (err) => new Error(MESSAGES[err?.code] ?? 'No se pudo entrar. Intente de nuevo.');

// ---------- estado compartido de la sesión ----------
// { status: 'loading' | 'signedOut' | 'signedIn', user: { uid, email, name, role, driverId } | null }
let state = { status: 'loading', user: null };
const listeners = new Set();
function setState(next) {
  state = next;
  listeners.forEach((l) => l());
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Sesión actual; la pantalla se vuelve a pintar cuando cambia. */
export const useSession = () => useSyncExternalStore(subscribe, () => state, () => state);
/** La sesión en este momento, fuera de React (servicios). */
export const currentSession = () => state;

// ---------- Firebase ----------
let auth = null;
function startFirebase() {
  auth = getAuth(app);
  if (USE_EMULATORS) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) return setState({ status: 'signedOut', user: null });
    try {
      const snap = await getDoc(doc(db, 'users', fbUser.uid));
      const data = snap.exists() ? snap.data() : null;
      setState({
        status: 'signedIn',
        user: {
          uid: fbUser.uid,
          email: fbUser.email,
          name: data?.name ?? fbUser.email,
          role: data?.active === false ? null : (data?.role ?? null), // sin rol: la app pide hablar con el despacho
          driverId: data?.driverId ?? null,
        },
      });
    } catch {
      setState({
        status: 'signedIn',
        user: { uid: fbUser.uid, email: fbUser.email, name: fbUser.email, role: null, driverId: null },
      });
    }
  });
}

startFirebase();

/**
 * Entrar con correo y contraseña. Devuelve el usuario ({ uid, email, name, role, driverId }) ya con su rol.
 * Si falla, lanza un Error con el mensaje listo para mostrar.
 */
export async function signIn(email, password) {
  const clean = String(email ?? '').trim().toLowerCase();
  if (!clean) throw new Error('Escriba su correo.');
  if (!password) throw new Error('Escriba la contraseña.');
  let uid;
  try {
    uid = (await signInWithEmailAndPassword(auth, clean, password)).user.uid;
  } catch (err) {
    throw authError(err);
  }
  // El rol llega un momento después (users/{uid}): se espera a que la sesión lo tenga
  if (state.status === 'signedIn' && state.user?.uid === uid) return state.user;
  return new Promise((resolve) => {
    const stop = subscribe(() => {
      if (state.status === 'signedIn' && state.user?.uid === uid) {
        stop();
        resolve(state.user);
      }
    });
  });
}

export async function signOut() {
  await firebaseSignOut(auth);
}

/**
 * El despachador le da acceso a un motorista (C48): crea su cuenta con correo y contraseña inicial y su
 * users/{uid} con rol motorista. La sesión del despachador no cambia (la cuenta se crea en una instancia
 * aparte de Firebase). Solo cuentas de motorista: las de despacho las crea P1.
 * @returns {Promise<{ uid: string, email: string }>}
 */
export async function createDriverAccess({ driverId, name, email, password }) {
  const clean = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('El correo no es válido.');
  if (String(password ?? '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  if (!driverId) throw new Error('Elija el motorista.');
  if (state.user?.role !== ROLE.DESPACHO) throw new Error('Solo el despacho da acceso a los motoristas.');
  const account = { email: clean, name: String(name ?? clean).trim(), role: ROLE.MOTORISTA, driverId };
  const secondAuth = getAuth(secondaryApp('altas'));
  if (USE_EMULATORS && !secondAuth.emulatorConfig)
    connectAuthEmulator(secondAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  let uid;
  try {
    uid = (await createUserWithEmailAndPassword(secondAuth, clean, password)).user.uid;
  } catch (err) {
    throw authError(err);
  } finally {
    await firebaseSignOut(secondAuth).catch(() => {});
  }
  await setDoc(doc(db, 'users', uid), { ...account, active: true });
  return { uid, email: clean };
}

/** Quita (o devuelve) el acceso de una cuenta de motorista; la cuenta no se borra. */
export async function setAccessActive(uid, active) {
  if (state.user?.role !== ROLE.DESPACHO) throw new Error('Solo el despacho cambia los accesos.');
  await updateDoc(doc(db, 'users', uid), { active: Boolean(active) });
}

/**
 * Cuentas con acceso a la app (solo el despacho las ve todas): cb([{ uid, email, name, role, driverId, active }]).
 * Para mostrar en Motoristas quién tiene acceso y quitarlo o devolverlo.
 * @returns {() => void} cancelar
 */
export function listenAccounts(cb, onError) {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    (err) => {
      console.error('[auth] listenAccounts:', err);
      onError?.(new Error('No se pudieron leer las cuentas. Revise la conexión e intente de nuevo.'));
    },
  );
}

/** Pantallas que puede abrir cada rol (la protección de app/_layout.js). */
export function canOpen(role, pathname) {
  if (pathname === '/login') return true;
  // Roles estrictos (Andrés, 31 oct): el despacho no abre la vista del motorista, y el motorista solo la suya
  const driverView = pathname === '/motorista' || pathname.startsWith('/entrega');
  if (role === ROLE.DESPACHO) return !driverView;
  if (role === ROLE.MOTORISTA) return driverView;
  return false;
}

/** A dónde va cada rol al entrar. */
export const homeOf = (role) => (role === ROLE.MOTORISTA ? '/motorista' : '/despacho');
