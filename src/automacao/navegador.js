const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function pastaNavegadores() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'browsers')
    : path.join(__dirname, '..', '..', 'browsers');
}

// Usa o Chromium empacotado quando existir. Em desenvolvimento, sem a pasta,
// o Playwright usa o navegador instalado por "npx playwright install chromium".
async function abrirNavegador({ headless = false } = {}) {
  const pasta = pastaNavegadores();
  if (app.isPackaged || fs.existsSync(pasta)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = pasta;
  }

  const { chromium } = require('playwright');

  let browser;
  try {
    browser = await chromium.launch({
      headless,
      args: ['--start-maximized', '--disable-notifications']
    });
  } catch (erro) {
    throw new Error(
      'Não foi possível abrir o Chromium. Rode "npx playwright install chromium" ' +
      `e tente novamente. Detalhe: ${erro.message.split('\n')[0]}`
    );
  }

  const context = await browser.newContext({
    viewport: null,
    acceptDownloads: true,
    ignoreHTTPSErrors: true
  });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(45000);

  const page = await context.newPage();
  return { browser, context, page };
}

module.exports = { abrirNavegador };