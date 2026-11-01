// __integration__/roles25.emu.js  (dueño: P1) — ruta de 25 paradas con roles: dentro del límite de get() de las reglas (C48)
// Archivo propio (datos limpios): la ruta armada a mano no se cruza con Optimizar día de roles.emu.js.
// Necesita el emulador de cuentas además del de Firestore:
//   npx firebase emulators:start --config firebase.auth-emu.json --only auth --project demo-siman-logistica
// Cuentas: el despachador y los 5 motoristas de DEMO_ACCOUNTS, con users/{uid} escrito antes de las reglas.
import { readFileSync } from 'node:fs';
import { createUserWithEmailAndPassword, getAuth, signOut as fbSignOut } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, terminate } from 'firebase/firestore';
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

test('una ruta de 25 paradas: la inicia y entrega SU motorista, dentro del límite de consultas de las reglas', async () => {
  // El despachador arma una ruta de 25 pedidos pendientes para Daniela (D3)
  await as('despacho');
  const { assignToRoute, changeStatus } = require('../src/features/shipments/statusMachine');
  const pend = (await getDocs(collection(db, 'shipments'))).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.status === 'pendiente' && !x.routeId)
    .slice(0, 25);
  expect(pend.length).toBe(25);
  const stops = pend.map((x, i) => ({ shipmentId: x.id, seq: i + 1, etaMin: 10 * (i + 1) }));
  const routeId = `R-${today}-Z9`;
  await assignToRoute({
    routeId,
    stops,
    driverId: 'D3',
    route: { code: 'Ruta Z', date: today, zoneId: 'Z3', driverId: 'D3', status: 'asignada', stops, totalKm: 0,
      baselineKm: 0, estEnd: null, vehicleId: null, engine: 'local', geometry: null, minutes: 0 },
  });
  const { startRoute } = require('../src/features/routes/routesService');
  await as('mario');
  await denied(startRoute(routeId, 'D4'));
  await as('daniela');
  expect((await startRoute(routeId, 'D3')).count).toBe(25);
  const { getShipment } = require('../src/features/shipments/shipmentsService');
  const res = await changeStatus({
    shipment: await getShipment(pend[24].id),
    to: 'entregado',
    payload: { photoUri: 'file:///f.jpg', signatureBase64: 'data:image/png;base64,AA', description: 'Recibió el cliente' },
    driverId: 'D3',
  });
  expect(res.status).toBe('entregado');
}, 60000);

