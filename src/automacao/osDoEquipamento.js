// Lê a grade "Ordens de Serviço" do equipamento. O cabeçalho é tr.GRC e as
// linhas são tr.GR / tr.GRA. Procura em todos os frames da página.
async function lerOsDoEquipamento(page) {
  for (const frame of page.frames()) {
    const temCabecalho = await frame.locator('tr.GRC').count().catch(() => 0);
    if (temCabecalho === 0) continue;

    const linhas = await frame
      .locator('tr.GR, tr.GRA')
      .evaluateAll((trs) =>
        trs.map((tr) => {
          const celulas = Array.from(tr.querySelectorAll(':scope > td')).map((td) =>
            (td.textContent || '').replace(/\s+/g, ' ').trim()
          );
          const onclick = tr.getAttribute('onclick') || '';
          const m = /GSR\(this,\s*event,\s*'(\d+)'\)/.exec(onclick);
          return {
            codigoInterno: m ? m[1] : '',
            numeroExterno: (celulas[0] || '').match(/\d+/)?.[0] || '',
            tipo: celulas[1] || '',
            externa: celulas[2] || '',
            servico: celulas[3] || '',
            situacao: celulas[4] || '',
            abertura: celulas[5] || '',
            fechamento: celulas[6] || ''
          };
        })
      );

    return { encontrada: true, linhas };
  }
  return { encontrada: false, linhas: [] };
}

// Converte "2026-11-06T07:10" em "06/11/2026", formato da grade.
function paraDataBr(dataHoraLocal) {
  const [data] = String(dataHoraLocal).split('T');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Regras:
// - OS aberta (fechamento vazio) com a mesma data de abertura → adotar e completar.
// - Mais de uma aberta na mesma data → bloqueio (ambíguo).
// - Qualquer outra OS aberta sem correspondência → bloqueio (verificação manual).
// - OS fechada na mesma data → já concluída, pula.
// - Nenhuma correspondência → criar OS nova.
function decidirOs({ linhas, dataAbertura }) {
  const abertas = linhas.filter((l) => !l.fechamento);
  const fechadas = linhas.filter((l) => l.fechamento);

  const abertasDoDia = abertas.filter((l) => l.abertura === dataAbertura);

  if (abertasDoDia.length === 1) {
    const os = abertasDoDia[0];
    return {
      acao: 'adotar',
      numeroExterno: os.numeroExterno,
      codigoInterno: os.codigoInterno,
      motivo: `OS ${os.numeroExterno} aberta com data ${dataAbertura}.`
    };
  }

  if (abertasDoDia.length > 1) {
    return {
      acao: 'bloqueado',
      motivo:
        `Há ${abertasDoDia.length} OS abertas com data ${dataAbertura} ` +
        `(${abertasDoDia.map((l) => l.numeroExterno).join(', ')}). ` +
        'Não é possível escolher automaticamente.'
    };
  }

  if (abertas.length > 0) {
    return {
      acao: 'bloqueado',
      motivo:
        `Existe OS aberta para o equipamento (${abertas.map((l) => l.numeroExterno).join(', ')}) ` +
        `sem correspondência com a data ${dataAbertura}. ` +
        'Verifique no Effort antes de criar outra OS.'
    };
  }

  const fechadaDoDia = fechadas.find((l) => l.abertura === dataAbertura);
  if (fechadaDoDia) {
    return {
      acao: 'ja_fechada',
      numeroExterno: fechadaDoDia.numeroExterno,
      codigoInterno: fechadaDoDia.codigoInterno,
      motivo: `OS ${fechadaDoDia.numeroExterno} já fechada com data ${dataAbertura}.`
    };
  }

  return { acao: 'nova', motivo: 'Nenhuma OS compatível encontrada.' };
}

module.exports = { lerOsDoEquipamento, decidirOs, paraDataBr };