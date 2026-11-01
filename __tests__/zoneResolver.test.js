// __tests__/zoneResolver.test.js  (dueño: P1)
import { SIN_ZONA } from '../src/constants';
import { resolveZone } from '../src/features/zones/zoneResolver';
import zones from '../src/mocks/zones.json';

describe('resolveZone', () => {
  // 10 puntos de prueba, 2 por zona (criterio de aceptación de H3)
  test.each([
    [13.6989, -89.1914, 'Z1'],
    [13.6971, -89.1882, 'Z1'],
    [13.7035, -89.24, 'Z2'],
    [13.708, -89.235, 'Z2'],
    [13.675, -89.26, 'Z3'],
    [13.68, -89.255, 'Z3'],
    [13.71, -89.15, 'Z4'],
    [13.7088, -89.1534, 'Z4'],
    [13.74, -89.213, 'Z5'],
    [13.7392, -89.2101, 'Z5'],
  ])('(%f, %f) cae en %s', (lat, lng, zoneId) => {
    expect(resolveZone({ location: { lat, lng } })).toBe(zoneId);
    expect(resolveZone({ location: { lat, lng } }, zones)).toBe(zoneId);
  });

  test('fuera de los polígonos usa la tabla de municipios', () => {
    expect(resolveZone({ location: { lat: 13.72, lng: -89.12 }, municipio: 'Ilopango' })).toBe('Z4');
    expect(resolveZone({ municipio: 'ANTIGUO CUSCATLÁN' })).toBe('Z3');
  });

  test('sin coincidencia devuelve SIN_ZONA', () => {
    expect(resolveZone({ location: { lat: 13.9, lng: -89.9 }, municipio: 'Chalatenango' })).toBe(SIN_ZONA);
    expect(resolveZone({})).toBe(SIN_ZONA);
  });

  test('todos los envíos de los mocks caen en su zona o en la tabla', () => {
    const shipments = require('../src/mocks/shipments.json');
    const ruteA = new Set(['SIM-0417', 'SIM-0418', 'SIM-0419', 'SIM-0420', 'SIM-0421', 'SIM-0422', 'SIM-0423', 'SIM-0424']);
    for (const s of shipments.filter((x) => !ruteA.has(x.id))) {
      expect(resolveZone({ location: s.location, municipio: s.address.municipio })).toBe(s.zoneId);
    }
  });
});
