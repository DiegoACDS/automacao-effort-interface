const { lerCodigos } = require('../planilha/lerPlanilha');
const anexos = require('../planilha/anexos');
const validacao = require('../planilha/validacao');
const { RelatorioPendencias } = require('./relatorio');
const {
  pastaBaseRelatorios,
  verificarPastaGravavel
} = require('./configuracoes');
const { abrirNavegador } = require('../automacao/navegador');
const { fazerLogin, estaNoDesktop } = require('../automacao/login');
const {
  voltarParaInicio,
  abrirFormularioNovaOs,
  consultarEquipamento
} = require('../automacao/pesquisaEquipamento');
const { abrirOS, localizarAnexoPorAlx } = require('../automacao/abrirOs');

// 'consulta' só consulta o Effort. 'abertura' consulta e abre a OS.
const MODO = 'abertura';

const ORDEM_DATAS = [
  ['abertura', 'Abertura'],
  ['inicio', 'Início da mão de obra'],
  ['termino', 'Término da mão de obra'],
  ['fechamento', 'Fechamento']
];

function validarDatas(datas = {}, agora = new Date()) {
  const valores = [];

  for (const [chave, rotulo] of ORDEM_DATAS) {
    const texto = datas[chave];
    if (!texto) {
      return { erro: `Informe a data e a hora de ${rotulo.toLowerCase()}.` };
    }

    const instante = new Date(texto).getTime();
    if (Number.isNaN(instante)) {
      return { erro: `Data e hora inválidas em ${rotulo.toLowerCase()}.` };
    }

    if (instante > agora.getTime()) {
      return {
        erro:
          `${rotulo} não pode ser futura. ` +
          'O Effort não aceita lançamentos com data e hora futuras.'
      };
    }

    valores.push(instante);
  }

  for (let i = 1; i < valores.length; i += 1) {
    if (valores[i] < valores[i - 1]) {
      return {
        erro:
          `${ORDEM_DATAS[i][1]} não pode ser anterior a ` +
          `${ORDEM_DATAS[i - 1][1].toLowerCase()}.`
      };
    }
  }

  return {
    datas: Object.fromEntries(ORDEM_DATAS.map(([chave]) => [chave, datas[chave]]))
  };
}

function dataHoraAgora() {
  return new Date().toLocaleString('pt-BR');
}

