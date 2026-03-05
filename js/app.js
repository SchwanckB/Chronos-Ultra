import * as storage from './storage.js'
import * as tarefas from './tarefas.js'
import * as ui from './ui.js'
import * as alg from './algoritmo.js'

console.log('app.js carregado')

// estado da aplicação
let dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }
let configuracoes = { cronotipo: '3', limiteHoras: 6 }

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

  document.getElementById('cronotipo-usuario').value = configuracoes.cronotipo
  document.getElementById('limite-horas').value = configuracoes.limiteHoras

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
  const compensacao = parseInt(
    document.getElementById('cronotipo-usuario').value
  )
  ui.renderizarGrafico(compensacao)
  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
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
  configuracoes = { cronotipo: '3', limiteHoras: 6 }
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

  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
  const turno = document.getElementById('cronotipo-usuario').value

  // só considera tarefas ativas (não concluídas)
  const tarefasOrdenadas = tarefas
    .filtrarAtivas()
    .sort((a, b) => b.peso - a.peso)
  const resultado = alg.gerarAgendaHTML(tarefasOrdenadas, limiteMinutos, turno)
  ui.mostrarResultado(
    resultado.html +
      `<button onclick="enviarParaWhatsApp()" style="margin-top: 16px; background: #25d366; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer;">📱 Enviar para WhatsApp</button>`
  )
  const statsBox = document.getElementById('resumo-agenda')
  if (statsBox) {
    const livre = resultado.stats.limite - resultado.stats.utilizado
    statsBox.innerText = `Usado: ${resultado.stats.utilizado} min; Livre: ${
      livre >= 0 ? livre : 0
    } min; Não agendadas: ${resultado.stats.naoAgendadas}`
  }

  configuracoes.cronotipo = turno
  configuracoes.limiteHoras = limiteMinutos / 60
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
  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
  const turno = document.getElementById('cronotipo-usuario').value
  const nome = dadosUsuario.nome

  const mensagem = alg.gerarMensagemWhatsApp(
    tarefas.filtrarAtivas().sort((a, b) => b.peso - a.peso),
    limiteMinutos,
    turno,
    nome
  )
  const urlWhatsApp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  window.open(urlWhatsApp, '_blank')
}
