const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SEL_ITENS_BARRA = '#BarraTarefas a[id^="dwmtarefa"]';

// Título da janela de impressão que o Effort abre após abrir ou fechar uma OS.
const REGEX_IMPRESSAO = /Impress.o\s+Ordem\s+de\s+Servi.o/i;

function textoLimpo(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim();
}

// A barra de tarefas fica na página do Desktop, que pode não ser a primeira
// aba do navegador. Procura em todas as páginas do contexto.
async function paginaDaBarra(context) {
  for (const p of context.pages()) {
    const existe = await p
      .locator('#BarraTarefas')
      .count()
      .catch(() => 0);
    if (existe > 0) return p;
  }
  return null;
}

// Lê os itens do rodapé: id (dwmtarefaN) e título exibido.
async function listarItensBarra(pagina) {
  return pagina
    .locator(SEL_ITENS_BARRA)
    .evaluateAll((links) =>
      links.map((a) => {
        const titulo = a.querySelector('[id$="_titulo"]');
        return {
          id: a.id,
          titulo: (titulo?.textContent || '').replace(/\s+/g, ' ').trim()
        };
      })
    )
    .catch(() => []);
}

// Casa exatamente "OS - <número>". "SUB-OS - <número>" não casa, porque
// a expressão exige OS no início do texto.
function ehItemDaOs(titulo, numeroExterno) {
  const regex = new RegExp(`^OS\\s*-\\s*${numeroExterno}$`);
  return regex.test(textoLimpo(titulo));
}

// Espera o item da OS aparecer no rodapé. Só então as outras janelas são
// fechadas, para não fechar nada caso a OS ainda não tenha aberto.
async function aguardarItemDaOs(pagina, numeroExterno, timeout = 15000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    const itens = await listarItensBarra(pagina);
    const item = itens.find((i) => ehItemDaOs(i.titulo, numeroExterno));
    if (item) return item;
    await esperar(300);
  }
  return null;
}

// Fecha, uma única vez cada, os itens do rodapé que não são a OS em foco.
// Um item que não some não é clicado de novo.
async function fecharOutrasJanelas(pagina, numeroExterno) {
  const tentados = new Set();
  let fechadas = 0;

  for (let rodada = 0; rodada < 15; rodada += 1) {
    const itens = await listarItensBarra(pagina);
    const outro = itens.find(
      (i) => !ehItemDaOs(i.titulo, numeroExterno) && !tentados.has(i.id)
    );
    if (!outro) break;

    tentados.add(outro.id);
    const botao = pagina.locator(`#${outro.id}_del`).first();
    if ((await botao.count().catch(() => 0)) === 0) continue;

    console.log(`[JANELA] Fechando "${outro.titulo}" para liberar a OS.`);
    await botao.click({ force: true }).catch(() => {});
    fechadas += 1;
    await esperar(900);
  }

  return fechadas;
}

// Verifica se a OS está na frente e visível, por geometria da tela:
// 1. o iframe da OS precisa ter tamanho real (minimizada = sem tamanho);
// 2. o elemento no ponto central do iframe precisa ser o próprio iframe
//    (se estiver coberta pelo painel ou por outra janela, o topo será outro).
// Não depende de classes ou estados do rodapé, que não mudam ao minimizar.
async function osEstaNaFrente(frameOS) {
  const elemento = await frameOS.frameElement().catch(() => null);
  if (!elemento) return null;

  return elemento
    .evaluate((iframe) => {
      const r = iframe.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) return false;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const topo = document.elementFromPoint(x, y);
      return topo === iframe || iframe.contains(topo);
    })
    .catch(() => false);
}

