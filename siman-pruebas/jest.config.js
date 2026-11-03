// jest.config.js  (dueño: P1) — lo copia correr.mjs dentro del proyecto mientras corren las pruebas
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // en el repositorio siman-pruebas/ está dentro de la app: solo se corre la copia que hace correr.mjs
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/siman-pruebas/', '<rootDir>/Sprint 1/'],
};
