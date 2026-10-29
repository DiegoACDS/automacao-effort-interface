const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { pastaBaseRelatorios } = require('./configuracoes');

const NOME_PASTA = 'Relatórios';
const pad = (n) => String(n).padStart(2, '0');

// Pasta "Relatórios" criada dentro da pasta escolhida pelo usuário.
function pastaRelatorios() {
  const pasta = path.join(pastaBaseRelatorios(), NOME_PASTA);
  fs.mkdirSync(pasta, { recursive: true });
  return pasta;
}

// Nome que não sobrescreve um lote anterior iniciado no mesmo minuto.
function nomeArquivoUnico(pastaDia, horaTexto) {
  let arquivo = path.join(pastaDia, `pendencias_${horaTexto}.xlsx`);
  let contador = 2;
  while (fs.existsSync(arquivo)) {
    arquivo = path.join(pastaDia, `pendencias_${horaTexto}_${contador}.xlsx`);
    contador += 1;
  }
  return arquivo;
}

class RelatorioPendencias {
  constructor(inicioLote = new Date()) {
    const dia =
      `${inicioLote.getFullYear()}-` +
      `${pad(inicioLote.getMonth() + 1)}-` +
      `${pad(inicioLote.getDate())}`;
    const hora = `${pad(inicioLote.getHours())}${pad(inicioLote.getMinutes())}`;

    this.pasta = path.join(pastaRelatorios(), dia);
    fs.mkdirSync(this.pasta, { recursive: true });

    this.arquivo = nomeArquivoUnico(this.pasta, hora);
    this.excecoes = [];
  }

  // Grava a cada exceção, para não perder registros se o app parar no meio.
  registrar({
    codigo = '',
    patrimonio = '',
    situacao,
    etapa,
    motivo,
    numeroOs = '',
    acao = ''
  }) {
    this.excecoes.push({
      'Data e hora': new Date().toLocaleString('pt-BR'),
      'Código ALX': codigo,
      Patrimônio: patrimonio,
      Situação: situacao,
      Etapa: etapa,
      Motivo: motivo,
      'Nº da OS': numeroOs,
      'Ação sugerida': acao
    });
    this.salvar();
  }

  // Chamado ao fim do lote. Se não houve exceção, registra uma linha de confirmação.
  finalizar(totalProcessado, concluidos) {
    if (this.excecoes.length === 0) {
      this.excecoes.push({
        'Data e hora': new Date().toLocaleString('pt-BR'),
        Situação: 'Nenhuma pendência neste lote',
        Motivo: `${concluidos} de ${totalProcessado} equipamentos concluídos`
      });
    }
    this.salvar();
  }

  salvar() {
    const planilha = XLSX.utils.json_to_sheet(this.excecoes);
    planilha['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 26 },
      { wch: 22 }, { wch: 60 }, { wch: 14 }, { wch: 50 }
    ];
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Pendências');

    try {
      XLSX.writeFile(livro, this.arquivo);
    } catch (erro) {
      if (erro.code === 'EBUSY' || erro.code === 'EPERM') {
        throw new Error(
          'Feche o relatório de pendências no Excel para continuar o lote.'
        );
      }
      throw erro;
    }
  }
}

module.exports = { RelatorioPendencias, pastaRelatorios };