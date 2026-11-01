// __tests__/gpsCorrection.test.js  (dueño: P3) — corrección de ubicación por GPS al entregar (S4-14)
const mockConfirm = jest.fn();
jest.mock('../src/features/geo/addressBook', () => ({ confirmLocation: (...a) => mockConfirm(...a) }));

const { confirmFromDelivery, shouldConfirmFromGps } = require('../src/features/driver/gpsCorrection');

const ship = (status) => ({ id: 'SIM-0419', location: status ? { lat: 13.7, lng: -89.2, status } : null });
const gps = (accuracyM) => ({ lat: 13.70352, lng: -89.24011, accuracyM });

beforeEach(() => mockConfirm.mockReset());

describe('shouldConfirmFromGps', () => {
  it('preciso y sin confirmar: sí', () => expect(shouldConfirmFromGps(ship('revisar'), gps(12))).toBe(true));
  it('ubicación alta (sin confirmar): sí', () => expect(shouldConfirmFromGps(ship('alta'), gps(30))).toBe(true));
  it('envío sin ubicación: sí', () => expect(shouldConfirmFromGps(ship(null), gps(30))).toBe(true));
  it('ya confirmada: no', () => expect(shouldConfirmFromGps(ship('confirmada'), gps(5))).toBe(false));
  it('50 m o más: no', () => expect(shouldConfirmFromGps(ship('revisar'), gps(50))).toBe(false));
  it('sin GPS o sin precisión: no', () => {
    expect(shouldConfirmFromGps(ship('revisar'), null)).toBe(false);
    expect(shouldConfirmFromGps(ship('revisar'), { lat: 13.7, lng: -89.2 })).toBe(false);
  });
});

describe('confirmFromDelivery', () => {
  it('llama a confirmLocation con la fuente gps_entrega', async () => {
    mockConfirm.mockResolvedValue({ addressId: 'x' });
    await expect(confirmFromDelivery(ship('revisar'), gps(12))).resolves.toBe(true);
    expect(mockConfirm).toHaveBeenCalledWith('SIM-0419', { lat: 13.70352, lng: -89.24011 }, 'gps_entrega');
  });
  it('no la llama si no corresponde', async () => {
    await expect(confirmFromDelivery(ship('confirmada'), gps(12))).resolves.toBe(false);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
  it('si falla, no lanza (solo consola)', async () => {
    mockConfirm.mockRejectedValue(new Error('sin red'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(confirmFromDelivery(ship('revisar'), gps(12))).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
