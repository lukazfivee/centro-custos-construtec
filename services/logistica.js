const crypto = require('crypto');
const { recordAudit } = require('./audit');
const { httpError } = require('../lib/http');
const { decodeSignature } = require('./servicos/files');

const positiveId = (value, label = 'item') => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, `Informe um ${label} válido.`);
  return id;
};

function readTool(data) {
  const nome = String(data?.nome || '').trim();
  const codigo = String(data?.codigo || '').trim();
  if (!nome || nome.length > 120 || !codigo || codigo.length > 80) throw httpError(400, 'Informe o nome e o código da ferramenta.');
  return { nome, codigo };
}

function readToolIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw httpError(400, 'Selecione pelo menos uma ferramenta.');
  const ids = value.map((id) => positiveId(id, 'ferramenta'));
  if (new Set(ids).size !== ids.length) throw httpError(400, 'A entrega contém ferramenta repetida.');
  return ids.sort((a, b) => a - b);
}

async function criarFerramenta(tx, data, ator) {
  const fields = readTool(data);
  const row = (await tx.query(`INSERT INTO logistica_ferramentas(nome,codigo,created_by)
    VALUES($1,$2,$3) RETURNING id,nome,codigo,situacao,localizacao,tecnico_id`, [fields.nome, fields.codigo, ator?.id || null])).rows[0];
  await tx.query(`INSERT INTO logistica_eventos(ferramenta_id,tipo,detalhe,ator_id)
    VALUES($1,'entrada_base',$2::jsonb,$3)`, [row.id, JSON.stringify(fields), ator?.id || null]);
  await recordAudit({ entityType: 'logistica_ferramenta', entityId: row.id, action: 'cadastrada', summary: `Ferramenta cadastrada: ${fields.nome} (${fields.codigo})`, data: fields, user: ator, client: tx });
  return row;
}

async function criarRecibo(tx, { tecnicoId, centroId = null, tipo = 'entrega_ferramenta', criadoPor, clientId, requestHash }) {
  const id = positiveId(tecnicoId, 'técnico');
  const tecnico = (await tx.query(`SELECT id FROM users WHERE id=$1 AND active=TRUE AND deleted_at IS NULL
    AND COALESCE(suite_role,CASE WHEN role='admin' THEN 'admin' WHEN role='gestor' THEN 'gestor' ELSE 'tecnico' END)='tecnico'`, [id])).rows[0];
  if (!tecnico) throw httpError(404, 'Técnico ativo não encontrado.');
  const client = String(clientId || '').trim();
  if (!client || client.length > 100) throw httpError(400, 'Informe um identificador válido para a entrega.');
  const created = await tx.query(`INSERT INTO logistica_recibos(tecnico_id,centro_id,tipo,criado_por,client_id,request_hash)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(client_id) DO NOTHING RETURNING id,tecnico_id,tipo,status,client_id,criado_em`,
  [id, centroId == null ? null : positiveId(centroId, 'centro de custo'), tipo, positiveId(criadoPor, 'usuário'), client, requestHash]);
  if (created.rows[0]) return { ...created.rows[0], repetido: false };
  const previous = (await tx.query('SELECT id,tecnico_id,tipo,status,client_id,criado_em,request_hash FROM logistica_recibos WHERE client_id=$1', [client])).rows[0];
  if (!previous || previous.request_hash !== requestHash) throw httpError(409, 'Esse identificador de entrega já foi usado com outros dados.');
  return { ...previous, repetido: true };
}

