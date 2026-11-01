// __integration__/reseed.js  (dueño: P1)
// Cada archivo de integración arranca con el seed limpio (npm run seed -- --reset).
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

module.exports = function reseed() {
  execFileSync(process.execPath, [join(__dirname, '..', 'scripts', 'seed.js'), '--reset'], { stdio: 'ignore' });
};
