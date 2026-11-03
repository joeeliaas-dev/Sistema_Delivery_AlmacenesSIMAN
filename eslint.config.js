// eslint.config.js  (dueño: P1) — https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    // siman-pruebas se revisa cuando sus pruebas se copian dentro de la app; Sprint 1/ es otra app (la del equipo, en main)
    ignores: [
      'dist/*',
      'dist-*/*',
      '.expo/*',
      '.e2e/*',
      '.tour/*',
      'emulator-data/*',
      'siman-pruebas/**',
      'Sprint 1/**',
    ],
  },
  {
    // Pruebas: globales de Jest; jest.mock va antes de los import a propósito
    files: ['__tests__/**/*.js', '__integration__/**/*.js', 'jest.setup.js'],
    languageOptions: { globals: globals.jest },
    rules: { 'import/first': 'off' },
  },
  {
    // Scripts: corren en Node, no en el teléfono
    files: ['scripts/**/*.{js,mjs}', 'jest.emulator.config.js', '__integration__/reseed.js'],
    languageOptions: { globals: globals.node },
  },
]);