async function entregarFerramentas(tx, data, ator) {
  const tecnicoId = positiveId(data?.tecnicoId, 'técnico');
  const ferramentaIds = readToolIds(data?.ferramentaIds);
  const tipo = data.tipo === 'conferencia_inicial' ? 'conferencia_inicial' : 'entrega_ferramenta';
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ tecnicoId, ferramentaIds, centroId: data.centroId || null, tipo })).digest('hex');
  const recibo = await criarRecibo(tx, { tecnicoId, centroId: data.centroId, tipo, criadoPor: ator?.id, clientId: data.client_id, requestHash });
  if (recibo.repetido) return reciboCompleto(tx, recibo.id);

  const tools = (await tx.query(`SELECT id,nome,codigo,situacao,tecnico_id FROM logistica_ferramentas
    WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE`, [ferramentaIds])).rows;
  if (tools.length !== ferramentaIds.length) throw httpError(404, 'Uma ou mais ferramentas não existem.');
  if (tools.some((tool) => tool.situacao !== 'disponivel')) throw httpError(409, 'Uma ou mais ferramentas não estão disponíveis.');
  await tx.query(`UPDATE logistica_ferramentas SET situacao='com_tecnico',localizacao='tecnico',tecnico_id=$1,updated_at=NOW()
    WHERE id=ANY($2::int[])`, [tecnicoId, ferramentaIds]);
  for (const tool of tools) {
    await tx.query('INSERT INTO logistica_recibo_ferramentas(recibo_id,ferramenta_id) VALUES($1,$2)', [recibo.id, tool.id]);
    await tx.query(`INSERT INTO logistica_eventos(ferramenta_id,recibo_id,tecnico_id,tipo,detalhe,ator_id)
      VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [tool.id, recibo.id, tecnicoId, tipo, JSON.stringify({ codigo: tool.codigo }), ator.id]);
  }
  const groups = [...new Set(tools.map((tool) => tool.nome.toLowerCase()))];
  for (const name of groups) {
    const replacementIds = tools.filter((tool) => tool.nome.toLowerCase() === name).map((tool) => tool.id);
    const missing = await tx.query(`SELECT m.id,m.ferramenta_id FROM logistica_faltas m
      JOIN logistica_ferramentas old ON old.id=m.ferramenta_id
      WHERE m.tecnico_id=$1 AND m.estado='aberta' AND LOWER(old.nome)=LOWER($2)
      ORDER BY m.id LIMIT $3 FOR UPDATE OF m`, [tecnicoId, name, replacementIds.length]);
    for (const item of missing.rows) {
      await tx.query("UPDATE logistica_faltas SET estado='reposta',encerrada_em=NOW() WHERE id=$1", [item.id]);
      await tx.query("UPDATE logistica_ferramentas SET situacao='baixada',localizacao='extraviada',tecnico_id=NULL,updated_at=NOW() WHERE id=$1", [item.ferramenta_id]);
      await tx.query("INSERT INTO logistica_eventos(ferramenta_id,recibo_id,tecnico_id,tipo,detalhe,ator_id) VALUES($1,$2,$3,'falta_reposta',$4::jsonb,$5)", [item.ferramenta_id, recibo.id, tecnicoId, JSON.stringify({ faltaId: item.id, repostaPor: replacementIds }), ator.id]);
    }
  }
  await recordAudit({ entityType: 'logistica_recibo', entityId: recibo.id, action: 'entrega_iniciada', summary: `Entrega de ${tools.length} ferramenta(s) para técnico ${tecnicoId}`, data: { tecnicoId, ferramentaIds }, user: ator, client: tx });
  return reciboCompleto(tx, recibo.id);
}

async function reciboCompleto(tx, id) {
  const receipt = (await tx.query(`SELECT r.id,r.tecnico_id,r.centro_id,r.tipo,r.status,r.client_id,r.criado_em,r.assinado_em,
    u.name AS tecnico,c.name AS centro,issuer.name AS emissor FROM logistica_recibos r
    JOIN users u ON u.id=r.tecnico_id LEFT JOIN cost_centers c ON c.id=r.centro_id
    LEFT JOIN users issuer ON issuer.id=r.criado_por WHERE r.id=$1`, [id])).rows[0];
  if (!receipt) throw httpError(404, 'Recibo não encontrado.');
  receipt.ferramentas = (await tx.query(`SELECT f.id,f.nome,f.codigo FROM logistica_recibo_ferramentas rf
    JOIN logistica_ferramentas f ON f.id=rf.ferramenta_id WHERE rf.recibo_id=$1 ORDER BY f.nome,f.codigo`, [id])).rows;
  receipt.materiais = (await tx.query(`SELECT m.id,m.nome,m.unidade,l.quantidade FROM logistica_recibo_materiais l
    JOIN logistica_materiais m ON m.id=l.material_id WHERE l.recibo_id=$1 ORDER BY m.nome`, [id])).rows;
  return receipt;
}

async function meuKit(db, tecnicoId) {
  const id = positiveId(tecnicoId, 'técnico');
  const ferramentas = (await db.query(`SELECT id,nome,codigo,situacao,localizacao FROM logistica_ferramentas
    WHERE tecnico_id=$1 ORDER BY nome,codigo`, [id])).rows;
  const recibos = (await db.query(`SELECT r.id,r.tipo,r.status,r.client_id,r.criado_em,r.divergencia,
    (SELECT COALESCE(json_agg(json_build_object('nome',f.nome,'codigo',f.codigo)), '[]'::json)
      FROM logistica_recibo_ferramentas rf JOIN logistica_ferramentas f ON f.id=rf.ferramenta_id WHERE rf.recibo_id=r.id) AS ferramentas,
    (SELECT COALESCE(json_agg(json_build_object('nome',m.nome,'unidade',m.unidade,'quantidade',rm.quantidade)), '[]'::json)
      FROM logistica_recibo_materiais rm JOIN logistica_materiais m ON m.id=rm.material_id WHERE rm.recibo_id=r.id) AS materiais
    FROM logistica_recibos r
    WHERE r.tecnico_id=$1 AND r.status IN ('aguardando_assinatura','divergencia') ORDER BY r.criado_em DESC`, [id])).rows;
  const { itens: padrao } = await kitPadrao(db);
  const faltas = ferramentas.filter((item) => item.situacao === 'em_falta');
  const kitPadraoAtual = padrao.map((item) => {
    const emPosse = ferramentas.filter((f) => f.situacao === 'com_tecnico' && f.nome.toLowerCase() === item.nome.toLowerCase()).length;
    return { ...item, emPosse, falta: Math.max(0, item.quantidade - emPosse) };
  });
  const esperados = new Set(padrao.map((item) => item.nome.toLowerCase()));
  const extras = ferramentas.filter((item) => !esperados.has(item.nome.toLowerCase()));
  return { ferramentas, kitPadrao: kitPadraoAtual, extras, faltas, incompleto: kitPadraoAtual.some((item) => item.falta > 0), recibos };
}

async function relatarFalta(tx, { ferramentaId, tecnicoId, relato, ator }) {
  const toolId = positiveId(ferramentaId, 'ferramenta'), userId = positiveId(tecnicoId, 'técnico');
  const text = String(relato || '').trim();
  if (text.length < 5 || text.length > 2000) throw httpError(400, 'Descreva a falta em pelo menos 5 caracteres.');
  const tool = (await tx.query("SELECT id,nome,codigo FROM logistica_ferramentas WHERE id=$1 AND tecnico_id=$2 AND situacao='com_tecnico' FOR UPDATE", [toolId, userId])).rows[0];
  if (!tool) throw httpError(404, 'Ferramenta atribuída não encontrada.');
  const incident = (await tx.query(`INSERT INTO logistica_faltas(ferramenta_id,tecnico_id,relato)
    VALUES($1,$2,$3) RETURNING id`, [toolId, userId, text])).rows[0];
  await tx.query("UPDATE logistica_ferramentas SET situacao='em_falta',updated_at=NOW() WHERE id=$1", [toolId]);
  await tx.query("INSERT INTO logistica_eventos(ferramenta_id,tecnico_id,tipo,detalhe,ator_id) VALUES($1,$2,'falta_reportada',$3::jsonb,$2)", [toolId, userId, JSON.stringify({ faltaId: incident.id, relato: text })]);
  await recordAudit({ entityType: 'logistica_ferramenta', entityId: toolId, action: 'falta_reportada', summary: `Falta de ${tool.nome} relatada pelo técnico ${userId}`, data: { faltaId: incident.id, relato: text }, user: ator || { id: userId, name: 'Técnico' }, client: tx });
  return { id: incident.id, ferramentaId: toolId, codigo: tool.codigo, situacao: 'em_falta' };
}

async function devolverFerramenta(tx, { ferramentaId, condicao, observacao, ator }) {
  const id = positiveId(ferramentaId, 'ferramenta');
  if (!['boa', 'avariada'].includes(condicao)) throw httpError(400, 'Informe se a ferramenta voltou em boas condições ou avariada.');
  const text = String(observacao || '').trim();
  if (condicao === 'avariada' && text.length < 5) throw httpError(400, 'Descreva a avaria em pelo menos 5 caracteres.');
  const tool = (await tx.query("SELECT id,nome,codigo,tecnico_id FROM logistica_ferramentas WHERE id=$1 AND situacao='com_tecnico' FOR UPDATE", [id])).rows[0];
  if (!tool) throw httpError(409, 'A ferramenta não está com um técnico para devolução.');
  const next = condicao === 'avariada' ? 'em_avaliacao' : 'disponivel';
  const local = condicao === 'avariada' ? 'escritorio_base' : 'base';
  await tx.query('UPDATE logistica_ferramentas SET situacao=$2,localizacao=$3,tecnico_id=NULL,updated_at=NOW() WHERE id=$1', [id, next, local]);
  await tx.query('INSERT INTO logistica_eventos(ferramenta_id,tecnico_id,tipo,detalhe,ator_id) VALUES($1,$2,$3,$4::jsonb,$5)',
    [id, tool.tecnico_id, condicao === 'avariada' ? 'devolucao_avariada' : 'devolucao', JSON.stringify({ condicao, observacao: text, localizacao: local }), ator.id]);
  await recordAudit({ entityType: 'logistica_ferramenta', entityId: id, action: 'devolvida', summary: `${tool.nome} (${tool.codigo}) devolvida ${condicao === 'avariada' ? 'com avaria' : 'em boas condições'}`, data: { condicao, observacao: text }, user: ator, client: tx });
  return { id, situacao: next, localizacao: local };
}

async function avaliarFerramenta(tx, { ferramentaId, resultado, motivo, ator }) {
  const id = positiveId(ferramentaId, 'ferramenta'), text = String(motivo || '').trim();
  if (!['reparada', 'baixada'].includes(resultado) || text.length < 5) throw httpError(400, 'Informe o resultado e o motivo da avaliação.');
  const tool = (await tx.query("SELECT id,nome,codigo FROM logistica_ferramentas WHERE id=$1 AND situacao='em_avaliacao' FOR UPDATE", [id])).rows[0];
  if (!tool) throw httpError(409, 'A ferramenta não está em avaliação.');
  const situacao = resultado === 'reparada' ? 'disponivel' : 'baixada';
  const local = resultado === 'reparada' ? 'base' : 'baixada';
  await tx.query('UPDATE logistica_ferramentas SET situacao=$2,localizacao=$3,updated_at=NOW() WHERE id=$1', [id, situacao, local]);
  await tx.query('INSERT INTO logistica_eventos(ferramenta_id,tipo,detalhe,ator_id) VALUES($1,$2,$3::jsonb,$4)', [id, resultado, JSON.stringify({ motivo: text }), ator.id]);
  await recordAudit({ entityType: 'logistica_ferramenta', entityId: id, action: resultado, summary: `${tool.nome} (${tool.codigo}): ${resultado}`, data: { motivo: text }, user: ator, client: tx });
  return { id, situacao, localizacao: local };
}

async function apurarFalta(tx, { faltaId, apuracao, ator }) {
  const id = positiveId(faltaId, 'ocorrência'), text = String(apuracao || '').trim();
  if (text.length < 5 || text.length > 2000) throw httpError(400, 'Registre o resultado da apuração.');
  const row = (await tx.query("SELECT id,ferramenta_id,tecnico_id FROM logistica_faltas WHERE id=$1 AND estado='aberta' FOR UPDATE", [id])).rows[0];
  if (!row) throw httpError(404, 'Falta pendente não encontrada.');
  await tx.query('UPDATE logistica_faltas SET apuracao=$2 WHERE id=$1', [id, text]);
  await tx.query("INSERT INTO logistica_eventos(ferramenta_id,tecnico_id,tipo,detalhe,ator_id) VALUES($1,$2,'falta_apurada',$3::jsonb,$4)", [row.ferramenta_id, row.tecnico_id, JSON.stringify({ faltaId: id, apuracao: text }), ator.id]);
  await recordAudit({ entityType: 'logistica_ferramenta', entityId: row.ferramenta_id, action: 'falta_apurada', summary: `Apuração da falta ${id}`, data: { apuracao: text }, user: ator, client: tx });
  return { id, apuracao: text, estado: 'aberta' };
}

async function historicoFerramenta(db, ferramentaId) {
  const id = positiveId(ferramentaId, 'ferramenta');
  const { rows } = await db.query(`SELECT e.id,e.tipo,e.detalhe,e.criado_em,e.tecnico_id,u.name AS ator
    FROM logistica_eventos e LEFT JOIN users u ON u.id=e.ator_id WHERE e.ferramenta_id=$1 ORDER BY e.criado_em,e.id`, [id]);
  return rows;
}

async function assinarRecibo(tx, { reciboId, tecnicoId, ator, dataHora, assinatura, clientId }) {
  const id = positiveId(reciboId, 'recibo'), userId = positiveId(tecnicoId, 'técnico');
  const client = String(clientId || '').trim();
  if (!client || client.length > 100) throw httpError(400, 'Informe o identificador da assinatura.');
  const when = new Date(dataHora);
  if (!dataHora || Number.isNaN(when.getTime())) throw httpError(400, 'Data e hora da assinatura inválidas.');
  const signature = decodeSignature(assinatura || {});
  const base64 = signature.content.toString('base64');
  const receipt = (await tx.query(`SELECT id,tecnico_id,status,assinatura_base64,assinatura_client_id,assinado_em
    FROM logistica_recibos WHERE id=$1 FOR UPDATE`, [id])).rows[0];
  if (!receipt) throw httpError(404, 'Recibo não encontrado.');
  if (Number(receipt.tecnico_id) !== userId) throw httpError(403, 'Este recibo pertence a outro técnico.');
  if (receipt.status === 'assinado') {
    if (receipt.assinatura_client_id === client && receipt.assinatura_base64 === base64 && new Date(receipt.assinado_em).getTime() === when.getTime()) return reciboCompleto(tx, id);
    throw httpError(409, 'Este recibo já foi assinado.');
  }
  if (receipt.status !== 'aguardando_assinatura') throw httpError(409, 'A Logística precisa revisar a divergência antes da assinatura.');
  await tx.query(`UPDATE logistica_recibos SET status='assinado',assinado_em=$2,assinatura_base64=$3,
    assinado_por=$4,assinatura_client_id=$5 WHERE id=$1`, [id, when.toISOString(), base64, userId, client]);
  await tx.query(`INSERT INTO logistica_eventos(recibo_id,tecnico_id,tipo,detalhe,ator_id)
    VALUES($1,$2,'assinado',$3::jsonb,$2)`, [id, userId, JSON.stringify({ dataHora: when.toISOString(), sha256: signature.sha256 })]);
  await tx.query("UPDATE logistica_solicitacoes_materiais SET status='concluida' WHERE recibo_id=$1 AND status='aguardando_assinatura'", [id]);
  await recordAudit({ entityType: 'logistica_recibo', entityId: id, action: 'assinado', summary: `Recebimento de ferramentas assinado pelo técnico ${userId}`, data: { tecnicoId: userId, dataHora: when.toISOString(), sha256: signature.sha256 }, user: ator || { id: userId, name: 'Técnico' }, client: tx });
  return reciboCompleto(tx, id);
}

async function relatarDivergencia(tx, { reciboId, tecnicoId, relato }) {
  const id = positiveId(reciboId, 'recibo'), userId = positiveId(tecnicoId, 'técnico');
  const text = String(relato || '').trim();
  if (text.length < 5 || text.length > 2000) throw httpError(400, 'Descreva a divergência em pelo menos 5 caracteres.');
  const receipt = (await tx.query('SELECT id,tecnico_id,status FROM logistica_recibos WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!receipt) throw httpError(404, 'Recibo não encontrado.');
  if (Number(receipt.tecnico_id) !== userId) throw httpError(403, 'Este recibo pertence a outro técnico.');
  if (receipt.status !== 'aguardando_assinatura') throw httpError(409, 'Este recibo não aguarda assinatura.');
  await tx.query("UPDATE logistica_recibos SET status='divergencia',divergencia=$2 WHERE id=$1", [id, text]);
  await tx.query("INSERT INTO logistica_eventos(recibo_id,tecnico_id,tipo,detalhe,ator_id) VALUES($1,$2,'divergencia',$3::jsonb,$2)", [id, userId, JSON.stringify({ relato: text })]);
  await recordAudit({ entityType: 'logistica_recibo', entityId: id, action: 'divergencia_reportada', summary: `Divergência relatada pelo técnico ${userId}`, data: { relato: text }, user: { id: userId, name: 'Técnico' }, client: tx });
  return reciboCompleto(tx, id);
}

async function revisarDivergencia(tx, { reciboId, ator, revisao }) {
  const id = positiveId(reciboId, 'recibo');
  const text = String(revisao || '').trim();
  if (text.length < 5 || text.length > 2000) throw httpError(400, 'Registre o que foi conferido pela Logística.');
  const receipt = (await tx.query('SELECT id,status,tecnico_id FROM logistica_recibos WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!receipt) throw httpError(404, 'Recibo não encontrado.');
  if (receipt.status !== 'divergencia') throw httpError(409, 'Este recibo não tem divergência pendente.');
  await tx.query("UPDATE logistica_recibos SET status='aguardando_assinatura',divergencia=NULL,revisada_por=$2,revisada_em=NOW() WHERE id=$1", [id, ator.id]);
  await tx.query("INSERT INTO logistica_eventos(recibo_id,tecnico_id,tipo,detalhe,ator_id) VALUES($1,$2,'divergencia_revisada',$3::jsonb,$4)", [id, receipt.tecnico_id, JSON.stringify({ revisao: text }), ator.id]);
  await recordAudit({ entityType: 'logistica_recibo', entityId: id, action: 'divergencia_revisada', summary: `Divergência revisada pela Logística no recibo ${id}`, data: { revisao: text }, user: ator, client: tx });
  return reciboCompleto(tx, id);
}

async function kitPadrao(db) {
  const { rows } = await db.query('SELECT id,nome_ferramenta AS nome,quantidade FROM logistica_kit_padrao WHERE ativo=TRUE ORDER BY nome_ferramenta');
  return { itens: rows };
}

async function atualizarKitPadrao(tx, data, ator) {
  if (!Array.isArray(data?.itens) || data.itens.length > 100) throw httpError(400, 'Informe até 100 itens para o kit padrão.');
  const itens = data.itens.map((item) => {
    const nome = String(item?.nome || '').trim();
    const quantidade = Number(item?.quantidade);
    if (!nome || nome.length > 120 || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 50) throw httpError(400, 'Confira o nome e a quantidade de cada item do kit.');
    return { nome, quantidade };
  });
  if (new Set(itens.map((item) => item.nome.toLowerCase())).size !== itens.length) throw httpError(400, 'O kit não pode repetir o mesmo item.');
  const before = await kitPadrao(tx);
  await tx.query('UPDATE logistica_kit_padrao SET ativo=FALSE WHERE ativo=TRUE');
  for (const item of itens) {
    const existing = (await tx.query('SELECT id FROM logistica_kit_padrao WHERE LOWER(nome_ferramenta)=LOWER($1)', [item.nome])).rows[0];
    if (existing) await tx.query('UPDATE logistica_kit_padrao SET nome_ferramenta=$1,quantidade=$2,ativo=TRUE WHERE id=$3', [item.nome, item.quantidade, existing.id]);
    else await tx.query('INSERT INTO logistica_kit_padrao(nome_ferramenta,quantidade,ativo) VALUES($1,$2,TRUE)', [item.nome, item.quantidade]);
  }
  await recordAudit({ entityType: 'logistica_kit', entityId: 'padrao', action: 'atualizado', summary: 'Kit padrão de ferramentas atualizado', data: { itens }, before, user: ator, client: tx });
  return kitPadrao(tx);
}

async function resumo(db) {
  const result = await db.query(`SELECT
    COUNT(*) FILTER (WHERE situacao='disponivel')::int AS disponiveis,
    COUNT(*) FILTER (WHERE situacao='com_tecnico')::int AS com_tecnicos,
    COUNT(*) FILTER (WHERE situacao='em_falta')::int AS faltas,
    COUNT(*) FILTER (WHERE situacao='em_avaliacao')::int AS em_avaliacao,
    COUNT(*) FILTER (WHERE situacao='baixada')::int AS baixadas,
    (SELECT COUNT(*)::int FROM logistica_recibos WHERE status='aguardando_assinatura') AS aguardando_assinatura,
    (SELECT COUNT(*)::int FROM logistica_recibos WHERE status='divergencia') AS divergencias
    FROM logistica_ferramentas`);
  return result.rows[0];
}

async function tecnicos(db) {
  const { rows } = await db.query(`SELECT id,name AS nome FROM users WHERE active=TRUE AND deleted_at IS NULL
    AND COALESCE(suite_role,CASE WHEN role='admin' THEN 'admin' WHEN role='gestor' THEN 'gestor' ELSE 'tecnico' END)='tecnico' ORDER BY name`);
  return rows;
}

module.exports = { criarFerramenta, criarRecibo, entregarFerramentas, meuKit, reciboCompleto, kitPadrao, atualizarKitPadrao, resumo, tecnicos, assinarRecibo, relatarDivergencia, revisarDivergencia, relatarFalta, devolverFerramenta, avaliarFerramenta, apurarFalta, historicoFerramenta };
