const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
module.exports = function reseed() {
  execFileSync(process.execPath, [join(__dirname, '..', 'scripts', 'seed.js'), '--reset'], {
    stdio: 'ignore',
  });
};
