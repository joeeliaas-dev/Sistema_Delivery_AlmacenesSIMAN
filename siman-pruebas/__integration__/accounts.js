// __integration__/accounts.js  (dueño: P1) — cuentas de prueba para las reglas con login (C48)
// Crea en el emulador de Auth las cuentas de scripts/cloud/cuentas.json y su users/{uid}, con las reglas abiertas del
// emulador (llamar ANTES de cargar firestore.cloud.rules). Necesita el emulador de cuentas en el 9099:
//   npx firebase emulators:start --config firebase.auth-emu.json --only auth --project demo-siman-logistica
const { createUserWithEmailAndPassword, getAuth, signOut: fbSignOut } = require('firebase/auth');
const { doc, setDoc } = require('firebase/firestore');
const { app, db } = require('../src/lib/firebase');
const { signIn, signOut } = require('../src/lib/auth');

// Las mismas cuentas que crea seed:cloud en la nube; en el emulador todas con esta contraseña
const DEMO_ACCOUNTS = require('../scripts/cloud/cuentas.json');
const DEMO_PASSWORD = 'trazza-prueba';

async function createAccounts() {
  const auth = getAuth(app);
  for (const a of DEMO_ACCOUNTS) {
    let uid;
    try {
      uid = (await createUserWithEmailAndPassword(auth, a.email, DEMO_PASSWORD)).user.uid;
    } catch (err) {
      if (err.code !== 'auth/email-already-in-use') throw err;
      uid = (await signIn(a.email, DEMO_PASSWORD)).uid;
    }
    await setDoc(doc(db, 'users', uid), { role: a.role, driverId: a.driverId, name: a.name, email: a.email, active: true });
  }
  await fbSignOut(auth);
}

/** Entra con una cuenta de prueba por su key ('despacho', 'kevin'…) o por su driverId ('D3'). */
async function as(keyOrDriver) {
  await signOut();
  const a = DEMO_ACCOUNTS.find((x) => x.key === keyOrDriver || x.driverId === keyOrDriver);
  if (!a) throw new Error(`No hay cuenta de prueba para ${keyOrDriver}`);
  return signIn(a.email, DEMO_PASSWORD);
}

module.exports = { createAccounts, as, DEMO_ACCOUNTS, DEMO_PASSWORD };
