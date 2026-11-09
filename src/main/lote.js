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
const { clicarMaoDeObra, preencherMaoDeObra } = require('../automacao/maoDeObra');
const { anexarArquivo } = require('../automacao/anexos');
const { verificarGrade } = require('../automacao/grade');
const { abrirOsExistente } = require('../automacao/abrirOsExistente');
const { fecharOs } = require('../automacao/fecharOS');
const progresso = require('../automacao/progresso');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 'consulta' só consulta o Effort. 'completo' abre a OS, lança mão de obra,
// anexo e fecha a OS.
const MODO = 'completo';

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

// Relê a grade da OS até confirmar anexo e mão de obra (completa).
async function aguardarGradeCompleta(frame, timeoutMs = 30000) {
  const inicio = Date.now();
  let ultima = null;
  while (Date.now() - inicio < timeoutMs) {
    ultima = await verificarGrade(frame).catch(() => null);
    if (ultima && ultima.completa) return ultima;
    await esperar(2000);
  }
  return ultima;
}

// Fecha uma OS cuja grade já está completa. A grade é reconferida
// antes do fechamento: só fecha OS confirmada.
async function encerrarOs({
  page,
  item,
  datas,
  contagem,
  enviarStatus,
  origem
}) {
  let etapa = `Fechamento (${origem})`;
  const numeroExterno = progresso.numeroExterno(item.codigo);
  console.log(
    `[FECHAMENTO] ${item.codigo}: etapa salva "${progresso.situacao(item.codigo)}", ` +
    `OS ${numeroExterno}.`
  );

  const os = await abrirOsExistente(page, numeroExterno);
  const pageOS = os.frame.page();
  const frameOS = os.frame;

  const grade = await verificarGrade(frameOS);
  if (!grade.completa) {
    throw new Error(
      'A grade da OS não está completa (mão de obra e anexo). ' +
      'O fechamento só é executado com a grade confirmada.'
    );
  }
  console.log('[FECHAMENTO] Grade confirmada. Prosseguindo.');

  await fecharOs(frameOS, {
    fechamento: datas.fechamento,
    dialogo: contagem.dialogo
  });

  progresso.registrar(item.codigo, { etapa: 'fechada' });
  contagem.fechados += 1;
  enviarStatus({
    codigo: item.codigo,
    situacao: 'Fechada',
    motivo: `OS ${numeroExterno} fechada no Effort`
  });
}

// Completa uma OS já aberta, executando apenas o que falta na grade,
// e fecha a OS ao final.
async function retomarOs({
  page,
  item,
  caminhoAnexo,
  datas,
  contagem,
  enviarStatus
}) {
  const numeroExterno = progresso.numeroExterno(item.codigo);
  console.log(
    `[RETOMADA] ${item.codigo}: etapa salva "${progresso.situacao(item.codigo)}", ` +
    `OS ${numeroExterno}.`
  );

  const os = await abrirOsExistente(page, numeroExterno);
  const pageOS = os.frame.page();
  const frameOS = os.frame;

  const grade = await verificarGrade(frameOS);
  console.log(
    `[RETOMADA] Grade da OS: anexo=${grade.anexo}, maoDeObra=${grade.maoDeObra}.`
  );

  let etapa = 'Mão de obra (retomada)';
  if (!grade.maoDeObra) {
    const janela = await clicarMaoDeObra(pageOS, frameOS);
    await preencherMaoDeObra(janela, {
      inicio: datas.inicio,
      termino: datas.termino
    });
    progresso.registrar(item.codigo, { etapa: 'mao-de-obra' });
  } else {
    console.log('[RETOMADA] Mão de obra já registrada na grade.');
  }

  etapa = 'Anexo (retomada)';
  if (!grade.anexo) {
    await anexarArquivo(pageOS, frameOS, caminhoAnexo);
  } else {
    console.log('[RETOMADA] Anexo já registrado na grade.');
  }

  etapa = 'Conferência da grade (retomada)';
  const gradeFinal = await aguardarGradeCompleta(frameOS);
  if (!gradeFinal || !gradeFinal.completa) {
    throw new Error(
      'A grade da OS não confirmou anexo e mão de obra após a retomada. ' +
      'Confira a OS no Effort antes de reprocessar este equipamento.'
    );
  }

  progresso.registrar(item.codigo, { etapa: 'completa' });

  // Com a grade confirmada, a OS é fechada na mesma execução.
  etapa = 'Fechamento (retomada)';
  await fecharOs(frameOS, {
    fechamento: datas.fechamento,
    dialogo: contagem.dialogo
  });
  progresso.registrar(item.codigo, { etapa: 'fechada' });

  contagem.concluidos += 1;
  contagem.fechados += 1;
  enviarStatus({
    codigo: item.codigo,
    situacao: 'Fechada',
    motivo: `OS ${numeroExterno} completada e fechada na retomada`
  });
}

