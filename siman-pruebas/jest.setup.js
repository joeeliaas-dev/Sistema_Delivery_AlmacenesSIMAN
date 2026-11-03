// jest.setup.js  (dueño: P1)
// Pruebas de unidad: lógica sin servidor. Jest no transforma el ESM de firebase, así que se simula vacío,
// y Geoapify lo responde la simulación de __tests__/simulaciones (nunca gasta créditos).
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/storage', () => ({}));
jest.mock('./src/lib/firebase', () => ({ USE_EMULATORS: false, db: {}, storage: {}, EMULATOR_HOST: 'localhost', app: {} }));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  connectAuthEmulator: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(async () => {}),
}));
process.env.EXPO_PUBLIC_GEOAPIFY_KEY = 'prueba';
require('./__tests__/simulaciones/geoapify.cjs').instalar(global);