async function processarNoEffort({
  itens,
  credenciais,
  relatorio,
  enviarStatus,
  pastaAnexos,
  datas
}) {
  const { browser, page } = await abrirNavegador({ headless: false });
  let alertas = [];

  // Alertas do Effort são lidos e dispensados. Nenhum alerta é confirmado,
  // então nada que crie registro é aceito por esse caminho.
  page.on('dialog', async (dialogo) => {
    alertas.push(dialogo.message());
    console.log(`[ALERTA] ${dialogo.message()}`);
    await dialogo.dismiss().catch(() => {});
  });

  const contagem = { consultados: 0, abertas: 0, excecoes: 0 };

  try {
    await fazerLogin(page, credenciais);

    for (const item of itens) {
      alertas = [];
      console.log(`[LOTE] Processando ${item.codigo} (modo: ${MODO})`);

      try {
        // Sem anexo não há abertura. Falha aqui, antes de tocar no Effort.
        if (MODO === 'abertura') {
          const anexo = localizarAnexoPorAlx(pastaAnexos, item.codigo);
          console.log(`[LOTE] Anexo localizado: ${anexo}`);
        }

        await voltarParaInicio(page);
        if (!(await estaNoDesktop(page))) {
          await fazerLogin(page, credenciais);
        }

        const frame = await abrirFormularioNovaOs(page);
        const resultado = await consultarEquipamento(frame, item.codigo);

        if (!resultado.ok) {
          contagem.excecoes += 1;
          relatorio.registrar({
            codigo: item.codigo,
            situacao: 'Não confere',
            etapa: 'Consulta no Effort',
            motivo: resultado.motivo,
            acao:
              'Verificar o código ALX na planilha ou o cadastro do equipamento no Effort'
          });
          enviarStatus({
            codigo: item.codigo,
            situacao: 'Exceção',
            motivo: resultado.motivo
          });
          continue;
        }

        if (MODO === 'abertura') {
          const os = await abrirOS({
            page,
            frame,
            codigoAlx: item.codigo,
            abertura: datas.abertura
          });
          contagem.abertas += 1;
          enviarStatus({
            codigo: item.codigo,
            situacao: 'OS aberta',
            motivo: `OS ${os.codigoOs}`
          });
        } else {
          contagem.consultados += 1;
          enviarStatus({
            codigo: item.codigo,
            situacao: 'Consultado',
            motivo: resultado.descricao
          });
        }
      } catch (erro) {
        console.error(`[LOTE] Erro em ${item.codigo}:`, erro.stack || erro);
        contagem.excecoes += 1;

        const ultimoAlerta = alertas[alertas.length - 1];
        const motivo = ultimoAlerta
          ? `${erro.message} Alerta do Effort: "${ultimoAlerta}"`
          : erro.message;

        relatorio.registrar({
          codigo: item.codigo,
          situacao: 'Erro no processamento',
          etapa: 'Abertura da OS',
          motivo,
          acao:
            'Verificar no Effort se a OS foi criada antes de reprocessar este equipamento'
        });
        enviarStatus({ codigo: item.codigo, situacao: 'Exceção', motivo });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return contagem;
}

async function iniciarLote({
  planilhaPath,
  pastaAnexos,
  datas,
  credenciais,
  enviarStatus = () => {}
}) {
  // 1. A pasta de relatórios pode ter sido removida ou bloqueada desde a escolha.
  const pasta = verificarPastaGravavel(pastaBaseRelatorios());
  if (!pasta.ok) {
    return { erro: pasta.motivo };
  }

  // 2. Datas: ausentes, fora de ordem ou futuras.
  const checagemDatas = validarDatas(datas);
  if (checagemDatas.erro) {
    return { erro: checagemDatas.erro };
  }

  // 3. Credenciais: só em memória.
  if (!credenciais?.usuario || !credenciais?.senha) {
    return { erro: 'Informe usuário e senha do Effort.' };
  }

  // 4. Revalidação da planilha e dos PDFs.
  if (!planilhaPath || !pastaAnexos) {
    return { erro: 'Selecione a planilha e a pasta de anexos.' };
  }

  const linhas = lerCodigos(planilhaPath);
  const pre = validacao.preValidar(linhas, anexos.listarPdfs(pastaAnexos));

  if (pre.ok === 0) {
    return { erro: 'Nenhum equipamento está pronto para o lote.' };
  }

  // 5. Pendências da validação vão para o relatório na hora.
  const relatorio = new RelatorioPendencias(new Date());
  const prontos = [];

  for (const item of pre.itens) {
    if (item.situacao === 'OK') {
      prontos.push(item);
      continue;
    }

    relatorio.registrar({
      codigo: item.codigo,
      situacao: item.situacao,
      etapa: 'Validação',
      motivo: item.motivo,
      acao:
        'Corrigir a planilha ou a pasta de anexos e incluir ' +
        'este equipamento em um novo lote'
    });
    enviarStatus({ codigo: item.codigo, situacao: 'Pendência', motivo: item.motivo });
  }

  // 6. Consulta e abertura no Effort, um equipamento por vez.
  let contagem;
  try {
    contagem = await processarNoEffort({
      itens: prontos,
      credenciais,
      relatorio,
      enviarStatus,
      pastaAnexos,
      datas: checagemDatas.datas
    });
  } catch (erro) {
    console.error('[LOTE] Falha no processamento:', erro.stack || erro);
    relatorio.registrar({
      codigo: '',
      situacao: 'Lote interrompido',
      etapa: 'Login',
      motivo: erro.message,
      acao: 'Verificar usuário e senha e iniciar um novo lote'
    });
    return {
      erro: `Lote interrompido: ${erro.message}`,
      relatorio: relatorio.arquivo
    };
  }

  // 7. Se não houve exceção, registra uma linha de confirmação.
  if (relatorio.excecoes.length === 0) {
    relatorio.excecoes.push({
      'Data e hora': dataHoraAgora(),
      Situação: 'Nenhuma pendência neste lote',
      Motivo:
        MODO === 'abertura'
          ? `${contagem.abertas} OS aberta(s) no Effort.`
          : `${contagem.consultados} equipamento(s) conferido(s) no Effort. Nenhuma OS foi aberta.`
    });
    relatorio.salvar();
  }

  const excecoesTotais = contagem.excecoes + (pre.total - pre.ok);
  const mensagemFinal =
    MODO === 'abertura'
      ? `Lote concluído: ${contagem.abertas} OS aberta(s) e ${excecoesTotais} exceção(ões).`
      : `Consulta concluída: ${contagem.consultados} equipamento(s) conferido(s) ` +
        `no Effort e ${excecoesTotais} exceção(ões). Nenhuma OS foi aberta.`;

  return {
    mensagem: mensagemFinal,
    total: pre.total,
    ok: pre.ok,
    pendentes: pre.total - pre.ok,
    abertas: contagem.abertas,
    consultados: contagem.consultados,
    relatorio: relatorio.arquivo
  };
}

module.exports = { iniciarLote, validarDatas };