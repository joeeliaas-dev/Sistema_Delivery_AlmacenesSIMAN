// __tests__/fleetMath.test.js  (dueño: P3) — cálculos de la pantalla Motoristas (C53)
import {
  accessFieldOf,
  accountForDriver,
  driverFieldOf,
  driversLine,
  driverShift,
  normalizeTime,
  shiftError,
  zonesWithoutDriver,
} from '../src/features/drivers/fleetMath';

describe('normalizeTime', () => {
  it('completa la hora', () => expect(normalizeTime('7:00')).toBe('07:00'));
  it('deja igual lo correcto', () => expect(normalizeTime(' 18:30 ')).toBe('18:30'));
  it('lo inválido se devuelve sin cambiar (lo rechaza P1)', () => expect(normalizeTime('700')).toBe('700'));
});

describe('shiftError', () => {
  it('turno válido', () => expect(shiftError('07:00', '18:00')).toBeNull());
  it('formato malo', () => expect(shiftError('7', '18:00')).toMatch(/Inicio "7": use HH:MM/));
  it('fin vacío', () => expect(shiftError('07:00', '')).toMatch(/Fin "vacío"/));
  it('empieza después de terminar', () =>
    expect(shiftError('18:00', '07:00')).toBe('El turno debe empezar antes de terminar'));
});

it('driverShift usa el turno por defecto si falta', () => {
  expect(driverShift({})).toEqual({ shiftStart: '07:00', shiftEnd: '18:00' });
  expect(driverShift({ shiftStart: '08:00', shiftEnd: '16:00' })).toEqual({ shiftStart: '08:00', shiftEnd: '16:00' });
});

it('el error de createDriver va junto a su campo', () => {
  expect(driverFieldOf('Escriba el nombre del motorista')).toBe('name');
  expect(driverFieldOf('El nombre es muy largo (máximo 60 letras)')).toBe('name');
  expect(driverFieldOf('Teléfono inválido')).toBe('phone');
  expect(driverFieldOf('Elija la zona del motorista')).toBe('zone');
  expect(driverFieldOf('Turno: use HH:MM')).toBe('shift');
  expect(driverFieldOf('El turno debe empezar antes de terminar')).toBe('shift');
  expect(driverFieldOf('Sin conexión')).toBeNull();
});

describe('acceso a la app del motorista', () => {
  it('el error de createDriverAccess va junto a su campo', () => {
    expect(accessFieldOf('El correo no es válido.')).toBe('email');
    expect(accessFieldOf('Ese correo ya tiene una cuenta.')).toBe('email');
    expect(accessFieldOf('La contraseña debe tener al menos 8 caracteres.')).toBe('password');
    expect(accessFieldOf('Sin conexión a internet.')).toBeNull();
  });
  it('la cuenta de cada motorista sale de users por su driverId', () => {
    const accounts = [
      { uid: 'u1', role: 'despacho', driverId: null },
      { uid: 'u2', role: 'motorista', driverId: 'D1', email: 'kevin@x.test' },
    ];
    expect(accountForDriver(accounts, 'D1').uid).toBe('u2');
    expect(accountForDriver(accounts, 'D9')).toBeNull();
    expect(accountForDriver(null, 'D1')).toBeNull();
  });
});

describe('baja y zonas', () => {
  const zones = [
    { id: 'Z1', name: 'Centro' },
    { id: 'Z2', name: 'Escalón' },
    { id: 'Z3', name: 'Apopa' },
  ];
  const drivers = [
    { id: 'D1', zoneId: 'Z1' },
    { id: 'D2', zoneId: 'Z2', active: false },
  ];
  it('una zona sin motorista activo se queda sin ruta', () =>
    expect(zonesWithoutDriver(zones, drivers).map((z) => z.id)).toEqual(['Z2', 'Z3']));
  it('la línea de arriba cuenta los de baja', () => {
    expect(driversLine(drivers)).toBe('2 motoristas · 1 de baja');
    expect(driversLine([{ id: 'D1' }])).toBe('1 motorista');
  });
});
