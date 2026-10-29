const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selecionarPlanilha: () => ipcRenderer.invoke('selecionar-planilha'),
  selecionarPasta: () => ipcRenderer.invoke('selecionar-pasta'),
  preValidar: (dados) => ipcRenderer.invoke('pre-validar', dados),
  obterPastaRelatorios: () => ipcRenderer.invoke('obter-pasta-relatorios'),
  escolherPastaRelatorios: () => ipcRenderer.invoke('escolher-pasta-relatorios'),
  abrirRelatorios: () => ipcRenderer.invoke('abrir-relatorios'),
  iniciarLote: (dados) => ipcRenderer.invoke('iniciar-lote', dados),

  // Assina as atualizações de status do lote. Devolve a função para cancelar.
  onLoteStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('lote-status', handler);
    return () => ipcRenderer.removeListener('lote-status', handler);
  }
});