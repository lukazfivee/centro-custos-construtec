// C4: todos os dados e perfis descartaveis ficam dentro desta worktree.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const tmp = path.resolve(__dirname, '../../docs/suite-desktop/validacao/C4/.tmp');
fs.mkdirSync(tmp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp;
process.env.NODE_ENV = 'test';
for (const key of ['DATABASE_URL', 'SYNC_API_URL', 'REPORT_API_URL']) process.env[key] = '';
// O Worker ficticio do C1 usa listen(0); reserva fixa, sem porta aleatoria.
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  if (args[0] === 0) args[0] = 3165;
  return listen.apply(this, args);
};
