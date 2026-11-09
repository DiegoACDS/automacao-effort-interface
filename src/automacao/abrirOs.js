const fs = require('fs');
const path = require('path');

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Valores fixos da calibração, herdados da automação antiga.
const VALORES = {
  oficina: 'CRD',
  tipoManutencao: '6',
  ocorrencia: '383',
  reclamante: '650',
  responsavel: 'MEDSYSTEM01'
};

const CAMPOS = {
  equipamentoSelect: '#cboequipamento',
  oficina: '#cboOficina',
  tipoManutencao: '#cbotipomanutencao',
  ocorrencia: '#cboOcorrencia',
  reclamante: '#cboUsuario',
  responsavel: '#cbotecnico',
  dataAbertura: '#txtdataabertura',
  horaAbertura: '#txthoraabertura',
  botaoAbrirOs: '#btnAbrirOS',
  fecharModal: '#dwmJanela3_fechar'
};

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function validarCodigo(codigo) {
  const valor = String(codigo || '').toUpperCase().replace(/\s+/g, '');
  if (!/^ALX\d+$/.test(valor)) {
    throw new Error(`Código ALX inválido: "${codigo}".`);
  }
  return valor;
}

// Converte "2026-10-29T07:00" (datetime-local do Electron) em ddMMyyyy e HHmm.
function separarAbertura(valorLocal) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(valorLocal || ''));
  if (!m) {
    throw new Error(`Data/hora de abertura inválida: "${valorLocal}".`);
  }
  return {
    data: `${m[3]}${m[2]}${m[1]}`,
    hora: `${m[4]}${m[5]}`
  };
}

// Procura o PDF pelo código ALX. Evita falso positivo: ALX9 não casa com ALX96.
function localizarAnexoPorAlx(pasta, codigoAlx) {
  const codigo = validarCodigo(codigoAlx);
  const padrao = new RegExp(`(^|[^A-Z0-9])${codigo}(?!\\d)`, 'i');
  const arquivos = fs
    .readdirSync(pasta)
    .filter((nome) => nome.toLowerCase().endsWith('.pdf') && padrao.test(nome));

  if (arquivos.length === 0) {
    throw new Error(`Anexo não encontrado para ${codigo} na pasta selecionada.`);
  }
  if (arquivos.length > 1) {
    throw new Error(`Mais de um anexo para ${codigo}: ${arquivos.join(', ')}.`);
  }
  return path.join(pasta, arquivos[0]);
}

async function selecionar(frame, seletor, valor, nome) {
  const select = frame.locator(seletor).first();
  await select.waitFor({ state: 'visible', timeout: 30000 });

  const existe = await select.locator('option').evaluateAll(
    (opcoes, alvo) => opcoes.some((opcao) => opcao.value === alvo),
    valor
  );
  if (!existe) {
    throw new Error(`A opção "${valor}" não está disponível em ${nome}.`);
  }

  await select.selectOption(valor);
  await select.press('Tab').catch(() => {});
  await esperar(800);

  const atual = await select.evaluate((el) => el.value);
  if (atual !== valor) {
    throw new Error(`${nome} não ficou com "${valor}" (atual: "${atual}").`);
  }
  console.log(`[OS] ${nome} = ${valor}`);
}

async function preencher(frame, seletor, valor, nome) {
  const campo = frame.locator(seletor).first();
  await campo.waitFor({ state: 'visible', timeout: 30000 });
  await campo.fill(valor);
  await campo.press('Tab').catch(() => {});
  await esperar(800);

  const atual = (await campo.inputValue()).replace(/\D/g, '');
  if (atual !== valor.replace(/\D/g, '')) {
    throw new Error(`${nome} não ficou com "${valor}" (atual: "${atual}").`);
  }
  console.log(`[OS] ${nome} = ${valor}`);
}

