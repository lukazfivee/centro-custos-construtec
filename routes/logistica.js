const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao, suiteRoleOf, can } = require('../services/permissions');
const { asyncRoute, httpError, positiveId } = require('../lib/http');
const service = require('../services/logistica');

const router = express.Router();
router.use(autenticar);
const manager = exigirPermissao('p5');

router.get('/meu-kit', asyncRoute(async (req, res) => {
  if (suiteRoleOf(req.usuario) !== 'tecnico') throw httpError(403, 'Esta consulta está disponível somente para o técnico.');
  res.json(await service.meuKit(getDb(), req.usuario.id));
}));

router.get('/resumo', manager, asyncRoute(async (_req, res) => res.json(await service.resumo(getDb()))));
router.get('/tecnicos', manager, asyncRoute(async (_req, res) => res.json(await service.tecnicos(getDb()))));
router.get('/kits/padrao', manager, asyncRoute(async (_req, res) => res.json(await service.kitPadrao(getDb()))));
router.put('/kits/padrao', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.atualizarKitPadrao(tx, req.body || {}, req.usuario)));
}));

router.get('/ferramentas', manager, asyncRoute(async (_req, res) => {
  const { rows } = await getDb().query(`SELECT f.id,f.nome,f.codigo,f.situacao,f.localizacao,f.tecnico_id,f.created_at,u.name AS tecnico
    FROM logistica_ferramentas f LEFT JOIN users u ON u.id=f.tecnico_id ORDER BY f.nome,f.codigo`);
  res.json(rows);
}));

router.post('/ferramentas', manager, asyncRoute(async (req, res) => {
  try {
    const item = await getDb().transaction((tx) => service.criarFerramenta(tx, req.body || {}, req.usuario));
    res.status(201).json(item);
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'Esse código de patrimônio já está cadastrado.');
    throw error;
  }
}));

router.post('/entregas', manager, asyncRoute(async (req, res) => {
  const receipt = await getDb().transaction((tx) => service.entregarFerramentas(tx, req.body || {}, req.usuario));
  res.status(201).json(receipt);
}));

router.post('/conferencias-iniciais', manager, asyncRoute(async (req, res) => {
  const receipt = await getDb().transaction((tx) => service.entregarFerramentas(tx, { ...req.body, tipo: 'conferencia_inicial' }, req.usuario));
  res.status(201).json(receipt);
}));

router.put('/entregas/:id/assinatura', asyncRoute(async (req, res) => {
  if (suiteRoleOf(req.usuario) !== 'tecnico') throw httpError(403, 'Somente o técnico destinatário pode assinar este recibo.');
  try {
    const receipt = await getDb().transaction((tx) => service.assinarRecibo(tx, {
      reciboId: req.params.id, tecnicoId: req.usuario.id, ator: req.usuario,
      dataHora: req.body?.dataHora, assinatura: req.body?.assinatura, clientId: req.body?.client_id,
    }));
    res.json(receipt);
  } catch (error) {
    if (error.code === '23505') throw httpError(409, 'Esse identificador de assinatura já foi usado.');
    throw error;
  }
}));

router.post('/entregas/:id/divergencia', asyncRoute(async (req, res) => {
  if (suiteRoleOf(req.usuario) !== 'tecnico') throw httpError(403, 'Somente o técnico destinatário pode informar divergência.');
  res.json(await getDb().transaction((tx) => service.relatarDivergencia(tx, {
    reciboId: req.params.id, tecnicoId: req.usuario.id, relato: req.body?.relato,
  })));
}));

router.post('/entregas/:id/revisao', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.revisarDivergencia(tx, {
    reciboId: req.params.id, ator: req.usuario, revisao: req.body?.revisao,
  })));
}));

router.post('/faltas', asyncRoute(async (req, res) => {
  if (suiteRoleOf(req.usuario) !== 'tecnico') throw httpError(403, 'Somente o técnico responsável pode relatar falta.');
  res.status(201).json(await getDb().transaction((tx) => service.relatarFalta(tx, {
    ferramentaId: req.body?.ferramentaId, tecnicoId: req.usuario.id, relato: req.body?.relato, ator: req.usuario,
  })));
}));

router.get('/faltas', manager, asyncRoute(async (_req, res) => {
  const { rows } = await getDb().query(`SELECT m.id,m.ferramenta_id,m.tecnico_id,m.relato,m.apuracao,m.estado,m.criada_em,
    f.nome AS ferramenta,f.codigo,u.name AS tecnico FROM logistica_faltas m
    JOIN logistica_ferramentas f ON f.id=m.ferramenta_id JOIN users u ON u.id=m.tecnico_id
    WHERE m.estado='aberta' ORDER BY m.criada_em DESC`);
  res.json(rows);
}));
router.get('/recibos-pendentes', manager, asyncRoute(async (_req, res) => {
  const { rows } = await getDb().query(`SELECT r.id,r.tipo,r.status,r.criado_em,r.divergencia,u.name AS tecnico,c.name AS centro
    FROM logistica_recibos r JOIN users u ON u.id=r.tecnico_id LEFT JOIN cost_centers c ON c.id=r.centro_id
    WHERE r.status IN ('aguardando_assinatura','divergencia') ORDER BY (r.status='divergencia') DESC,r.criado_em DESC`);
  res.json(rows);
}));
router.post('/faltas/:id/apuracao', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.apurarFalta(tx, { faltaId: req.params.id, apuracao: req.body?.apuracao, ator: req.usuario })));
}));
router.post('/ferramentas/:id/devolucao', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.devolverFerramenta(tx, { ferramentaId: req.params.id,
    condicao: req.body?.condicao, observacao: req.body?.observacao, ator: req.usuario })));
}));
router.post('/ferramentas/:id/avaliacao', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.avaliarFerramenta(tx, { ferramentaId: req.params.id,
    resultado: req.body?.resultado, motivo: req.body?.motivo, ator: req.usuario })));
}));
router.get('/ferramentas/:id/historico', manager, asyncRoute(async (req, res) => {
  res.json(await service.historicoFerramenta(getDb(), req.params.id));
}));

router.get('/movimentacoes', manager, asyncRoute(async (_req, res) => {
  const { rows } = await getDb().query(`SELECT e.id,e.tipo,e.detalhe,e.criado_em,f.nome AS ferramenta,f.codigo,u.name AS tecnico
    FROM logistica_eventos e LEFT JOIN logistica_ferramentas f ON f.id=e.ferramenta_id
    LEFT JOIN users u ON u.id=e.tecnico_id ORDER BY e.criado_em DESC,e.id DESC LIMIT 1000`);
  res.json(rows);
}));

router.get('/entregas/:id', asyncRoute(async (req, res) => {
  if (suiteRoleOf(req.usuario) === 'tecnico') {
    const row = (await getDb().query('SELECT tecnico_id FROM logistica_recibos WHERE id=$1', [positiveId(req.params.id, 'recibo')])).rows[0];
    if (!row || Number(row.tecnico_id) !== Number(req.usuario.id)) throw httpError(404, 'Ficha não encontrada.');
  } else if (!(await can(req.usuario, 'p5'))) throw httpError(403, 'Você não tem permissão para esta ficha.');
  const receipt = await service.reciboCompleto(getDb(), positiveId(req.params.id, 'recibo'));
  res.json(receipt);
}));

module.exports = router;
