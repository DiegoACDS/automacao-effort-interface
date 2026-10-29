const fs = require('fs');
const path = require('path');
const seletores = require('./seletores');
const { pastaBaseRelatorios } = require('../main/configuracoes');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Textos que só aparecem na tela principal do Effort.
const INDICADORES_DESKTOP = [
  'maintenance management',
  'work orders',
  'open work order',
  'gestão da manutenção',
  'ordens de serviço',
  'abrir ordem de serviço'
];

async function textoDaPagina(page) {
  try {
    return await page.locator('body').innerText({ timeout: 3000 });
  } catch {
    return '';
  }
}

async function estaNoDesktop(page) {
  if (page.url().toLowerCase().includes('/ui/base/desktop.aspx')) return true;

  const menu = await page.locator(seletores.menu.ordensServico).count().catch(() => 0);
  if (menu > 0) return true;

  const texto = (await textoDaPagina(page)).toLowerCase();
  return INDICADORES_DESKTOP.some((indicador) => texto.includes(indicador));
}

function estaNaSessaoAberta(page) {
  const url = page.url().toLowerCase();
  return url.includes('sessaoaberta') || url.includes('sessao_aberta');
}

// Tela de "sessão já aberta": libera ou continua.
async function tratarSessaoAberta(page) {
  if (!estaNaSessaoAberta(page)) return;

  console.log('[LOGIN] Tela de sessão existente detectada.');

  const liberar = page.locator(seletores.sessao.liberar).first();
  if (await liberar.isVisible().catch(() => false)) {
    await liberar.click();
    await esperar(800);
  }

  const continuar = page.locator(seletores.sessao.continuar).first();
  if (await continuar.isVisible().catch(() => false)) {
    await continuar.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await esperar(800);
  }
}

// Aguarda a tela principal aparecer, em vez de verificar uma única vez.
async function aguardarDesktop(page, timeout = 45000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    await tratarSessaoAberta(page);
    if (await estaNoDesktop(page)) return true;
    await esperar(500);
  }
  return false;
}

// Salva captura e texto da tela para diagnóstico. A senha nunca entra aqui,
// porque innerText não inclui o valor dos campos.
async function salvarDiagnostico(page, nome) {
  try {
    const pasta = path.join(pastaBaseRelatorios(), 'Relatórios', 'diagnosticos');
    fs.mkdirSync(pasta, { recursive: true });

    const marca = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(pasta, `${marca}_${nome}`);

    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    const texto = await textoDaPagina(page);
    fs.writeFileSync(`${base}.txt`, `URL: ${page.url()}\n\n${texto}`, 'utf8');

    return `${base}.png`;
  } catch {
    return '';
  }
}

// A senha nunca entra em mensagens de erro nem em logs.
async function fazerLogin(page, { usuario, senha }) {
  console.log('[LOGIN] Acessando a tela de login.');
  await page.goto(seletores.url.login, { waitUntil: 'domcontentloaded' });
  await esperar(800);
  await tratarSessaoAberta(page);

  if (await estaNoDesktop(page)) {
    console.log('[LOGIN] Sessão já ativa.');
    return;
  }

  console.log('[LOGIN] Preenchendo usuário e senha.');
  const campoUsuario = page.locator(seletores.login.usuario).first();
  await campoUsuario.waitFor({ state: 'visible', timeout: 30000 });
  await campoUsuario.fill(usuario);
  await page.locator(seletores.login.senha).first().fill(senha);

  console.log('[LOGIN] Clicando em Entrar.');
  await page.locator(seletores.login.botao).first().click();

  const confirmado = await aguardarDesktop(page, 45000);

  if (!confirmado) {
    const captura = await salvarDiagnostico(page, 'login-nao-confirmado');
    const texto = (await textoDaPagina(page)).replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(
      `Login não confirmado. URL: ${page.url()}. ` +
      `Texto da tela: "${texto || 'vazio'}". ` +
      `Diagnóstico salvo em: ${captura || 'não foi possível salvar'}`
    );
  }

  console.log('[LOGIN] Login confirmado.');
}

module.exports = { fazerLogin, estaNoDesktop };