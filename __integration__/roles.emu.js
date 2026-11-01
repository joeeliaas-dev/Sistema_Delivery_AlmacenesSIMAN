// __integration__/roles.emu.js  (dueño: P1) — reglas de la nube CON login y roles (C48)
// Necesita el emulador de cuentas además del de Firestore:
//   npx firebase emulators:start --config firebase.auth-emu.json --only auth --project demo-siman-logistica
// Cuentas: el despachador y los 5 motoristas de DEMO_ACCOUNTS, con users/{uid} escrito antes de las reglas.
import { readFileSync } from 'node:fs';
import { createUserWithEmailAndPassword, getAuth, signOut as fbSignOut } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, terminate, updateDoc } from 'firebase/firestore';
import { app, db } from '../src/lib/firebase';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, signIn, signOut } from '../src/lib/auth';
import { todayISO } from '../src/lib/dates';

const project = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const RULES_URL = `http://127.0.0.1:8080/emulator/v1/projects/${project}:securityRules`;
const loadRules = async (file) => {
  const res = await fetch(RULES_URL, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: file, content: readFileSync(require.resolve(`../${file}`), 'utf8') }] } }),
  });
  if (!res.ok) throw new Error(`No se pudieron cargar ${file}: ${res.status}`);
};
const as = async (key) => {
  await signOut();
  const account = DEMO_ACCOUNTS.find((a) => a.key === key);
  return signIn(account.email, DEMO_PASSWORD);
};
const denied = (p) => expect(p).rejects.toMatchObject({ code: 'permission-denied' });

const today = todayISO();
let routes = {};

beforeAll(async () => {
  require('./reseed')();
  // Cuentas en el emulador de Auth y su rol en users/{uid} (con las reglas abiertas del emulador)
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
  await loadRules('firestore.cloud.rules');
}, 90000);

afterAll(async () => {
  await loadRules('firestore.rules');
  await signOut();
  await terminate(db);
});

test('sin sesión no se lee nada', async () => {
  await signOut();
  await denied(getDocs(collection(db, 'shipments')));
});

