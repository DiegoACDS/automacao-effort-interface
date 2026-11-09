const { separarAbertura } = require('./abrirOs');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CAMPOS = {
  data: '#txtdatafechamento',
  hora: '#txthorafechamento',
  containerFechar: '#btnfecharOS_container'
};

async function preencherCampo(frame, seletor, valor, nome) {
  const campo = frame.locator(seletor).first();
  await campo.waitFor({ state: 'visible', timeout: 30000 });
  await campo.fill(valor);
  await campo.press('Tab').catch(() => {});
  await esperar(600);

  const atual = (await campo.inputValue()).replace(/\D/g, '');
  if (atual !== valor.replace(/\D/g, '')) {
    throw new Error(`${nome} não ficou com "${valor}" (ficou "${atual}").`);
  }
  console.log(`[FECHAMENTO] ${nome} = ${valor}`);
}

// Fecha a OS: data e hora do Electron, clique em Fechar OS e
// aceite do alerta de confirmação. O aceite é temporário: vale
// apenas para o diálogo disparado por este clique.
async function fecharOs(frameOS, { fechamento, dialogo }) {
  const dado = separarAbertura(fechamento);

  console.log('[FECHAMENTO] Preenchendo data e hora de fechamento.');
  await preencherCampo(frameOS, CAMPOS.data, dado.data, 'Data de fechamento');
  await preencherCampo(frameOS, CAMPOS.hora, dado.hora, 'Hora de fechamento');

  const container = frameOS.locator(CAMPOS.containerFechar).first();
  await container.waitFor({ state: 'visible', timeout: 30000 });

  console.log('[FECHAMENTO] Clicando em Fechar OS.');
  dialogo.aceitarProximo = true;
  try {
    await container.click({ force: true });
    await esperar(2000);
    console.log('[FECHAMENTO] Clique e confirmação executados.');
  } finally {
    // Nunca deixa o aceite ligado: os próximos alertas voltam a ser
    // dispensados, como no restante do fluxo.
    dialogo.aceitarProximo = false;
  }
}

module.exports = { fecharOs };