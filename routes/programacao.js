const express = require('express');
const { getDb } = require('../db');
const { autenticar } = require('../middleware/auth');
const { exigirPermissao } = require('../services/permissions');
const { asyncRoute } = require('../lib/http');
const { todayIso } = require('../lib/dates');
const v = require('../services/programacao/validation');
const core = require('../services/programacao/core');
const manage = require('../services/programacao/manage');
const progress = require('../services/programacao/progress');
const cloud = require('../services/programacao/cloud');

const router = express.Router();
router.use(autenticar);
router.post('/abrir-nuvem', asyncRoute(async (req, res) => {
  res.json(await cloud.open(req.usuario));
}));
router.use(asyncRoute(async (req, _res, next) => {
  await core.actor(req.usuario);
  cloud.requireCanonical(req.usuario);
  next();
}));
router.get('/', asyncRoute(async (req, res) => {
  res.json(await core.list(getDb(), v.day(req.query.dia ?? todayIso('America/Sao_Paulo')), req.usuario));
}));
router.get('/opcoes', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  res.json(await core.options(getDb(), v.day(req.query.dia ?? todayIso('America/Sao_Paulo'))));
}));
router.get('/:id', asyncRoute(async (req, res) => {
  await core.actor(req.usuario);
  res.json(await core.detail(getDb(), v.positiveId(req.params.id), req.usuario));
}));
router.post('/', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  res.status(201).json(await manage.create(getDb(), req.body || {}, req.usuario));
}));
router.put('/:id', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  res.json(await manage.edit(getDb(), v.positiveId(req.params.id), req.body || {}, req.usuario));
}));
router.post('/:id/cancelar', exigirPermissao('p5'), asyncRoute(async (req, res) => {
  res.json(await manage.cancel(getDb(), v.positiveId(req.params.id), req.body || {}, req.usuario));
}));
router.post('/:id/atualizacoes', asyncRoute(async (req, res) => {
  res.json(await progress.update(getDb(), v.positiveId(req.params.id), req.body || {}, req.usuario));
}));
module.exports = router;
