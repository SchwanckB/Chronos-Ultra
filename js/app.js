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
  fimDisponivel: '18:00',
  interrupcoes: []
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

function criarItemInterrupcaoDOM(interrupcao = {}) {
  const nome = interrupcao.nome || 'Interrupção'
  const inicio = interrupcao.inicio || '12:00'
  const fim = interrupcao.fim || '13:00'
  const tipo = interrupcao.tipo || 'Almoço'

  const container = document.createElement('div')
  container.className = 'item-interrupcao'

  container.innerHTML = `
    <div class="item-interrupcao-info">
      <strong>${tipo}</strong>
      <span>${nome}</span>
      <small>${inicio} - ${fim}</small>
    </div>
    <button type="button" class="botao-remover-interrupcao">
      Remover
    </button>
    <input type="hidden" class="interrupcao-nome" value="${nome}" />
    <input type="hidden" class="interrupcao-inicio" value="${inicio}" />
    <input type="hidden" class="interrupcao-fim" value="${fim}" />
    <input type="hidden" class="interrupcao-tipo" value="${tipo}" />
  `
  return container
}

function carregarInterrupcoesNaTela(interrupcoes = []) {
  const checkbox = document.getElementById('tem-interrupcoes')
  const detalhes = document.getElementById('interrupcoes-detalhes')
  const lista = document.getElementById('lista-interrupcoes')
  if (!checkbox || !detalhes || !lista) return

  checkbox.checked = interrupcoes.length > 0
  detalhes.classList.toggle('ativa', checkbox.checked)
  lista.innerHTML = ''

  if (checkbox.checked) {
    interrupcoes.forEach(item => adicionarInterrupcaoNaTela(item))
  }
}

function adicionarInterrupcaoNaTela(interrupcao = {}) {
  const lista = document.getElementById('lista-interrupcoes')
  if (!lista) return
  lista.appendChild(criarItemInterrupcaoDOM(interrupcao))
}

function adicionarInterrupcaoDoFormulario(event) {
  event.preventDefault()
  const nome = document.getElementById('nome-interrupcao')?.value.trim() || ''
  const inicio = document.getElementById('inicio-interrupcao')?.value
  const fim = document.getElementById('fim-interrupcao')?.value
  const tipo = document.getElementById('tipo-interrupcao')?.value || 'Outra'

  if (!inicio || !fim) {
    return alert('Informe horário de início e fim para a interrupção.')
  }
  const inicioMinutos = parseHorario(inicio)
  const fimMinutos = parseHorario(fim)
  if (inicioMinutos === null || fimMinutos === null || fimMinutos <= inicioMinutos) {
    return alert('Informe um intervalo válido para a interrupção.')
  }

  adicionarInterrupcaoNaTela({ nome, inicio, fim, tipo })
  renderizarGrafico()

  const inputNome = document.getElementById('nome-interrupcao')
  const inputInicio = document.getElementById('inicio-interrupcao')
  const inputFim = document.getElementById('fim-interrupcao')
  if (inputNome) inputNome.value = ''
  if (inputInicio) inputInicio.value = '12:00'
  if (inputFim) inputFim.value = '13:00'
}

function toggleInterrupcoesVisibilidade() {
  const checkbox = document.getElementById('tem-interrupcoes')
  const detalhes = document.getElementById('interrupcoes-detalhes')
  if (!checkbox || !detalhes) return

  detalhes.classList.toggle('ativa', checkbox.checked)
  if (checkbox.checked && !document.querySelector('.item-interrupcao')) {
    adicionarInterrupcaoNaTela()
  }
}

function obterInterrupcoesDoDOM() {
  const checkbox = document.getElementById('tem-interrupcoes')
  if (!checkbox || !checkbox.checked) return []
  const itens = Array.from(document.querySelectorAll('.item-interrupcao'))
  return itens
    .map(item => {
      const nome = item.querySelector('.interrupcao-nome')?.value.trim() || ''
      const inicio = item.querySelector('.interrupcao-inicio')?.value
      const fim = item.querySelector('.interrupcao-fim')?.value
      const tipo = item.querySelector('.interrupcao-tipo')?.value || 'Outra'
      const inicioMinutos = parseHorario(inicio)
      const fimMinutos = parseHorario(fim)
      if (
        inicioMinutos === null ||
        fimMinutos === null ||
        fimMinutos <= inicioMinutos
      )
        return null
      return {
        nome,
        tipo,
        inicio,
        fim,
        inicioMinutos,
        fimMinutos
      }
    })
    .filter(Boolean)
}

