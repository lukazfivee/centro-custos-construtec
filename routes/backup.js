const fs = require('fs');
const path = require('path');
const express = require('express');
const { getDb, getInstanceIdentity } = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { asyncRoute, httpError } = require('../lib/http');
const { recordAudit } = require('../services/audit');

const router = express.Router();
router.use(autenticar, exigirPapel('admin'));

function restoreRootDir() {
  return path.resolve(process.env.RESTORE_ROOT_DIR || path.join(__dirname, '..', 'dados'));
}

router.get('/', asyncRoute(async (req, res) => {
  const db = getDb();
  if (!db.dump) throw httpError(501, 'No modo PostgreSQL central, faça o backup com pg_dump.');
  const dump = await db.dump();
  const buffer = Buffer.from(await dump.arrayBuffer());
  const name = getInstanceIdentity().name.replace(/[^a-zA-Z0-9_-]+/g,'-').toLowerCase();
  const date = new Date().toISOString().replace(/[:.]/g,'-');
  await recordAudit({entityType:'backup',action:'criado',summary:'Backup local gerado pelo administrador.',user:req.usuario});
  res.setHeader('Content-Type','application/gzip');
  res.setHeader('Content-Disposition',`attachment; filename="backup-${name}-${date}.tar.gz"`);
  res.send(buffer);
}));

router.post('/restaurar', asyncRoute(async (req,res) => {
  const db=getDb();
  if(!db.dump) throw httpError(501,'A restauração por arquivo é exclusiva do modo local.');
  if(String(req.body.confirmacao||'')!=='RESTAURAR') throw httpError(400,'Digite RESTAURAR para confirmar.');
  const filename=String(req.body.nomeArquivo||'').slice(0,240);
  if(!/\.tar\.gz$/i.test(filename)) throw httpError(400,'Selecione um backup .tar.gz gerado pelo sistema.');
  const encoded=String(req.body.conteudoBase64||'').replace(/^data:[^,]+,/, '');
  let buffer;
  try { buffer=Buffer.from(encoded,'base64'); } catch { throw httpError(400,'Arquivo de backup inválido.'); }
  if(buffer.length<1024 || buffer.length>80*1024*1024) throw httpError(400,'O backup deve ter entre 1 KB e 80 MB.');
  if(buffer[0]!==0x1f || buffer[1]!==0x8b) throw httpError(400,'O arquivo não parece ser um backup compactado válido.');
  const directory=path.join(restoreRootDir(),'restauracoes');
  fs.mkdirSync(directory,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const archivePath=path.join(directory,`restauracao-${stamp}.tar.gz`);
  fs.writeFileSync(archivePath,buffer,{flag:'wx'});
  const markerPath=path.join(restoreRootDir(),'restauracao-pendente.json');
  const tempMarker=`${markerPath}.tmp`;
  fs.writeFileSync(tempMarker,JSON.stringify({archivePath,filename,requestedAt:new Date().toISOString(),requestedBy:req.usuario.name},null,2));
  fs.renameSync(tempMarker,markerPath);
  await recordAudit({entityType:'backup',action:'agendado',summary:`Restauração agendada a partir de ${filename}.`,data:{filename,bytes:buffer.length},user:req.usuario});
  res.json({ok:true,reinicioNecessario:true,mensagem:'Backup validado e agendado. Reinicie o sistema para aplicar. A base atual será preservada automaticamente.'});
}));

router.post('/reiniciar', asyncRoute(async (req,res) => {
  const markerPath=path.join(restoreRootDir(),'restauracao-pendente.json');
  if(!fs.existsSync(markerPath)) throw httpError(400,'Não existe uma restauração agendada.');
  res.json({ok:true,mensagem:'O servidor será encerrado com segurança. Abra iniciar-windows.bat novamente em alguns segundos.'});
  setTimeout(()=>req.app.locals.requestShutdown?.(),600);
}));

module.exports = router;

