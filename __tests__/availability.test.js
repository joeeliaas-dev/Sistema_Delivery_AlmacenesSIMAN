// __tests__/availability.test.js  (dueño: P1) — disponibilidad y flota (C49)
import { availableDrivers, unavailability } from '../src/features/fleet/availability';

const vehicles = [
  { id: 'V1', label: 'Moto 1' },
  { id: 'V5', label: 'Camión 1', status: 'taller' },
];
const d = (id, extra = {}) => ({ id, name: `M ${id}`, vehicleId: 'V1', active: true, absentDates: [], ...extra });

it('sale quien está activo, no está ausente ese día y su vehículo no está en taller', () => {
  const r = availableDrivers(
    [d('D1'), d('D2', { absentDates: ['2026-11-01'] }), d('D3', { active: false }), d('D4', { vehicleId: 'V5' })],
    vehicles,
    '2026-11-01',
  );
  expect(r.drivers.map((x) => x.id)).toEqual(['D1']);
  expect(r.skipped.map((x) => [x.driverId, x.reason])).toEqual([
    ['D2', 'ausente'],
    ['D3', 'baja'],
    ['D4', 'taller'],
  ]);
  expect(r.skipped[2].text).toBe('M D4: Camión 1 está en taller');
});

it('la ausencia es solo de ese día; los datos viejos sin campos cuentan como disponibles', () => {
  expect(unavailability(d('D2', { absentDates: ['2026-11-01'] }), vehicles, '2026-11-02')).toBeNull();
  expect(unavailability({ id: 'D9', vehicleId: 'V1' }, vehicles, '2026-11-01')).toBeNull();
  expect(unavailability({ id: 'D8', name: 'Ana' }, vehicles, '2026-11-01')).toEqual({ reason: 'sin_vehiculo', text: 'Ana no tiene vehículo asignado' });
});

describe('servicio de flota con datos de prueba', () => {
  let fleet, mockDb;
  beforeEach(() => {
    jest.resetModules();
    fleet = require('../src/features/fleet/fleetService');
    ({ mockDb } = require('../src/mocks'));
  });
  const future = require('../src/features/dispatch/dispatchMath').addDays(require('../src/lib/dates').todayISO(), 2);

  it('ausente un día y de vuelta', async () => {
    expect(await fleet.setDriverAbsent('D1', future, true)).toEqual([future]);
    expect(mockDb.get('drivers', 'D1').absentDates).toEqual([future]);
    expect(await fleet.setDriverAbsent('D1', future, false)).toEqual([]);
  });

  it('vehículo en taller y crear motorista', async () => {
    await fleet.setVehicleStatus('V5', 'taller');
    expect(mockDb.get('vehicles', 'V5').status).toBe('taller');
    await expect(fleet.setVehicleStatus('V5', 'roto')).rejects.toThrow('desconocido');
    const id = await fleet.createDriver({ name: '  Ana   Pérez ', zoneId: 'Z1', vehicleId: 'V1' });
    expect(mockDb.get('drivers', id)).toMatchObject({ name: 'Ana Pérez', initials: 'AP', active: true, absentDates: [] });
    await expect(fleet.createDriver({ name: 'Al', zoneId: 'Z1' })).rejects.toThrow('nombre');
    await expect(fleet.createDriver({ name: 'Ana Pérez', zoneId: 'Z1', shiftStart: '18:00', shiftEnd: '07:00' })).rejects.toThrow('turno');
  });

  it('"Generar ruta de esta zona" no sale si su motorista está ausente', async () => {
    const svc = require('../src/features/routes/routesService');
    const today = require('../src/lib/dates').todayISO();
    await fleet.setDriverAbsent('D1', today, true);
    await expect(svc.createRoute({ zoneId: 'Z1', date: today })).rejects.toThrow('no trabaja ese día');
  });
});
