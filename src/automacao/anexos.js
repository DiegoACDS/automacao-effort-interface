const fs = require('fs');
const path = require('path');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CAMPOS = {
  outrasOpcoes: '#btnOutrasOpcoes',
  anexos: '#btnAnexos',
  arquivo: '#arquivos',
  enviar: '#btnEnviarAnexo',
  fechar: '#btnFechar'
};

// Tela de anexos: campo de arquivo + botão enviar na mesma janela.
function temTelaDeAnexos(frame) {
  return frame
    .evaluate(
      (sels) =>
        Boolean(
          document.querySelector(sels.arquivo) &&
          document.querySelector(sels.enviar)
        ),
      CAMPOS
    )
    .catch(() => false);
}

async function aguardarTelaDeAnexos(page, timeout = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    for (const frame of page.frames()) {
      if (await temTelaDeAnexos(frame)) return frame;
    }
    await esperar(300);
  }
  throw new Error('A tela de anexos não apareceu após o clique em Anexos.');
}

// Envia o PDF na tela de anexos da OS e fecha a janela.
async function anexarArquivo(page, frameOS, caminhoArquivo) {
  const nome = path.basename(caminhoArquivo);
  if (!fs.existsSync(caminhoArquivo)) {
    throw new Error(`Anexo não encontrado no disco: ${caminhoArquivo}`);
  }

  // Janela residual de um item anterior impede identificar a janela nova.
  for (const frame of page.frames()) {
    if (await temTelaDeAnexos(frame)) {
      throw new Error(
        'Já existe uma tela de anexos aberta no Effort. ' +
        'Feche-a antes de rodar o lote novamente.'
      );
    }
  }

  const botaoOpcoes = frameOS.locator(CAMPOS.outrasOpcoes).first();
  await botaoOpcoes.waitFor({ state: 'visible', timeout: 30000 });
  console.log('[ANEXO] Abrindo Outras Opções.');
  await botaoOpcoes.click();
  await esperar(1000);

  const botaoAnexos = frameOS.locator(CAMPOS.anexos).first();
  await botaoAnexos.waitFor({ state: 'visible', timeout: 30000 });
  console.log('[ANEXO] Abrindo a tela de anexos.');
  await botaoAnexos.click();

  const tela = await aguardarTelaDeAnexos(page);
  await tela.locator(CAMPOS.arquivo).first().setInputFiles(caminhoArquivo);
  console.log(`[ANEXO] Arquivo selecionado: ${nome}`);

  await tela.locator(CAMPOS.enviar).first().click();
  await esperar(2000);

  const texto = await tela.locator('body').innerText();
  if (!texto.includes(nome)) {
    throw new Error(`O arquivo ${nome} não apareceu na lista após o envio.`);
  }
  console.log(`[ANEXO] Anexo enviado: ${nome}`);

  const fechar = tela.locator(CAMPOS.fechar).first();
  await fechar.waitFor({ state: 'visible', timeout: 30000 });
  await fechar.click();
  await esperar(1000);
  console.log('[ANEXO] Tela de anexos fechada.');
}

module.exports = { anexarArquivo };