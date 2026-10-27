jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/storage', () => ({}));
jest.mock('./src/lib/firebase', () => ({
  USE_MOCKS: true,
  db: {},
  storage: {},
  EMULATOR_HOST: 'localhost',
}));
