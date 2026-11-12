const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

test('Programação diária: autorização, histórico e concorrência por participante via HTTP', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-programacao-'));
  Object.assign(process.env, { DATABASE_URL: '', PGLITE_DATA_DIR: path.join(temp, 'db'), RESTORE_ROOT_DIR: path.join(temp, 'restore'),
    JWT_SECRET: 'programacao-secret-at-least-32-characters', ADMIN_INITIAL_PASSWORD: 'programacao-123' });
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  const { createApp } = require('../server');
  let server;
  t.after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await closeDatabase();
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await initializeDatabase();
  const db = getDb();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/programacao`;
  const adminId = (await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows[0].id;
  async function user(name, role = 'tecnico', active = true) {
    return (await db.query(`INSERT INTO users(name,email,password_hash,role,suite_role,active)
      VALUES($1,$2,'unused','supervisor',$3,$4) RETURNING id`, [name, `${name}@test.local`, role, active])).rows[0].id;
  }
  const a = await user('Ana'), b = await user('Beto'), c = await user('Caio');
  const engineer = await user('Engenharia', 'engenharia'), inactive = await user('Inativo', 'tecnico', false);
  async function center(code, kind = 'obra', active = true) {
    return (await db.query(`INSERT INTO cost_centers(code,name,kind,active,contract_amount,client,public_id)
      VALUES($1,$1,$2,$3,12345,'Cliente',$4) RETURNING id`, [code, kind, active, randomUUID()])).rows[0].id;
  }
  const obra = await center('OB-P1'), servico = await center('SV-P1', 'servico'), off = await center('OB-OFF', 'obra', false);
  await db.query('INSERT INTO service_jobs(cost_center_id) VALUES($1)', [servico]);
  const token = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET);
  async function req(url = '', method = 'GET', body, expected = 200, uid = adminId) {
    const r = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token(uid)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    assert.equal(r.status, expected, `${method} ${url}: ${text}`);
    return r.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
  }
  const body = (centroId = obra, tecnicos = [a, b], dia = '2020-01-02') => ({ dia, centroId, tecnicos, orientacao: 'Instalar equipamentos', ordem: 1 });
  const update = (estado = 'em_andamento', revision = 1, observacao = 'Em execução') => ({ estado, revision, observacao, clientId: randomUUID() });
  let activity, knownOperation;
  await t.test('cria equipes, acesso persistente e projeção segura sem diretório global', async () => {
    const options = await req('/opcoes?dia=2020-01-02');
    assert.deepEqual(options.tecnicos.map((u) => u.nome).sort(), ['Ana', 'Beto', 'Caio']);
    assert.equal(options.centros.length, 2);
    await req('/opcoes?dia=2020-01-02', 'GET', undefined, 403, a);
    await req('', 'POST', body(), 403, a);
    await req('', 'POST', body(off), 400);
    await req('', 'POST', body(obra, [engineer]), 400);
    await req('', 'POST', body(obra, [inactive]), 400);
    await req('', 'POST', body(obra, []), 400);
    await req('', 'POST', body(obra, [a], '2020-02-31'), 400);
    activity = await req('', 'POST', body(), 201);
    await db.query('INSERT INTO user_cost_centers(user_id,cost_center_id) VALUES($1,$2)', [c, obra]);
    assert.equal(activity.revision, 1);
    assert.deepEqual(activity.participantes.map((p) => [p.id, p.estado, p.revision, p.ativo]), [[a, 'pendente', 1, true], [b, 'pendente', 1, true]]);
    const list = await req('?dia=2020-01-02', 'GET', undefined, 200, a);
    assert.equal(list.atividades.length, 1);
    assert.equal(list.atividades[0].centro.tipo, 'obra');
    assert.equal(JSON.stringify(list).includes('12345'), false);
    assert.equal((await req('?dia=2020-01-02', 'GET', undefined, 200, c)).atividades.length, 0);
    await req(`/${activity.id}`, 'GET', undefined, 404, c);
    await req(`/${activity.id}`, 'GET', undefined, 403, engineer);
    assert.equal((await req('/opcoes?dia=2020-01-02')).tecnicos.find((u) => u.id === a).programado, true);
  });
  if (!activity) return;
  await t.test('progresso separado, identidade da sessão, repetição e conflitos sem eventos duplicados', async () => {
    const op = update('pausado', 1, 'Falta acabamento');
    knownOperation = op;
    const first = await req(`/${activity.id}/atualizacoes`, 'POST', { ...op, usuarioId: b }, 200, a);
    assert.equal(first.participantes.find((p) => p.id === a).estado, 'pausado');
    assert.equal(first.participantes.find((p) => p.id === b).estado, 'pendente');
    assert.equal(first.revision, 1);
    const repeated = await req(`/${activity.id}/atualizacoes`, 'POST', op, 200, a);
    assert.equal(repeated.eventos.filter((e) => e.tipo === 'andamento').length, 1);
    assert.ok((await req(`/${activity.id}`, 'GET', undefined, 200, b)).eventos.some((e) => e.nome === 'Ana' && e.observacao === 'Falta acabamento'));
    await req(`/${activity.id}/atualizacoes`, 'POST', { ...op, observacao: 'Reutilização inválida' }, 409, a);
    await req(`/${activity.id}/atualizacoes`, 'POST', update(), 409, a);
    await req(`/${activity.id}/atualizacoes`, 'POST', update(), 200, b);
    const resumed = await req(`/${activity.id}/atualizacoes`, 'POST', update('em_andamento', 2, 'Retomei'), 200, a);
    assert.ok(resumed.eventos.some((e) => e.observacao === 'Falta acabamento' && e.nome === 'Ana'));
    assert.equal(resumed.eventos.filter((e) => e.tipo === 'andamento').length, 3);
    await req(`/${activity.id}/atualizacoes`, 'POST', update(), 403);
    await req(`/${activity.id}/atualizacoes`, 'POST', { ...update('invalido', 3) }, 400, a);
    await req(`/${activity.id}/atualizacoes`, 'POST', { ...update('pendente', 3), clientId: 'bad' }, 400, a);
    const future = await req('', 'POST', body(obra, [a], '2099-01-01'), 201);
    await req(`/${future.id}/atualizacoes`, 'POST', update(), 400, a);
    const other = await req('', 'POST', body(obra, [a]), 201);
    await req(`/${other.id}/atualizacoes`, 'POST', op, 409, a);
    const same = update('concluido', 3);
    const results = await Promise.all([req(`/${activity.id}/atualizacoes`, 'POST', same, 200, a), req(`/${activity.id}/atualizacoes`, 'POST', same, 200, a)]);
    assert.equal(results[1].eventos.filter((e) => e.tipo === 'andamento').length, 4);
  });
  await t.test('editar instrução e equipe preserva histórico e não restaura vínculo revogado', async () => {
    await db.query('DELETE FROM user_cost_centers WHERE user_id=$1 AND cost_center_id=$2', [a, obra]);
    await req(`/${activity.id}`, 'GET', undefined, 404, a);
    await req(`/${activity.id}/atualizacoes`, 'POST', update('pendente', 4), 404, a);
    await req(`/${activity.id}/atualizacoes`, 'POST', knownOperation, 404, a);
    assert.equal((await req('?dia=2020-01-02', 'GET', undefined, 200, a)).atividades.length, 0);
    const edit = { ...body(), revision: 1, orientacao: 'Orientação corrigida' };
    let edited = await req(`/${activity.id}`, 'PUT', edit);
    assert.ok(edited.eventos.some((e) => e.tipo === 'instrucao' && e.observacao.includes('Instalar equipamentos')));
    await req(`/${activity.id}`, 'PUT', edit, 409);
    await req(`/${activity.id}`, 'GET', undefined, 404, a);
    await req(`/${activity.id}`, 'PUT', { ...edit, revision: 2, dia: '2020-01-03' }, 400);
    edited = await req(`/${activity.id}`, 'PUT', { ...edit, revision: 2, tecnicos: [b] });
    assert.equal(edited.participantes.find((p) => p.id === a).ativo, false);
    assert.equal(edited.eventos.filter((e) => e.tipo === 'andamento').length, 4);
    edited = await req(`/${activity.id}`, 'PUT', { ...edit, revision: 3 });
    assert.equal(edited.participantes.find((p) => p.id === a).revision, 4);
    await req(`/${activity.id}`, 'GET', undefined, 200, a);
    await req(`/${activity.id}`, 'PUT', { ...edit, revision: 4, tecnicos: [a] });
    await req(`/${activity.id}`, 'GET', undefined, 404, b);
    await req(`/${activity.id}/atualizacoes`, 'POST', update('pendente', 2), 404, b);
    assert.equal((await db.query('SELECT 1 FROM user_cost_centers WHERE user_id=$1 AND cost_center_id=$2', [b, obra])).rows.length, 1);
    activity = await req(`/${activity.id}`);
  });
  await t.test('cópia preserva origem, reinicia progresso, cancela sem apagar; execução do serviço é independente', async () => {
    const copied = await req('', 'POST', { ...body(obra, [a], '2020-01-04'), origemId: activity.id }, 201);
    assert.equal(copied.origemId, activity.id);
    assert.equal(copied.participantes[0].estado, 'pendente');
    assert.equal((await req(`/${activity.id}`)).dia, '2020-01-02');
    await req('', 'POST', { ...body(servico), origemId: activity.id }, 400);
    await req('', 'POST', { ...body(), origemId: activity.id }, 400);
    const canceled = await req(`/${activity.id}/cancelar`, 'POST', { revision: activity.revision, motivo: 'Destino indisponível' });
    assert.equal(canceled.cancelada, true);
    assert.equal(canceled.motivoCancelamento, 'Destino indisponível');
    const visible = await req(`/${activity.id}`, 'GET', undefined, 200, a);
    assert.equal(visible.eventos.filter((e) => e.tipo === 'andamento').length, 4);
    await req(`/${activity.id}/atualizacoes`, 'POST', update('pendente', 4), 409, a);
    await req(`/${activity.id}`, 'PUT', { ...body(), revision: canceled.revision }, 409);
    const service = await req('', 'POST', body(servico, [a]), 201);
    await req(`/${service.id}/atualizacoes`, 'POST', update('concluido'), 200, a);
    assert.equal((await db.query('SELECT status FROM service_jobs WHERE cost_center_id=$1', [servico])).rows[0].status, 'agendado');
    const multi = await req('?dia=2020-01-02', 'GET', undefined, 200, a);
    assert.ok(multi.atividades.some((x) => x.centro.tipo === 'obra') && multi.atividades.some((x) => x.centro.tipo === 'servico'));
    assert.ok((await db.query("SELECT 1 FROM audit_log WHERE entity_type='programacao' LIMIT 1")).rows.length);
    await assert.rejects(db.query('DELETE FROM cost_centers WHERE id=$1', [obra]), /foreign key/);
  });
  await t.test('virada UTC respeita a data civil de Brasília e preserva canceladas na lista', async (context) => {
    const now = await req('', 'POST', body(obra, [c], '2026-10-15'), 201);
    const tomorrow = await req('', 'POST', body(obra, [c], '2026-10-16'), 201);
    context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T01:30:00Z') });
    try {
      assert.equal((await req('', 'GET', undefined, 200, c)).dia, '2026-10-15');
      await req(`/${now.id}/atualizacoes`, 'POST', update(), 200, c);
      await req(`/${tomorrow.id}/atualizacoes`, 'POST', update(), 400, c);
    } finally { context.mock.timers.reset(); }
    assert.ok((await req('?dia=2020-01-02', 'GET', undefined, 200, a)).atividades.some((x) => x.id === activity.id && x.cancelada));
  });
  await t.test('colisão concorrente no UUID reverte todo o progresso e informa conflito', async () => {
    const first = await req('', 'POST', body(obra, [c]), 201);
    const second = await req('', 'POST', body(obra, [c]), 201);
    const operation = update();
    await req(`/${first.id}/atualizacoes`, 'POST', operation, 200, c);
    const user = (await db.query('SELECT * FROM users WHERE id=$1', [c])).rows[0];
    // Simula a leitura anterior ao commit concorrente; a unicidade e o rollback são reais.
    const concurrentSnapshot = { transaction: (fn) => db.transaction((tx) => fn({
      ...tx, query: (sql, args) => sql.startsWith('SELECT activity_id,request_payload FROM daily_events')
        ? Promise.resolve({ rows: [] }) : tx.query(sql, args),
    })) };
    await assert.rejects(require('../services/programacao/progress').update(concurrentSnapshot, second.id, operation, user),
      (error) => error.statusCode === 409);
    const preserved = await req(`/${second.id}`);
    assert.equal(preserved.participantes[0].revision, 1);
    assert.equal(preserved.participantes[0].estado, 'pendente');
    assert.equal(preserved.eventos.filter((e) => e.tipo === 'andamento').length, 0);
  });
});
