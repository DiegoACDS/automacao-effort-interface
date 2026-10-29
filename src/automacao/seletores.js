module.exports = {
  url: {
    login: 'https://santamarcelinasaude.globalthings.net/Login.aspx',
    desktop: 'https://santamarcelinasaude.globalthings.net/UI/Base/Desktop.aspx'
  },
  login: {
    usuario: '#login',
    senha: '#senha',
    botao: '#logar'
  },
  sessao: {
    liberar:
      'input[value*="Liberar"], button:has-text("Liberar"), text=Liberar Acesso',
    continuar:
      'input[value*="Continuar"], button:has-text("Continuar"), ' +
      'input[value*="Verificar"], button:has-text("Verificar")'
  },
  menu: {
    ordensServico: 'nav.menuEffort > ul.firstLevel > li[title="Ordens de Serviço"]',
    abrirOs: 'Abrir Ordem de Serviço'
  },
  os: {
    campoEquipamento: '#txtcod_equipamento_nominal',
    cboEquipamento: '#cboequipamento'
  },
  grade: {
    painel: '#PainelGrade',
    tabela: '#Grade'
  }
};