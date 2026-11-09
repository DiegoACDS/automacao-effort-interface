const fs = require('fs');
const path = require('path');

const CAMINHO = path.resolve(process.cwd(), 'output', 'progresso.json');

function ler() {
  try {
    return JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  } catch {
    return {};
  }
}

function gravar(mapa) {
  fs.mkdirSync(path.dirname(CAMINHO), { recursive: true });
  fs.writeFileSync(CAMINHO, JSON.stringify(mapa, null, 2), 'utf8');
}

// Registra a etapa concluída de um equipamento. Etapas: aberta,
// mao-de-obra, completa.
function registrar(codigo, dados) {
  const mapa = ler();
  mapa[codigo] = {
    ...(mapa[codigo] || {}),
    ...dados,
    atualizadoEm: new Date().toISOString()
  };
  gravar(mapa);
}

function situacao(codigo) {
  return ler()[codigo]?.etapa || '';
}

function numeroExterno(codigo) {
  return ler()[codigo]?.numeroExterno || '';
}

module.exports = { CAMINHO, ler, registrar, situacao, numeroExterno };