test('el despachador optimiza el día (crea rutas y asigna)', async () => {
  await as('despacho');
  const { optimizeAndSaveDay } = require('../src/features/routes/routesService');
  const res = await optimizeAndSaveDay(today);
  expect(res.routeIds.length).toBeGreaterThan(0);
  const all = (await getDocs(collection(db, 'routes'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  routes = Object.fromEntries(all.filter((r) => r.date === today && r.status === 'asignada').map((r) => [r.driverId, r]));
  expect(Object.keys(routes).length).toBeGreaterThan(0);
}, 60000);

test('un motorista no importa, no planifica ni toca la flota', async () => {
  await as('kevin');
  await denied(setDoc(doc(db, 'shipments', 'SIM-9999'), { code: 'SIM-9999', status: 'pendiente' }));
  await denied(updateDoc(doc(db, 'vehicles', 'V1'), { maxKg: 999 }));
  await denied(updateDoc(doc(db, 'drivers', 'D1'), { shiftStart: '06:00' }));
  const anyRoute = Object.values(routes)[0];
  await denied(updateDoc(doc(db, 'routes', anyRoute.id), { stops: [] }));
});

test('la ruta más larga la inicia SU motorista; otro motorista no puede', async () => {
  const biggest = Object.values(routes).sort((a, b) => b.stops.length - a.stops.length)[0];
  const owner = DEMO_ACCOUNTS.find((a) => a.driverId === biggest.driverId);
  const other = DEMO_ACCOUNTS.find((a) => a.role === 'motorista' && a.driverId !== biggest.driverId);
  const { startRoute } = require('../src/features/routes/routesService');
  // Otro motorista no puede iniciarla
  await as(other.key);
  await denied(startRoute(biggest.id, other.driverId));
  // El suyo sí, con todas sus paradas en una transacción
  await as(owner.key);
  const { count } = await startRoute(biggest.id, owner.driverId);
  expect(count).toBe(biggest.stops.length);
  console.log(`ruta ${biggest.code}: ${count} paradas iniciadas por ${owner.key}`);

  // Entrega una parada de su ruta; otro motorista no puede tocarla
  const { changeStatus } = require('../src/features/shipments/statusMachine');
  const { getShipment } = require('../src/features/shipments/shipmentsService');
  const stop = await getShipment(biggest.stops[0].shipmentId);
  await as(other.key);
  await denied(
    changeStatus({
      shipment: stop,
      to: 'entregado',
      payload: { photoUri: 'file:///f.jpg', signatureBase64: 'data:image/png;base64,AA', description: 'Recibió el cliente' },
      driverId: other.driverId,
    }),
  );
  await as(owner.key);
  const res = await changeStatus({
    shipment: stop,
    to: 'entregado',
    payload: { photoUri: 'file:///f.jpg', signatureBase64: 'data:image/png;base64,AA', description: 'Recibió el cliente' },
    driverId: owner.driverId,
  });
  expect(res.status).toBe('entregado');
}, 60000);

test('el motorista no puede cambiar la fecha ni la ruta de sus pedidos', async () => {
  const biggest = Object.values(routes).sort((a, b) => b.stops.length - a.stops.length)[0];
  const owner = DEMO_ACCOUNTS.find((a) => a.driverId === biggest.driverId);
  await as(owner.key);
  const id = biggest.stops[1].shipmentId;
  await denied(updateDoc(doc(db, 'shipments', id), { routeId: null }));
  await denied(updateDoc(doc(db, 'shipments', id), { scheduledDate: '2099-01-01' }));
});

test('cada cuenta lee solo su rol; el despachador ve todas', async () => {
  await as('kevin');
  await denied(getDocs(collection(db, 'users')));
  await as('despacho');
  expect((await getDocs(collection(db, 'users'))).size).toBe(DEMO_ACCOUNTS.length);
});

test('el despacho da acceso a un motorista; nadie más crea cuentas ni cuentas de despacho', async () => {
  const { createDriverAccess, signIn: enter } = require('../src/lib/auth');
  const { createDriver } = require('../src/features/fleet/fleetService');
  await as('despacho');
  const driverId = await createDriver({ name: 'Ana Pérez', zoneId: 'Z1', vehicleId: 'V1' });
  const anaEmail = `ana-${Date.now()}@trazzasv.test`; // el emulador de cuentas guarda las de corridas anteriores
  const { uid } = await createDriverAccess({ driverId, name: 'Ana Pérez', email: anaEmail, password: 'clave-de-ana' });
  expect(uid).toBeTruthy();
  // la sesión del despacho no cambió
  await expect(getDocs(collection(db, 'users'))).resolves.toBeTruthy();
  // un despachador no puede crear otra cuenta de despacho por las reglas
  await denied(setDoc(doc(db, 'users', 'falso'), { role: 'despacho', driverId: null, name: 'X', email: 'x@x.test', active: true }));
  // Ana entra como motorista
  await signOut();
  expect(await enter(anaEmail, 'clave-de-ana')).toMatchObject({ role: 'motorista', driverId });
  // y un motorista no crea cuentas
  await denied(setDoc(doc(db, 'users', 'otro'), { role: 'motorista', driverId, name: 'Y', email: 'y@x.test', active: true }));
});

test('el despacho quita el acceso: la cuenta entra sin rol y no puede escribir; listenAccounts la muestra', async () => {
  const { createDriverAccess, setAccessActive, listenAccounts, signIn: enter } = require('../src/lib/auth');
  await as('despacho');
  const email = `beto-${Date.now()}@trazzasv.test`;
  const { uid } = await createDriverAccess({ driverId: 'D1', name: 'Beto', email, password: 'clave-de-beto' });
  const list = await new Promise((resolve) => {
    const stop = listenAccounts((l) => {
      if (l.some((a) => a.uid === uid)) {
        stop();
        resolve(l);
      }
    });
  });
  expect(list.find((a) => a.uid === uid)).toMatchObject({ role: 'motorista', driverId: 'D1', active: true });
  await setAccessActive(uid, false);
  await signOut();
  const beto = await new Promise((resolve) => {
    const { currentSession } = require('../src/lib/auth');
    enter(email, 'clave-de-beto').catch(() => {});
    const t = setInterval(() => {
      const s = currentSession();
      if (s.status === 'signedIn' && s.user?.uid === uid) {
        clearInterval(t);
        resolve(s.user);
      }
    }, 100);
  });
  expect(beto.role).toBeNull(); // la app le muestra "Su cuenta no tiene acceso"
  // y las reglas no lo dejan escribir aunque se salte la app
  await denied(updateDoc(doc(db, 'drivers', 'D1'), { shiftStart: '06:00' }));
});
