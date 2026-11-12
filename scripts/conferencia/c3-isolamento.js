const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const tmp = path.resolve(__dirname, '../../docs/suite-desktop/validacao/C3/.tmp');
fs.mkdirSync(tmp, { recursive: true });
process.env.TEMP = process.env.TMP = tmp;
process.env.NODE_ENV = 'test';
for (const key of ['DATABASE_URL', 'SYNC_API_URL', 'REPORT_API_URL']) process.env[key] = '';
// Apenas o Worker ficticio e os testes focados pedem listen(0).
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  if (args[0] === 0) args[0] = 3155;
  return listen.apply(this, args);
};
