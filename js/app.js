import * as storage from './storage.js'
import * as tarefas from './tarefas.js'
import * as ui from './ui.js'
import * as alg from './algoritmo.js'

console.log('app.js carregado')

// estado da aplicação
let dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }
let configuracoes = {
  limiteHoras: 6,
  inicioDisponivel: '08:00',
  fimDisponivel: '18:00'
}

function calcularCompensacaoPorIdade(idade) {
  const idadeLimpa = Math.min(Math.max(idade, 10), 70)
  return 3 + Math.round(((idadeLimpa - 10) / 60) * 12)
}

function parseHorario(horario) {
  if (!horario) return null
  const partes = horario.split(':').map(Number)
  if (partes.length !== 2 || partes.some(Number.isNaN)) return null
  return partes[0] * 60 + partes[1]
}

function obterDisponibilidade() {
  const inicio = document.getElementById('inicio-disponivel')?.value
  const fim = document.getElementById('fim-disponivel')?.value
  const inicioMinutos = parseHorario(inicio)
  const fimMinutos = parseHorario(fim)
  if (
    inicioMinutos === null ||
    fimMinutos === null ||
    fimMinutos <= inicioMinutos
  )
    return null
  return {
    inicio,
    fim,
    inicioMinutos,
    fimMinutos,
    disponivel: fimMinutos - inicioMinutos
  }
}

function calcularLimiteDeTempo() {
  const limiteHoras = parseInt(document.getElementById('limite-horas').value)
  const limiteMinutos = (isNaN(limiteHoras) ? 6 : limiteHoras) * 60
  const disponibilidade = obterDisponibilidade()
  if (!disponibilidade) return limiteMinutos
  return Math.min(limiteMinutos, disponibilidade.disponivel)
}

// --- funções exportadas como API de interação com HTML ---

// ligado no carregamento da página para garantir que o botão exista
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-iniciar')
    if (btn) btn.addEventListener('click', entrarNoSistema)

    // formulário auxilia na captura do Enter sem refresh
    const form = document.getElementById('dados-usuario')
    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault()
        entrarNoSistema()
      })
    }

    // liga sugestões inteligentes de tarefas
    if (ui && typeof ui.inicializarSugestoes === 'function') {
      ui.inicializarSugestoes()
    }
  })
}
export function entrarNoSistema() {
  console.log('entra: iniciar otimização chamada')
  const inputNome = document.getElementById('seu-nome')
  const inputIdade = document.getElementById('sua-idade')

  const nome = inputNome.value.trim()
  const idade = parseInt(inputIdade.value)
  console.log('dados fornecidos:', { nome, idade, raw: inputIdade.value })

  if (!nome || !idade || isNaN(idade)) {
    console.log('falha na validação de entrada', { nome, idade })
    return alert('Por favor, preencha corretamente seu nome e idade!')
  }

  const dadosSalvos = storage.carregarDadosUsuario(nome)
  if (dadosSalvos) {
    tarefas.definirLista(dadosSalvos.listaTarefas || [])
    dadosUsuario = dadosSalvos.dadosUsuario || dadosUsuario
    configuracoes = dadosSalvos.configuracoes || configuracoes
  }

  let calcFoco = Math.floor(90 - Math.abs(idade - 25) * 1.2)
  dadosUsuario = { nome, idade, focoMaximo: Math.max(25, calcFoco) }

  ui.atualizarSaudacao(dadosUsuario.nome)
  ui.atualizarEstatisticasBio(dadosUsuario.focoMaximo)

  document.getElementById('limite-horas').value = configuracoes.limiteHoras
  const inicioCampo = document.getElementById('inicio-disponivel')
  const fimCampo = document.getElementById('fim-disponivel')
  if (inicioCampo) inicioCampo.value = configuracoes.inicioDisponivel || '08:00'
  if (fimCampo) fimCampo.value = configuracoes.fimDisponivel || '18:00'

  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  ui.transicionarParaTelaPrincipal()

  setTimeout(() => atualizarGraficos(), 50)
}

export function renderizarGrafico() {
  atualizarGraficos()
}

// recalcula energias e tempo livre
export function atualizarGraficos() {
  const compensacao = calcularCompensacaoPorIdade(dadosUsuario.idade || 25)
  ui.renderizarGrafico(compensacao)
  const limiteMinutos = calcularLimiteDeTempo()
  const usado = tarefas.filtrarAtivas().reduce((sum, t) => sum + t.tempo, 0)
  ui.renderizarGraficoLivre(usado, limiteMinutos)
}

