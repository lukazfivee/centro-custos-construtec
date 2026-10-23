const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao, suiteRoleOf } = require('../services/permissions');
const { asyncRoute, httpError } = require('../lib/http');
const service = require('../services/logisticaMateriais');

const router = express.Router();
router.use(autenticar);
const manager = exigirPermissao('p5');
const techOnly = (req) => { if (suiteRoleOf(req.usuario) !== 'tecnico') throw httpError(403, 'Ação disponível somente para técnicos.'); };

router.get('/materiais', manager, asyncRoute(async (_req, res) => res.json(await service.materiais(getDb()))));
router.get('/materiais/movimentacoes', manager, asyncRoute(async (_req, res) => res.json(await service.movimentos(getDb()))));
router.get('/materiais/devolucoes-pendentes', manager, asyncRoute(async (_req, res) => res.json(await service.devolucoesPendentes(getDb()))));
router.post('/materiais', manager, asyncRoute(async (req, res) => {
  try { res.status(201).json(await getDb().transaction((tx) => service.criarMaterial(tx, req.body || {}, req.usuario))); }
  catch (error) { if (error.code === '23505') throw httpError(409, 'Esse material já está cadastrado.'); throw error; }
}));
router.post('/materiais/entradas', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.entrada(tx, req.body || {}, req.usuario)));
}));
router.post('/materiais/entregas', manager, asyncRoute(async (req, res) => {
  res.status(201).json(await getDb().transaction((tx) => service.entregar(tx, req.body || {}, req.usuario)));
}));
router.post('/materiais/devolucoes', manager, asyncRoute(async (req, res) => {
  res.json(await getDb().transaction((tx) => service.devolver(tx, req.body || {}, req.usuario)));
}));
router.get('/materiais/solicitacoes', manager, asyncRoute(async (_req, res) => res.json(await service.pedidos(getDb()))));
router.get('/materiais/opcoes-entrega', manager, asyncRoute(async (_req, res) => {
  const db = getDb();
  const [centros, tecnicos] = await Promise.all([
    db.query('SELECT id,name,kind FROM cost_centers WHERE active=TRUE ORDER BY name'),
    db.query(`SELECT id,name AS nome FROM users WHERE active=TRUE AND deleted_at IS NULL
      AND COALESCE(suite_role,CASE WHEN role='admin' THEN 'admin' WHEN role='gestor' THEN 'gestor' ELSE 'tecnico' END)='tecnico' ORDER BY name`),
  ]);
  res.json({ centros: centros.rows, tecnicos: tecnicos.rows });
}));
router.post('/materiais/solicitacoes', asyncRoute(async (req, res) => {
  techOnly(req);
  res.status(201).json(await getDb().transaction((tx) => service.solicitar(tx, req.body || {}, req.usuario.id)));
}));
router.get('/materiais/minhas-solicitacoes', asyncRoute(async (req, res) => {
  techOnly(req);
  res.json(await service.pedidos(getDb(), req.usuario.id));
}));
router.post('/materiais/solicitacoes/:id/cancelar', asyncRoute(async (req, res) => {
  techOnly(req);
  res.json(await getDb().transaction((tx) => service.cancelarPedido(tx, req.params.id, req.usuario.id, req.body?.motivo, req.usuario)));
}));
router.get('/materiais/opcoes-tecnico', asyncRoute(async (req, res) => {
  techOnly(req);
  const db = getDb();
  const [centros, materiais] = await Promise.all([
    db.query(`SELECT c.id,c.name,c.kind FROM user_cost_centers uc JOIN cost_centers c ON c.id=uc.cost_center_id
      WHERE uc.user_id=$1 AND c.active=TRUE ORDER BY c.name`, [req.usuario.id]),
    service.materiais(db),
  ]);
  res.json({ centros: centros.rows, materiais });
}));

module.exports = router;
