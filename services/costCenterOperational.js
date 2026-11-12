const { getDb } = require('../db');
const { obrasPermitidas, assertObra } = require('./obraScope');
const { parsePagination, wantsPagination, paginationMeta } = require('../lib/pagination');
const { httpError } = require('../lib/http');

const SELECT = `SELECT cc.id,cc.code AS codigo,cc.name AS nome,cc.responsible AS responsavel,
  cc.client AS cliente,cc.start_date::text AS data_inicio,cc.end_date::text AS data_fim,
  cc.project_status AS situacao,cc.active AS ativo,cc.description AS descricao,cc.revision,cc.kind AS tipo
  FROM cost_centers cc`;

async function operationalCenters(req, res, { id, kind } = {}) {
  const db = getDb();
  if (id) {
    await assertObra(req, id);
    const { rows } = await db.query(`${SELECT} WHERE cc.id=$1`, [id]);
    if (!rows[0]) throw httpError(404, 'Centro de custo não encontrado.');
    return res.json({ centro: rows[0] });
  }
  const values = [await obrasPermitidas(req)];
  let where = 'WHERE cc.id = ANY($1::int[])';
  if (kind) { values.push(kind); where += ' AND cc.kind=$2'; }
  const page = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const paginated = wantsPagination(req.query);
  const limit = paginated ? page.limit : 500;
  const offset = paginated ? page.offset : 0;
  const { rows } = await db.query(`${SELECT} ${where} ORDER BY cc.active DESC,cc.name LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]);
  if (!paginated) { res.setHeader('X-Result-Limit', '500'); return res.json(rows); }
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM cost_centers cc ${where}`, values);
  const total = Number(count.rows[0].total);
  res.setHeader('X-Total-Count', String(total));
  return res.json({ itens: rows, paginacao: paginationMeta(total, page.page, page.limit) });
}

module.exports = { operationalCenters };