// Garante que a OS esteja na frente, com no máximo um clique no rodapé.
// Se a OS já estiver na frente, nenhum clique é feito. Se não estiver,
// clica uma vez no item da OS e confere. Não repete o clique.
async function garantirOsNaFrente(pagina, frameOS, numeroExterno) {
  const estado = await osEstaNaFrente(frameOS);

  if (estado === true) {
    console.log(`[JANELA] OS ${numeroExterno} já está na frente. Nenhum clique necessário.`);
    return true;
  }

  if (estado === null) {
    console.warn(
      `[JANELA] Não foi possível localizar o iframe da OS ${numeroExterno}. ` +
      'Nenhum clique foi feito para evitar alternar a janela.'
    );
    return false;
  }

  const item = await aguardarItemDaOs(pagina, numeroExterno, 5000);
  if (!item) {
    console.warn(`[JANELA] OS ${numeroExterno} não encontrada no rodapé.`);
    return false;
  }

  console.log(`[JANELA] OS ${numeroExterno} não está na frente. Restaurando pelo rodapé (1 clique).`);
  await pagina.locator(`#${item.id}`).first().click({ force: true }).catch(() => {});
  await esperar(1200);

  const depois = await osEstaNaFrente(frameOS);
  if (depois === true) {
    console.log(`[JANELA] OS ${numeroExterno} restaurada e na frente.`);
    return true;
  }

  console.warn(
    `[JANELA] OS ${numeroExterno} ainda não está na frente após 1 clique. ` +
    'Nenhum novo clique foi feito. Verifique a janela no Effort.'
  );
  return false;
}

// Fecha a janela "Impressão Ordem de Serviço Individual" pelo botão X.
async function fecharJanelasImpressao(context) {
  let fechadas = 0;

  for (let rodada = 0; rodada < 3; rodada += 1) {
    let achou = false;

    for (const pagina of context.pages()) {
      const titulos = pagina.locator('[id^="dwmJanela"][id$="_titulo"]');
      const total = await titulos.count().catch(() => 0);

      for (let i = 0; i < total; i += 1) {
        const texto = await titulos.nth(i).innerText({ timeout: 1000 }).catch(() => '');
        if (!REGEX_IMPRESSAO.test(texto)) continue;

        const id = (await titulos.nth(i).getAttribute('id').catch(() => '')) || '';
        const m = /^(dwmJanela\d+)_titulo$/.exec(id);
        if (!m) continue;

        const botao = pagina.locator(`#${m[1]}_fechar`).first();
        if ((await botao.count().catch(() => 0)) === 0) continue;

        await botao.click({ force: true }).catch(() => {});
        await esperar(800);
        fechadas += 1;
        achou = true;
        break;
      }
      if (achou) break;
    }

    if (!achou) break;
  }

  if (fechadas > 0) {
    console.log(`[JANELA] ${fechadas} janela(s) de impressão fechada(s).`);
  }
  return fechadas;
}

// Ponto de entrada. Fecha as janelas que não são a OS e, em seguida,
// garante que a OS esteja na frente. Não atualiza a página.
async function organizarJanelas(context, numeroExterno, frameOS) {
  if (!/^\d+$/.test(String(numeroExterno || ''))) {
    console.warn('[JANELA] Número externo inválido. Nenhuma janela foi alterada.');
    return false;
  }

  const pagina = await paginaDaBarra(context);
  if (!pagina) {
    console.warn('[JANELA] Barra de tarefas não encontrada. Nenhuma janela foi alterada.');
    return false;
  }

  const item = await aguardarItemDaOs(pagina, numeroExterno);
  if (!item) {
    console.warn(
      `[JANELA] OS ${numeroExterno} não apareceu no rodapé. ` +
      'Nenhuma janela foi fechada por segurança.'
    );
    return false;
  }

  const fechadas = await fecharOutrasJanelas(pagina, numeroExterno);
  if (fechadas > 0) {
    console.log(`[JANELA] ${fechadas} janela(s) fechada(s) pelo rodapé.`);
  }

  await fecharJanelasImpressao(context);

  if (!frameOS) {
    console.warn('[JANELA] Frame da OS não informado. Nenhum clique de restauração foi feito.');
    return false;
  }
  return garantirOsNaFrente(pagina, frameOS, numeroExterno);
}

module.exports = { organizarJanelas, fecharJanelasImpressao };