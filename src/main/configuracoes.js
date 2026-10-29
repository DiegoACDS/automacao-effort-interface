const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ARQUIVO = () => path.join(app.getPath('userData'), 'preferencias.json');

function lerPreferencias() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO(), 'utf8'));
  } catch {
    return {};
  }
}

function salvarPreferencias(alteracoes) {
  const atual = { ...lerPreferencias(), ...alteracoes };
  fs.mkdirSync(path.dirname(ARQUIVO()), { recursive: true });
  fs.writeFileSync(ARQUIVO(), JSON.stringify(atual, null, 2), 'utf8');
  return atual;
}

// Pasta padrão: onde o programa está instalado.
function pastaPadrao() {
  return app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : path.join(__dirname, '..', '..');
}

// Pasta escolhida pelo usuário ou, se não houver, a padrão.
function pastaBaseRelatorios() {
  return lerPreferencias().pastaRelatorios || pastaPadrao();
}

// Testa a gravação antes de aceitar a pasta, para não descobrir no meio do lote.
function verificarPastaGravavel(pasta) {
  try {
    fs.mkdirSync(pasta, { recursive: true });
    const teste = path.join(pasta, '.teste_gravacao');
    fs.writeFileSync(teste, 'ok');
    fs.unlinkSync(teste);
    return { ok: true };
  } catch {
    return {
      ok: false,
      motivo: 'O programa não consegue gravar nesta pasta. Escolha outra pasta, como Documentos ou uma pasta de trabalho.'
    };
  }
}

module.exports = {
  lerPreferencias,
  salvarPreferencias,
  pastaBaseRelatorios,
  verificarPastaGravavel
};