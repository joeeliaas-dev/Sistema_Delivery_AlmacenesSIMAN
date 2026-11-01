// __tests__/geoapifyLimit.test.js  (dueño: P1) — N50: tope diario de llamadas reales a Geoapify por equipo
// La API real se simula con un fetch falso: ninguna prueba sale a internet.
let geo;
let fetchMock;

beforeEach(() => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_GEOAPIFY_LIVE = 'true';
  process.env.EXPO_PUBLIC_GEOAPIFY_KEY = 'clave-de-prueba';
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }));
  global.fetch = fetchMock;
  geo = require('../src/lib/geoapify');
});

afterEach(() => {
  process.env.EXPO_PUBLIC_GEOAPIFY_LIVE = 'false';
  delete process.env.EXPO_PUBLIC_GEOAPIFY_KEY;
  delete global.fetch;
});

it('cuenta cada llamada real por tipo', async () => {
  await geo.geoapifyFetch('/v1/geocode/search', { params: { text: 'x' } });
  await geo.geoapifyFetch('/v1/routeplanner', { method: 'POST', body: {} });
  expect(geo.geoapifyUsage()).toMatchObject({ geocode: 1, routeplanner: 1 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('al llegar al tope responde "quota" sin llamar a la API', async () => {
  const { GEOAPIFY_DAILY_LIMIT } = require('../src/constants');
  for (let i = 0; i < GEOAPIFY_DAILY_LIMIT.routeplanner; i++)
    await geo.geoapifyFetch('/v1/routeplanner', { method: 'POST', body: {} });
  const calls = fetchMock.mock.calls.length;
  await expect(geo.geoapifyFetch('/v1/routeplanner', { method: 'POST', body: {} })).rejects.toMatchObject({
    code: 'quota',
    message: expect.stringContaining('límite diario'),
  });
  expect(fetchMock).toHaveBeenCalledTimes(calls);
  // las búsquedas de direcciones tienen su propio tope
  await geo.geoapifyFetch('/v1/geocode/search', { params: { text: 'x' } });
  expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
});

it('con mocks no cuenta nada', async () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_GEOAPIFY_LIVE = 'false';
  const mocked = require('../src/lib/geoapify');
  await mocked.geoapifyFetch('/v1/routeplanner', {
    method: 'POST',
    body: { mode: 'drive', agents: [{ id: 'D1', start_location: [-89.22, 13.699] }], jobs: [] },
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocked.geoapifyUsage()).toMatchObject({ geocode: 0, routeplanner: 0 });
});
