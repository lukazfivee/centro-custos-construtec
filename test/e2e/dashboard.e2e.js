// Guarda de regressão para a classe de bug que afetou a produção em
// 2026-09-17 (Service Worker obsoleto quebrando o carregamento do painel
// financeiro): navega por todas as seções principais e falha o teste se
// QUALQUER erro aparecer no console do navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const { By, until } = require('selenium-webdriver');
const { startServer, stopServer, buildDriver, stopDriver, login, collectConsoleErrors, assertLocalUiTraffic } = require('./helpers');

const SECTIONS = [
  'dashboard', 'lancamentos', 'centros', 'categorias', 'fornecedores',
  'config', 'recorrentes', 'bugreports', 'usuarios',
];

test('E2E painel financeiro: carrega os KPIs sem erro de console', async (t) => {
  const ctx = await startServer();
  const driver = await buildDriver();
  try {
    await login(driver, ctx.baseUrl);
    // A tela inicial já contém R$ estático; abre a view e espera os dados reais.
    await driver.findElement(By.css('.nav-item[data-view="dashboard"]')).click();
    await assertLocalUiTraffic(driver, ctx, t);
    await driver.wait(async () => {
      try {
        const receitas = await driver.findElement(By.id('kpi-receitas')).getText();
        const saldo = await driver.findElement(By.id('kpi-saldo')).getText();
        return /R\$/.test(receitas) && /R\$/.test(saldo);
      } catch { return false; } // O carregamento substitui temporariamente o grid.
    }, 10000, 'KPIs devem renderizar valores monetários após a resposta real.');

    const receitas = await driver.findElement(By.id('kpi-receitas')).getText();
    const saldo = await driver.findElement(By.id('kpi-saldo')).getText();
    assert.match(receitas, /R\$/, 'KPI de receitas deve mostrar um valor monetário');
    assert.match(saldo, /R\$/, 'KPI de saldo deve mostrar um valor monetário');

    const errors = await collectConsoleErrors(driver);
    if (errors !== null) {
      assert.deepEqual(errors.map((e) => e.message), [], 'não deve haver erros de console ao carregar o painel');
    }
  } finally {
    await stopDriver(driver);
    await stopServer(ctx);
  }
});

test('E2E navegação: todas as seções principais abrem sem erro de console', async (t) => {
  const ctx = await startServer();
  const driver = await buildDriver();
  try {
    await login(driver, ctx.baseUrl);
    await driver.wait(until.elementLocated(By.id('kpi-receitas')), 10000);

    for (const section of SECTIONS) {
      const nav = await driver.findElement(By.css(`.nav-item[data-view="${section}"]`));
      await nav.click();
      await driver.wait(until.elementIsVisible(driver.findElement(By.id(`view-${section}`))), 10000);
      // Pequena pausa para as chamadas assíncronas de carregamento da view concluírem.
      await driver.sleep(300);
    }

    await assertLocalUiTraffic(driver, ctx, t);
    const errors = await collectConsoleErrors(driver);
    if (errors !== null) {
      assert.deepEqual(
        errors.map((e) => e.message),
        [],
        `não deve haver erros de console ao navegar por: ${SECTIONS.join(', ')}`
      );
    }
  } finally {
    await stopDriver(driver);
    await stopServer(ctx);
  }
});
