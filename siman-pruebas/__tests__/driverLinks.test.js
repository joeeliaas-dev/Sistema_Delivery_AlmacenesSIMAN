// __tests__/driverLinks.test.js  (dueño: P3) — llamada y "Falta …" del motorista
import { missingText } from '../src/features/driver/routeMath';
import { phoneUrl } from '../src/features/driver/navigationLinks';

test('el teléfono del cliente queda como enlace tel: sin espacios ni guiones', () => {
  expect(phoneUrl('+503 7000-0400')).toBe('tel:+50370000400');
  expect(phoneUrl(70000400)).toBe('tel:70000400');
});

test('lo que falta para completar se dice en una frase', () => {
  expect(missingText([])).toBe('');
  expect(missingText(['la firma'])).toBe('Falta la firma');
  expect(missingText(['la foto', 'la firma'])).toBe('Falta la foto y la firma');
  expect(missingText(['la foto', 'la firma', 'la nota'])).toBe('Falta la foto, la firma y la nota');
});
