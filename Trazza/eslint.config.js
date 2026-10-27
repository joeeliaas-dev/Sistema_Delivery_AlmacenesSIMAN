const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'dist-cloud/*', 'dist-emu/*', '.expo/*', '.e2e/*', '.tour/*', 'emulator-data/*'],
  },
  {
    files: ['__tests__/**/*.js', '__integration__/**/*.js', 'jest.setup.js'],
    languageOptions: {
      globals: globals.jest,
    },
    rules: {
      'import/first': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'jest.emulator.config.js', '__integration__/reseed.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
