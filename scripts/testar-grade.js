const { chromium } = require('playwright');
const { ICONES, lerGradeCompleta, verificarGrade } = require('../src/automacao/grade');
const seletores = require('../src/automacao/seletores');

const ENDERECO = 'http://localhost:9222';
const ICONES_ATIVIDADE = Object.values(ICONES);

function nomeIcone(src) {
  return String(src || '').split('?')[0].split('/').pop().toLowerCase();
}

// Só é grade de OS se tiver pelo menos um ícone de atividade conhecido.
function ehGradeDaOs(linhas) {
  return linhas.some((l) => ICONES_ATIVIDADE.includes(nomeIcone(l.icone)));
}

// Código interno da OS, presente na URL do frame (ex.: Codigo=771565).
function codigoDaOs(url) {
  try {
    return new URL(url).searchParams.get('Codigo') || '(não identificado)';
  } catch {
    return '(não identificado)';
  }
}

async function main() {
  console.log(`[TESTE] Conectando em ${ENDERECO} ...`);
  const browser = await chromium.connectOverCDP(ENDERECO, { timeout: 10000 });

  const paginas = browser.contexts().flatMap((c) => c.pages());
  console.log(`[TESTE] Abas encontradas: ${paginas.length}`);

  const candidatos = [];

  for (const page of paginas) {
    for (const frame of page.frames()) {
      const temTabela = await frame
        .evaluate((sel) => Boolean(document.querySelector(sel)), seletores.grade.tabela)
        .catch(() => false);
      if (!temTabela) continue;

      const linhas = await lerGradeCompleta(frame).catch(() => []);
      const ehOs = ehGradeDaOs(linhas);

      console.log(
        `[TESTE] frame: ${frame.url()} | linhas: ${linhas.length} | ` +
        `grade da OS: ${ehOs ? 'SIM' : 'não (auxiliar, ignorada)'}`
      );

      if (ehOs) candidatos.push(frame);
    }
  }

  if (candidatos.length === 0) {
    console.log('[TESTE] Nenhuma grade de atividades de OS encontrada.');
    return 2;
  }

  for (const frame of candidatos) {
    const resultado = await verificarGrade(frame);
    console.log(JSON.stringify({
      codigoOs: codigoDaOs(frame.url()),
      frame: frame.url(),
      anexo: resultado.anexo,
      maoDeObra: resultado.maoDeObra,
      ocorrenciaAberta: resultado.ocorrenciaAberta,
      ocorrenciaSolucionada: resultado.ocorrenciaSolucionada,
      completa: resultado.completa,
      linhas: resultado.linhas.map((l) => ({
        icone: nomeIcone(l.icone),
        data: l.data,
        descricao: l.descricao,
        observacao: l.observacao,
        qtd: l.qtd
      }))
    }, null, 2));
  }

  return 0;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error('[TESTE] Falha:', erro.message);
    process.exit(1);
  });