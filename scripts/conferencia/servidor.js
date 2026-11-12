// Servidor de teste do kit de conferencia: banco temporario proprio (PGlite em pasta nova), dados de
// exemplo inventados, nuvem simulada (Worker comercial de mentira) e e-mail que so registra.
// Nada aponta para os dados reais: AppData, banco do app instalado, Neon e Cloudflare ficam de fora.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const http = require('node:http');
const RAIZ = path.join(__dirname, '..', '..');

// Nuvem simulada: o Worker comercial de mentira (cobrancas e e-mail, que apenas registra) mais as rotas
// de sincronizacao e atividade respondendo "tudo em dia", para o selo do topo mostrar "Sincronizado".
function nuvemSimulada(porta, destino) {
  const servidor = http.createServer(async (req, res) => {
    const caminho = new URL(req.url, 'http://x').pathname;
    const responder = (dados) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(dados)); };
    if (req.method === 'GET' && caminho === '/v1/sync/snapshot') return responder({ ok: true, snapshot: { cursor: 1, payload: {} } });
    if (req.method === 'POST' && caminho === '/v1/sync') { req.resume(); return responder({ ok: true, snapshot: { cursor: 2, payload: {} } }); }
    if (req.method === 'GET' && caminho === '/v1/activity') return responder({ ok: true, items: [], cursor: 0 });
    const corpo = await new Promise((resolve) => { const partes = []; req.on('data', (c) => partes.push(c)); req.on('end', () => resolve(Buffer.concat(partes))); });
    const r = await fetch(`${destino}${req.url}`, { method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo });
    res.writeHead(r.status, { 'content-type': 'application/json' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise((resolve) => servidor.listen(porta, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${porta}`, fechar: () => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(r); }) })));
}
const SENHA_ADMIN = 'conferencia-admin-1';

// Pessoas de teste. O e-mail @rcconstrutec.com.br e o que a tela de Cobrancas exige (nao envia nada: o Worker e de mentira).
const PESSOAS = {
  admin: { nome: 'Marina Costa', email: 'marina.costa@rcconstrutec.com.br', suiteRole: 'admin' },
  gestor: { nome: 'Rafael Nogueira', email: 'rafael.nogueira@rcconstrutec.com.br', suiteRole: 'gestor' },
  financeiro: { nome: 'Carla Menezes', email: 'carla.menezes@rcconstrutec.com.br', suiteRole: 'financeiro' },
  engenharia: { nome: 'Bruno Tavares', email: 'bruno.tavares@rcconstrutec.com.br', suiteRole: 'engenharia' },
  tecnico: { nome: 'Diego Ferraz', email: 'diego.ferraz@rcconstrutec.com.br', suiteRole: 'tecnico' },
  comercial: { nome: 'Paula Siqueira', email: 'paula.siqueira@rcconstrutec.com.br', suiteRole: 'comercial' },
};

function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

async function iniciar({ porta, pasta } = {}) {
  const raizTemp = pasta || fs.mkdtempSync(path.join(os.tmpdir(), 'conferencia-dados-'));
  // Tudo isolado: variaveis ANTES de carregar db e server.
  Object.assign(process.env, {
    PGLITE_DATA_DIR: path.join(raizTemp, 'banco'),
    RESTORE_ROOT_DIR: path.join(raizTemp, 'restauracao'),
    JWT_SECRET: 'conferencia-segredo-local-com-mais-de-trinta-e-dois-caracteres',
    ADMIN_INITIAL_EMAIL: 'admin@teste.local',
    ADMIN_INITIAL_PASSWORD: SENHA_ADMIN,
    ADMIN_INITIAL_NAME: 'Conta inicial',
    HOST: '127.0.0.1',
    PORT: String(porta),
    REPORT_API_URL: '', // fila de reports local, sem entrega central
    MOBILE_APP_URL: '',
    NODE_ENV: 'test',
    LOG_LEVEL: process.env.LOG_LEVEL || 'error',
  });
  delete process.env.DATABASE_URL;
  delete process.env.SYNC_SHARED_KEY;

  const { iniciar: iniciarWorker } = require('../dev/fake-commercial-worker');
  const { initializeDatabase, closeDatabase, getDb, getInstanceIdentity } = require('../../db');

  // O banco e as obras nascem antes do Worker de mentira, que precisa conhecer as obras.
  await initializeDatabase();
  const obrasNuvem = [];
  const worker = await iniciarWorker({ obras: obrasNuvem });
  const nuvem = await nuvemSimulada(porta + 3, worker.url);
  process.env.SYNC_API_URL = nuvem.url;
  process.env.SYNC_SHARED_KEY = 'chave-de-conferencia-local-0000000000000000';

  const { createApp } = require('../../server');
  const servidor = createApp().listen(porta, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  const url = `http://127.0.0.1:${porta}`;
  const api = `${url}/api`;

  async function chamar(rota, metodo, corpo, token, esperado) {
    const r = await fetch(`${api}${rota}`, {
      method: metodo || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    if (esperado && r.status !== esperado) throw new Error(`${metodo || 'GET'} ${rota} -> ${r.status}: ${JSON.stringify(dados)}`);
    return dados;
  }

  const login = await chamar('/auth/login', 'POST', { email: 'admin@teste.local', senha: SENHA_ADMIN }, null, 200);
  const instancia = login.instancia || getInstanceIdentity();
  const tokenAdminLocal = login.token;

  // ---- pessoas
  const ids = {};
  for (const [chave, p] of Object.entries(PESSOAS)) {
    const criado = await chamar('/usuarios', 'POST', { nome: p.nome, email: p.email, senha: `senha-${chave}-provisoria-1`, suiteRole: p.suiteRole }, tokenAdminLocal, 201);
    ids[chave] = criado.id;
  }
  const assinar = (id) => jwt.sign({}, process.env.JWT_SECRET, { subject: String(id), expiresIn: '12h' });
  const tokens = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, assinar(id)]));
  tokens.adminLocal = tokenAdminLocal;
  const t = tokens.admin;

  const { currentMonth, todayIso } = require('../../lib/dates');
  const mes = currentMonth();
  const mesAnterior = somarMeses(mes, -1);
  const hoje = todayIso();

  // ---- categorias
  const cats = {};
  const lista = await chamar('/categorias', 'GET', undefined, t);
  for (const c of lista) cats[c.nome] = c.id;
  for (const [nome, tipo, cor, descricao] of [
    ['Material', 'despesa', '#12a9d1', 'Cimento, areia, revestimentos e acabamentos'],
    ['Mão de obra', 'despesa', '#1d7a4f', 'Equipes próprias e empreiteiros'],
    ['Equipamentos', 'despesa', '#e0a33a', 'Locação e manutenção'],
    ['Serviços terceirizados', 'despesa', '#8a5cd0', 'Projetos, laudos e consultorias'],
    ['Transporte', 'despesa', '#c2692a', 'Frete, combustível e caçambas'],
    ['Medição de contrato', 'receita', '#0b4a5c', 'Recebimentos de medições aprovadas'],
  ]) {
    if (cats[nome]) continue;
    const c = await chamar('/categorias', 'POST', { nome, tipo, cor, descricao }, t, 201);
    cats[nome] = c.id;
  }

  // ---- obras (a 1a vem do Orcamentos, com planilha e medicoes)
  const obras = {};
  const db = getDb();
  const { confirmImport } = require('../../services/budgets/budgetImportService');
  const { recordLaborMeasurement, recordContractMeasurement } = require('../../services/budgets/budgetMeasurements');
  const envelope = JSON.parse(fs.readFileSync(path.join(RAIZ, 'test', 'fixtures', 'proposal-approved.v1.example.json'), 'utf8'));
  const importada = await confirmImport(db, { envelope, confirmedHash: envelope.payloadSha256 }, ids.admin);
  obras.modelo = { id: importada.costCenterId, contrato: importada.contractId };

  const novaObra = async (chave, dados) => {
    const r = await chamar('/centros-custo', 'POST', dados, t, 201);
    obras[chave] = { id: r.id };
  };
  await novaObra('aurora', { codigo: 'CC-031', nome: 'Residencial Aurora', cliente: 'Aurora Incorporadora', responsavel: 'Rafael Nogueira', orcamento: 1850000, valor_contrato: 2380000, data_inicio: `${somarMeses(mes, -8)}-03`, data_fim: `${somarMeses(mes, 6)}-20`, situacao: 'execucao' });
  await novaObra('vista', { codigo: 'CC-034', nome: 'Edifício Vista Verde', cliente: 'Vista Verde Empreend.', responsavel: 'Bruno Tavares', orcamento: 920000, valor_contrato: 1210000, data_inicio: `${somarMeses(mes, -4)}-10`, data_fim: `${somarMeses(mes, 8)}-30`, situacao: 'execucao' });
  await novaObra('galpao', { codigo: 'CC-029', nome: 'Galpão Logístico Norte', cliente: 'Norte Logística S.A.', responsavel: 'Rafael Nogueira', orcamento: 640000, valor_contrato: 790000, data_inicio: `${somarMeses(mes, -10)}-15`, data_fim: `${somarMeses(mes, -1)}-28`, situacao: 'concluido' });
  await novaObra('reforma', { codigo: 'CC-036', nome: 'Reforma da Clínica São Lucas', cliente: 'Clínica São Lucas', responsavel: 'Diego Ferraz', orcamento: 210000, valor_contrato: 268000, situacao: 'planejamento' });
  await novaObra('servico', { codigo: 'SV-012', nome: 'Laudo de fachada Torre Sul', cliente: 'Condomínio Torre Sul', responsavel: 'Bruno Tavares', tipo: 'servico', orcamento: 18000, valor_contrato: 24000, situacao: 'execucao' });

  // Engenharia e tecnico so veem as obras atribuidas.
  await chamar(`/usuarios/${ids.tecnico}/acesso`, 'PUT', { suiteRole: 'tecnico', obras: [obras.aurora.id, obras.vista.id] }, t, 200);
  await chamar(`/usuarios/${ids.engenharia}/acesso`, 'PUT', { suiteRole: 'engenharia', obras: [obras.vista.id, obras.modelo.id] }, t, 200);

  // ---- fornecedores
  const forn = {};
  for (const [chave, dados] of Object.entries({
    alfa: { nome: 'Casa Alfa Materiais', documento: '11222333000181', contato: 'Ana Prado', telefone: '1133334444', email: 'vendas@casaalfa.example', categoria_id: cats['Material'] },
    beta: { nome: 'Concreto Beta', documento: '45997418000153', contato: 'Marcos Lima', telefone: '1144445555', categoria_id: cats['Material'] },
    gama: { nome: 'Locaplat Equipamentos', documento: '60701190000104', contato: 'Sônia Reis', categoria_id: cats['Equipamentos'] },
    delta: { nome: 'Engenharia Delta Projetos', documento: '11144477735', contato: 'Paulo Delta', categoria_id: cats['Serviços terceirizados'] },
    epsilon: { nome: 'TransLog Fretes', documento: '07526557000100', contato: 'Rita Souza', categoria_id: cats['Transporte'] },
  })) {
    const f = await chamar('/fornecedores', 'POST', dados, t, 201);
    forn[chave] = f.id;
  }

  // ---- lancamentos (mes anterior e atual; vencidos e a pagar)
  const dia = (m, d) => `${m}-${String(d).padStart(2, '0')}`;
  const lanc = [];
  const L = async (obra, categoria, tipo, descricao, valor, data, situacao, extra = {}) => {
    const corpo = { tipo, cost_center_id: obras[obra].id, category_id: cats[categoria], descricao, valor, data, status_financeiro: situacao, ...extra };
    const r = await chamar('/lancamentos', 'POST', corpo, t, 201);
    lanc.push(r.id);
    return r.id;
  };
  const ult = Number(hoje.slice(8, 10));
  const idRef = await L('aurora', 'Material', 'despesa', 'Cimento CP-II 50 kg, 600 sacos', 14880, dia(mesAnterior, 22), 'liquidado', { favorecido: 'Casa Alfa Materiais', documento: 'NF 18.442', forma_pagamento: 'Boleto' });
  await L('aurora', 'Material', 'despesa', 'Aço CA-50, vergalhão 10 mm', 31250, dia(mesAnterior, 15), 'liquidado', { favorecido: 'Casa Alfa Materiais', documento: 'NF 7.781' });
  await L('aurora', 'Mão de obra', 'despesa', 'Equipe de alvenaria, 2ª quinzena', 42800, dia(mesAnterior, 30), 'liquidado', { favorecido: 'Empreiteira Silva' });
  await L('aurora', 'Equipamentos', 'despesa', 'Locação de plataforma elevatória', 3800, dia(mes, Math.max(1, ult - 6)), 'pendente', { favorecido: 'Locaplat Equipamentos', vencimento: dia(mes, Math.max(1, ult - 2)), documento: 'NF 3.301' });
  await L('aurora', 'Serviços terceirizados', 'despesa', 'Laudo de sondagem do terreno', 5400, dia(mes, 2), 'liquidado', { favorecido: 'Engenharia Delta Projetos' });
  await L('aurora', 'Medição de contrato', 'receita', 'Medição 06 · Residencial Aurora', 126800, dia(mes, 3), 'liquidado', { favorecido: 'Aurora Incorporadora' });
  await L('aurora', 'Medição de contrato', 'receita', 'Medição 07 · Residencial Aurora', 98400, dia(mes, Math.min(28, ult + 10)), 'pendente', { favorecido: 'Aurora Incorporadora', vencimento: dia(mes, Math.min(28, ult + 10)) });
  await L('vista', 'Material', 'despesa', 'Concreto usinado fck 30, 42 m³', 21060, dia(mes, 5), 'liquidado', { favorecido: 'Concreto Beta', documento: 'NF 4.410' });
  await L('vista', 'Mão de obra', 'despesa', 'Equipe de formas e armação', 36500, dia(mes, 9), 'liquidado', { favorecido: 'Empreiteira Silva' });
  await L('vista', 'Transporte', 'despesa', 'Caçambas de entulho, 8 viagens', 2640, dia(mes, 7), 'liquidado', { favorecido: 'TransLog Fretes' });
  await L('vista', 'Material', 'despesa', 'Tubulação hidráulica PVC', 8420, dia(mes, Math.min(28, ult + 6)), 'pendente', { favorecido: 'Casa Alfa Materiais', vencimento: dia(mes, Math.min(28, ult + 6)) });
  await L('vista', 'Medição de contrato', 'receita', 'Medição 02 · Vista Verde', 210000, dia(mesAnterior, 25), 'liquidado', { favorecido: 'Vista Verde Empreend.' });
  await L('galpao', 'Material', 'despesa', 'Telhas metálicas, acerto final', 18900, dia(mesAnterior, 12), 'liquidado', { favorecido: 'Casa Alfa Materiais' });
  await L('galpao', 'Medição de contrato', 'receita', 'Medição final · Galpão Norte', 158000, dia(mesAnterior, 28), 'liquidado', { favorecido: 'Norte Logística S.A.' });
  await L('galpao', 'Serviços terceirizados', 'despesa', 'Projeto de combate a incêndio', 7200, dia(mesAnterior, 8), 'pendente', { favorecido: 'Engenharia Delta Projetos', vencimento: dia(mesAnterior, 20) });
  await L('servico', 'Serviços terceirizados', 'despesa', 'Inspeção por drone da fachada', 4900, dia(mes, 4), 'liquidado', { favorecido: 'Engenharia Delta Projetos' });
  await L('reforma', 'Material', 'despesa', 'Sinalização e tapumes', 3150, dia(mes, 6), 'pendente', { favorecido: 'Casa Alfa Materiais', vencimento: dia(mes, Math.min(28, ult + 3)) });
  for (let i = 0; i < 9; i += 1) {
    await L(['aurora', 'vista'][i % 2], ['Material', 'Mão de obra', 'Transporte'][i % 3], 'despesa', `Compra avulsa ${i + 1}`, 480 + i * 137.5, dia(mes, 1 + i), 'liquidado', { favorecido: ['Casa Alfa Materiais', 'TransLog Fretes', 'Concreto Beta'][i % 3] });
  }

  // Historico dos meses anteriores, para o grafico de evolucao e a carteira nao ficarem vazios.
  for (let k = 2; k <= 9; k += 1) {
    const m = somarMeses(mes, -k);
    await L('aurora', 'Medição de contrato', 'receita', `Medição ${10 - k} · Residencial Aurora`, 90000 + k * 4300, dia(m, 20), 'liquidado', { favorecido: 'Aurora Incorporadora' });
    await L('aurora', 'Material', 'despesa', `Materiais do mês ${m}`, 31000 + k * 2750, dia(m, 8), 'liquidado', { favorecido: 'Casa Alfa Materiais' });
    await L('vista', 'Mão de obra', 'despesa', `Folha da equipe ${m}`, 24000 + k * 1900, dia(m, 28), 'liquidado', { favorecido: 'Empreiteira Silva' });
  }

  // ---- planilha da obra importada: apropriacao e medicoes (como no servidor de demonstracao do repositorio)
  const itens = (await db.query('SELECT id, kind FROM budget_control_items WHERE contract_id = $1', [obras.modelo.contrato])).rows;
  const itemMaterial = itens.find((i) => i.kind === 'material');
  const itemMao = itens.find((i) => i.kind === 'labor');
  const catMat = cats['Material'];
  const gasto = await chamar('/lancamentos', 'POST', { tipo: 'despesa', cost_center_id: obras.modelo.id, category_id: catMat, descricao: 'Compra de porcelanato 60x60, lote 1', valor: 450, data: dia(mes, 3), status_financeiro: 'liquidado', favorecido: 'Casa Alfa Materiais' }, t, 201);
  await chamar(`/centros-custo/${obras.modelo.id}/apropriacoes`, 'POST', { transactionId: gasto.id, amount: 450, contractId: obras.modelo.contrato, controlItemId: itemMaterial.id, quantity: 45, unit: 'm²', notes: 'Primeira entrega no canteiro' }, t);
  await chamar('/lancamentos', 'POST', { tipo: 'despesa', cost_center_id: obras.modelo.id, category_id: cats['Transporte'], descricao: 'Frete e caçamba de entulho', valor: 150, data: dia(mes, 3), status_financeiro: 'liquidado', favorecido: 'TransLog Fretes' }, t, 201);
  await recordLaborMeasurement(db, { contractId: obras.modelo.contrato, costCenterId: obras.modelo.id, periodStart: dia(mesAnterior, 1), periodEnd: dia(mesAnterior, 15), teamHours: 44, costAmount: 880, lines: [{ controlItemId: itemMao.id, teamHours: 44, costAmount: 880, evidenceRef: 'Diário de obras, quinzena 1' }], userId: ids.admin, notes: '1ª quinzena, revestimento' });
  await recordContractMeasurement(db, { contractId: obras.modelo.contrato, costCenterId: obras.modelo.id, measurementNumber: 1, periodStart: dia(mesAnterior, 1), periodEnd: dia(mesAnterior, 15), measuredAmount: 1250, userId: ids.admin, notes: '1ª medição, fundação e alvenaria' });

  // ---- recorrentes
  await chamar('/recorrentes', 'POST', { nome: 'Locação de plataforma elevatória', tipo: 'despesa', cost_center_id: obras.aurora.id, category_id: cats['Equipamentos'], favorecido: 'Locaplat Equipamentos', valor: 3800, dia_mes: 15, frequencia: 'mensal', total_parcelas: 6, inicio: mes }, t, 201);
  await chamar('/recorrentes', 'POST', { nome: 'Aluguel do canteiro', tipo: 'despesa', cost_center_id: obras.vista.id, category_id: cats['Serviços terceirizados'], favorecido: 'Engenharia Delta Projetos', valor: 2900, dia_mes: 5, frequencia: 'mensal', inicio: mes }, t, 201);
  await chamar('/recorrentes', 'POST', { nome: 'Vigilância noturna', tipo: 'despesa', cost_center_id: obras.aurora.id, category_id: cats['Serviços terceirizados'], favorecido: 'TransLog Fretes', valor: 5600, dia_mes: 25, frequencia: 'mensal', inicio: mes }, t, 201);

  // ---- fechamento: o mes anterior ao anterior fica fechado (para as telas de mes fechado e historico)
  const mesFechado = somarMeses(mes, -2);
  await chamar('/fechamento-mensal', 'POST', { ano: Number(mesFechado.slice(0, 4)), mes: Number(mesFechado.slice(5, 7)) }, t, 201);

  // ---- reports
  await chamar('/bug-reports', 'POST', { titulo: 'Botão Exportar não responde na lista', descricao: 'Ao clicar em Exportar CSV com filtro ativo nada acontece.', tipo: 'bug', severidade: 'media', tela: 'Lançamentos' }, tokens.gestor, 201);
  await chamar('/bug-reports', 'POST', { titulo: 'Sugestão: filtro por fornecedor nas obras', descricao: 'Seria útil filtrar os gastos da obra por fornecedor.', tipo: 'sugestao', severidade: 'baixa', tela: 'Obras' }, tokens.financeiro, 201);

  // ---- cobrancas (Worker de mentira): obras publicas, uma com NF emitida e vencida
  const publicas = (await db.query('SELECT id, public_id, code, name, client, responsible, contract_amount, project_status, end_date FROM cost_centers WHERE active = TRUE ORDER BY id')).rows;
  for (const o of publicas) {
    obrasNuvem.push({ publicId: o.public_id, code: o.code, name: o.name, client: o.client, responsible: o.responsible, contractAmount: Number(o.contract_amount || 0), projectStatus: o.project_status, endDate: o.end_date ? String(o.end_date).slice(0, 10) : null });
  }
  const pubDe = (id) => publicas.find((o) => o.id === id).public_id;
  const cobrar = async (obra, dados) => {
    const atual = (await chamar('/cloud-sync/cobrancas', 'GET', undefined, tokens.gestor)).items.find((i) => i.publicId === pubDe(obras[obra].id));
    await chamar(`/cloud-sync/cobrancas/${pubDe(obras[obra].id)}`, 'PUT', { ...atual, ...dados }, tokens.gestor, 200);
  };
  await cobrar('aurora', { financialStatus: 'aguardando_pagamento', invoiceNumber: 'NF 2.204', dueDate: dia(mesAnterior, 25), clientEmails: ['financeiro@aurora.example'], receivableAmount: 98400 });
  await cobrar('vista', { financialStatus: 'nf_emitida', invoiceNumber: 'NF 2.231', dueDate: dia(mes, Math.min(28, ult + 12)), clientEmails: ['contas@vistaverde.example'], receivableAmount: 210000 });
  await cobrar('galpao', { financialStatus: 'pago', invoiceNumber: 'NF 2.176', operationalStatus: 'finalizada', receivableAmount: 158000 });

  // Primeiro uso concluido; o historico da conta inicial passa a ser da Marina e a conta inicial sai da lista.
  await chamar('/first-use/complete', 'POST', {}, t, 200);
  await db.query('UPDATE audit_log SET user_id=$1, user_name=$2 WHERE user_id=1', [ids.admin, PESSOAS.admin.nome]);
  await db.query('UPDATE users SET active=FALSE, deleted_at=NOW() WHERE id=1');

  return {
    url, porta, tokens, ids, obras, forn, cats, mes, mesAnterior, mesFechado, hoje, instancia, PESSOAS,
    publicas, pubDe,
    chamar: (rota, metodo, corpo, quem = 'admin', esperado) => chamar(rota, metodo, corpo, tokens[quem], esperado),
    consulta: (sql, params) => db.query(sql, params),
    async fechar() {
      await new Promise((resolve) => servidor.close(resolve));
      servidor.closeAllConnections?.();
      await nuvem.fechar();
      await worker.fechar();
      await closeDatabase();
      if (!pasta) fs.rmSync(raizTemp, { recursive: true, force: true });
    },
  };
}

module.exports = { iniciar, PESSOAS };
