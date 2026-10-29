const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const lote = require('./lote');
const lerPlanilha = require('../planilha/lerPlanilha');
const anexos = require('../planilha/anexos');
const validacao = require('../planilha/validacao');
const { pastaRelatorios } = require('./relatorio');
const {
  salvarPreferencias,
  verificarPastaGravavel
} = require('./configuracoes');

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Automação Effort',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  janela.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(criarJanela);

app.on('window-all-closed', () => app.quit());

// ---------- Seleção de arquivos e pastas ----------

ipcMain.handle('selecionar-planilha', async () => {
  const r = await dialog.showOpenDialog(janela, {
    properties: ['openFile'],
    filters: [{ name: 'Planilhas Excel', extensions: ['xlsx'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('selecionar-pasta', async () => {
  const r = await dialog.showOpenDialog(janela, {
    properties: ['openDirectory']
  });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- Pré-validação (somente leitura: não acessa o Effort) ----------

ipcMain.handle('pre-validar', async (_, { planilhaPath, pastaAnexos } = {}) => {
  if (!planilhaPath || !pastaAnexos) {
    return { erro: 'Selecione a planilha e a pasta de anexos.' };
  }

  try {
    const linhas = lerPlanilha.lerCodigos(planilhaPath);
    if (linhas.length === 0) {
      return {
        erro: 'A planilha não possui códigos na primeira coluna.'
      };
    }

    const pdfs = anexos.listarPdfs(pastaAnexos);
    return validacao.preValidar(linhas, pdfs);
  } catch (erro) {
    return { erro: `Não foi possível ler os arquivos: ${erro.message}` };
  }
});

// ---------- Pasta dos relatórios ----------

ipcMain.handle('obter-pasta-relatorios', () => {
  try {
    return { pasta: pastaRelatorios() };
  } catch (erro) {
    return { erro: erro.message };
  }
});

ipcMain.handle('escolher-pasta-relatorios', async () => {
  const r = await dialog.showOpenDialog(janela, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Escolha a pasta onde o programa vai criar a pasta Relatórios'
  });
  if (r.canceled) return null;

  const base = r.filePaths[0];
  const teste = verificarPastaGravavel(base);
  if (!teste.ok) return { erro: teste.motivo };

  salvarPreferencias({ pastaRelatorios: base });

  try {
    return { pasta: pastaRelatorios() };
  } catch (erro) {
    return { erro: erro.message };
  }
});

ipcMain.handle('abrir-relatorios', async () => {
  try {
    const erro = await shell.openPath(pastaRelatorios());
    return erro ? { erro } : { ok: true };
  } catch (erro) {
    return { erro: erro.message };
  }
});

// ---------- Lote ----------

ipcMain.handle('iniciar-lote', async (event, dados = {}) => {
  try {
    return await lote.iniciarLote({
      ...dados,
      enviarStatus: (status) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('lote-status', status);
        }
      }
    });
  } catch (erro) {
    return { erro: `Falha ao iniciar o lote: ${erro.message}` };
  }
});