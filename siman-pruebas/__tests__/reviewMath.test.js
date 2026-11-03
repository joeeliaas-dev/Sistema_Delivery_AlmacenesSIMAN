// __tests__/reviewMath.test.js  (dueño: P3) — cálculos de Revisar ubicaciones (S4-12)
import {
  needsReview,
  remainingLabel,
  reviewQueue,
  reviewDetail,
  reviewReason,
  startPoint,
  zoneCenter,
} from '../src/features/review/reviewMath';

const ship = (id, over = {}) => ({
  id,
  orderNumber: id,
  status: 'pendiente',
  zoneId: 'Z1',
  location: { lat: 13.7, lng: -89.2, status: 'revisar', confidence: 0.5, label: 'Colonia Escalón' },
  ...over,
});
const zones = [
  {
    id: 'Z1',
    polygon: [
      { lat: 13, lng: -89 },
      { lat: 14, lng: -89 },
      { lat: 14, lng: -90 },
      { lat: 13, lng: -90 },
    ],
  },
];
const depot = { location: { lat: 13.69, lng: -89.21 } };

describe('needsReview y reviewQueue', () => {
  it('entra solo lo pendiente con ubicación revisar o sin_ubicacion', () => {
    expect(needsReview(ship('A'))).toBe(true);
    expect(needsReview(ship('B', { location: { status: 'sin_ubicacion' } }))).toBe(true);
    expect(needsReview(ship('C', { location: { status: 'alta' } }))).toBe(false);
    expect(needsReview(ship('D', { location: { status: 'confirmada' } }))).toBe(false);
    expect(needsReview(ship('E', { status: 'asignado' }))).toBe(false);
    expect(needsReview(ship('F', { location: null }))).toBe(false);
  });
  it('ordena por número de pedido', () => {
    expect(
      reviewQueue([ship('WEB-3'), ship('WEB-1'), ship('X', { location: { status: 'alta' } })]).map((s) => s.id),
    ).toEqual(['WEB-1', 'WEB-3']);
  });
});

describe('reviewReason y reviewDetail', () => {
  it('dudosa: motivo corto y, al tocar, dónde la ubicó el mapa (sin porcentajes)', () => {
    expect(reviewReason(ship('A'))).toBe('Dirección dudosa');
    expect(reviewDetail(ship('A'))).toBe('El mapa la ubicó en: Colonia Escalón');
  });
  it('sin ubicación', () => {
    const s = ship('B', { location: { status: 'sin_ubicacion', lat: null } });
    expect(reviewReason(s)).toBe('Dirección no encontrada');
    expect(reviewDetail(s)).toBe('Ubique el pin a mano en la casa del cliente');
  });
  it('dudosa sin texto del mapa: no hay detalle', () =>
    expect(reviewDetail(ship('C', { location: { status: 'revisar', lat: 13.7, lng: -89.2 } }))).toBeNull());
});

describe('startPoint', () => {
  it('usa la ubicación dudosa si existe', () =>
    expect(startPoint(ship('A'), zones, depot)).toEqual({ lat: 13.7, lng: -89.2 }));
  it('sin ubicación: el centro de su zona', () =>
    expect(startPoint(ship('B', { location: { status: 'sin_ubicacion', lat: null } }), zones, depot)).toEqual({
      lat: 13.5,
      lng: -89.5,
    }));
  it('sin zona: el depósito', () =>
    expect(startPoint(ship('C', { zoneId: 'SIN_ZONA', location: { status: 'sin_ubicacion' } }), zones, depot)).toEqual({
      lat: 13.69,
      lng: -89.21,
    }));
  it('zoneCenter sin polígono', () => expect(zoneCenter({ polygon: [] })).toBeNull());
});

it('remainingLabel', () => {
  expect(remainingLabel(1)).toBe('Queda 1');
  expect(remainingLabel(12)).toBe('Quedan 12');
});
