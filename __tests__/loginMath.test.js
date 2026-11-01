// __tests__/loginMath.test.js  (dueño: P3) — revisión previa de la pantalla de entrada
import { loginFieldErrors } from '../src/features/session/loginMath';

test('campos vacíos: el mensaje va junto a cada campo', () => {
  expect(loginFieldErrors('', '')).toEqual({ email: 'Escriba su correo', password: 'Escriba su contraseña' });
  expect(loginFieldErrors('  ', 'x')).toEqual({ email: 'Escriba su correo' });
});

test('correo sin forma de correo', () => {
  expect(loginFieldErrors('kevin', 'x').email).toMatch(/nombre@empresa\.com/);
  expect(loginFieldErrors('kevin@trazza', 'x').email).toBeDefined();
  expect(loginFieldErrors(' kevin@trazzasv.test ', 'x')).toEqual({});
});
