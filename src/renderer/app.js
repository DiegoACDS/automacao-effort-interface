const estado = {
  planilhaPath: null,
  pastaAnexos: null,
  validacao: null,
  pastaRelatoriosOk: false,
  rodando: false
};

const CAMPOS_DATA = ['abertura', 'inicio', 'termino', 'fechamento'];
const ROTULO_DATA = {
  abertura: 'Abertura',
  inicio: 'Início da mão de obra',
  termino: 'Término da mão de obra',
  fechamento: 'Fechamento'
};

// Situações que aparecem em verde no andamento. As demais aparecem em laranja.
const SITUACOES_OK = ['Consultado', 'Pronto'];

const el = (id) => document.getElementById(id);

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function mostrarMensagem(texto, tipo = 'erro') {
  const m = el('mensagem');
  m.textContent = texto || '';
  m.className = tipo;
}

// Horário atual no formato aceito por datetime-local (sem segundos).
function agoraLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Impede o seletor do navegador de escolher datas futuras.
function atualizarLimitesDatas() {
  const maximo = agoraLocal();
  CAMPOS_DATA.forEach((c) => {
    el(`dt-${c}`).max = maximo;
  });
}

function lerDatas() {
  return Object.fromEntries(CAMPOS_DATA.map((c) => [c, el(`dt-${c}`).value]));
}

function validarDatasNaTela(datas) {
  const agora = Date.now();

  for (const c of CAMPOS_DATA) {
    if (!datas[c]) {
      return `Informe a data e a hora de ${ROTULO_DATA[c].toLowerCase()}.`;
    }
    if (new Date(datas[c]).getTime() > agora) {
      return (
        `${ROTULO_DATA[c]} não pode ser futura. ` +
        'O Effort não aceita lançamentos com data e hora futuras.'
      );
    }
  }

  for (let i = 1; i < CAMPOS_DATA.length; i += 1) {
    const anterior = CAMPOS_DATA[i - 1];
    const atual = CAMPOS_DATA[i];
    if (new Date(datas[atual]) < new Date(datas[anterior])) {
      return (
        `${ROTULO_DATA[atual]} não pode ser anterior a ` +
        `${ROTULO_DATA[anterior].toLowerCase()}.`
      );
    }
  }

  return null;
}

function formatarDataHora(valor) {
  const [data, hora] = valor.split('T');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano} ${hora}`;
}

function classeSituacao(situacao) {
  return SITUACOES_OK.includes(situacao) ? 'ok' : 'alerta';
}

// Durante o lote, nenhum controle pode alterar os dados em execução.
function bloquearControles(bloquear) {
  const ids = [
    'btnPlanilha',
    'btnPasta',
    'btnPastaRelatorios',
    'btnValidar',
    'btnRelatorios',
    'usuario',
    'senha',
    'aceitePendencias',
    ...CAMPOS_DATA.map((c) => `dt-${c}`)
  ];
  ids.forEach((id) => {
    el(id).disabled = bloquear;
  });
}

function atualizarBotaoIniciar() {
  atualizarLimitesDatas();

  const v = estado.validacao;
  const pendentes = v ? v.total - v.ok : 0;
  el('blocoAceite').hidden = pendentes === 0;
  el('qtdPendentes').textContent = pendentes;

  const aceite = pendentes === 0 || el('aceitePendencias').checked;
  const pronto =
    Boolean(v && v.ok > 0) &&
    estado.pastaRelatoriosOk &&
    !estado.rodando &&
    !validarDatasNaTela(lerDatas()) &&
    el('usuario').value.trim() !== '' &&
    el('senha').value !== '' &&
    aceite;

  el('btnIniciar').disabled = !pronto;
}

function limparResultado() {
  estado.validacao = null;
  el('resumo').innerHTML = '';
  el('resultado').innerHTML = '';
  el('aceitePendencias').checked = false;
  atualizarBotaoIniciar();
}

async function atualizarPastaRelatorios() {
  const r = await window.api.obterPastaRelatorios();
  if (r.erro) {
    estado.pastaRelatoriosOk = false;
    el('pastaRelatorios').textContent = 'Indisponível';
    mostrarMensagem(r.erro);
  } else {
    estado.pastaRelatoriosOk = true;
    el('pastaRelatorios').textContent = r.pasta;
  }
  atualizarBotaoIniciar();
}

// ---------- Arquivos ----------

el('btnPlanilha').onclick = async () => {
  const caminho = await window.api.selecionarPlanilha();
  if (!caminho) return;
  estado.planilhaPath = caminho;
  el('planilha').textContent = caminho;
  mostrarMensagem('');
  limparResultado();
};

el('btnPasta').onclick = async () => {
  const caminho = await window.api.selecionarPasta();
  if (!caminho) return;
  estado.pastaAnexos = caminho;
  el('pasta').textContent = caminho;
  mostrarMensagem('');
  limparResultado();
};

el('btnPastaRelatorios').onclick = async () => {
  const r = await window.api.escolherPastaRelatorios();
  if (!r) return;
  if (r.erro) {
    mostrarMensagem(r.erro);
    return;
  }
  estado.pastaRelatoriosOk = true;
  el('pastaRelatorios').textContent = r.pasta;
  mostrarMensagem('');
  atualizarBotaoIniciar();
};

el('btnRelatorios').onclick = async () => {
  const r = await window.api.abrirRelatorios();
  if (r.erro) mostrarMensagem(`Não foi possível abrir a pasta: ${r.erro}`);
};

// ---------- Pré-validação ----------

el('btnValidar').onclick = async () => {
  if (estado.rodando) return;

  mostrarMensagem('');
  limparResultado();

  if (!estado.planilhaPath || !estado.pastaAnexos) {
    mostrarMensagem('Selecione a planilha e a pasta de anexos antes de validar.');
    return;
  }

  const botao = el('btnValidar');
  botao.disabled = true;
  botao.textContent = 'Validando...';

  try {
    const r = await window.api.preValidar({
      planilhaPath: estado.planilhaPath,
      pastaAnexos: estado.pastaAnexos
    });

    if (r.erro) {
      mostrarMensagem(r.erro);
      return;
    }

    estado.validacao = r;
    renderizarResultado(r);
    atualizarBotaoIniciar();
  } finally {
    botao.disabled = false;
    botao.textContent = 'Pré-validar';
  }
};

function renderizarResultado(r) {
  const pendentes = r.total - r.ok;
  const semLinha = r.pdfsSemLinha.length;

  el('resumo').innerHTML =
    `<p><b>${r.ok}</b> de <b>${r.total}</b> equipamentos prontos` +
    (pendentes > 0 ? `, <b>${pendentes}</b> com pendência` : '') +
    `. ${semLinha} PDF(s) sem linha na planilha.</p>` +
    (pendentes === 0 && semLinha === 0
      ? '<p class="ok">Todos os equipamentos estão prontos para o lote.</p>'
      : '<p class="alerta">Pendências serão ignoradas e registradas no relatório, se você confirmar abaixo.</p>');

  const linhas = r.itens.map((i) => `
    <tr>
      <td>${escapar(i.linha)}</td>
      <td>${escapar(i.codigo)}</td>
      <td class="${i.situacao === 'OK' ? 'ok' : 'alerta'}">${escapar(i.situacao)}</td>
      <td>${escapar(i.motivo)}</td>
      <td>${escapar(i.arquivo || '')}</td>
    </tr>`).join('');

  const extras = r.pdfsSemLinha.map((p) => `
    <tr>
      <td>-</td>
      <td>-</td>
      <td class="alerta">PDF sem linha</td>
      <td>${escapar(p.motivo)}</td>
      <td>${escapar(p.arquivo)}</td>
    </tr>`).join('');

  el('resultado').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Linha</th>
          <th>Código ALX</th>
          <th>Situação</th>
          <th>Motivo</th>
          <th>Arquivo</th>
        </tr>
      </thead>
      <tbody>${linhas}${extras}</tbody>
    </table>`;
}