// Fluxo normal: consulta, abre OS nova, mão de obra, anexo, grade e fechamento.
async function fluxoCompleto({
  page,
  item,
  frameFormulario,
  caminhoAnexo,
  datas,
  contagem,
  enviarStatus
}) {
  const os = await abrirOS({
    page,
    frame: frameFormulario,
    codigoAlx: item.codigo,
    abertura: datas.abertura
  });

  if (os.numeroExterno) {
    progresso.registrar(item.codigo, {
      etapa: 'aberta',
      codigoOs: os.codigoOs,
      numeroExterno: os.numeroExterno
    });
  } else {
    console.warn(
      `[LOTE] ${item.codigo}: o número externo da OS não foi lido do título. ` +
      'A retomada desta OS precisará do número informado manualmente.'
    );
    progresso.registrar(item.codigo, { etapa: 'aberta', codigoOs: os.codigoOs });
  }

  let etapa = 'Mão de obra';
  const janelaMaoDeObra = await clicarMaoDeObra(page, os.frame);
  await preencherMaoDeObra(janelaMaoDeObra, {
    inicio: datas.inicio,
    termino: datas.termino
  });
  progresso.registrar(item.codigo, { etapa: 'mao-de-obra' });

  etapa = 'Anexo';
  await anexarArquivo(page, os.frame, caminhoAnexo);

  etapa = 'Conferência da grade';
  const grade = await aguardarGradeCompleta(os.frame);
  if (!grade || !grade.completa) {
    throw new Error(
      'A grade da OS não confirmou anexo e mão de obra. ' +
      'Confira a OS no Effort antes de reprocessar este equipamento.'
    );
  }
  progresso.registrar(item.codigo, { etapa: 'completa' });

  etapa = 'Fechamento';
  await fecharOs(os.frame, {
    fechamento: datas.fechamento,
    dialogo: contagem.dialogo
  });
  progresso.registrar(item.codigo, { etapa: 'fechada' });

  contagem.concluidos += 1;
  contagem.fechados += 1;
  enviarStatus({
    codigo: item.codigo,
    situacao: 'Fechada',
    motivo: `OS ${os.numeroExterno || os.codigoOs} aberta, completada e fechada`
  });
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

  // Controle do diálogo: por padrão todo alerta é dispensado. O fechamento
  // da OS liga o aceite apenas para o alerta disparado pelo próprio clique.
  const dialogo = { aceitarProximo: false };
  page.on('dialog', async (aviso) => {
    alertas.push(aviso.message());
    console.log(`[ALERTA] ${aviso.message()}`);
    if (dialogo.aceitarProximo) {
      dialogo.aceitarProximo = false;
      await aviso.accept().catch(() => {});
      console.log('[ALERTA] Aceito (confirmação de fechamento).');
    } else {
      await aviso.dismiss().catch(() => {});
    }
  });

  const contagem = {
    consultados: 0,
    concluidos: 0,
    fechados: 0,
    excecoes: 0,
    dialogo
  };

  try {
    await fazerLogin(page, credenciais);

    for (const item of itens) {
      alertas = [];
      let etapa = 'Consulta no Effort';
      console.log(`[LOTE] Processando ${item.codigo} (modo: ${MODO})`);

      try {
        let caminhoAnexo = '';
        if (MODO !== 'consulta') {
          caminhoAnexo = localizarAnexoPorAlx(pastaAnexos, item.codigo);
          console.log(`[LOTE] Anexo localizado: ${caminhoAnexo}`);
        }

        // Estados finais são pulados.
        const etapaSalva = progresso.situacao(item.codigo);
        if (etapaSalva === 'fechada') {
          console.log(`[LOTE] ${item.codigo} já está fechado. Pulando.`);
          enviarStatus({
            codigo: item.codigo,
            situacao: 'Já fechado',
            motivo: 'Registrado como fechado em execução anterior'
          });
          continue;
        }

        await voltarParaInicio(page);
        if (!(await estaNoDesktop(page))) {
          await fazerLogin(page, credenciais);
        }

        // OS com mão de obra e anexo já confirmados: só falta fechar.
        if (MODO !== 'consulta' && etapaSalva === 'completa') {
          await encerrarOs({
            page,
            item,
            datas,
            contagem,
            enviarStatus,
            origem: 'progresso completa'
          });
          continue;
        }

        // OS parcial: abre a OS existente, faz o que falta e fecha.
        if (
          MODO !== 'consulta' &&
          (etapaSalva === 'aberta' || etapaSalva === 'mao-de-obra')
        ) {
          await retomarOs({
            page,
            item,
            caminhoAnexo,
            datas,
            contagem,
            enviarStatus
          });
          continue;
        }

        const frameFormulario = await abrirFormularioNovaOs(page);
        const resultado = await consultarEquipamento(frameFormulario, item.codigo);

        if (!resultado.ok) {
          contagem.excecoes += 1;
          relatorio.registrar({
            codigo: item.codigo,
            situacao: 'Não confere',
            etapa,
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

        if (MODO === 'consulta') {
          contagem.consultados += 1;
          enviarStatus({
            codigo: item.codigo,
            situacao: 'Consultado',
            motivo: resultado.descricao
          });
          continue;
        }

        await fluxoCompleto({
          page,
          item,
          frameFormulario,
          caminhoAnexo,
          datas,
          contagem,
          enviarStatus
        });
      } catch (erro) {
        console.error(`[LOTE] Erro em ${item.codigo} (${etapa}):`, erro.stack || erro);
        contagem.excecoes += 1;

        const ultimoAlerta = alertas[alertas.length - 1];
        const motivo = ultimoAlerta
          ? `${erro.message} Alerta do Effort: "${ultimoAlerta}"`
          : erro.message;

        relatorio.registrar({
          codigo: item.codigo,
          situacao: 'Erro no processamento',
          etapa,
          motivo,
          acao:
            'Verificar no Effort o estado da OS antes de reprocessar este equipamento'
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
  const pasta = verificarPastaGravavel(pastaBaseRelatorios());
  if (!pasta.ok) {
    return { erro: pasta.motivo };
  }

  const checagemDatas = validarDatas(datas);
  if (checagemDatas.erro) {
    return { erro: checagemDatas.erro };
  }

  if (!credenciais?.usuario || !credenciais?.senha) {
    return { erro: 'Informe usuário e senha do Effort.' };
  }

  if (!planilhaPath || !pastaAnexos) {
    return { erro: 'Selecione a planilha e a pasta de anexos.' };
  }

  const linhas = lerCodigos(planilhaPath);
  const pre = validacao.preValidar(linhas, anexos.listarPdfs(pastaAnexos));

  if (pre.ok === 0) {
    return { erro: 'Nenhum equipamento está pronto para o lote.' };
  }

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

  if (relatorio.excecoes.length === 0) {
    relatorio.excecoes.push({
      'Data e hora': dataHoraAgora(),
      Situação: 'Nenhuma pendência neste lote',
      Motivo:
        MODO === 'consulta'
          ? `${contagem.consultados} equipamento(s) conferido(s) no Effort. Nenhuma OS foi aberta.`
          : `${contagem.fechados} OS fechada(s) no Effort.`
    });
    relatorio.salvar();
  }

  const excecoesTotais = contagem.excecoes + (pre.total - pre.ok);
  const mensagemFinal =
    MODO === 'consulta'
      ? `Consulta concluída: ${contagem.consultados} equipamento(s) conferido(s) no Effort e ${excecoesTotais} exceção(ões). Nenhuma OS foi aberta.`
      : `Lote concluído: ${contagem.fechados} OS fechada(s) e ${excecoesTotais} exceção(ões).`;

  return {
    mensagem: mensagemFinal,
    total: pre.total,
    ok: pre.ok,
    pendentes: pre.total - pre.ok,
    abertas: contagem.concluidos,
    concluidos: contagem.concluidos,
    fechados: contagem.fechados,
    consultados: contagem.consultados,
    relatorio: relatorio.arquivo
  };
}

module.exports = { iniciarLote, validarDatas };