function normalizarInterrupcoes(interrupcoes, inicioMinutos, fimMinutos) {
  const ordenadas = (interrupcoes || [])
    .map(item => ({
      inicioMinutos: Math.max(inicioMinutos, item.inicioMinutos),
      fimMinutos: Math.min(fimMinutos, item.fimMinutos),
      descricao: item.tipo
        ? `${item.tipo}: ${item.nome || ''}`.trim()
        : item.nome
    }))
    .filter(item => item.fimMinutos > item.inicioMinutos)
    .sort((a, b) => a.inicioMinutos - b.inicioMinutos)

  const resultado = []
  let atual = null

  ordenadas.forEach(item => {
    if (!atual) {
      atual = { ...item }
      return
    }
    if (item.inicioMinutos <= atual.fimMinutos) {
      atual.fimMinutos = Math.max(atual.fimMinutos, item.fimMinutos)
      atual.descricao = atual.descricao
        ? `${atual.descricao} / ${item.descricao}`
        : item.descricao
    } else {
      resultado.push(atual)
      atual = { ...item }
    }
  })
  if (atual) resultado.push(atual)
  return resultado
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

  const interrupcoes = obterInterrupcoesDoDOM()
  const interrupcoesNormalizadas = normalizarInterrupcoes(
    interrupcoes,
    inicioMinutos,
    fimMinutos
  )
  const bloqueado = interrupcoesNormalizadas.reduce(
    (sum, item) => sum + (item.fimMinutos - item.inicioMinutos),
    0
  )
  const disponivel = Math.max(0, fimMinutos - inicioMinutos - bloqueado)

  return {
    inicio,
    fim,
    inicioMinutos,
    fimMinutos,
    disponivel,
    interrupcoes,
    interrupcoesNormalizadas
  }
}

function calcularLimiteDeTempo() {
  const limiteInput = document.getElementById('limite-horas')
  const limiteHoras = limiteInput
    ? parseInt(limiteInput.value)
    : configuracoes.limiteHoras || 6
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

    const formInventario = document.getElementById('form-inventario-tarefas')
    if (formInventario) {
      formInventario.addEventListener('submit', event => {
        event.preventDefault()
        adicionarTarefa()
      })
    }

    const formInterrupcoes = document.getElementById('form-interrupcoes')
    if (formInterrupcoes) {
      formInterrupcoes.addEventListener('submit', adicionarInterrupcaoDoFormulario)
    }

    const inputNomeUsuario = document.getElementById('seu-nome')
    const inputIdadeUsuario = document.getElementById('sua-idade')
    if (inputNomeUsuario && inputIdadeUsuario) {
      inputNomeUsuario.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          inputIdadeUsuario.focus()
        }
      })
      inputIdadeUsuario.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          entrarNoSistema()
        }
      })
    }

    const inputNomeTarefa = document.getElementById('nome-tarefa')
    const inputPesoTarefa = document.getElementById('peso-tarefa')
    const inputTempoTarefa = document.getElementById('tempo-tarefa')
    if (inputNomeTarefa && inputPesoTarefa && inputTempoTarefa) {
      inputNomeTarefa.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          inputPesoTarefa.focus()
        }
      })
      inputPesoTarefa.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          inputTempoTarefa.focus()
        }
      })
      inputTempoTarefa.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          adicionarTarefa()
        }
      })
    }

    // liga sugestões inteligentes de tarefas
    if (ui && typeof ui.inicializarSugestoes === 'function') {
      ui.inicializarSugestoes()
    }

    const temInterrupcoes = document.getElementById('tem-interrupcoes')
    if (temInterrupcoes) {
      temInterrupcoes.addEventListener('change', () => {
        toggleInterrupcoesVisibilidade()
        renderizarGrafico()
      })
    }

    const btnAddInterrupcao = document.getElementById(
      'btn-adicionar-interrupcao'
    )
    if (btnAddInterrupcao) {
      btnAddInterrupcao.addEventListener('click', () => {
        adicionarInterrupcaoNaTela()
        renderizarGrafico()
      })
    }

    const listaInterrupcoes = document.getElementById('lista-interrupcoes')
    if (listaInterrupcoes) {
      listaInterrupcoes.addEventListener('click', event => {
        if (event.target.matches('.botao-remover-interrupcao')) {
          event.target.closest('.item-interrupcao')?.remove()
          renderizarGrafico()
        }
      })
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

  const limiteHorasCampo = document.getElementById('limite-horas')
  if (limiteHorasCampo) limiteHorasCampo.value = configuracoes.limiteHoras
  const inicioCampo = document.getElementById('inicio-disponivel')
  const fimCampo = document.getElementById('fim-disponivel')
  if (inicioCampo) inicioCampo.value = configuracoes.inicioDisponivel || '08:00'
  if (fimCampo) fimCampo.value = configuracoes.fimDisponivel || '18:00'
  carregarInterrupcoesNaTela(configuracoes.interrupcoes || [])

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
    fimDisponivel: '18:00',
    interrupcoes: []
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
    disponibilidade,
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
  configuracoes.interrupcoes = obterInterrupcoesDoDOM()
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
    disponibilidade,
    compensacao,
    nome
  )
  const urlWhatsApp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`
  window.open(urlWhatsApp, '_blank')
}
