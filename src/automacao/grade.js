const seletores = require('./seletores');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ICONES = {
  anexo: 'ico_anexo.png',
  maoDeObra: 'ico_servico.png',
  ocorrenciaAberta: 'ico_ocorrenciaservico.png',
  ocorrenciaSolucionada: 'ico_ocorrenciasolucionada.png'
};

function nomeDoIcone(src) {
  return String(src || '').split('?')[0].split('/').pop().toLowerCase();
}

// Procura o frame que contém a tabela #Grade. Não espera por nenhum seletor.
async function localizarFrameGrade(page) {
  for (const frame of page.frames()) {
    const existe = await frame
      .evaluate((sel) => Boolean(document.querySelector(sel)), seletores.grade.tabela)
      .catch(() => false);
    if (existe) return frame;
  }
  throw new Error('A grade de atividades (#Grade) não foi encontrada em nenhum frame.');
}

// Lê as linhas direto do DOM, incluindo as que ficam fora da área visível.
// Rola a área de scroll até o fim e volta ao topo, sem alterar dados.
async function lerGradeCompleta(frame) {
  return frame.evaluate(
    ({ tabelaSel, painelSel }) => {
      const painel = document.querySelector(painelSel);
      if (painel) painel.scrollTop = painel.scrollHeight;

      const linhas = Array.from(
        document.querySelectorAll(`${tabelaSel} tr.GR, ${tabelaSel} tr.GRA`)
      ).map((tr) => {
        const celulas = tr.querySelectorAll('td');
        const img = tr.querySelector('img');
        return {
          icone: img ? img.getAttribute('src') || '' : '',
          data: (celulas[1]?.innerText || '').trim(),
          descricao: (celulas[2]?.innerText || '').trim(),
          observacao: (celulas[3]?.innerText || '').trim(),
          qtd: (celulas[4]?.innerText || '').trim()
        };
      });

      if (painel) painel.scrollTop = 0;
      return linhas;
    },
    { tabelaSel: seletores.grade.tabela, painelSel: seletores.grade.painel }
  );
}

function classificar(linhas) {
  const doTipo = (nome) => linhas.filter((l) => nomeDoIcone(l.icone) === nome);

  const anexos = doTipo(ICONES.anexo);
  // Mão de obra: ícone de serviço com duração hh:mm na coluna QTD.
  const maos = doTipo(ICONES.maoDeObra).filter(
    (l) => /\d{2}:\d{2}/.test(l.qtd) && /SERVI/i.test(l.observacao)
  );
  const abertas = doTipo(ICONES.ocorrenciaAberta);
  const solucionadas = doTipo(ICONES.ocorrenciaSolucionada);

  return {
    totalLinhas: linhas.length,
    anexo: anexos.length > 0,
    maoDeObra: maos.length > 0,
    ocorrenciaAberta: abertas.length > 0,
    ocorrenciaSolucionada: solucionadas.length > 0,
    completa: anexos.length > 0 && maos.length > 0
  };
}

async function verificarGrade(frame) {
  const linhas = await lerGradeCompleta(frame);
  return { ...classificar(linhas), linhas };
}

module.exports = { ICONES, localizarFrameGrade, verificarGrade, lerGradeCompleta };