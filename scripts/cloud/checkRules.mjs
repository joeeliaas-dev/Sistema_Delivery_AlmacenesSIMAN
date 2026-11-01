// scripts/cloud/checkRules.mjs  (dueño: P1)
// Comprueba contra la NUBE que las reglas limitadas funcionan, sin cambiar ningún dato:
// la lectura está abierta y cada escritura prohibida es rechazada.
// Uso: npm run check:cloud
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
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
const db = getFirestore(initializeApp(cfg));
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

const shipments = await getDocs(collection(db, 'shipments'));
const s = shipments.docs.find((d) => d.data().status === 'pendiente');
const entregado = shipments.docs.find((d) => d.data().status === 'entregado');
console.log(`Lectura abierta: ${shipments.size} envíos, ${(await getDocs(collection(db, 'zones'))).size} zonas`);
ok += shipments.size > 0 ? 1 : 0;

await expectDenied('crear un envío', () =>
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
await expectDenied('crear un motorista', () => setDoc(doc(db, 'drivers', 'D9'), { name: 'X' }));
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

// Nada cambió
const after = await getDoc(doc(db, 'shipments', s.id));
if (after.data().status !== 'pendiente') bad += 1;

console.log(`\n${ok} comprobaciones correctas · ${bad} problemas`);
await terminate(db);
process.exit(bad ? 1 : 0);
