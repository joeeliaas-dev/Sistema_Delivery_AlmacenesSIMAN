// jest.setup.js  (dueño: P1)
// Las pruebas corren en modo mocks. Jest no transforma el ESM de firebase y en mocks
// no se usa, así que se simula aquí para todas las pruebas (no hace falta repetirlo).
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/storage', () => ({}));
jest.mock('./src/lib/firebase', () => ({ USE_MOCKS: true, db: {}, storage: {}, EMULATOR_HOST: 'localhost' }));
