const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CAMPOS = {
  painel: '#painel',
  abaPainel: '#aba_painel',
  pesquisaOS: '#pesquisaOS',
  botaoPesquisar: '#formPesquisaOS button[type="submit"]'
};

// A OS pode abrir em qualquer janela do navegador, não só na página principal.
function framesDeTodasAsPaginas(context) {
  return context.pages().flatMap((p) => p.frames());
}

function codigosDeFramesOs(context) {
  return new Set(
    framesDeTodasAsPaginas(context)
      .map((f) => f.url())
      .filter((url) => /frmos(_alterar|_consultar)?\.aspx/i.test(url))
      .map((url) => {
        try {
          return new URL(url).searchParams.get('Codigo');
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  );
}

// Localiza a página que contém o painel de apps (fica no Desktop).
async function paginaDoPainel(context) {
  for (const p of context.pages()) {
    const existe = await p.locator(CAMPOS.painel).count().catch(() => 0);
    if (existe > 0) return p;
  }
  return null;
}

// O Effort grava o estado no style do #painel:
// fechado = width: 0px, aberto = width: auto.
// offsetWidth engana: a borda deixa 1px mesmo fechado, e a transição
// de abertura/fechamento faz a largura oscilar durante a medição.
async function estadoPainel(page) {
  const medicao = await page
    .locator(CAMPOS.painel)
    .first()
    .evaluate((el) => ({
      estilo: (el.style.width || '').trim(),
      px: el.offsetWidth
    }))
    .catch(() => ({ estilo: '', px: -1 }));

  if (medicao.estilo === '0px') return 'fechado';
  if (medicao.estilo === 'auto') return 'aberto';
  if (medicao.px < 0) return 'desconhecido';
  // Reserva, caso o style não esteja populado.
  return medicao.px > 10 ? 'aberto' : 'fechado';
}

async function esperarEstadoPainel(page, alvo, timeout = 5000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if ((await estadoPainel(page)) === alvo) return true;
    await esperar(200);
  }
  return false;
}

// Garante o painel aberto antes de pesquisar. O clique na aba alterna:
// abre quando fechado, fecha quando aberto.
async function garantirPainelAberto(page) {
  const estado = await estadoPainel(page);
  if (estado === 'aberto') {
    console.log('[RETOMADA] Painel de apps já está aberto.');
    return;
  }

  console.log('[RETOMADA] Abrindo o Painel de apps.');
  await page.locator(CAMPOS.abaPainel).first().click();

  if (!(await esperarEstadoPainel(page, 'aberto'))) {
    throw new Error('O Painel de apps não abriu após o clique na aba.');
  }
}

// Fecha o painel com confirmação de estado após cada clique.
// Um clique só é repetido se o painel continuar aberto, porque
// o clique alterna: clicar sem conferir reabre o que acabou de fechar.
async function fecharPainelSeAberto(page) {
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    const estado = await estadoPainel(page);
    if (estado === 'fechado') {
      console.log('[RETOMADA] Painel de apps fechado.');
      return;
    }
    if (estado === 'desconhecido') {
      console.warn('[RETOMADA] Não foi possível medir o painel de apps.');
      return;
    }

    console.log(`[RETOMADA] Fechando o painel de apps (tentativa ${tentativa}).`);
    await page
      .locator(CAMPOS.abaPainel)
      .first()
      .click({ force: true })
      .catch(() => {});

    // Espera o estado realmente mudar antes de decidir clicar de novo.
    if (await esperarEstadoPainel(page, 'fechado')) {
      console.log('[RETOMADA] Painel de apps fechado.');
      return;
    }
  }

  throw new Error(
    'O painel de apps não fechou após 3 tentativas. ' +
    'Ele fica sobre os botões da OS e bloqueia o restante do fluxo. ' +
    'Feche-o manualmente e rode o lote novamente.'
  );
}

// Submete a busca pelo número externo da OS.
// Enter no campo é o caminho principal, porque o botão de pesquisa
// pode ficar fora da viewport mesmo com o painel aberto.
async function submeterPesquisa(page) {
  const campo = page.locator(CAMPOS.pesquisaOS).first();
  await campo.waitFor({ state: 'visible', timeout: 15000 });

  try {
    await campo.press('Enter');
    console.log('[RETOMADA] Busca submetida com Enter.');
    return;
  } catch {
    // Enter não submeteu. Tenta o botão, mesmo fora da viewport.
  }

  const botao = page.locator(CAMPOS.botaoPesquisar).first();
  await botao.scrollIntoViewIfNeeded().catch(() => {});
  await botao.click({ force: true }).catch(() => {});
  console.log('[RETOMADA] Busca submetida pelo botão de pesquisa.');
}

// A janela da OS mostra o título "OS - <número externo>" no Desktop.
// Serve para identificar a OS mesmo quando o frame já existia antes da busca.
async function paginaMostraOs(page, numeroExterno) {
  const texto = await page
    .locator('body')
    .innerText({ timeout: 2000 })
    .catch(() => '');
  return texto.includes(`OS - ${numeroExterno}`);
}

// Busca a OS pelo número externo no Painel de apps e devolve o frame dela.
async function abrirOsExistente(page, numeroExterno, timeout = 30000) {
  if (!/^\d+$/.test(String(numeroExterno || ''))) {
    throw new Error(
      `Número externo da OS inválido: "${numeroExterno}". ` +
      'O progresso não registrou o número externo desta OS.'
    );
  }

  const context = page.context();
  const codigosAntes = codigosDeFramesOs(context);

  const paginaPainel = (await paginaDoPainel(context)) || page;

  await garantirPainelAberto(paginaPainel);

  const campo = paginaPainel.locator(CAMPOS.pesquisaOS).first();
  await campo.fill(String(numeroExterno));
  console.log(`[RETOMADA] Pesquisando a OS ${numeroExterno}.`);
  await submeterPesquisa(paginaPainel);

  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    for (const frame of framesDeTodasAsPaginas(context)) {
      const url = frame.url();
      if (!/frmos(_alterar|_consultar)?\.aspx/i.test(url)) continue;

      let codigoOs = null;
      try {
        codigoOs = new URL(url).searchParams.get('Codigo');
      } catch {
        codigoOs = null;
      }

      const ehNova = codigoOs && !codigosAntes.has(codigoOs);
      const tituloConfere = await paginaMostraOs(frame.page(), numeroExterno);

      if (ehNova || tituloConfere) {
        console.log(
          `[RETOMADA] OS encontrada. Código interno: ${codigoOs || '(pelo título)'}`
        );
        // O painel fica sobre os botões da OS. Fecha antes de seguir.
        await fecharPainelSeAberto(paginaPainel);
        return { codigoOs: codigoOs || '', frame };
      }
    }
    await esperar(300);
  }

  throw new Error(
    `A OS ${numeroExterno} não abriu após a pesquisa. ` +
    'Verifique o número no Painel de apps e se nenhuma janela da OS ' +
    'já está aberta no Effort.'
  );
}

module.exports = { abrirOsExistente };