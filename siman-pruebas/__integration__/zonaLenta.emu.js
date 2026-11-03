// __integration__/zonaLenta.emu.js  (dueño: P1)
// Geoapify lento (2 nov): al volver a optimizar, si una zona no responde, su ruta sin salir queda como estaba
// (no se vacía) y las demás sí se rehacen.
import { collection, getDocs, terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { todayISO } from '../src/lib/dates';

beforeAll(() => require('./reseed')(), 60000);
afterAll(() => terminate(db));

test('una zona que no responde conserva su ruta; el día se guarda igual', async () => {
  const geo = require('../src/lib/geoapify');
  const { optimizeAndSaveDay } = require('../src/features/routes/routesService');
  const today = todayISO();
  const first = await optimizeAndSaveDay(today);
  const z5 = first.routeIds.find((id) => id.endsWith('-Z5'));
  expect(z5).toBeTruthy();
  const routesNow = async () =>
    Object.fromEntries((await getDocs(collection(db, 'routes'))).docs.map((d) => [d.id, d.data()]));
  const before = (await routesNow())[z5].stops;

  const real = geo.geoapifyFetch;
  jest.spyOn(geo, 'geoapifyFetch').mockImplementation((path, opts) =>
    opts?.body?.agents?.[0]?.id === 'D5'
      ? Promise.reject(new geo.GeoapifyError('timeout', 'Geoapify no respondió a tiempo.'))
      : real(path, opts),
  );
  const again = await optimizeAndSaveDay(today);
  expect(again.warnings.some((w) => /Geoapify no respondió para la/.test(w))).toBe(true);
  expect(again.routeIds).not.toContain(z5);
  expect((await routesNow())[z5].stops).toEqual(before);
}, 90000);
