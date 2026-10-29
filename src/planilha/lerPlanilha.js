const XLSX = require('xlsx');

// "ALX 130000" -> "ALX130000"
function normalizarCodigo(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).toUpperCase().replace(/\s+/g, '').trim();
}

// Lê apenas a primeira coluna da primeira aba.
function lerCodigos(caminho) {
  const wb = XLSX.readFile(caminho);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const codigos = [];
  linhas.forEach((linha, indice) => {
    const bruto = linha[0];
    const codigo = normalizarCodigo(bruto);
    if (!codigo) return;
    codigos.push({ linha: indice + 1, bruto: String(bruto), codigo });
  });
  return codigos;
}

module.exports = { lerCodigos, normalizarCodigo };