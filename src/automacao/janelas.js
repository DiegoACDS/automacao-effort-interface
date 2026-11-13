const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SEL_BARRA = '#BarraTarefas a[id^="dwmtarefa"]';

// Título da janela de impressão que o Effort abre após abrir ou fechar uma OS.
// A barra de tarefas exibe "Impressão Ordem de Serviço Individual" com acentos
// ou com entidades HTML, por isso a comparação ignora caracteres acentuados.
const REGEX_IMPRESSAO = /Impress.o\s+Ordem\s+de\s+Servi.o/i;

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

// Clica no item "OS - <número externo>" da barra de tarefas para trazer
// a janela da OS para frente. Compara o texto inteiro, para que
// "OS - 2025950" não case com "OS - 20259505".
async function trazerOsParaFrente(context, numeroExterno, timeout = 15000) {
  if (!/^\d+$/.test(String(numeroExterno || ''))) {
    console.warn('[JANELA] Número externo inválido. A OS não foi trazida para frente.');
    return false;
  }

  const textoExato = new RegExp(`^\\s*OS\\s*-\\s*${numeroExterno}\\s*$`);
  const inicio = Date.now();

  while (Date.now() - inicio < timeout) {
    const pagina = await paginaDaBarra(context);
    if (pagina) {
      const item = pagina
        .locator(SEL_BARRA)
        .filter({ hasText: textoExato })
        .first();

      if ((await item.count().catch(() => 0)) > 0) {
        await item.click({ force: true }).catch(() => {});
        await esperar(800);
        console.log(`[JANELA] OS ${numeroExterno} trazida para frente pela barra de tarefas.`);
        return true;
      }
    }
    await esperar(300);
  }

  console.warn(`[JANELA] OS ${numeroExterno} não encontrada na barra de tarefas.`);
  return false;
}

// Procura a janela de impressão aberta e devolve o botão Fechar dela.
// O número N de dwmJanelaN muda a cada janela, então a busca é pelo título.
async function acharJanelaImpressao(context) {
  for (const pagina of context.pages()) {
    const titulos = pagina.locator('[id^="dwmJanela"][id$="_titulo"]');
    const total = await titulos.count().catch(() => 0);

    for (let i = 0; i < total; i += 1) {
      const titulo = titulos.nth(i);
      const texto = await titulo.innerText({ timeout: 1000 }).catch(() => '');
      if (!REGEX_IMPRESSAO.test(texto)) continue;

      const id = (await titulo.getAttribute('id').catch(() => '')) || '';
      const m = /^(dwmJanela\d+)_titulo$/.exec(id);
      if (!m) continue;

      const botao = pagina.locator(`#${m[1]}_fechar`).first();
      if ((await botao.count().catch(() => 0)) > 0) return botao;
    }
  }
  return null;
}

// Fecha as janelas de impressão que o Effort abre sozinho. Elas ficam por
// cima da OS e cobrem os botões. Não clica em "Gerar", só no X da janela.
async function fecharJanelasImpressao(context) {
  let fechadas = 0;

  // Limite de rodadas para não entrar em laço caso o Effort reabra a janela.
  for (let rodada = 0; rodada < 5; rodada += 1) {
    const botao = await acharJanelaImpressao(context);
    if (!botao) break;

    await botao.click({ force: true }).catch(() => {});
    await esperar(800);
    fechadas += 1;
  }

  if (fechadas > 0) {
    console.log(`[JANELA] ${fechadas} janela(s) de impressão fechada(s).`);
  }
  return fechadas;
}

module.exports = { trazerOsParaFrente, fecharJanelasImpressao };