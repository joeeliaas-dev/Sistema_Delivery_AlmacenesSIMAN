// src/lib/auth.js  (dueño: P1) — sesión y rol de quien usa la app (C48)
// Con Firebase: correo y contraseña (Firebase Auth); el rol sale de users/{uid}
// ({ role: 'despacho' | 'motorista', driverId, name, email }), que solo P1 crea con su script.
// Con datos de prueba (USE_MOCKS): cuentas de prueba sin servidor; la sesión se guarda en el navegador.
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
import demoAccounts from './demoAccounts.json';
import { EMULATOR_HOST, USE_EMULATORS, USE_MOCKS, app, db, secondaryApp } from './firebase';

export const ROLE = { DESPACHO: 'despacho', MOTORISTA: 'motorista' };

// Cuentas de prueba: las de los botones "Entrar como…" (datos de prueba) y las que crea el script de
// cuentas en el emulador. Con datos de prueba la contraseña no se revisa; en el emulador es DEMO_PASSWORD.
// En la nube las contraseñas son otras y no están en el código.
export const DEMO_PASSWORD = 'trazza-prueba';
// La lista vive en demoAccounts.json: la usan también los scripts de la nube (cuentas y revisión de reglas)
export const DEMO_ACCOUNTS = demoAccounts;

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

// ---------- datos de prueba ----------
const SESSION_KEY = 'siman-logistica:sesion';
const storage = (() => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
})();
const mockUser = (account) => ({ uid: `demo-${account.email.split('@')[0]}`, ...account });
const EXTRA_KEY = 'siman-logistica:cuentas';
let extraAccounts = [];
try {
  extraAccounts = JSON.parse(storage?.getItem(EXTRA_KEY) ?? '[]');
} catch {
  extraAccounts = [];
}
// Acceso quitado en datos de prueba: correos sin acceso (se guarda en el navegador)
const OFF_KEY = 'siman-logistica:sin-acceso';
let offEmails = [];
try {
  offEmails = JSON.parse(storage?.getItem(OFF_KEY) ?? '[]');
} catch {
  offEmails = [];
}
const mockAccounts = () =>
  [...DEMO_ACCOUNTS, ...extraAccounts].map((a) => ({ ...a, uid: mockUser(a).uid, active: !offEmails.includes(a.email) }));
const accountListeners = new Set();
const saveMockAccess = () => {
  try {
    storage?.setItem(EXTRA_KEY, JSON.stringify(extraAccounts));
    storage?.setItem(OFF_KEY, JSON.stringify(offEmails));
  } catch {
    // sin almacenamiento: dura mientras la página esté abierta
  }
  accountListeners.forEach((l) => l());
};

function startMocks() {
  let saved = null;
  try {
    saved = mockAccounts().find((a) => a.email === storage?.getItem(SESSION_KEY)) ?? null;
  } catch {
    saved = null;
  }
  setState(saved ? { status: 'signedIn', user: mockUser(saved) } : { status: 'signedOut', user: null });
}

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

if (USE_MOCKS) startMocks();
else startFirebase();

/**
 * Entrar con correo y contraseña. Con datos de prueba basta una cuenta de DEMO_ACCOUNTS (la contraseña
 * no se revisa). Devuelve el usuario ({ uid, email, name, role, driverId }) ya con su rol.
 * Si falla, lanza un Error con el mensaje listo para mostrar.
 */
export async function signIn(email, password) {
  const clean = String(email ?? '').trim().toLowerCase();
  if (!clean) throw new Error('Escriba su correo.');
  if (USE_MOCKS) {
    const account = mockAccounts().find((a) => a.email === clean);
    if (!account) throw new Error('Correo o contraseña incorrectos.');
    if (!account.active) throw new Error('Esta cuenta no tiene acceso. Hable con el despacho.');
    try {
      storage?.setItem(SESSION_KEY, account.email);
    } catch {
      // sin almacenamiento: la sesión dura mientras la página esté abierta
    }
    const user = mockUser(account);
    setState({ status: 'signedIn', user });
    return user;
  }
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
  if (USE_MOCKS) {
    try {
      storage?.removeItem(SESSION_KEY);
    } catch {
      // nada que borrar
    }
    setState({ status: 'signedOut', user: null });
    return;
  }
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
  if (USE_MOCKS) {
    if (mockAccounts().some((a) => a.email === clean)) throw new Error('Ese correo ya tiene una cuenta.');
    extraAccounts = [...extraAccounts, { key: clean.split('@')[0], ...account }];
    saveMockAccess();
    return { uid: mockUser(account).uid, email: clean };
  }
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
  if (USE_MOCKS) {
    const account = mockAccounts().find((a) => a.uid === uid);
    if (!account) throw new Error('No existe esa cuenta.');
    if (account.role !== ROLE.MOTORISTA) throw new Error('Solo se quita el acceso a cuentas de motorista.');
    offEmails = active ? offEmails.filter((e) => e !== account.email) : [...new Set([...offEmails, account.email])];
    saveMockAccess();
    return;
  }
  await updateDoc(doc(db, 'users', uid), { active: Boolean(active) });
}

/**
 * Cuentas con acceso a la app (solo el despacho las ve todas): cb([{ uid, email, name, role, driverId, active }]).
 * Para mostrar en Vehículos y turnos quién tiene acceso y quitarlo o devolverlo.
 * @returns {() => void} cancelar
 */
export function listenAccounts(cb, onError) {
  if (USE_MOCKS) {
    const emit = () => cb(mockAccounts().map(({ key, ...a }) => a));
    accountListeners.add(emit);
    emit();
    return () => accountListeners.delete(emit);
  }
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
  if (role === ROLE.DESPACHO) return true; // el despacho también revisa la vista del motorista
  if (role === ROLE.MOTORISTA) return pathname === '/motorista' || pathname.startsWith('/entrega');
  return false;
}

/** A dónde va cada rol al entrar. */
export const homeOf = (role) => (role === ROLE.MOTORISTA ? '/motorista' : '/despacho');
