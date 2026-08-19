const express = require('express');
const { getDb } = require('../db');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { asyncRoute, httpError } = require('../lib/http');
const { recordAudit } = require('../services/audit');

const router = express.Router();
router.use(autenticar);

router.get('/', asyncRoute(async (req, res) => {
  const { rows } = await getDb().query(
    'SELECT id, year, month, closed_at, closed_by FROM monthly_closings ORDER BY year DESC, month DESC'
  );
  res.json(rows);
}));

router.post('/', exigirPapel('admin'), asyncRoute(async (req, res) => {
  const year = Number(req.body.ano);
  const month = Number(req.body.mes);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw httpError(400, 'Ano inválido.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw httpError(400, 'Mês inválido.');
  const db = getDb();
  const existing = await db.query('SELECT id FROM monthly_closings WHERE year=$1 AND month=$2', [year, month]);
  if (existing.rows[0]) throw httpError(409, 'Este mês já está fechado.');
  await db.query('INSERT INTO monthly_closings (year, month, closed_by) VALUES ($1,$2,$3)', [year, month, req.usuario.id]);
  await recordAudit({entityType:'fechamento',entityId:`${year}-${month}`,action:'fechado',summary:`Competência ${String(month).padStart(2,'0')}/${year} fechada.`,data:{year,month},user:req.usuario});
  res.status(201).json({ ok: true, mensagem: `Competência ${String(month).padStart(2,'0')}/${year} fechada com sucesso.` });
}));

router.delete('/:id', exigirPapel('admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'ID inválido.');
  const db = getDb();
  const { rows } = await db.query('SELECT * FROM monthly_closings WHERE id=$1', [id]);
  if (!rows[0]) throw httpError(404, 'Fechamento não encontrado.');
  await db.query('DELETE FROM monthly_closings WHERE id=$1', [id]);
  await recordAudit({entityType:'fechamento',entityId:`${rows[0].year}-${rows[0].month}`,action:'reaberto',summary:`Competência ${String(rows[0].month).padStart(2,'0')}/${rows[0].year} reaberta.`,data:rows[0],user:req.usuario});
  res.json({ ok: true, mensagem: 'Competência reaberta.' });
}));

module.exports = router;
