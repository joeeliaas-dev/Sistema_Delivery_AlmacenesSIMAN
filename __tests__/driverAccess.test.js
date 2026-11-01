// __tests__/driverAccess.test.js  (dueño: P1) — el despacho da acceso a un motorista (datos de prueba)
let auth;
beforeEach(() => {
  jest.resetModules();
  auth = require('../src/lib/auth');
});

it('solo el despacho crea accesos; el motorista nuevo puede entrar', async () => {
  await auth.signIn('kevin@trazzasv.test');
  await expect(auth.createDriverAccess({ driverId: 'D1', name: 'Ana', email: 'ana@x.test', password: '12345678' })).rejects.toThrow('Solo el despacho');
  await auth.signIn('despacho@trazzasv.test');
  await expect(auth.createDriverAccess({ driverId: 'D1', email: 'mal', password: '12345678' })).rejects.toThrow('correo');
  await expect(auth.createDriverAccess({ driverId: 'D1', email: 'ana@x.test', password: 'corta' })).rejects.toThrow('8 caracteres');
  await expect(auth.createDriverAccess({ driverId: 'D1', email: 'kevin@trazzasv.test', password: '12345678' })).rejects.toThrow('ya tiene');
  expect(await auth.createDriverAccess({ driverId: 'D9', name: 'Ana Pérez', email: 'Ana@X.test', password: '12345678' })).toMatchObject({ email: 'ana@x.test' });
  await auth.signOut();
  expect(await auth.signIn('ana@x.test')).toMatchObject({ role: 'motorista', driverId: 'D9', name: 'Ana Pérez' });
});

it('listenAccounts y quitar/devolver acceso (datos de prueba)', async () => {
  await auth.signIn('despacho@trazzasv.test');
  const seen = [];
  const stop = auth.listenAccounts((list) => seen.push(list));
  const kevin = seen.at(-1).find((a) => a.email === 'kevin@trazzasv.test');
  expect(kevin).toMatchObject({ role: 'motorista', driverId: 'D1', active: true });
  await expect(auth.setAccessActive(seen.at(-1).find((a) => a.role === 'despacho').uid, false)).rejects.toThrow('motorista');
  await auth.setAccessActive(kevin.uid, false);
  expect(seen.at(-1).find((a) => a.uid === kevin.uid).active).toBe(false);
  await auth.signOut();
  await expect(auth.signIn('kevin@trazzasv.test')).rejects.toThrow('no tiene acceso');
  await auth.signIn('despacho@trazzasv.test');
  await auth.setAccessActive(kevin.uid, true);
  await auth.signOut();
  expect(await auth.signIn('kevin@trazzasv.test')).toMatchObject({ role: 'motorista' });
  stop();
});
