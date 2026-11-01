// __tests__/getCurrentGps.test.js  (dueño: P1)
// N5: el GPS nunca bloquea la entrega.
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const Location = require('expo-location');
const { getCurrentGps } = require('../src/features/evidence/getCurrentGps');

const pos = (lat, lng, accuracy) => ({ coords: { latitude: lat, longitude: lng, accuracy } });

beforeEach(() => {
  jest.useRealTimers();
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getCurrentPositionAsync.mockResolvedValue(pos(13.7035, -89.24, 8.6));
  Location.getLastKnownPositionAsync.mockResolvedValue(pos(13.7, -89.2, 40));
});

test('devuelve la posición actual con la precisión redondeada', async () => {
  await expect(getCurrentGps()).resolves.toEqual({ lat: 13.7035, lng: -89.24, accuracyM: 9 });
});

test('sin permiso devuelve null', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await expect(getCurrentGps()).resolves.toBeNull();
});

test('si el GPS falla usa la última posición conocida', async () => {
  Location.getCurrentPositionAsync.mockRejectedValue(new Error('Location services are disabled'));
  await expect(getCurrentGps()).resolves.toEqual({ lat: 13.7, lng: -89.2, accuracyM: 40 });
});

test('si no hay señal en 10 s usa la última posición conocida', async () => {
  jest.useFakeTimers();
  Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {})); // nunca responde
  const result = getCurrentGps();
  await jest.advanceTimersByTimeAsync(10000);
  await expect(result).resolves.toEqual({ lat: 13.7, lng: -89.2, accuracyM: 40 });
});
