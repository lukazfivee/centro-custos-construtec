const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Builder, Browser, By, until } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');
const { startServer, stopServer, stopDriver, buildDriver, ADMIN_EMAIL, ADMIN_PASSWORD } = require('./helpers');

test('celular do tecnico: agenda, filtros, relato, rascunho e checklist no navegador', async () => {
  let ctx, driver;
  try {
    ctx = await startServer();
    const api = async (route, method, body, token) => {
      const response = await fetch(ctx.baseUrl + '/api' + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      assert.ok(response.ok, `${route}: ${JSON.stringify(data)}`);
      return data;
    };
    const admin = (await api('/auth/login', 'POST', { email: ADMIN_EMAIL, senha: ADMIN_PASSWORD })).token;
    await api('/usuarios', 'POST', { nome: 'Técnico Demonstração', email: 'tecnico@teste.local', senha: 'Tecnico@123456', role: 'supervisor' }, admin);
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const service = await api('/servicos', 'POST', { cliente: 'Condomínio Sol', valor: 1250, nome: 'Revisão da central de alarme', local: 'Bloco A · sala técnica', data: hoje, descricao: 'Vistoria inicial realizada.' }, admin);
    await api(`/servicos/${service.id}/checklist`, 'PUT', { itens: [{ texto: 'Testar alimentação', feito: true }, { texto: 'Revisar sensores' }] }, admin);
    await api(`/servicos/${service.id}/situacao`, 'PUT', { situacao: 'em_andamento' }, admin);
    if (process.env.E2E_BROWSER === 'edge') {
      const options = new edge.Options().addArguments('--headless=new', '--disable-gpu', '--no-first-run')
        .setMobileEmulation({ deviceMetrics: { width: 375, height: 812, pixelRatio: 1 } });
      driver = await new Builder().forBrowser(Browser.EDGE).setEdgeOptions(options).build();
    } else driver = await buildDriver();
    const screenshot = async (name) => {
      if (!process.env.E2E_SCREENSHOT_DIR) return;
      const dir = path.resolve(process.env.E2E_SCREENSHOT_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name + '.png'), await driver.takeScreenshot(), 'base64');
    };
    const find = (selector) => driver.findElement(By.css(selector));
    const wait = (selector) => driver.wait(until.elementLocated(By.css(selector)), 15000);
    await driver.get(ctx.baseUrl + '/m/');
    await wait('input[type=email]');
    await (await find('input[type=email]')).sendKeys('tecnico@teste.local');
    await (await find('input[type=password]')).sendKeys('Tecnico@123456');
    await (await find('button[type=submit]')).click();
    await wait('[data-exec]');
    assert.doesNotMatch(await (await find('#view')).getText(), /Resultado|Margem|Contratado/);
    for (const theme of ['claro', 'escuro']) {
      await driver.executeScript("document.documentElement.dataset.theme = arguments[0]", theme);
      await screenshot('inicio-' + theme);
      assert.ok(await driver.executeScript('return document.documentElement.scrollWidth <= window.innerWidth'), 'inicio sem rolagem horizontal');
    }
    await (await find('[data-tc-filtro="atrasados"]')).click();
    assert.equal((await driver.findElements(By.css('[data-exec]'))).length, 0);
    await (await find('[data-tc-filtro="hoje"]')).click();
    await (await find('#tc-busca')).sendKeys('condominio');
    assert.equal((await driver.findElements(By.css('[data-exec]'))).length, 1);
    await (await find('[data-exec]')).click();
    await wait('#sv-relato');
    for (const theme of ['claro', 'escuro']) {
      await driver.executeScript("document.documentElement.dataset.theme = arguments[0]", theme);
      await screenshot('execucao-' + theme);
      assert.ok(await driver.executeScript('return document.documentElement.scrollWidth <= window.innerWidth'), 'execucao sem rolagem horizontal');
    }
    await (await find('#sv-relato')).click();
    await wait('#sr-texto');
    await (await find('#sr-texto')).clear();
    const relato = 'Central testada. Todos os sensores responderam.';
    await (await find('#sr-texto')).sendKeys(relato);
    await driver.wait(async () => (await (await find('#sr-status')).getText()).includes('Rascunho salvo'), 5000);
    await driver.navigate().refresh();
    await wait('[data-exec]');
    await (await find('[data-exec]')).click();
    await wait('#sv-relato');
    await (await find('#sv-relato')).click();
    await wait('#sr-texto');
    assert.equal(await (await find('#sr-texto')).getAttribute('value'), relato, 'rascunho recuperado apos recarregar');
    await (await find('#sr-salvar')).click();
    await driver.wait(async () => (await (await find('#view')).getText()).includes(relato), 10000);
    assert.equal((await api(`/servicos/${service.id}`, 'GET', undefined, admin)).descricao, relato);
    await (await find('[data-item][aria-checked="false"]')).click();
    await driver.wait(async () => (await api(`/servicos/${service.id}`, 'GET', undefined, admin)).checklist.every((i) => i.feito), 10000);
    await wait('#sv-relato');
    assert.equal((await driver.findElements(By.css('[data-fase][capture="environment"]'))).length, 2, 'camera traseira antes/depois');
    const photo = path.join(process.env.PGLITE_DATA_DIR, 'foto-campo.png');
    fs.writeFileSync(photo, await driver.takeScreenshot(), 'base64');
    await (await find('[data-fase="antes"]:not([capture])')).sendKeys(photo);
    await wait('#sf-legenda');
    await (await find('#sf-legenda')).sendKeys('Central antes do reparo');
    await screenshot('foto-legenda');
    await (await find('#sf-enviar')).click();
    await driver.wait(async () => (await api(`/servicos/${service.id}`, 'GET', undefined, admin)).fotos.some((f) => f.legenda === 'Central antes do reparo'), 10000);
  } finally {
    await stopDriver(driver);
    if (ctx) await stopServer(ctx);
  }
});
