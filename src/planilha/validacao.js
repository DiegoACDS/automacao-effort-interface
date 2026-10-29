const { normalizarCodigo } = require('./lerPlanilha');

const FORMATO_ALX = /^ALX\d+$/;

function preValidar(linhas, pdfs) {
  // Contagem de códigos para detectar duplicados
  const contagem = {};
  linhas.forEach((l) => {
    contagem[l.codigo] = (contagem[l.codigo] || 0) + 1;
  });

  const usados = new Set();

  const itens = linhas.map((l) => {
    let situacao;
    let motivo = '';
    let arquivo = null;

    if (!FORMATO_ALX.test(l.codigo)) {
      situacao = 'Código inválido';
      motivo = `"${l.bruto}" não está no formato ALX + número`;
    } else if (contagem[l.codigo] > 1) {
      situacao = 'Duplicado';
      motivo = `Aparece ${contagem[l.codigo]} vezes na planilha`;
    } else {
      const achados = pdfs.filter((p) => p.codigo === l.codigo);
      if (achados.length === 0) {
        situacao = 'Sem anexo';
        motivo = 'Nenhum PDF com este nome na pasta';
      } else if (achados.length > 1) {
        situacao = 'Anexo ambíguo';
        motivo = `Mais de um PDF: ${achados.map((a) => a.arquivo).join(', ')}`;
      } else {
        situacao = 'OK';
        arquivo = achados[0].arquivo;
        usados.add(arquivo);
      }
    }

    return { linha: l.linha, codigo: l.codigo, situacao, motivo, arquivo };
  });

  // PDFs que não correspondem a nenhuma linha válida
  const pdfsSemLinha = pdfs
    .filter((p) => !usados.has(p.arquivo))
    .map((p) => ({ arquivo: p.arquivo, motivo: 'Não há linha correspondente na planilha' }));

  return {
    itens,
    pdfsSemLinha,
    total: itens.length,
    ok: itens.filter((i) => i.situacao === 'OK').length
  };
}

// Regra de conferência da descrição retornada pelo Effort (usada na Fase 2).
// Remove acentos antes de comparar.
function descricaoEhTermometro(codigoAlx, descricao) {
  const d = String(descricao || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  return d.startsWith(codigoAlx) && /TERMOMETRO|TERMOHIGROMETRO/.test(d);
}

module.exports = { preValidar, descricaoEhTermometro };