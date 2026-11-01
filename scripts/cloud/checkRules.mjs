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

// Las reglas tardan en aplicarse en todos los servidores (después de seed:cloud quedan abiertas un momento):
// antes de probar nada se espera a que una escritura inofensiva en una colección sin reglas sea rechazada
// 5 veces seguidas. Si alguna pasa (reglas aún abiertas), se borra y se sigue esperando, hasta 4 min.
{
  const probe = doc(db, 'revision', 'guardia');
  let streak = 0;
  const end = Date.now() + 4 * 60000;
  while (streak < 5) {
    if (Date.now() > end)
      throw new Error('Las reglas de la nube no se aplicaron en 4 min: no se revisa para no tocar datos');
    try {
      await setDoc(probe, { at: Date.now() });
      streak = 0;
      await deleteDoc(probe).catch(() => {});
      console.log('  … las reglas todavía no se aplican en todos los servidores; espero');
    } catch (err) {
      streak = err.code === 'permission-denied' ? streak + 1 : 0;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log('  reglas de la nube aplicadas');
}

const shipments = await getDocs(collection(db, 'shipments'));
const s = shipments.docs.find((d) => d.data().status === 'pendiente');
const entregado = shipments.docs.find((d) => d.data().status === 'entregado');
console.log(`Lectura abierta: ${shipments.size} envíos, ${(await getDocs(collection(db, 'zones'))).size} zonas`);
ok += shipments.size > 0 ? 1 : 0;

await expectDenied('crear un envío incompleto', () =>
  setDoc(doc(db, 'shipments', 'SIM-9999'), { code: 'SIM-9999', status: 'pendiente' }),
);
await expectDenied('borrar un envío', () => deleteDoc(doc(db, 'shipments', 'SIM-0000')));
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
await expectDenied('borrar un evento del historial', () =>
  deleteDoc(doc(db, 'shipments', entregado.id, 'events', 'REVISION-NO-EXISTE')),
);
await expectDenied('evento con campos inventados', () =>
  addDoc(collection(db, 'shipments', s.id, 'events'), { fromStatus: 'pendiente', toStatus: 'asignado', hack: true }),
);
await expectDenied('ruta con id inválido', () =>
  setDoc(doc(db, 'routes', 'cualquiera'), { status: 'asignada', stops: [] }),
);
await expectDenied('borrar una ruta', () => deleteDoc(doc(db, 'routes', 'R-2000-01-01-Z0')));

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
await expectDenied('borrar evidencia', () => deleteDoc(doc(db, 'evidence', 'SIM-0000_intento-1')));

// Sprint 3: reprogramar y sin asignar
const enCurso = (await getDocs(collection(db, 'routes'))).docs.find((d) => d.data().status === 'en_curso');
await expectDenied('crear un envío ya asignado', () =>
  setDoc(doc(db, 'shipments', 'SIM-9998'), { code: 'SIM-9998', status: 'asignado', attempts: 0, routeId: 'R-x' }),
);
await expectDenied('cambiar la fecha de un pendiente (solo al reprogramar)', () =>
  updateDoc(doc(db, 'shipments', s.id), { scheduledDate: '2030-01-01' }),
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
await expectDenied('cambiar el nombre de un motorista', () => updateDoc(doc(db, 'drivers', 'D1'), { name: 'X' }));
await expectDenied('turno con hora inválida', () => updateDoc(doc(db, 'drivers', 'D1'), { shiftStart: '25:00' }));
if (enCurso)
  await expectDenied('cambiar las paradas de una ruta en curso', () => updateDoc(enCurso.ref, { stops: [] }));

// Nada cambió
const after = await getDoc(doc(db, 'shipments', s.id));
if (after.data().status !== 'pendiente') bad += 1;

console.log(`\n${ok} comprobaciones correctas · ${bad} problemas`);
await terminate(db);
process.exit(bad ? 1 : 0);
