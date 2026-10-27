const babelPresetExpo = require.resolve('babel-preset-expo', {
  paths: [require.resolve('expo')],
});
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__integration__/**/*.emu.js'],
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [babelPresetExpo],
      },
    ],
  },
  setupFiles: ['<rootDir>/__integration__/setupEnv.js'],
  testTimeout: 30000,
  maxWorkers: 1,
};
