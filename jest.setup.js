// jest.setup.js  (dueño: P1)
// Las pruebas corren en modo mocks. Jest no transforma el ESM de firebase y en mocks
// no se usa, así que se simula aquí para todas las pruebas (no hace falta repetirlo).
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/storage', () => ({}));
jest.mock('./src/lib/firebase', () => ({ USE_MOCKS: true, db: {}, storage: {}, EMULATOR_HOST: 'localhost' }));
// Las pruebas nunca gastan créditos de Geoapify, aunque .env tenga la API real encendida
process.env.EXPO_PUBLIC_GEOAPIFY_LIVE = 'false';
// Las pruebas unitarias corren con datos de prueba: la sesión no usa Firebase Auth (C48).
// Su paquete viene en ESM y Jest no lo transforma; basta una simulación vacía.
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  connectAuthEmulator: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(async () => {}),
}));