// expõe funções para HTML
window.entrarNoSistema = entrarNoSistema
window.trocarUsuario = trocarUsuario
window.adicionarTarefa = adicionarTarefa
window.editarTarefa = editarTarefa
window.toggleConcluidaTarefa = toggleConcluidaTarefa
window.limparConcluidas = limparConcluidas
window.limparTodas = limparTodas
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
  tarefas.limparTodas()
  dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }
  configuracoes = {
    limiteHoras: 6,
    inicioDisponivel: '08:00',
    fimDisponivel: '18:00'
  }
  document.getElementById('seu-nome').value = ''
  document.getElementById('sua-idade').value = ''
  ui.limparInterface()
  ui.transicionarParaTelaInicial()
  atualizarGraficos()
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

  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function excluirTarefa(id) {
  tarefas.excluir(id)
  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function toggleConcluidaTarefa(id) {
  tarefas.toggleConcluida(id)
  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function editarTarefa(id) {
  const t = tarefas.listaTarefas.find(x => x.id === id)
  if (!t) return
  const novoNome = prompt('Nome da tarefa', t.nome)
  if (novoNome === null) return
  const novoPeso = prompt('Peso (1-10)', t.peso)
  if (novoPeso === null) return
  const novoTempo = prompt('Tempo em minutos', t.tempo)
  if (novoTempo === null) return

  tarefas.editar(id, {
    nome: novoNome.trim() || t.nome,
    peso: parseFloat(novoPeso) || t.peso,
    tempo: parseFloat(novoTempo) || t.tempo
  })

  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function limparConcluidas() {
  tarefas.limparConcluidas()
  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function limparTodas() {
  if (!confirm('Deseja realmente apagar todas as tarefas?')) return
  tarefas.limparTodas()
  ui.atualizarListaNaTela(tarefas.listaTarefas, {
    excluir: excluirTarefa,
    editar: editarTarefa,
    toggleConcluida: toggleConcluidaTarefa
  })
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function otimizarDia() {
  const containerLista = document.getElementById('resultado-otimizacao')
  if (tarefas.listaTarefas.length === 0)
    return alert('Adicione tarefas ao inventário primeiro!')

  const disponibilidade = obterDisponibilidade()
  if (!disponibilidade)
    return alert(
      'Informe um período disponível válido: início e fim de trabalho.'
    )

  const limiteHoras =
    parseInt(document.getElementById('limite-horas').value) || 6
  const limiteMinutos = Math.min(limiteHoras * 60, disponibilidade.disponivel)

  const tarefasOrdenadas = tarefas
    .filtrarAtivas()
    .sort((a, b) => b.peso - a.peso)
  const compensacao = calcularCompensacaoPorIdade(dadosUsuario.idade || 25)
  const resultado = alg.gerarAgendaHTML(
    tarefasOrdenadas,
    limiteMinutos,
    disponibilidade.inicioMinutos,
    compensacao
  )
  ui.mostrarResultado(
    resultado.html +
      '<button class="botao-whatsapp" onclick="enviarParaWhatsApp()">📱 Enviar para WhatsApp</button>'
  )
  const statsBox = document.getElementById('resumo-agenda')
  if (statsBox) {
    const livre = resultado.stats.limite - resultado.stats.utilizado
    statsBox.innerText = `Usado: ${resultado.stats.utilizado} min; Livre: ${
      livre >= 0 ? livre : 0
    } min; Não agendadas: ${resultado.stats.naoAgendadas}`
  }

  configuracoes.limiteHoras = limiteHoras
  configuracoes.inicioDisponivel = disponibilidade.inicio
  configuracoes.fimDisponivel = disponibilidade.fim
  storage.salvarDadosUsuario(
    dadosUsuario.nome,
    tarefas.listaTarefas,
    dadosUsuario,
    configuracoes
  )
  atualizarGraficos()
}

export function enviarParaWhatsApp() {
  if (tarefas.filtrarAtivas().length === 0)
    return alert('Gere a agenda primeiro!')

  const disponibilidade = obterDisponibilidade()
  if (!disponibilidade)
    return alert('Informe um período disponível válido antes de enviar.')

  const limiteHoras =
    parseInt(document.getElementById('limite-horas').value) || 6
  const limiteMinutos = Math.min(limiteHoras * 60, disponibilidade.disponivel)
  const nome = dadosUsuario.nome
  const compensacao = calcularCompensacaoPorIdade(dadosUsuario.idade || 25)

  const mensagem = alg.gerarMensagemWhatsApp(
    tarefas.filtrarAtivas().sort((a, b) => b.peso - a.peso),
    limiteMinutos,
    disponibilidade.inicioMinutos,
    compensacao,
    nome
  )
  const urlWhatsApp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  window.open(urlWhatsApp, '_blank')
}
