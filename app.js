import * as storage from './storage.js'
import * as tarefas from './tarefas.js'
import * as ui from './ui.js'
import * as alg from './algoritmo.js'

// estado da aplicação
let dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }
let configuracoes = { cronotipo: '3', limiteHoras: 6 }

// --- funções exportadas como API de interação com HTML ---
export function entrarNoSistema() {
  const inputNome = document.getElementById('seu-nome')
  const inputIdade = document.getElementById('sua-idade')

  const nome = inputNome.value.trim()
  const idade = parseInt(inputIdade.value)

  if (!nome || !idade || isNaN(idade)) {
    return alert('Por favor, preencha corretamente seu nome e idade!')
  }

  const dadosSalvos = storage.carregarDadosUsuario(nome)
  if (dadosSalvos) {
    tarefas.listaTarefas = dadosSalvos.listaTarefas || []
    dadosUsuario = dadosSalvos.dadosUsuario || dadosUsuario
    configuracoes = dadosSalvos.configuracoes || configuracoes
  }

  let calcFoco = Math.floor(90 - Math.abs(idade - 25) * 1.2)
  dadosUsuario = { nome, idade, focoMaximo: Math.max(25, calcFoco) }

  ui.atualizarSaudacao(dadosUsuario.nome)
  ui.atualizarEstatisticasBio(dadosUsuario.focoMaximo)

  document.getElementById('cronotipo-usuario').value = configuracoes.cronotipo
  document.getElementById('limite-horas').value = configuracoes.limiteHoras

  ui.atualizarListaNaTela(tarefas.listaTarefas, excluirTarefa)
  ui.transicionarParaTelaPrincipal()

  setTimeout(() => ui.renderizarGrafico(parseInt(configuracoes.cronotipo)), 50)
}

export function renderizarGrafico() {
  const compensacao = parseInt(
    document.getElementById('cronotipo-usuario').value
  )
  ui.renderizarGrafico(compensacao)
}

// expõe funções para HTML
window.entrarNoSistema = entrarNoSistema
window.trocarUsuario = trocarUsuario
window.adicionarTarefa = adicionarTarefa
window.otimizarDia = otimizarDia
window.enviarParaWhatsApp = enviarParaWhatsApp
window.renderizarGrafico = renderizarGrafico

export function trocarUsuario() {
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  tarefas.listaTarefas = []
  dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }
  configuracoes = { cronotipo: '3', limiteHoras: 6 }
  document.getElementById('seu-nome').value = ''
  document.getElementById('sua-idade').value = ''
  ui.limparInterface()
  ui.transicionarParaTelaInicial()
}

export function adicionarTarefa() {
  const nome = document.getElementById('nome-tarefa').value.trim()
  const peso = parseFloat(document.getElementById('peso-tarefa').value)
  const tempo = parseFloat(document.getElementById('tempo-tarefa').value)

  if (!nome || isNaN(peso) || isNaN(tempo))
    return alert('Preencha todos os dados da tarefa corretamente!')

  if (tempo > dadosUsuario.focoMaximo) {
    alert(
      `Atenção ${dadosUsuario.nome}! Tarefas acima de ${dadosUsuario.focoMaximo} min sem pausa podem esgotar sua energia mental. Cuidado!`
    )
  }

  tarefas.adicionar(nome, peso, tempo)
  document.getElementById('nome-tarefa').value = ''
  document.getElementById('peso-tarefa').value = ''
  document.getElementById('tempo-tarefa').value = ''

  ui.atualizarListaNaTela(tarefas.listaTarefas, excluirTarefa)
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
}

export function excluirTarefa(id) {
  tarefas.excluir(id)
  ui.atualizarListaNaTela(tarefas.listaTarefas, excluirTarefa)
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
}

export function otimizarDia() {
  const containerLista = document.getElementById('resultado-otimizacao')
  if (tarefas.listaTarefas.length === 0)
    return alert('Adicione tarefas ao inventário primeiro!')

  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
  const turno = document.getElementById('cronotipo-usuario').value

  const tarefasOrdenadas = tarefas.ordenarPorPeso()
  const html = alg.gerarAgendaHTML(tarefasOrdenadas, limiteMinutos, turno)
  ui.mostrarResultado(
    html +
      `<button onclick="enviarParaWhatsApp()" style="margin-top: 16px; background: #25d366; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer;">📱 Enviar para WhatsApp</button>`
  )

  configuracoes.cronotipo = turno
  configuracoes.limiteHoras = limiteMinutos / 60
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
}

export function enviarParaWhatsApp() {
  if (tarefas.listaTarefas.length === 0) return alert('Gere a agenda primeiro!')
  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
  const turno = document.getElementById('cronotipo-usuario').value
  const nome = dadosUsuario.nome

  const mensagem = alg.gerarMensagemWhatsApp(
    tarefas.ordenarPorPeso(),
    limiteMinutos,
    turno,
    nome
  )
  const urlWhatsApp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  window.open(urlWhatsApp, '_blank')
}

// expõe funções para HTML
window.entrarNoSistema = entrarNoSistema
window.trocarUsuario = trocarUsuario
window.adicionarTarefa = adicionarTarefa
window.otimizarDia = otimizarDia
window.enviarParaWhatsApp = enviarParaWhatsApp
