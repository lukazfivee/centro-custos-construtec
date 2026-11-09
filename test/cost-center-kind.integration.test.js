const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Obra ou servico: tipo do centro de custo na API, no CSV e na importacao do Orcamentos', async (context) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-kind-test-'));
  process.env.DATABASE_URL = '';
  process.env.PGLITE_DATA_DIR = path.join(tempRoot, 'database');
  process.env.RESTORE_ROOT_DIR = path.join(tempRoot, 'restore');
  process.env.JWT_SECRET = 'cost-center-kind-test-secret-at-least-32-chars';
  process.env.ADMIN_INITIAL_PASSWORD = 'kind-test-123';
  process.env.ADMIN_INITIAL_EMAIL = 'kind@teste.local';

  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  const { createApp } = require('../server');
  const { computeSha256, canonicalJsonStringify } = require('../services/budgets/budgetCanonical');

  let server;
  context.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const db = getDb();
  const KEY = { 'x-construtec-integration-key': 'construtec-internal-integration-secret-2026' };
  let auth = '';

  async function request(route, method = 'GET', body, status = 200, headers = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (auth && !headers['x-construtec-integration-key']) h.Authorization = `Bearer ${auth}`;
    const response = await fetch(base + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    assert.equal(response.status, status, text);
    return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  }

  function fixture(suffix) {
    const envelope = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/proposal-approved.v1.example.json'), 'utf8'));
    if (suffix) {
      envelope.payload.proposal.seriesId = `${envelope.payload.proposal.seriesId}-${suffix}`;
      envelope.payload.proposal.id = `${envelope.payload.proposal.id}-${suffix}`;
      envelope.payloadSha256 = computeSha256(canonicalJsonStringify(envelope.payload));
    }
    return envelope;
  }

  const kindOf = async (id) => (await db.query('SELECT kind FROM cost_centers WHERE id=$1', [id])).rows[0].kind;

  auth = (await request('/auth/login', 'POST', { email: 'kind@teste.local', senha: 'kind-test-123' })).token;

  let obraId;
  let servicoId;

  await context.test('cria obra (padrao) e servico; lista e detalhe devolvem o tipo', async () => {
    obraId = (await request('/centros-custo', 'POST', { codigo: 'OB-1', nome: 'Obra grande' }, 201)).id;
    servicoId = (await request('/centros-custo', 'POST', { codigo: 'SV-1', nome: 'Instalar camera', tipo: 'servico' }, 201)).id;
    const list = await request('/centros-custo');
    assert.equal(list.find((c) => c.id === obraId).tipo, 'obra');
    assert.equal(list.find((c) => c.id === servicoId).tipo, 'servico');
    const detail = await request(`/centros-custo/${servicoId}/detalhes`);
    assert.equal(detail.centro.tipo, 'servico');
  });

  await context.test('tipo invalido e recusado', async () => {
    await request('/centros-custo', 'POST', { codigo: 'X-1', nome: 'X', tipo: 'reforma' }, 400);
  });

  await context.test('contrato de manutenção tem tipo próprio e filtro isolado', async () => {
    const contrato = await request('/centros-custo', 'POST', { codigo: 'CM-1', nome: 'Manutenção', tipo: 'contrato_manutencao', orcamento: 1000 }, 201);
    const detalhe = await request(`/centros-custo/${contrato.id}/detalhes`);
    assert.equal(detalhe.centro.tipo, 'contrato_manutencao');
    assert.equal(Number(detalhe.centro.orcamento), 1000);
    const lista = await request('/centros-custo?kind=contrato_manutencao');
    assert.deepEqual(lista.map((item) => item.id), [contrato.id]);
    const carteira = await request('/centros-custo/portfolio-summary?kind=contrato_manutencao');
    assert.equal(carteira.portfolio.totalCenters, 1);
    const url = `/centros-custo/${contrato.id}/competencias-manutencao`;
    const mes = require('../lib/dates').currentMonth();
    const periodo = await request(url, 'POST', { mes });
    assert.equal(Number(periodo.valor_mensal), 1000);
    assert.equal(periodo.recebido, false);
    assert.equal((await request(url, 'POST', { mes })).id, periodo.id);
    await request(`${url}/${mes}/recebimento`, 'PUT', { recebido: true });
    await request(`/centros-custo/${contrato.id}`, 'PUT', { codigo: 'CM-1', nome: 'Manutenção', tipo: 'contrato_manutencao', orcamento: 2000 });
    assert.equal(Number((await request(url)).find((p) => p.mes === mes).valor_mensal), 1000);
    assert.equal((await request(url)).find((p) => p.mes === mes).recebido, true);
    const baseUrl = `/centros-custo/${contrato.id}/manutencao`;
    assert.equal((await request(`${baseUrl}-resumo`)).saldo, 1000);
    const idempotencia = require('node:crypto').randomUUID();
    const movimento = await request(`${baseUrl}-movimentos`, 'POST', { destino:'centro', centro_destino:obraId, valor:200, client_id:idempotencia }, 201);
    assert.equal((await request(`${baseUrl}-movimentos`, 'POST', { destino:'centro', centro_destino:obraId, valor:200, client_id:idempotencia })).repetido, true);
    const financeiro = await request(`${baseUrl}-movimentos`, 'POST', { destino:'financeiro', valor:100 }, 201);
    assert.equal((await request(`${baseUrl}-resumo`)).saldo, 700);
    await request(`${baseUrl}-movimentos`, 'POST', { destino:'financeiro', valor:701 }, 409);
    await request(`${baseUrl}-movimentos/${movimento.publicId}/estornar`, 'POST', {});
    assert.equal((await request(`${baseUrl}-resumo`)).saldo, 900);
    const receita = (await db.query('SELECT id,financial_status FROM transactions WHERE public_id=$1', [financeiro.lancamento])).rows[0];
    assert.equal(receita.financial_status, 'pendente');
    await request(`/lancamentos/${receita.id}`, 'DELETE');
    assert.equal((await request(`${baseUrl}-resumo`)).saldo, 1000);
    const categoria = (await db.query("SELECT id FROM categories WHERE name='Material'")).rows[0].id;
    await request('/recorrentes', 'POST', { nome:'Limpeza', tipo:'despesa', cost_center_id:contrato.id, category_id:categoria, valor:75, frequencia:'mensal', inicio:mes }, 201);
    let resumo = await request(`${baseUrl}-resumo`);
    assert.equal(resumo.recorrentes_previstos, 75);
    assert.equal(resumo.saldo, 925);
    await request('/recorrentes/gerar', 'POST', { mes });
    resumo = await request(`${baseUrl}-resumo`);
    assert.equal(resumo.recorrentes_previstos, 0);
    assert.equal(resumo.despesas, 75);
    assert.equal(resumo.saldo, 925);
    const { buildPackage } = require('../services/smartSync');
    const { importPeriods, importMovements } = require('../services/maintenanceSync');
    const pack = await buildPackage();
    assert.equal(pack.formatVersion, 4);
    assert.ok(pack.payload.maintenancePeriods.length >= 1);
    assert.equal(pack.payload.maintenanceMovements.length, 3);
    await db.transaction((tx) => importPeriods(tx, pack.payload.maintenancePeriods));
    const divergent = { ...pack.payload.maintenancePeriods[0], amount: '123.00' };
    await assert.rejects(db.transaction((tx) => importPeriods(tx, [divergent])), /Valor divergente/);
    const centroPublicId = (await db.query('SELECT public_id FROM cost_centers WHERE id=$1', [contrato.id])).rows[0].public_id;
    const csv = ['secao;public_id;nome;tipo;codigo;orcamento_mensal;revisao;alterado_em',
      `obras;${centroPublicId};Manutenção;contrato_manutencao;CM-1;9999;999;2026-11-01T00:00:00Z`].join('\n');
    const csvImportado = await request('/cadastro-sync/importar','POST',{ conteudo:csv });
    assert.equal(csvImportado.erros,1);
    assert.match(csvImportado.detalhes[0].mensagem, /sincronização inteligente/);
    assert.equal(Number((await db.query('SELECT monthly_budget FROM cost_centers WHERE id=$1', [contrato.id])).rows[0].monthly_budget),2000);
    const proximoMes = require('../services/recurringSchedule').somarMeses(mes, 1);
    const futuro = await request('/centros-custo', 'POST', { codigo:'CM-3', nome:'Contrato futuro', tipo:'contrato_manutencao', orcamento:1000, data_inicio:`${proximoMes}-01` }, 201);
    const futuroPublicId = (await db.query('SELECT public_id FROM cost_centers WHERE id=$1', [futuro.id])).rows[0].public_id;
    const novaCompetencia = { ...pack.payload.maintenancePeriods[0], center:futuroPublicId, month:proximoMes, publicId:undefined };
    await db.transaction((tx) => importPeriods(tx, [novaCompetencia]));
    assert.equal((await request(`/centros-custo/${futuro.id}/competencias-manutencao`))[0].mes, proximoMes);
    const enviado = await request(`${baseUrl}-movimentos`,'POST',{ destino:'centro',centro_destino:futuro.id,valor:200 },201);
    const destinoUrl = `/centros-custo/${futuro.id}/manutencao-movimentos`;
    const gastoVerba = await request(destinoUrl,'POST',{ destino:'centro',centro_destino:obraId,valor:150 },201);
    const estornoRecebido = { publicId:require('node:crypto').randomUUID(), center:centroPublicId, destination:futuroPublicId,
      transaction:null,amount:'200.00',date:require('../lib/dates').todayIso(),reversalOf:enviado.publicId,revision:1,updatedAt:new Date().toISOString() };
    await assert.rejects(db.transaction((tx) => importMovements(tx,[estornoRecebido],{ id:1 })), /já utilizou esta verba/);
    await request(`${destinoUrl}/${gastoVerba.publicId}/estornar`,'POST',{});
    await request(`${baseUrl}-movimentos/${enviado.publicId}/estornar`,'POST',{});
    const copia = await request('/centros-custo', 'POST', { codigo:'CM-2', nome:'Contrato sincronizado', tipo:'contrato_manutencao', orcamento:1000 }, 201);
    const copyId = (await db.query('SELECT public_id FROM cost_centers WHERE id=$1', [copia.id])).rows[0].public_id;
    const originais = pack.payload.maintenanceMovements.filter((m) => m.destination);
    const ids = new Map(originais.map((m) => [m.publicId,require('node:crypto').randomUUID()]));
    const copias = originais.map((m) => ({ ...m, center:copyId, publicId:ids.get(m.publicId), reversalOf:m.reversalOf ? ids.get(m.reversalOf) : null }));
    await db.transaction((tx) => importMovements(tx, copias, { id:1 }));
    assert.equal((await request(`/centros-custo/${copia.id}/manutencao-resumo`)).saldo,1000);
    const path = `/centros-custo/${copia.id}/manutencao-movimentos`;
    const concurrent = await Promise.all([0,1].map(() => fetch(base + path, { method:'POST',headers:{ 'Content-Type':'application/json',Authorization:`Bearer ${auth}` },
      body:JSON.stringify({ destino:'centro',centro_destino:obraId,valor:600,client_id:require('node:crypto').randomUUID() }) })));
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201,409]);
    const winning = await concurrent.find((r) => r.status === 201).json();
    assert.equal((await request(`/centros-custo/${copia.id}/manutencao-resumo`)).saldo,400);
    await request(`${path}/${winning.publicId}/estornar`,'POST',{});
    const renda = await request(path,'POST',{ destino:'financeiro',valor:250 },201);
    const rendaId = (await db.query('SELECT id FROM transactions WHERE public_id=$1', [renda.lancamento])).rows[0].id;
    const entry = await request(`/lancamentos/${rendaId}`);
    await request(`/lancamentos/${rendaId}`,'PUT',{ ...entry,valor:251,revisao:entry.revision },409);
    await request(`/lancamentos/${rendaId}`,'PUT',{ ...entry, status_financeiro:'liquidado', data_liquidacao:entry.data, revisao:entry.revision });
    assert.equal((await request(`/centros-custo/${copia.id}/manutencao-resumo`)).saldo,750);
    await request(`/lancamentos/${rendaId}/estornar`,'POST',{ motivo:'Correção da destinação',data_estorno:entry.data },201);
    assert.equal((await request(`/centros-custo/${copia.id}/manutencao-resumo`)).saldo,1000);
    await assert.rejects(db.query('UPDATE maintenance_periods SET monthly_amount=1 WHERE id=$1', [periodo.id]));
    const nextMonth = require('../services/recurringSchedule').somarMeses(mes,1);
    const stored = (await db.query(`SELECT id,active,monthly_budget,start_date::text,end_date::text,
      (created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS created_date FROM cost_centers WHERE id=$1`, [contrato.id])).rows[0];
    await db.query('INSERT INTO monthly_closings(year,month,closed_by) VALUES($1,$2,$3)', [Number(nextMonth.slice(0,4)),Number(nextMonth.slice(5,7)),1]);
    await assert.rejects(db.transaction((tx) => require('../services/maintenanceBalance').ensurePeriods(tx,stored,nextMonth)), /está fechada/);
    await db.query('DELETE FROM monthly_closings WHERE year=$1 AND month=$2', [Number(nextMonth.slice(0,4)),Number(nextMonth.slice(5,7))]);
    await db.transaction((tx) => require('../services/maintenanceBalance').ensurePeriods(tx,stored,nextMonth));
    assert.equal(Number((await request(url)).find((p) => p.mes === nextMonth).valor_mensal),2000);
    await db.query('INSERT INTO monthly_closings(year,month,closed_by) VALUES($1,$2,$3)', [Number(mes.slice(0,4)),Number(mes.slice(5,7)),1]);
    assert.equal((await request(`${baseUrl}-resumo`)).saldo,925);
    await request(`${baseUrl}-movimentos`, 'POST', { destino:'financeiro',valor:1 },403);
    await assert.rejects(db.query(`INSERT INTO maintenance_movements(public_id,cost_center_id,destination_id,amount,movement_date,created_by)
      VALUES($1,$2,$3,1,$4,1)`, [require('node:crypto').randomUUID(),contrato.id,obraId,`${mes}-01`]), /FINANCIAL_MONTH_CLOSED/);
    await db.query('DELETE FROM monthly_closings WHERE year=$1 AND month=$2', [Number(mes.slice(0,4)),Number(mes.slice(5,7))]);
    await request(`/centros-custo/${contrato.id}`, 'PUT', { codigo: 'CM-1', nome: 'Manutenção', tipo: 'obra' }, 409);
    await request(`/centros-custo/${contrato.id}`, 'DELETE', undefined, 409);
  });

  await context.test('filtro ?kind= na lista simples e paginada', async () => {
    const servicos = await request('/centros-custo?kind=servico');
    assert.deepEqual(servicos.map((c) => c.id), [servicoId]);
    const obras = await request('/centros-custo?kind=obra');
    assert.ok(obras.every((c) => c.tipo === 'obra'));
    assert.ok(obras.some((c) => c.id === obraId));
    const paged = await request('/centros-custo?kind=servico&pagina=1&limite=10');
    assert.equal(paged.paginacao.total, 1);
    assert.equal(paged.itens[0].id, servicoId);
    await request('/centros-custo?kind=qualquer', 'GET', undefined, 400);
  });

  await context.test('editar muda o tipo; editar sem tipo mantem o atual', async () => {
    await request(`/centros-custo/${obraId}`, 'PUT', { codigo: 'OB-1', nome: 'Obra grande', tipo: 'servico' });
    assert.equal(await kindOf(obraId), 'servico');
    await request(`/centros-custo/${obraId}`, 'PUT', { codigo: 'OB-1', nome: 'Obra grande renomeada' });
    assert.equal(await kindOf(obraId), 'servico');
    await request(`/centros-custo/${obraId}`, 'PUT', { codigo: 'OB-1', nome: 'Obra grande', tipo: 'obra' });
    assert.equal(await kindOf(obraId), 'obra');
  });

  await context.test('o banco recusa tipo fora de obra/servico', async () => {
    await assert.rejects(db.query("UPDATE cost_centers SET kind='outro' WHERE id=$1", [obraId]));
  });

  await context.test('CSV de cadastros leva o tipo na coluna tipo', async () => {
    const csv = await request('/cadastro-sync/exportar.csv');
    const line = csv.split('\r\n').find((l) => l.includes('SV-1'));
    assert.ok(line && line.includes('servico'), line);
  });

  await context.test('sync-direto com costCenterKind=servico na raiz cria servico', async () => {
    const envelope = fixture('servico');
    await request('/integracao/orcamentos/sync-direto', 'POST', { ...envelope, costCenterKind: 'tipo-errado' }, 400, KEY);
    const result = await request('/integracao/orcamentos/sync-direto', 'POST', { ...envelope, costCenterKind: 'servico' }, 201, KEY);
    assert.equal(await kindOf(result.costCenterId), 'servico');
    // Codigo SV- a partir do numero da proposta (PA-1001 -> SV-1001) e valor cobrado = valor final da proposta.
    const cc = (await db.query('SELECT code,contract_amount FROM cost_centers WHERE id=$1', [result.costCenterId])).rows[0];
    assert.equal(cc.code, 'SV-1001');
    assert.equal(Number(cc.contract_amount), 3450);
  });

  await context.test('costCenterKind em options vale; sem o campo cria obra', async () => {
    const result = await request('/integracao/orcamentos/sync-direto', 'POST', { envelope: fixture('opt'), options: { costCenterKind: 'servico' } }, 201, KEY);
    assert.equal(await kindOf(result.costCenterId), 'servico');
    assert.equal((await db.query('SELECT code FROM cost_centers WHERE id=$1', [result.costCenterId])).rows[0].code, 'SV-1001-2');
    const plain = await request('/integracao/orcamentos/sync-direto', 'POST', fixture(), 201, KEY);
    assert.equal(await kindOf(plain.costCenterId), 'obra');
  });
});