// ---------- Lote ----------

document.querySelectorAll('#secaoLote input').forEach((campo) => {
  campo.addEventListener('input', atualizarBotaoIniciar);
  campo.addEventListener('change', atualizarBotaoIniciar);
});

el('btnIniciar').onclick = () => {
  const datas = lerDatas();
  const erroDatas = validarDatasNaTela(datas);
  if (erroDatas) {
    mostrarMensagem(erroDatas);
    return;
  }

  const v = estado.validacao;
  el('resumoConfirmacao').innerHTML = `
    <ul>
      <li>Equipamentos prontos: <b>${v.ok}</b></li>
      <li>Ignorados (registrados no relatório): <b>${v.total - v.ok}</b></li>
      <li>Abertura: ${formatarDataHora(datas.abertura)}</li>
      <li>Início da mão de obra: ${formatarDataHora(datas.inicio)}</li>
      <li>Término da mão de obra: ${formatarDataHora(datas.termino)}</li>
      <li>Fechamento: ${formatarDataHora(datas.fechamento)}</li>
      <li>Usuário do Effort: ${escapar(el('usuario').value.trim())}</li>
    </ul>
    <p class="alerta">Nesta versão o programa apenas consulta o Effort. Nenhuma OS será aberta ou fechada.</p>`;
  el('modal').hidden = false;
};

el('btnVoltar').onclick = () => {
  el('modal').hidden = true;
};

el('btnConfirmarInicio').onclick = async () => {
  if (estado.rodando) return;

  el('modal').hidden = true;

  // A senha sai do campo antes do envio e não fica na tela.
  const credenciais = {
    usuario: el('usuario').value.trim(),
    senha: el('senha').value
  };
  el('senha').value = '';

  estado.rodando = true;
  bloquearControles(true);
  el('btnConfirmarInicio').disabled = true;
  el('btnIniciar').disabled = true;

  el('secaoProgresso').hidden = false;
  el('progresso').innerHTML = '';
  el('resultadoLote').innerHTML = '';
  mostrarMensagem('Lote em andamento...', 'ok');

  try {
    const r = await window.api.iniciarLote({
      planilhaPath: estado.planilhaPath,
      pastaAnexos: estado.pastaAnexos,
      datas: lerDatas(),
      credenciais
    });

    if (r.erro) {
      mostrarMensagem(r.erro);
    } else {
      mostrarMensagem(r.mensagem, 'ok');
    }

    // O lote sempre gera o relatório, inclusive quando é interrompido.
    if (r.relatorio) {
      el('resultadoLote').innerHTML =
        `<p>Relatório de pendências: <b>${escapar(r.relatorio)}</b></p>`;
    }
  } catch (erro) {
    mostrarMensagem(`Falha inesperada: ${erro.message}`);
  } finally {
    estado.rodando = false;
    bloquearControles(false);
    el('btnConfirmarInicio').disabled = false;
    atualizarBotaoIniciar();
  }
};

window.api.onLoteStatus((s) => {
  el('progresso').insertAdjacentHTML(
    'beforeend',
    `<tr>
      <td>${escapar(s.codigo)}</td>
      <td class="${classeSituacao(s.situacao)}">${escapar(s.situacao)}</td>
      <td>${escapar(s.motivo || '')}</td>
    </tr>`
  );
});

// ---------- Inicialização ----------

el('dt-abertura').value = agoraLocal();
el('dt-inicio').value = agoraLocal();
atualizarPastaRelatorios();
atualizarBotaoIniciar();