// __tests__/fleetMath.test.js  (dueño: P3) — cálculos de Vehículos y turnos (S4-13)
import {
  absentLabel,
  accessFieldOf,
  accountForDriver,
  availabilityLine,
  driverFieldOf,
  driverShift,
  driverVehicleText,
  driverWarnings,
  hasBigLoad,
  normalizeTime,
  shiftError,
  TYPE_DEFAULTS,
  typeLabel,
  vehicleError,
  vehicleFieldError,
  vehicleUsersText,
} from '../src/features/vehicles/fleetMath';

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

describe('driverWarnings', () => {
  const vehicles = [{ id: 'V1' }, { id: 'V2' }];
  const drivers = [
    { id: 'D1', name: 'Kevin', vehicleId: 'V1' },
    { id: 'D2', name: 'Jorge', vehicleId: 'V1' },
    { id: 'D3', name: 'Daniela', vehicleId: null },
    { id: 'D4', name: 'Mario', vehicleId: 'V9' },
    { id: 'D5', name: 'Sofía', vehicleId: 'V2' },
  ];
  const w = driverWarnings(drivers, vehicles);
  it('compartido', () => {
    expect(w.D1).toEqual(['Comparte vehículo con Jorge']);
    expect(w.D2).toEqual(['Comparte vehículo con Kevin']);
  });
  it('sin vehículo', () => expect(w.D3[0]).toMatch(/^Sin vehículo/));
  it('vehículo borrado', () => expect(w.D4).toEqual(['Su vehículo ya no está en el catálogo']));
  it('sin avisos', () => expect(w.D5).toEqual([]));
});

describe('vehículos', () => {
  it('vehicleError', () => {
    expect(vehicleError({ type: 'moto', label: 'Moto 4', maxKg: 40 })).toBeNull();
    expect(vehicleError({ type: 'avion', label: 'X', maxKg: 1 })).toBe('Elija moto, pick-up o camión');
    expect(vehicleError({ type: 'moto', label: ' ', maxKg: 40 })).toBe('Ponga un nombre al vehículo');
    expect(vehicleError({ type: 'moto', label: 'M', maxKg: '0' })).toBe('Los kg máximos deben ser mayores que 0');
  });
  it('etiquetas y carga grande', () => {
    expect(typeLabel('pickup')).toBe('Pick-up');
    expect(hasBigLoad({ capabilities: ['carga_grande'] })).toBe(true);
    expect(hasBigLoad({ capabilities: [] })).toBe(false);
  });
});

describe('panel Agregar vehículo', () => {
  it('sugiere kg y carga grande por tipo', () => {
    expect(TYPE_DEFAULTS.moto).toEqual({ maxKg: 40, bigLoad: false });
    expect(TYPE_DEFAULTS.pickup).toEqual({ maxKg: 600, bigLoad: true });
    expect(TYPE_DEFAULTS.camion).toEqual({ maxKg: 2000, bigLoad: true });
  });
  it('el error de vehicleError va junto a su campo', () => {
    expect(vehicleFieldError({ type: 'moto', label: 'Moto 4', maxKg: '40' })).toBeNull();
    expect(vehicleFieldError({ type: 'moto', label: ' ', maxKg: '40' })).toEqual({
      field: 'label',
      message: 'Ponga un nombre al vehículo',
    });
    expect(vehicleFieldError({ type: 'moto', label: 'Moto 4', maxKg: '0' }).field).toBe('maxKg');
    expect(vehicleFieldError({ type: 'bici', label: 'B', maxKg: '5' }).field).toBe('type');
  });
  it('qué usa cada motorista y quién usa cada vehículo', () => {
    const vehicles = [{ id: 'V1', label: 'Moto 1' }];
    expect(driverVehicleText({ vehicleId: 'V1' }, vehicles)).toBe('Usa Moto 1');
    expect(driverVehicleText({}, vehicles)).toBe('Sin vehículo');
    expect(driverVehicleText({ vehicleId: 'V9' }, vehicles)).toBe('Usa un vehículo que ya no está');
    const drivers = [
      { name: 'Kevin Rivas', vehicleId: 'V1' },
      { name: 'Jorge Martínez', vehicleId: 'V1' },
      { name: 'Ana López', vehicleId: 'V1' },
    ];
    expect(vehicleUsersText({ id: 'V2' }, drivers)).toBe('Sin motorista');
    expect(vehicleUsersText({ id: 'V1' }, drivers.slice(0, 1))).toBe('Lo usa Kevin');
    expect(vehicleUsersText({ id: 'V1' }, drivers)).toBe('Lo usan Kevin, Jorge y Ana');
  });
});

describe('disponibilidad (C49)', () => {
  it('la opción de ausencia dice hoy solo si la fecha es hoy', () => {
    expect(absentLabel('2026-10-31', '2026-10-31')).toBe('No trabaja hoy');
    expect(absentLabel('2026-11-01', '2026-10-31')).toBe('No trabaja ese día');
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
  it('cuántos salen: los dados de baja no cuentan en el total', () => {
    const drivers = [{ id: 'a' }, { id: 'b' }, { id: 'c', active: false }, { id: 'd' }];
    const skipped = [{ driverId: 'b' }, { driverId: 'c' }];
    expect(availabilityLine(drivers, skipped)).toBe('2 de 3 salen');
    expect(availabilityLine([{ id: 'a' }], [])).toBe('1 de 1 sale');
  });
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
