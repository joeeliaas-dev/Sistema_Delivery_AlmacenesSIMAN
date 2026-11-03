// jest.emulator.config.js  (dueño: P1)
// Pruebas de integración contra el Emulator Suite (Firestore real, sin mocks).
// Uso: `npm run emulators` en otra terminal y después `npm run test:emulator`.
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo')] });

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__integration__/**/*.emu.js'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: [babelPresetExpo] }] },
  setupFiles: ['<rootDir>/__integration__/setupEnv.js'],
  testTimeout: 30000,
  maxWorkers: 1, // todos usan el mismo emulador: un archivo a la vez, cada uno con su seed
};
