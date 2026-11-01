// __tests__/colonyCheck.test.js  (dueño: P1) — N40 opción B: la colonia del Excel contra la de Geoapify
// Los casos salen de la medición real de P3 del 29 oct (N48).
import { colonyWords, judgeGeocode } from '../src/features/geo/resolveLocations';
import zones from '../src/mocks/zones.json';

const hit = (label, area = null, extra = {}) => ({
  lat: 13.7005,
  lng: -89.1905,
  confidence: 1,
  resultType: 'street',
  label,
  area,
  ...extra,
});
const sanSalvador = 'San Salvador Centro';

describe('colonyWords', () => {
  it.each([
    ['Calle El Mirador #6, Col. Escalón', ['escalon']],
    ['Avenida España #36, Barrio Candelaria', ['candelaria']],
    ['Avenida Prusia #106, Col. Guadalupe, Soyapango', ['guadalupe']],
    ['Calle Loma Linda #111, San Benito', ['benito']],
    ['Pasaje 3 #12, Urbanización Jardines de Guadalupe', ['jardines', 'guadalupe']],
    ['Calle La Mascota #26, Colonia Escalón', ['escalon']],
  ])('%s', (text, words) => expect(colonyWords({ text, municipio: sanSalvador })).toEqual(words));

  it('sin coma, con número o solo el municipio: no se compara', () => {
    expect(colonyWords({ text: 'Colonia Escalón', municipio: sanSalvador })).toEqual([]);
    expect(colonyWords({ text: 'Calle Arce, casa 5', municipio: sanSalvador })).toEqual([]);
    expect(colonyWords({ text: 'Calle Arce #5, San Salvador Centro', municipio: sanSalvador })).toEqual([]);
    expect(colonyWords(null)).toEqual([]);
  });
});

describe('judgeGeocode con colonia', () => {
  it('WEB-900137: calle con el mismo nombre en otra colonia (5.7 km) → revisar', () => {
    const r = judgeGeocode(hit('Calle Diagonal el Mirador, Ayutuxtepeque', 'Colonia Escandia'), zones, {
      text: 'Calle El Mirador #6, Col. Escalón',
      municipio: sanSalvador,
    });
    expect(r).toEqual({ status: 'revisar', reason: 'la colonia no coincide con la del Excel' });
  });

  it('WEB-900189: la avenida correcta en otro barrio → revisar', () => {
    const r = judgeGeocode(hit('Avenida España, San Salvador', 'Colonia Guadalupe'), zones, {
      text: 'Avenida España #36, Barrio Candelaria',
      municipio: sanSalvador,
    });
    expect(r.status).toBe('revisar');
  });

  it('WEB-900132: la colonia aparece en la respuesta → alta', () => {
    const r = judgeGeocode(hit('Calle Loma Linda, San Benito, San Salvador'), zones, {
      text: 'Calle Loma Linda #111, San Benito',
      municipio: sanSalvador,
    });
    expect(r).toEqual({ status: 'alta', reason: null });
  });

  it('la colonia puede venir solo en el área (suburb) y sin tildes', () => {
    const r = judgeGeocode(hit('Calle El Mirador, San Salvador', 'Colonia Escalon'), zones, {
      text: 'Calle El Mirador #6, Col. Escalón',
      municipio: sanSalvador,
    });
    expect(r.status).toBe('alta');
  });

  it('sin dirección o sin colonia en el Excel, se comporta como antes', () => {
    expect(judgeGeocode(hit('Calle Arce, San Salvador'), zones).status).toBe('alta');
    expect(
      judgeGeocode(hit('Calle Arce, San Salvador'), zones, { text: 'Calle Arce #5', municipio: sanSalvador }).status,
    ).toBe('alta');
  });

  it('las otras reglas siguen primero', () => {
    const address = { text: 'Calle El Mirador #6, Col. Escalón', municipio: sanSalvador };
    expect(judgeGeocode(hit('x', null, { confidence: 0.5 }), zones, address).reason).toBe('confianza baja');
    expect(judgeGeocode(null, zones, address).status).toBe('sin_ubicacion');
  });
});
