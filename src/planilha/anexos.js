const fs = require('fs');
const path = require('path');
const { normalizarCodigo } = require('./lerPlanilha');

// Lista os PDFs da pasta. O código é o nome do arquivo sem extensão.
function listarPdfs(pasta) {
  return fs
    .readdirSync(pasta)
    .filter((nome) => /\.pdf$/i.test(nome))
    .map((nome) => ({
      arquivo: nome,
      codigo: normalizarCodigo(path.basename(nome, path.extname(nome)))
    }));
}

module.exports = { listarPdfs };