// scripts/cloud/checkRules.mjs  (dueño: P1)
// Comprueba contra la NUBE que las reglas limitadas funcionan, sin cambiar ningún dato:
// la lectura está abierta y cada escritura prohibida es rechazada.
// Uso: npm run check:cloud
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  terminate,
  updateDoc,
} from 'firebase/firestore';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = JSON.parse(readFileSync(join(root, 'scripts/cloud/cloudConfig.json'), 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app);
const ACCOUNTS = JSON.parse(readFileSync(join(root, 'src/lib/demoAccounts.json'), 'utf8'));
const PASSWORD = /^TRAZZA_CLAVE_CUENTAS=(.+)$/m.exec(readFileSync(join(root, '.env.local'), 'utf8'))?.[1]?.trim();
let ok = 0;
let bad = 0;

async function expectDenied(what, fn) {
  try {
    await fn();
    bad += 1;
    console.log(`  ✗ PERMITIDO (no debería): ${what}`);
  } catch (err) {
    if (err.code === 'permission-denied') {
      ok += 1;
      console.log(`  ✓ bloqueado: ${what}`);
    } else {
      bad += 1;
      console.log(`  ✗ error inesperado en "${what}": ${err.code ?? err.message}`);
    }
  }
}

// Con login (C48): sin sesión no se lee nada; el resto de las pruebas se hace COMO DESPACHADOR,
// así se comprueba que ni siquiera él puede dejar datos inválidos
await expectDenied('leer envíos sin sesión', () => getDocs(collection(db, 'shipments')));
if (!PASSWORD) throw new Error('Falta TRAZZA_CLAVE_CUENTAS en .env.local');
await signInWithEmailAndPassword(getAuth(app), ACCOUNTS.find((a) => a.role === 'despacho').email, PASSWORD);

const shipments = await getDocs(collection(db, 'shipments'));
const s = shipments.docs.find((d) => d.data().status === 'pendiente');
const entregado = shipments.docs.find((d) => d.data().status === 'entregado');
console.log(`Lectura abierta: ${shipments.size} envíos, ${(await getDocs(collection(db, 'zones'))).size} zonas`);
ok += shipments.size > 0 ? 1 : 0;

await expectDenied('crear un envío incompleto', () =>
  setDoc(doc(db, 'shipments', 'SIM-9999'), { code: 'SIM-9999', status: 'pendiente' }),
);
await expectDenied('borrar un envío', () => deleteDoc(doc(db, 'shipments', s.id)));
await expectDenied('cambiar el cliente de un envío', () =>
  updateDoc(doc(db, 'shipments', s.id), { customer: { name: 'X' } }),
);
await expectDenied('saltar de pendiente a entregado', () =>
  updateDoc(doc(db, 'shipments', s.id), { status: 'entregado' }),
);
await expectDenied('volver un entregado a pendiente', () =>
  updateDoc(doc(db, 'shipments', entregado.id), { status: 'pendiente' }),
);
await expectDenied('estado inventado', () => updateDoc(doc(db, 'shipments', s.id), { status: 'perdido' }));
await expectDenied('bajar los intentos', () => updateDoc(doc(db, 'shipments', entregado.id), { attempts: -1 }));
await expectDenied('modificar una zona', () => updateDoc(doc(db, 'zones', 'Z1'), { driverId: 'D9' }));
await expectDenied('crear un motorista incompleto', () => setDoc(doc(db, 'drivers', 'D9'), { name: 'X' }));
await expectDenied('borrar un evento del historial', async () => {
  const evs = await getDocs(collection(db, 'shipments', entregado.id, 'events'));
  await deleteDoc(evs.docs[0].ref);
});
await expectDenied('evento con campos inventados', () =>
  addDoc(collection(db, 'shipments', s.id, 'events'), { fromStatus: 'pendiente', toStatus: 'asignado', hack: true }),
);
await expectDenied('ruta con id inválido', () =>
  setDoc(doc(db, 'routes', 'cualquiera'), { status: 'asignada', stops: [] }),
);
await expectDenied('borrar una ruta', async () => {
  const r = await getDocs(collection(db, 'routes'));
  await deleteDoc(r.docs[0].ref);
});

// Evidencia (N35): solo se agrega, con id y forma válidos
await expectDenied('evidencia con id inválido', () =>
  setDoc(doc(db, 'evidence', 'cualquiera'), {
    code: s.id,
    attempt: 1,
    photo: 'data:image/jpeg;base64,AAAA',
    signature: null,
    shipmentId: s.id,
  }),
);
await expectDenied('evidencia cuya "foto" no es una imagen', () =>
  setDoc(doc(db, 'evidence', `${s.id}_intento-1`), {
    code: s.id,
    attempt: 1,
    photo: 'hola',
    signature: null,
    shipmentId: s.id,
  }),
);
await expectDenied('evidencia de un envío que no existe', () =>
  setDoc(doc(db, 'evidence', 'SIM-9999_intento-1'), {
    code: 'SIM-9999',
    attempt: 1,
    photo: 'data:image/jpeg;base64,AAAA',
    signature: null,
    shipmentId: 'SIM-9999',
  }),
);
await expectDenied('borrar evidencia', () => deleteDoc(doc(db, 'evidence', `${entregado.id}_intento-1`)));

// Sprint 4: importar, libreta, flota, reprogramar y sin asignar (C25–C33)
const v1 = 'V1';
const book = (await getDocs(collection(db, 'addresses'))).docs[0];
const enCurso = (await getDocs(collection(db, 'routes'))).docs.find((d) => d.data().status === 'en_curso');
await expectDenied('crear un envío ya asignado', () =>
  setDoc(doc(db, 'shipments', 'SIM-9998'), { code: 'SIM-9998', status: 'asignado', attempts: 0, routeId: 'R-x' }),
);
// Pasar a otro día (C44) solo mueve un pendiente sin ruta HACIA ADELANTE: hacia atrás se bloquea
await expectDenied('pasar un pendiente a una fecha anterior', () =>
  updateDoc(doc(db, 'shipments', s.id), { scheduledDate: '2020-01-01' }),
);
const conRuta = shipments.docs.find((d) => d.data().routeId && d.data().status === 'asignado');
if (conRuta)
  await expectDenied('cambiar la fecha de un pedido con ruta', () =>
    updateDoc(conRuta.ref, { scheduledDate: '2099-12-31' }),
  );
await expectDenied('motivo de sin asignar inventado', () =>
  updateDoc(doc(db, 'shipments', s.id), { unassignedReason: 'flojera' }),
);
await expectDenied('ubicación fuera de El Salvador', () =>
  updateDoc(doc(db, 'shipments', s.id), {
    location: { lat: 40.4, lng: -3.7, status: 'confirmada', source: 'despacho', confidence: 1, label: null },
  }),
);
await expectDenied('evento con tipo inventado', () =>
  addDoc(collection(db, 'shipments', s.id, 'events'), { fromStatus: 'pendiente', toStatus: 'pendiente', kind: 'hack' }),
);
await expectDenied('vehículo con tipo inventado', () =>
  setDoc(doc(db, 'vehicles', 'VX'), { type: 'avion', label: 'X', maxKg: 10, capabilities: [] }),
);
await expectDenied('borrar un vehículo', () => deleteDoc(doc(db, 'vehicles', v1)));
await expectDenied('cambiar el nombre de un motorista', () => updateDoc(doc(db, 'drivers', 'D1'), { name: 'X' }));
await expectDenied('turno con hora inválida', () => updateDoc(doc(db, 'drivers', 'D1'), { shiftStart: '25:00' }));
await expectDenied('libreta con campos inventados', () => setDoc(doc(db, 'addresses', '70000000_abc'), { hack: true }));
if (book) await expectDenied('borrar una entrada de la libreta', () => deleteDoc(book.ref));
if (enCurso)
  await expectDenied('cambiar las paradas de una ruta en curso', () => updateDoc(enCurso.ref, { stops: [] }));

// Nada cambió
const after = await getDoc(doc(db, 'shipments', s.id));
if (after.data().status !== 'pendiente') bad += 1;

console.log(`\n${ok} comprobaciones correctas · ${bad} problemas`);
await terminate(db);
process.exit(bad ? 1 : 0);
