require('dotenv').config();
const express = require('express');
const os = require('os');
const path = require('path');
const { initializeDatabase,closeDatabase,getDb,getInstanceIdentity } = require('./db');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit:'110mb' }));
  app.get('/api/health',async (req,res,next) => {
    try {
      await getDb().query('SELECT 1');
      res.json({ status:'ok',database:'connected',instancia:getInstanceIdentity() });
    } catch (error) { next(error); }
  });
  app.get('/api/version',(req,res) => {
    const pkg = require('./package.json');
    res.json({
      version: pkg.version,
      updateUrl: process.env.UPDATE_URL || '',
      githubRepo: process.env.GITHUB_REPO || ''
    });
  });
  app.use('/api/auth',require('./routes/auth'));
  app.use('/api/usuarios',require('./routes/users'));
  app.use('/api/centros-custo',require('./routes/costCenters'));
  app.use('/api/categorias',require('./routes/categories'));
  app.use('/api/fornecedores',require('./routes/suppliers'));
  app.use('/api/historico',require('./routes/history'));
  app.use('/api/lancamentos',require('./routes/transactions'));
  app.use('/api/dashboard',require('./routes/dashboard'));
  app.use('/api/sincronizacao',require('./routes/sync'));
  app.use('/api/backup',require('./routes/backup'));
  app.use('/api/first-use',require('./routes/firstUse'));
  app.use('/api/cadastro-sync',require('./routes/cadastroSync'));
  app.use('/api/fechamento-mensal',require('./routes/monthlyClosing'));
  app.use('/api/recorrentes',require('./routes/recurring'));
  app.use('/api/update',require('./routes/update'));
  app.use('/api/bug-reports',require('./routes/bugReports'));
  app.use('/api/email-settings',require('./routes/emailSettings'));
  app.use('/api/appearance',require('./routes/appearance'));
  app.use(express.static(path.join(__dirname,'public')));
  app.get('*',(req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
  app.use((error,req,res,next) => {
    if (res.headersSent) return next(error);
    if (error.statusCode) return res.status(error.statusCode).json({ erro:error.message });
    if (error.code === '23505') return res.status(409).json({ erro:'Já existe um cadastro com estes dados.' });
    if (error.code === '23503') return res.status(409).json({ erro:'O registro está sendo usado e não pode ser removido.' });
    console.error(error);
    return res.status(500).json({ erro:'Não foi possível concluir a operação.' });
  });
  return app;
}

function localIPv4s() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal).map((item) => item.address);
}

async function start() {
  const t0 = Date.now();
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) throw new Error('Defina JWT_SECRET no .env com pelo menos 32 caracteres.');
  const t1 = Date.now();
  const info = await initializeDatabase();
  const t2 = Date.now();
  const port = Number(process.env.PORT || 3333);
  const host = process.env.HOST || '127.0.0.1';
  let server;
  const app = createApp();
  const t3 = Date.now();
  try {
    server = await new Promise((resolve,reject) => {
      const candidate = app.listen(port,host,() => resolve(candidate));
      candidate.once('error',reject);
    });
  } catch (error) {
    await closeDatabase();
    throw error;
  }
  const t4 = Date.now();
  console.log(`[PERF] env: ${t1-t0}ms, db init: ${t2-t1}ms, createApp: ${t3-t2}ms, listen: ${t4-t3}ms, total: ${t4-t0}ms`);
  console.log(`\nCentro de Custos — ${info.instance.name}`);
  console.log(`Banco: ${info.mode === 'pglite' ? `local (${info.dataDir})` : 'PostgreSQL central'}`);
  console.log(`Abrir no navegador: http://localhost:${port}`);
  if (host === '0.0.0.0') localIPv4s().forEach((ip) => console.log(`Rede local: http://${ip}:${port}`));
  console.log('Operação local: nenhuma API de IA ou serviço online é utilizado.\n');
  let shuttingDown=false;
  async function shutdown() {
    if(shuttingDown) return;
    shuttingDown=true;
    server.close(async () => { await closeDatabase(); process.exit(0); });
  }
  app.locals.requestShutdown=shutdown;
  process.on('SIGINT',shutdown);
  process.on('SIGTERM',shutdown);
  return server;
}

if (require.main === module) start().catch((error) => { console.error(`\nFalha ao iniciar: ${error.message}`); process.exit(1); });
module.exports = { createApp,start };


