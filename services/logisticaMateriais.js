const crypto = require('crypto');
const { recordAudit } = require('./audit');
const { httpError } = require('../lib/http');

const id = (v, label) => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 1) throw httpError(400, `Informe ${label} válido.`); return n; };
const qty = (v) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > 1000000 || Math.round(n * 1000) !== n * 1000) throw httpError(400, 'Informe quantidade positiva com até 3 casas decimais.'); return n; };
const clean = (v, label, max = 500) => { const s = String(v || '').trim(); if (s.length < 3 || s.length > max) throw httpError(400, `Informe ${label}.`); return s; };

async function materiais(db) {
  return (await db.query(`SELECT id,nome,unidade,saldo,estoque_minimo,exige_retorno,
    (saldo<=estoque_minimo) AS estoque_baixo FROM logistica_materiais WHERE ativo=TRUE ORDER BY nome`)).rows;
}

async function criarMaterial(tx, data, ator) {
  const nome = clean(data.nome, 'o nome do material', 120), unidade = String(data.unidade || '').trim();
  if (!unidade || unidade.length > 24) throw httpError(400, 'Informe a unidade.');
  const minimo = data.estoqueMinimo == null ? 0 : Number(data.estoqueMinimo), inicial = data.saldoInicial == null ? 0 : Number(data.saldoInicial);
  if (![minimo, inicial].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000000 && Math.round(n * 1000) === n * 1000)) throw httpError(400, 'Confira o saldo inicial e o estoque mínimo.');
  const row = (await tx.query(`INSERT INTO logistica_materiais(nome,unidade,saldo,estoque_minimo,exige_retorno,criado_por)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [nome, unidade, inicial, minimo, !!data.exigeRetorno, ator.id])).rows[0];
  if (inicial) await tx.query(`INSERT INTO logistica_movimentos_materiais(material_id,tipo,quantidade,motivo,client_id,ator_id)
    VALUES($1,'entrada',$2,'Saldo inicial',$3,$4)`, [row.id, inicial, `abertura-${row.id}`, ator.id]);
  await recordAudit({ entityType: 'logistica_material', entityId: row.id, action: 'cadastrado', summary: `Material cadastrado: ${nome}`, data: { unidade, inicial, minimo }, user: ator, client: tx });
  return row;
}

async function entrada(tx, data, ator) {
  const materialId = id(data.materialId, 'material'), quantidade = qty(data.quantidade), motivo = clean(data.motivo || 'Reposição', 'o motivo'), clientId = clean(data.client_id, 'o identificador');
  const prior = (await tx.query('SELECT id,material_id,quantidade,motivo FROM logistica_movimentos_materiais WHERE client_id=$1', [clientId])).rows[0];
  if (prior) {
    if (Number(prior.material_id) !== materialId || Number(prior.quantidade) !== quantidade || prior.motivo !== motivo) throw httpError(409, 'Identificador de entrada já usado com outros dados.');
    return { repetido: true };
  }
  const row = (await tx.query('SELECT id FROM logistica_materiais WHERE id=$1 AND ativo=TRUE FOR UPDATE', [materialId])).rows[0];
  if (!row) throw httpError(404, 'Material não encontrado.');
  await tx.query('UPDATE logistica_materiais SET saldo=saldo+$2 WHERE id=$1', [materialId, quantidade]);
  await tx.query(`INSERT INTO logistica_movimentos_materiais(material_id,tipo,quantidade,motivo,client_id,ator_id)
    VALUES($1,'entrada',$2,$3,$4,$5)`, [materialId, quantidade, motivo, clientId, ator.id]);
  return { repetido: false, materialId, quantidade };
}

async function assertAtribuido(tx, tecnicoId, centroId) {
  const row = (await tx.query(`SELECT 1 FROM user_cost_centers WHERE user_id=$1 AND cost_center_id=$2`, [tecnicoId, centroId])).rows[0];
  if (!row) throw httpError(403, 'O técnico não está atribuído a esta obra ou serviço.');
}

async function solicitar(tx, data, tecnicoId) {
  const centroId = id(data.centroId, 'a obra ou serviço'), materialId = id(data.materialId, 'o material'), quantidade = qty(data.quantidade);
  const clientId = clean(data.client_id, 'o identificador');
  const tecnico = (await tx.query(`SELECT id FROM users WHERE id=$1 AND active=TRUE AND deleted_at IS NULL
    AND COALESCE(suite_role,CASE WHEN role='admin' THEN 'admin' WHEN role='gestor' THEN 'gestor' ELSE 'tecnico' END)='tecnico'`, [tecnicoId])).rows[0];
  if (!tecnico) throw httpError(403, 'Conta técnica não encontrada.');
  await assertAtribuido(tx, tecnicoId, centroId);
  const material = (await tx.query('SELECT id FROM logistica_materiais WHERE id=$1 AND ativo=TRUE', [materialId])).rows[0];
  if (!material) throw httpError(404, 'Material não encontrado.');
  const row = (await tx.query(`INSERT INTO logistica_solicitacoes_materiais(tecnico_id,centro_id,material_id,solicitada,observacao,client_id)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(client_id) DO NOTHING RETURNING *`, [tecnicoId, centroId, materialId, quantidade, String(data.observacao || '').slice(0, 500), clientId])).rows[0];
  if (row) {
    await recordAudit({ entityType: 'logistica_solicitacao_material', entityId: row.id, action: 'solicitada', summary: `Material solicitado pelo técnico ${tecnicoId}`, data: { centroId, materialId, quantidade }, user: { id: tecnicoId, name: 'Técnico' }, client: tx });
    return row;
  }
  const previous = (await tx.query('SELECT * FROM logistica_solicitacoes_materiais WHERE client_id=$1', [clientId])).rows[0];
  if (Number(previous.tecnico_id) !== Number(tecnicoId) || Number(previous.material_id) !== materialId || Number(previous.centro_id) !== centroId || Number(previous.solicitada) !== quantidade) throw httpError(409, 'Identificador da solicitação já usado.');
  return previous;
}

async function pedidos(db, tecnicoId = null) {
  const where = tecnicoId ? 'WHERE r.tecnico_id=$1' : '';
  return (await db.query(`SELECT r.*,m.nome AS material,m.unidade,c.name AS centro,u.name AS tecnico
    FROM logistica_solicitacoes_materiais r JOIN logistica_materiais m ON m.id=r.material_id
    JOIN cost_centers c ON c.id=r.centro_id JOIN users u ON u.id=r.tecnico_id ${where} ORDER BY r.criado_em DESC`, tecnicoId ? [tecnicoId] : [])).rows;
}

async function movimentos(db) {
  return (await db.query(`SELECT l.id,l.tipo,l.quantidade,l.motivo,l.criado_em,m.nome AS material,m.unidade,
    u.name AS tecnico,c.name AS centro FROM logistica_movimentos_materiais l
    JOIN logistica_materiais m ON m.id=l.material_id LEFT JOIN logistica_recibos r ON r.id=l.recibo_id
    LEFT JOIN users u ON u.id=r.tecnico_id LEFT JOIN cost_centers c ON c.id=r.centro_id
    ORDER BY l.criado_em DESC,l.id DESC LIMIT 1000`)).rows;
}

async function devolucoesPendentes(db) {
  return (await db.query(`SELECT r.id AS recibo_id,r.criado_em,rm.material_id,m.nome AS material,m.unidade,
    rm.quantidade,COALESCE(SUM(d.quantidade),0) AS devolvido,
    rm.quantidade-COALESCE(SUM(d.quantidade),0) AS pendente,u.name AS tecnico,c.name AS centro
    FROM logistica_recibo_materiais rm JOIN logistica_materiais m ON m.id=rm.material_id AND m.exige_retorno=TRUE
    JOIN logistica_recibos r ON r.id=rm.recibo_id AND r.tipo='entrega_material' AND r.status='assinado'
    JOIN users u ON u.id=r.tecnico_id LEFT JOIN cost_centers c ON c.id=r.centro_id
    LEFT JOIN logistica_movimentos_materiais d ON d.recibo_id=r.id AND d.material_id=m.id AND d.tipo='devolucao'
    GROUP BY r.id,r.criado_em,rm.material_id,m.nome,m.unidade,rm.quantidade,u.name,c.name
    HAVING rm.quantidade-COALESCE(SUM(d.quantidade),0)>0 ORDER BY r.criado_em,r.id,m.nome`)).rows;
}

async function cancelarPedido(tx, pedidoId, tecnicoId, motivo, ator) {
  const text = clean(motivo, 'o motivo do cancelamento');
  const row = (await tx.query("SELECT id,status,observacao FROM logistica_solicitacoes_materiais WHERE id=$1 AND tecnico_id=$2 FOR UPDATE", [id(pedidoId, 'pedido'), id(tecnicoId, 'técnico')])).rows[0];
  if (!row) throw httpError(404, 'Solicitação não encontrada.');
  if (!['solicitada','parcial'].includes(row.status)) throw httpError(409, 'Esta solicitação não pode mais ser cancelada.');
  await tx.query("UPDATE logistica_solicitacoes_materiais SET status='cancelada',observacao=$2 WHERE id=$1", [row.id, `${row.observacao}\nCancelada: ${text}`.slice(-500)]);
  await recordAudit({ entityType: 'logistica_solicitacao_material', entityId: row.id, action: 'cancelada', summary: `Solicitação de material cancelada: ${row.id}`, data: { motivo: text }, user: ator, client: tx });
  return { id: row.id, status: 'cancelada' };
}

async function entregar(tx, data, ator) {
  const tecnicoId = id(data.tecnicoId, 'o técnico'), centroId = id(data.centroId, 'a obra ou serviço');
  const requestId = data.solicitacaoId == null ? null : id(data.solicitacaoId, 'a solicitação');
  await assertAtribuido(tx, tecnicoId, centroId);
  const lines = Array.isArray(data.itens) ? data.itens.map((line) => ({ materialId: id(line.materialId, 'o material'), quantidade: qty(line.quantidade) })) : [];
  if (!lines.length || lines.length > 100 || new Set(lines.map((l) => l.materialId)).size !== lines.length) throw httpError(400, 'Selecione materiais sem repetição.');
  const clientId = clean(data.client_id, 'o identificador');
  const hash = crypto.createHash('sha256').update(JSON.stringify({ tecnicoId, centroId, requestId, lines })).digest('hex');
  const created = await tx.query(`INSERT INTO logistica_recibos(tecnico_id,centro_id,tipo,criado_por,client_id,request_hash)
    VALUES($1,$2,'entrega_material',$3,$4,$5) ON CONFLICT(client_id) DO NOTHING RETURNING id`, [tecnicoId, centroId, ator.id, clientId, hash]);
  if (!created.rows[0]) {
    const previous = (await tx.query('SELECT id,request_hash FROM logistica_recibos WHERE client_id=$1', [clientId])).rows[0];
    if (previous.request_hash !== hash) throw httpError(409, 'Identificador já usado com outros dados.');
    return { id: previous.id, repetido: true };
  }
  const receiptId = created.rows[0].id;
  let request = null;
  if (requestId) {
    request = (await tx.query("SELECT * FROM logistica_solicitacoes_materiais WHERE id=$1 AND status IN ('solicitada','parcial') FOR UPDATE", [requestId])).rows[0];
    if (!request || Number(request.tecnico_id) !== tecnicoId || Number(request.centro_id) !== centroId || lines.length !== 1 || Number(request.material_id) !== lines[0].materialId) throw httpError(409, 'A solicitação não corresponde à entrega.');
    lines[0].quantidade = Math.min(lines[0].quantidade, Number(request.solicitada) - Number(request.entregue));
  }
  for (const line of lines) {
    const material = (await tx.query('SELECT id,nome,saldo FROM logistica_materiais WHERE id=$1 AND ativo=TRUE FOR UPDATE', [line.materialId])).rows[0];
    if (!material) throw httpError(404, 'Material não encontrado.');
    const delivered = Math.min(line.quantidade, Number(material.saldo));
    if (!delivered) throw httpError(409, `Sem saldo disponível de ${material.nome}.`);
    await tx.query('UPDATE logistica_materiais SET saldo=saldo-$2 WHERE id=$1 AND saldo>=$2', [line.materialId, delivered]);
    await tx.query('INSERT INTO logistica_recibo_materiais(recibo_id,material_id,quantidade) VALUES($1,$2,$3)', [receiptId, line.materialId, delivered]);
    await tx.query(`INSERT INTO logistica_movimentos_materiais(material_id,recibo_id,tipo,quantidade,motivo,client_id,ator_id)
      VALUES($1,$2,'entrega',$3,'Entrega ao técnico',$4,$5)`, [line.materialId, receiptId, delivered, `${clientId}:${line.materialId}`, ator.id]);
    line.entregue = delivered;
  }
  if (request) {
    const delivered = Number(request.entregue) + lines[0].entregue;
    const status = delivered >= Number(request.solicitada) ? 'aguardando_assinatura' : 'parcial';
    await tx.query('UPDATE logistica_solicitacoes_materiais SET entregue=$2,status=$3,recibo_id=$4 WHERE id=$1', [requestId, delivered, status, receiptId]);
  }
  await recordAudit({ entityType: 'logistica_recibo', entityId: receiptId, action: 'material_entregue', summary: `Materiais entregues ao técnico ${tecnicoId}`, data: { tecnicoId, centroId, lines }, user: ator, client: tx });
  return { id: receiptId, repetido: false, status: 'aguardando_assinatura', itens: lines };
}

async function devolver(tx, data, ator) {
  const receiptId = id(data.reciboId, 'o recibo'), materialId = id(data.materialId, 'o material'), quantidade = qty(data.quantidade), clientId = clean(data.client_id, 'o identificador');
  const prior = (await tx.query('SELECT id,recibo_id,material_id,quantidade FROM logistica_movimentos_materiais WHERE client_id=$1', [clientId])).rows[0];
  if (prior) {
    if (Number(prior.recibo_id) !== receiptId || Number(prior.material_id) !== materialId || Number(prior.quantidade) !== quantidade) throw httpError(409, 'Identificador de devolução já usado com outros dados.');
    return { repetido: true };
  }
  const line = (await tx.query(`SELECT l.quantidade,m.exige_retorno,m.id,m.saldo FROM logistica_recibo_materiais l
    JOIN logistica_materiais m ON m.id=l.material_id WHERE l.recibo_id=$1 AND l.material_id=$2 FOR UPDATE OF m`, [receiptId, materialId])).rows[0];
  if (!line || !line.exige_retorno) throw httpError(409, 'Este material não exige devolução de sobra.');
  const { rows } = await tx.query("SELECT COALESCE(SUM(quantidade),0) AS devolvido FROM logistica_movimentos_materiais WHERE recibo_id=$1 AND material_id=$2 AND tipo='devolucao'", [receiptId, materialId]);
  if (quantidade > Number(line.quantidade) - Number(rows[0].devolvido)) throw httpError(409, 'A devolução excede a quantidade ainda não devolvida.');
  await tx.query('UPDATE logistica_materiais SET saldo=saldo+$2 WHERE id=$1', [materialId, quantidade]);
  await tx.query("INSERT INTO logistica_movimentos_materiais(material_id,recibo_id,tipo,quantidade,motivo,client_id,ator_id) VALUES($1,$2,'devolucao',$3,'Sobra devolvida',$4,$5)", [materialId, receiptId, quantidade, clientId, ator.id]);
  await recordAudit({ entityType: 'logistica_material', entityId: materialId, action: 'devolucao', summary: `Sobra devolvida ao estoque: ${quantidade}`, data: { reciboId: receiptId, quantidade }, user: ator, client: tx });
  return { repetido: false, materialId, quantidade };
}

module.exports = { materiais, criarMaterial, entrada, assertAtribuido, solicitar, pedidos, movimentos, devolucoesPendentes, cancelarPedido, entregar, devolver };