async function confirmarEquipamento(frame, codigoAlx) {
  const equipamento = await frame
    .locator(CAMPOS.equipamentoSelect)
    .first()
    .evaluate((el) => {
      const opcao = el.options[el.selectedIndex];
      return { valor: el.value, texto: opcao ? opcao.textContent.trim() : '' };
    });

  if (equipamento.valor !== codigoAlx) {
    throw new Error(
      `O equipamento selecionado (${equipamento.valor || 'vazio'}) não é ${codigoAlx}.`
    );
  }
  if (!/TERMOMETRO|TERMOHIGROMETRO/.test(normalizar(equipamento.texto))) {
    throw new Error(
      `Equipamento incompatível: "${equipamento.texto}". ` +
      'Não é termômetro nem termohigrômetro.'
    );
  }
  return equipamento;
}

function codigosDeOsAbertos(page) {
  return new Set(
    page
      .frames()
      .map((f) => f.url())
      .filter((url) => /frmos_alterar\.aspx/i.test(url))
      .map((url) => new URL(url).searchParams.get('Codigo'))
      .filter(Boolean)
  );
}

async function fecharModalImpressao(page) {
  const botao = page.locator(CAMPOS.fecharModal).first();
  if (await botao.isVisible().catch(() => false)) {
    await botao.click();
    await esperar(700);
  }
}

async function aguardarOsNova(page, codigosAntes, timeout = 30000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    for (const frame of page.frames()) {
      const url = frame.url();
      if (!/frmos_alterar\.aspx/i.test(url)) continue;

      const codigoOs = new URL(url).searchParams.get('Codigo');
      if (codigoOs && !codigosAntes.has(codigoOs)) {
        return { codigoOs, frame };
      }
    }
    await esperar(300);
  }
  throw new Error(
    'A OS não foi aberta: a tela da OS nova não apareceu. ' +
    'Verifique no Effort se ela foi criada antes de repetir.'
  );
}

// Número externo da OS, exibido no título da janela (ex.: "OS - 202691454").
// Procura em todos os frames, porque o título fica na janela do Desktop.
async function lerNumeroExternoOs(page) {
  for (const frame of page.frames()) {
    const numero = await frame
      .evaluate(() => {
        for (const el of document.querySelectorAll('[id$="_titulo"]')) {
          const m = /^OS\s*-\s*(\d+)/.exec(el.textContent.trim());
          if (m) return m[1];
        }
        return '';
      })
      .catch(() => '');
    if (numero) return numero;
  }
  return '';
}

// Preenche os campos obrigatórios e clica em Abrir OS.
// Retorna { codigoOs, numeroExterno, frame } da OS criada.
async function abrirOS({ page, frame, codigoAlx, abertura }) {
  const codigo = validarCodigo(codigoAlx);
  const dataHora = separarAbertura(abertura);

  console.log(`[OS] Preenchendo a abertura do ${codigo}.`);
  await confirmarEquipamento(frame, codigo);

  await selecionar(frame, CAMPOS.oficina, VALORES.oficina, 'Oficina');
  await selecionar(frame, CAMPOS.tipoManutencao, VALORES.tipoManutencao, 'Tipo de manutenção');
  await selecionar(frame, CAMPOS.ocorrencia, VALORES.ocorrencia, 'Ocorrência');
  await selecionar(frame, CAMPOS.reclamante, VALORES.reclamante, 'Reclamante');
  await selecionar(frame, CAMPOS.responsavel, VALORES.responsavel, 'Responsável');
  await preencher(frame, CAMPOS.dataAbertura, dataHora.data, 'Data de abertura');
  await preencher(frame, CAMPOS.horaAbertura, dataHora.hora, 'Hora de abertura');

  const codigosAntes = codigosDeOsAbertos(page);

  console.log('[OS] Clicando em Abrir OS.');
  await frame.locator(CAMPOS.botaoAbrirOs).first().click();
  await esperar(1500);
  await fecharModalImpressao(page);

  const os = await aguardarOsNova(page, codigosAntes);
  const numeroExterno = await lerNumeroExternoOs(page);
  console.log(
    `[OS] OS aberta. Código interno: ${os.codigoOs}` +
    (numeroExterno ? ` | Número externo: ${numeroExterno}` : '')
  );
  return { ...os, numeroExterno };
}

module.exports = {
  VALORES,
  abrirOS,
  localizarAnexoPorAlx,
  separarAbertura,
  lerNumeroExternoOs
};