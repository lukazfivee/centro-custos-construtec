const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');

test('programação corporativa Windows abre a nuvem e não cria agenda isolada no PGlite', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'programacao-cloud-'));
  Object.assign(process.env, { DATABASE_URL: '', PGLITE_DATA_DIR: path.join(temp, 'db'), RESTORE_ROOT_DIR: path.join(temp, 'restore'),
    JWT_SECRET: 'programacao-cloud-secret-more-than-32-characters', ADMIN_INITIAL_PASSWORD: 'programacao-cloud-123',
    SYNC_API_URL: 'https://programacao.test' });
  const { initializeDatabase, closeDatabase, getDb } = require('../db');
  const { createApp } = require('../server');
  let local, upstream;
  const nativeFetch = global.fetch;
  t.after(async () => {
    global.fetch = nativeFetch;
    if (local) await new Promise((r) => local.close(r));
    if (upstream) await new Promise((r) => upstream.close(r));
    await closeDatabase();
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await initializeDatabase();
  const db = getDb(), calls = [];
  const admin = (await db.query("SELECT id FROM users WHERE role='admin' LIMIT 1")).rows[0].id;
  const add = async (name, role, cloud) => (await db.query(`INSERT INTO users(name,email,password_hash,role,suite_role,cloud_managed,cloud_session_token)
    VALUES($1,$2,'unused','supervisor',$3,$4,$5) RETURNING id`, [name, `${name}@test.local`, role, cloud, cloud ? `central-${name}` : null])).rows[0].id;
  const corporate = await add('gestor', 'gestor', true), tech = await add('tecnico', 'tecnico', true), engineering = await add('engenharia', 'engenharia', true);
  let handoffStatus = 200, handoffBody = { code: 'a'.repeat(43) };
  const remote = express(); remote.use(express.json());
  remote.post('/v1/auth/handoff', (req, res) => {
    calls.push({ authorization: req.get('Authorization'), body: req.body });
    res.status(handoffStatus).json(handoffBody);
  });
  upstream = remote.listen(0, '127.0.0.1');
  await new Promise((r) => upstream.once('listening', r));
  global.fetch = (input, options) => String(input).startsWith('https://programacao.test/')
    ? nativeFetch(String(input).replace('https://programacao.test', `http://127.0.0.1:${upstream.address().port}`), options)
    : nativeFetch(input, options);
  local = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => local.once('listening', r));
  const base = `http://127.0.0.1:${local.address().port}/api/programacao`;
  async function req(route, method = 'POST', body, uid = corporate, expected = 200) {
    const response = await nativeFetch(base + route, { method, headers: { Authorization: `Bearer ${jwt.sign({ sub: uid }, process.env.JWT_SECRET)}`,
      'content-type': 'application/json', Origin: 'https://untrusted.test' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
    return data;
  }
  await t.test('handoff usa sessão central nativa; destino e origem não vêm do cliente', async () => {
    assert.deepEqual(await req('/abrir-nuvem', 'POST', { url: 'https://untrusted.test', target: 'orcamentos' }),
      { url: `https://programacao.test/d/?programacao=1#handoff=${'a'.repeat(43)}` });
    assert.deepEqual(calls[0], { authorization: 'Bearer central-gestor', body: { target: 'centro-custos' } });
    assert.deepEqual(await req('/abrir-nuvem', 'POST', {}, tech), { url: `https://programacao.test/m/#handoff=${'a'.repeat(43)}` });
    await req('/abrir-nuvem', 'POST', {}, engineering, 403);
  });
  await t.test('bloqueia leituras e mutações corporativas locais sem gravar atividade', async () => {
    const body = { dia: '2026-10-15', centroId: 999, tecnicos: [tech], orientacao: 'Não gravar aqui', revision: 1, motivo: 'Cancelar' };
    for (const [method, route, uid] of [['GET', '?dia=2026-10-15', corporate], ['GET', '/opcoes', corporate], ['GET', '/1', corporate],
      ['POST', '', corporate], ['PUT', '/1', corporate], ['POST', '/1/cancelar', corporate], ['POST', '/1/atualizacoes', tech]]) {
      const data = await req(route, method, method === 'GET' ? undefined : body, uid, 409);
      assert.equal(data.codigo, 'PROGRAMACAO_NUVEM');
    }
    assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM daily_activities')).rows[0].total, 0);
  });
  await t.test('conta local e servidor cloud continuam usando seus dados atuais', async () => {
    assert.deepEqual(await req('/abrir-nuvem', 'POST', {}, admin), { url: null });
    assert.equal((await req('?dia=2026-10-15', 'GET', undefined, admin)).atividades.length, 0);
    const mode = db.mode;
    db.mode = 'postgres';
    try { assert.deepEqual(await req('/abrir-nuvem'), { url: null }); }
    finally { db.mode = mode; }
  });
  await t.test('falhas centrais e configuração insegura não viram agenda local nem expõem sessão', async () => {
    handoffStatus = 503; handoffBody = { error: 'Indisponível' };
    const failed = await req('/abrir-nuvem', 'POST', {}, corporate, 503);
    assert.equal(JSON.stringify(failed).includes('central-gestor'), false);
    handoffStatus = 200; handoffBody = { sessionToken: 'never-return-this' };
    const invalid = await req('/abrir-nuvem', 'POST', {}, corporate, 503);
    assert.equal(JSON.stringify(invalid).includes('never-return-this'), false);
    process.env.SYNC_API_URL = 'http://unsafe.test';
    await req('/abrir-nuvem', 'POST', {}, corporate, 503);
    process.env.SYNC_API_URL = 'https://user:password@programacao.test';
    await req('/abrir-nuvem', 'POST', {}, corporate, 503);
  });
});
