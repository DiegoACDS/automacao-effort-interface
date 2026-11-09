const { separarAbertura } = require('./abrirOs');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Valores fixos da mão de obra, herdados da automação antiga.
// Ajuste aqui se o seu .env antigo tiver valores diferentes.
const VALORES = {
  tecnico: 'MEDSYSTEM05',
  causa: '2',
  servico: '417'
};

const CAMPOS = {
  botaoMaoDeObra: '#btnMaoDeObra',
  tecnico: '#txttecnicomatricula',
  data: '#txtdata',
  hora: '#txthora',
  dataTermino: '#txtTerminoData',
  horaTermino: '#txtTerminoHora',
  causa: '#txtcod_causa_serial',
  servico: '#txtcod_servico_nominal',
  resolvida: '#chkocorrenciaresolvida',
  salvar: '#btnSalvar'
};

// Presença da janela de mão de obra: campos + botão salvar.
function estadoDaJanela(frame) {
  return frame
    .evaluate(
      (sels) => ({
        total: sels.indicios.filter((s) => document.querySelector(s)).length,
        salvar: Boolean(document.querySelector(sels.salvar))
      }),
      {
        indicios: [
          CAMPOS.tecnico,
          CAMPOS.data,
          CAMPOS.hora,
          CAMPOS.dataTermino,
          CAMPOS.horaTermino
        ],
        salvar: CAMPOS.salvar
      }
    )
    .catch(() => ({ total: 0, salvar: false }));
}

async function preencherCampo(frame, seletor, valor, nome) {
  const campo = frame.locator(seletor).first();
  await campo.waitFor({ state: 'visible', timeout: 30000 });
  await campo.fill(valor);
  await campo.press('Tab').catch(() => {});
  await esperar(600);

  // Compara só os dígitos, porque o Effort pode reformatar datas com barras.
  const atual = (await campo.inputValue()).replace(/\D/g, '');
  if (atual !== valor.replace(/\D/g, '')) {
    throw new Error(`${nome} não ficou com "${valor}" (ficou "${atual}").`);
  }
  console.log(`[MAO-DE-OBRA] ${nome} = ${valor}`);
}

// Abre a janela de mão de obra a partir da tela da OS e devolve o frame dela.
async function clicarMaoDeObra(page, frameOS) {
  // Janela residual de um item anterior impede identificar a janela nova.
  for (const frame of page.frames()) {
    const estado = await estadoDaJanela(frame);
    if (estado.total >= 3 && estado.salvar) {
      throw new Error(
        'Já existe uma janela de mão de obra aberta no Effort. ' +
        'Feche-a antes de rodar o lote novamente.'
      );
    }
  }

  const botao = frameOS.locator(CAMPOS.botaoMaoDeObra).first();
  await botao.waitFor({ state: 'visible', timeout: 30000 });
  console.log('[MAO-DE-OBRA] Abrindo a janela de mão de obra.');
  await botao.click();
  await esperar(1500);

  const inicio = Date.now();
  while (Date.now() - inicio < 30000) {
    for (const frame of page.frames()) {
      const estado = await estadoDaJanela(frame);
      if (estado.total >= 3 && estado.salvar) {
        console.log(`[MAO-DE-OBRA] Janela localizada: ${frame.url()}`);
        return frame;
      }
    }
    await esperar(300);
  }
  throw new Error('A janela de mão de obra não apareceu após o clique.');
}

// Preenche a mão de obra com os horários do Electron e salva.
async function preencherMaoDeObra(frame, { inicio, termino }) {
  const dadoInicio = separarAbertura(inicio);
  const dadoTermino = separarAbertura(termino);

  await preencherCampo(frame, CAMPOS.tecnico, VALORES.tecnico, 'Matrícula do técnico');
  await preencherCampo(frame, CAMPOS.data, dadoInicio.data, 'Data inicial');
  await preencherCampo(frame, CAMPOS.hora, dadoInicio.hora, 'Hora inicial');
  await preencherCampo(frame, CAMPOS.dataTermino, dadoTermino.data, 'Data final');
  await preencherCampo(frame, CAMPOS.horaTermino, dadoTermino.hora, 'Hora final');
  await preencherCampo(frame, CAMPOS.causa, VALORES.causa, 'Causa');
  await preencherCampo(frame, CAMPOS.servico, VALORES.servico, 'Serviço');

  const checkbox = frame.locator(CAMPOS.resolvida).first();
  await checkbox.waitFor({ state: 'attached', timeout: 30000 });
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
  console.log('[MAO-DE-OBRA] Ocorrência marcada como resolvida.');

  const salvar = frame.locator(CAMPOS.salvar).first();
  await salvar.waitFor({ state: 'visible', timeout: 30000 });
  console.log('[MAO-DE-OBRA] Salvando mão de obra.');
  await salvar.click();
  await esperar(2000);
  console.log('[MAO-DE-OBRA] Mão de obra salva.');
}

module.exports = { clicarMaoDeObra, preencherMaoDeObra, VALORES };