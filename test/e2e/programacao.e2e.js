const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Builder, Browser, By, until } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');
const { startServer, stopServer, stopDriver, buildDriver, ADMIN_EMAIL, ADMIN_PASSWORD } = require('./helpers');

test('programação: escritório escala equipe, técnicos registram separadamente e acompanham os colegas', async () => {
  let ctx, driver;
  try {
    ctx = await startServer();
    const api = async (route, method = 'GET', body, token = admin) => {
      const response = await fetch(ctx.baseUrl + '/api' + route, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      assert.ok(response.ok, `${method} ${route}: ${JSON.stringify(data)}`);
      return data;
    };
    const admin = (await api('/auth/login', 'POST', { email: ADMIN_EMAIL, senha: ADMIN_PASSWORD }, '')).token;
    for (const nome of ['Deco', 'André']) await api('/usuarios', 'POST', { nome, email: `${nome === 'Deco' ? 'deco' : 'andre'}@teste.local`, senha: 'Tecnico@123456', role: 'supervisor' });
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const amanha = new Date(Date.parse(hoje + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const servico = await api('/servicos', 'POST', { cliente: 'CEMED Ondina', nome: 'Câmeras da recepção', valor: 3500, data: hoje });
    const obra = await api('/centros-custo', 'POST', { codigo: 'OB-PG', nome: 'Hospital ortopédico', situacao: 'execucao' });
    const options = await api('/programacao/opcoes?dia=' + hoje);
    const deco = options.tecnicos.find((u) => u.nome === 'Deco').id;
    const andre = options.tecnicos.find((u) => u.nome === 'André').id;
    if (process.env.E2E_BROWSER === 'edge') {
      driver = await new Builder().forBrowser(Browser.EDGE).setEdgeOptions(new edge.Options()
        .addArguments('--headless=new', '--disable-gpu', '--no-first-run')
        .setMobileEmulation({ deviceMetrics: { width: 375, height: 812, pixelRatio: 1 } })).build();
    } else driver = await buildDriver();
    const find = (selector) => driver.findElement(By.css(selector));
    async function wait(selector) {
      const el = await driver.wait(until.elementLocated(By.css(selector)), 15000);
      await driver.wait(until.elementIsVisible(el), 10000);
      await driver.wait(until.elementIsEnabled(el), 10000);
      return el;
    }
    async function click(selector) {
      const el = await wait(selector);
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
      await el.click();
    }
    async function screenshot(name) {
      if (!process.env.E2E_SCREENSHOT_DIR) return;
      const dir = path.resolve(process.env.E2E_SCREENSHOT_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name + '.png'), await driver.takeScreenshot(), 'base64');
    }
    async function login(email, password, office = false) {
      await driver.get(ctx.baseUrl + '/m/');
      await driver.executeScript('CC.session.clear()');
      await driver.navigate().refresh();
      await wait('input[type=email]');
      for (const [selector, value] of [['input[type=email]', email], ['input[type=password]', password]]) {
        await (await find(selector)).clear();
        await (await find(selector)).sendKeys(value);
      }
      await click('button[type=submit]');
      await wait(office ? '#home-mais' : '#pg-trabalhos');
    }
    async function setDate(selector, value) {
      await driver.executeScript('const el=arguments[0];el.value=arguments[1];el.dispatchEvent(new Event("change",{bubbles:true}))', await find(selector), value);
    }
    async function create(centroId, technicians, text, order) {
      await click('[data-pe-new]');
      await wait('[data-pe-center]');
      await wait(`[data-pe-center] option[value="${centroId}"]`);
      await (await find(`[data-pe-center] option[value="${centroId}"]`)).click();
      await (await find('[data-pe-orientation]')).sendKeys(text);
      const ordem = await find('input[name=ordem]'); await ordem.clear(); await ordem.sendKeys(String(order));
      for (const id of technicians) await click(`input[name=tecnicos][value="${id}"]`);
      await click('[data-pe-save]');
      await driver.wait(async () => (await api('/programacao?dia=' + hoje)).atividades.some((a) => a.orientacao === text), 10000);
      await driver.wait(async () => !(await driver.findElements(By.css('[data-pe-form]'))).length, 10000);
    }
    await login(ADMIN_EMAIL, ADMIN_PASSWORD, true);
    await driver.get(ctx.baseUrl + '/d/?programacao=1');
    await wait('[data-pe-new]');
    await create(servico.id, [deco, andre], 'Colocar as cinco câmeras restantes para funcionar', 1);
    await create(obra.id, [deco], 'Procurar Mauro e vistoriar a chamada de enfermagem', 2);
    const activities = (await api('/programacao?dia=' + hoje)).atividades;
    const cameras = activities.find((a) => a.centro.id === servico.id);
    const hospital = activities.find((a) => a.centro.id === obra.id);
    assert.equal(cameras.participantes.length, 2);
    await screenshot('programacao-escritorio');

    async function update(activityId, userId, state, note) {
      await click(`[data-pg-estado="${state}"]`);
      const input = await find('#pg-observacao'); await input.clear(); await input.sendKeys(note);
      await click('#pg-salvar');
      await driver.wait(async () => {
        const a = await api('/programacao/' + activityId);
        return a.participantes.find((u) => u.id === userId).estado === state && a.eventos.some((e) => e.observacao === note);
      }, 10000);
      await wait('#pg-salvar');
    }
    await login('deco@teste.local', 'Tecnico@123456');
    assert.equal((await driver.findElements(By.css('[data-pg-atividade]'))).length, 2);
    assert.doesNotMatch(await (await find('#view')).getText(), /R\$|Orçado|Margem|Lançar despesa/);
    for (const theme of ['claro', 'escuro']) {
      await driver.executeScript('document.documentElement.dataset.theme=arguments[0]', theme);
      assert.ok(await driver.executeScript('return document.documentElement.scrollWidth<=window.innerWidth'));
      await screenshot('meu-dia-' + theme);
    }
    await click(`[data-pg-atividade="${cameras.id}"]`);
    await update(cameras.id, deco, 'em_andamento', 'Três câmeras funcionando.');
    assert.equal((await api('/programacao/' + cameras.id)).participantes.find((u) => u.id === andre).estado, 'pendente');

    await login('andre@teste.local', 'Tecnico@123456');
    assert.equal((await driver.findElements(By.css('[data-pg-atividade]'))).length, 1);
    await click(`[data-pg-atividade="${cameras.id}"]`);
    await wait('.pg-timeline');
    assert.match(await (await find('.pg-timeline')).getText(), /Deco|Três câmeras funcionando/);
    await update(cameras.id, andre, 'em_andamento', 'Conferindo as conexões.');
    await update(cameras.id, andre, 'pausado', 'Aguardando cabo para duas câmeras.');
    assert.equal((await api('/programacao/' + cameras.id)).participantes.find((u) => u.id === deco).estado, 'em_andamento');
    await screenshot('andamentos-individuais');

    await login('deco@teste.local', 'Tecnico@123456');
    await click(`[data-pg-atividade="${cameras.id}"]`);
    await wait('.pg-timeline');
    assert.match(await (await find('.pg-timeline')).getText(), /Aguardando cabo para duas câmeras/);
    await update(cameras.id, deco, 'pausado', 'Pausa para a vistoria no hospital.');
    await click('#pg-voltar');
    await click(`[data-pg-atividade="${hospital.id}"]`);
    await update(hospital.id, deco, 'em_andamento', 'Vistoria iniciada com Mauro.');
    assert.equal((await api('/servicos/' + servico.id)).situacao, 'agendado', 'atividade diária não inicia nem conclui o serviço inteiro');

    await login(ADMIN_EMAIL, ADMIN_PASSWORD, true);
    await driver.get(ctx.baseUrl + '/d/#/programacao');
    await click(`[data-pe-detail="${cameras.id}"]`);
    await wait('[data-pe-detail-panel]');
    assert.match(await (await find('[data-pe-detail-panel]')).getText(), /Três câmeras funcionando/);
    await click('[data-pe-copy]');
    await wait('[data-pe-date]');
    await setDate('[data-pe-date]', amanha);
    await wait('[data-pe-save]');
    await click('[data-pe-save]');
    await driver.wait(async () => (await api('/programacao?dia=' + amanha)).atividades.some((a) => a.origemId === cameras.id), 10000);
    const copy = (await api('/programacao?dia=' + amanha)).atividades.find((a) => a.origemId === cameras.id);
    assert.ok(copy.participantes.every((u) => u.estado === 'pendente'));
    assert.ok((await api('/programacao/' + cameras.id)).eventos.length >= 4, 'histórico anterior preservado');
    await screenshot('programacao-outro-dia');
  } finally {
    await stopDriver(driver);
    if (ctx) await stopServer(ctx);
  }
});
