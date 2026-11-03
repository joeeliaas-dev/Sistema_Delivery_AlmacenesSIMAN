// jest.config.js  (dueño: P1) — lo copia correr.mjs dentro del proyecto mientras corren las pruebas
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
