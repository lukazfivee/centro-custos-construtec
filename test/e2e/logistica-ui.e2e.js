const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { By, until } = require('selenium-webdriver');
const { startServer, stopServer, buildDriver, stopDriver, ADMIN_EMAIL, ADMIN_PASSWORD } = require('./helpers');

test('logística: troca de seção mantém o foco e cabe na largura estreita', async () => {
  const ctx = await startServer();
  let driver;
  try {
    driver = await buildDriver();
    await driver.get(ctx.baseUrl + '/m/');
    await driver.wait(until.elementLocated(By.css('input[type=email]')), 10000);
    await driver.findElement(By.css('input[type=email]')).sendKeys(ADMIN_EMAIL);
    await driver.findElement(By.css('input[type=password]')).sendKeys(ADMIN_PASSWORD);
    await driver.findElement(By.css('button[type=submit]')).click();
    await driver.wait(until.elementLocated(By.css('#home-mais')), 10000);

    await driver.get(ctx.baseUrl + '/d/#/logistica');
    await driver.wait(until.elementLocated(By.css('.logi-abas [data-aba="ferramentas"]')), 10000);
    await driver.findElement(By.css('.logi-abas [data-aba="ferramentas"]')).click();
    await driver.wait(async () => driver.executeScript('return document.activeElement?.dataset.aba === "ferramentas"'), 10000);
    assert.equal(await driver.executeScript('return document.activeElement?.getAttribute("aria-current")'), 'page');

    await driver.manage().window().setRect({ width: 760, height: 844 });
    const widths = await driver.executeScript('const el=document.querySelector(".logi-pagina");return [el.clientWidth,el.scrollWidth]');
    assert.ok(widths[0] >= 300, `área útil estreita demais para a interface desktop: ${widths[0]}px`);
    const overflow = await driver.executeScript('return [...document.querySelectorAll(".logi-pagina *")].filter(e=>e.scrollWidth>e.clientWidth+2).slice(0,12).map(e=>[e.tagName,e.className,e.clientWidth,e.scrollWidth])');
    assert.ok(widths[1] <= widths[0], `logística extrapolou o contêiner: ${widths.join(' / ')}; ${JSON.stringify(overflow)}`);
    if (process.env.E2E_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.E2E_SCREENSHOT_DIR, 'logistica-desktop-760.png'), await driver.takeScreenshot(), 'base64');
    }
  } finally {
    await stopDriver(driver);
    await stopServer(ctx);
  }
});
