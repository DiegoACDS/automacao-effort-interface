const seletores = require('./seletores');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizarCodigo(codigo) {
  return String(codigo || '').toUpperCase().replace(/\s+/g, '').trim();
}

async function voltarParaInicio(page) {
  await page.goto(seletores.url.desktop, { waitUntil: 'domcontentloaded' });
  await esperar(800);
}

async function abrirMenuAbrirOs(page) {
  const menu = page.locator(seletores.menu.ordensServico).first();
  await menu.waitFor({ state: 'visible', timeout: 30000 });

  const submenu = menu.locator('ul.secondLevel').first();
  if (!(await submenu.isVisible().catch(() => false))) {
    console.log('[OS] Expandindo o menu Ordens de Serviço.');
    await menu
      .locator(':scope > .cont_li')
      .click()
      .catch(() => menu.click({ force: true }));
    await esperar(700);
  }
  await submenu.waitFor({ state: 'visible', timeout: 30000 });

  console.log('[OS] Clicando em Abrir Ordem de Serviço.');
  await menu
    .locator('ul.secondLevel > li.itemMenu')
    .filter({ hasText: seletores.menu.abrirOs })
    .first()
    .locator('a')
    .click();
}

// Abre o formulário de nova OS. Não clica em Abrir OS.
async function abrirFormularioNovaOs(page, timeout = 30000) {
  await abrirMenuAbrirOs(page);

  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    const frame = page
      .frames()
      .find((f) => /frmos_novo\.aspx/i.test(f.url()));
    if (frame) {
      await frame
        .locator(seletores.os.campoEquipamento)
        .first()
        .waitFor({ state: 'visible', timeout });
      console.log('[OS] Formulário de nova OS carregado.');
      return frame;
    }
    await esperar(300);
  }

  const urls = page.frames().map((f) => f.url());
  throw new Error(
    'O formulário de nova OS não foi carregado. ' +
    `Frames encontrados: ${urls.join(' | ')}`
  );
}

// Lê o código (valor da opção) e a descrição (texto da opção) selecionados.
async function lerEquipamentoSelecionado(frame) {
  return frame
    .locator(seletores.os.cboEquipamento)
    .first()
    .evaluate((el) => {
      const opcao = el.options[el.selectedIndex];
      return {
        valor: (el.value || '').trim(),
        texto: opcao ? opcao.textContent.trim() : ''
      };
    })
    .catch(() => ({ valor: '', texto: '' }));
}

// Espera o campo mostrar o código pesquisado. Sem essa espera, o valor
// da consulta anterior poderia ser aceito como se fosse o novo.
async function aguardarEquipamento(frame, codigo, timeout = 15000) {
  const inicio = Date.now();
  let atual = { valor: '', texto: '' };
  while (Date.now() - inicio < timeout) {
    atual = await lerEquipamentoSelecionado(frame);
    if (atual.valor === codigo) return atual;
    await esperar(300);
  }
  return atual;
}

// Pesquisa o código ALX e confere o código e o tipo. Não salva nem abre a OS.
async function consultarEquipamento(frame, codigo) {
  const codigoAlx = normalizarCodigo(codigo);

  console.log(`[OS] Pesquisando ${codigoAlx}.`);
  const campo = frame.locator(seletores.os.campoEquipamento).first();
  await campo.fill(codigoAlx);
  await campo.press('Tab');

  const atual = await aguardarEquipamento(frame, codigoAlx);
  console.log(`[OS] Campo Equipamento: código "${atual.valor}" | descrição "${atual.texto}"`);

  if (atual.valor !== codigoAlx) {
    const motivo =
      atual.valor && atual.valor !== '-1'
        ? `O Effort mostrou o código ${atual.valor} em vez de ${codigoAlx}.`
        : `O Effort não retornou o código ${codigoAlx}.`;
    return { ok: false, descricao: atual.texto, motivo };
  }

  if (!atual.texto) {
    return {
      ok: false,
      descricao: '',
      motivo: `O código ${codigoAlx} foi encontrado, mas sem descrição no campo.`
    };
  }

  const tipoValido = /TERMOMETRO|TERMOHIGROMETRO/.test(normalizarTexto(atual.texto));
  if (!tipoValido) {
    return {
      ok: false,
      descricao: atual.texto,
      motivo:
        `O Effort retornou "${atual.texto}", que não é termômetro nem termohigrômetro.`
    };
  }

  return { ok: true, descricao: atual.texto, motivo: '' };
}

module.exports = {
  voltarParaInicio,
  abrirFormularioNovaOs,
  consultarEquipamento
};