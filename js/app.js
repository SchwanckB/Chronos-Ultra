/**
 * Chronos Ultra — orquestrador da aplicação.
 *
 * Mantém o estado em memória, reage aos eventos da interface e delega:
 *  · regras de agendamento .......... algoritmo.js
 *  · desenho da tela ................ ui.js / calendario.js / graficos.js
 *  · persistência ................... storage.js
 */

import * as storage from './storage.js'
import * as tarefas from './tarefas.js'
import * as ui from './ui.js'
import * as alg from './algoritmo.js'
import * as calendario from './calendario.js'
import * as graficos from './graficos.js'
import * as foco from './foco.js'
import {
  notificar,
  confirmar,
  abrirFormulario,
  copiarTexto,
  baixarArquivo
} from './componentes.js'

const $ = seletor => document.querySelector(seletor)
const $$ = seletor => Array.from(document.querySelectorAll(seletor))

const CONFIG_PADRAO = {
  limiteHoras: 6,
  inicioDisponivel: '08:00',
  fimDisponivel: '18:00',
  interrupcoes: []
}

const estado = {
  perfil: { nome: '', idade: 0, cronotipo: 'intermediario' },
  bio: alg.montarPerfilBiologico({ idade: 25, cronotipo: 'intermediario' }),
  configuracoes: { ...CONFIG_PADRAO },
  agendas: {},
  historico: [],
  agendaAtual: null,
  dataAgenda: calendario.chaveData(new Date()),
  tema: 'escuro',
  autenticado: false
}

/* =========================================================================
   Persistência
   ========================================================================= */

let timerSalvar = null

const MAX_AGENDAS_GUARDADAS = 90

/** Mantém apenas as agendas mais recentes para não inflar o localStorage. */
function podarAgendas() {
  const chaves = Object.keys(estado.agendas).sort()
  chaves.slice(0, Math.max(0, chaves.length - MAX_AGENDAS_GUARDADAS)).forEach(chave => {
    delete estado.agendas[chave]
  })
}

function salvar({ imediato = false } = {}) {
  if (!estado.autenticado || !estado.perfil.nome) return
  clearTimeout(timerSalvar)
  const gravar = () => {
    podarAgendas()
    estado.historico = tarefas.montarHistorico(estado.historico)
    storage.salvarDocumento(estado.perfil.nome, {
      perfil: { ...estado.perfil, focoMaximo: estado.bio.focoMaximo },
      configuracoes: estado.configuracoes,
      tarefas: tarefas.listaTarefas,
      agendas: estado.agendas,
      historico: estado.historico
    })
  }
  if (imediato) gravar()
  else timerSalvar = setTimeout(gravar, 400)
}

/* =========================================================================
   Leitura da configuração
   ========================================================================= */

function lerConfiguracaoDaTela() {
  const inicio = $('#inicio-disponivel')?.value || CONFIG_PADRAO.inicioDisponivel
  const fim = $('#fim-disponivel')?.value || CONFIG_PADRAO.fimDisponivel
  const limite = Number($('#limite-horas')?.value)

  estado.configuracoes.inicioDisponivel = inicio
  estado.configuracoes.fimDisponivel = fim
  estado.configuracoes.limiteHoras = Number.isFinite(limite)
    ? Math.min(Math.max(limite, 0.5), 16)
    : CONFIG_PADRAO.limiteHoras

  return estado.configuracoes
}

function aplicarConfiguracaoNaTela() {
  const { limiteHoras, inicioDisponivel, fimDisponivel } = estado.configuracoes
  if ($('#inicio-disponivel')) $('#inicio-disponivel').value = inicioDisponivel
  if ($('#fim-disponivel')) $('#fim-disponivel').value = fimDisponivel
  if ($('#limite-horas')) $('#limite-horas').value = limiteHoras
  ui.renderizarInterrupcoes(estado.configuracoes.interrupcoes)
}

function montarJanelaAtual() {
  const config = lerConfiguracaoDaTela()
  return alg.montarJanela({
    inicio: config.inicioDisponivel,
    fim: config.fimDisponivel,
    interrupcoes: config.interrupcoes
  })
}

function limiteMinutos(janela) {
  const teto = estado.configuracoes.limiteHoras * 60
  return janela ? Math.min(teto, janela.disponivel) : teto
}

function dataReferencia() {
  const [ano, mes, dia] = estado.dataAgenda.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

/* =========================================================================
   Atualização do painel
   ========================================================================= */

function atualizarPainel({ regerar = false } = {}) {
  const janela = montarJanelaAtual()
  const teto = limiteMinutos(janela)

  atualizarAvisoJanela(janela)
  ui.renderizarResumoInventario(tarefas.estatisticas(), teto)

  if (regerar && estado.agendaAtual) gerarAgenda({ silencioso: true })

  const agenda = estado.agendaAtual
  graficos.renderizarEnergia(estado.bio, janela, agenda?.eventos || [])
  graficos.renderizarDistribuicao(
    agenda?.stats || {
      trabalhados: 0,
      minutosPausa: 0,
      minutosInterrupcao: janela?.bloqueado || 0,
      minutosLivres: janela?.disponivel || 0
    }
  )
  ui.renderizarIndicadores(agenda)
  ui.definirEstadoAcoesAgenda(Boolean(agenda?.eventos?.length))
}

function atualizarAvisoJanela(janela) {
  const aviso = $('#aviso-janela')
  if (!aviso) return

  if (!janela) {
    aviso.hidden = false
    aviso.className = 'aviso-inline aviso-inline--erro'
    aviso.textContent = 'Janela inválida: revise os horários de início e fim.'
    return
  }

  const teto = limiteMinutos(janela)
  const partes = [
    `Janela de ${alg.formatarDuracao(janela.total)}`,
    janela.bloqueado ? `${alg.formatarDuracao(janela.bloqueado)} em compromissos` : null,
    `${alg.formatarDuracao(teto)} de trabalho no máximo`
  ].filter(Boolean)

  aviso.hidden = false
  aviso.className = 'aviso-inline'
  aviso.textContent = partes.join(' • ') + (janela.cruzaMeiaNoite ? ' • turno cruza a meia-noite' : '')
}

/* =========================================================================
   Entrada no sistema
   ========================================================================= */

function entrarNoSistema(evento) {
  evento?.preventDefault()

  const nome = $('#seu-nome')?.value.trim() || ''
  const idade = Number($('#sua-idade')?.value)
  const cronotipo = $('input[name="cronotipo"]:checked')?.value || 'intermediario'

  if (nome.length < 2) {
    notificar('Digite seu primeiro nome para continuar.', { tipo: 'erro' })
    $('#seu-nome')?.focus()
    return
  }
  if (!Number.isFinite(idade) || idade < 8 || idade > 100) {
    notificar('Informe uma idade entre 8 e 100 anos.', { tipo: 'erro' })
    $('#sua-idade')?.focus()
    return
  }

  const documento = storage.carregarDocumento(nome) || storage.documentoVazio(nome)

  estado.perfil = { nome, idade, cronotipo }
  estado.bio = alg.montarPerfilBiologico({ idade, cronotipo })
  estado.configuracoes = { ...CONFIG_PADRAO, ...documento.configuracoes }
  estado.configuracoes.interrupcoes = Array.isArray(documento.configuracoes?.interrupcoes)
    ? documento.configuracoes.interrupcoes
    : []
  estado.agendas = documento.agendas || {}
  estado.historico = documento.historico || []
  estado.agendaAtual = null
  estado.autenticado = true

  tarefas.definirLista(documento.tarefas || [])

  ui.atualizarCabecalho(estado.perfil, estado.bio)
  aplicarConfiguracaoNaTela()
  ui.renderizarListaTarefas(tarefas.listaTarefas)
  ui.renderizarAgenda(null)
  definirDataAgenda(calendario.chaveData(new Date()))
  ui.mostrarTela('tela-painel')
  atualizarPainel()
  salvar({ imediato: true })

  const recuperada = estado.agendas[estado.dataAgenda]
  if (recuperada) {
    estado.agendaAtual = recuperada
    ui.renderizarAgenda(recuperada)
    atualizarPainel()
    notificar('Recuperamos a agenda que você já tinha gerado hoje.', { tipo: 'info' })
  } else {
    notificar(
      `Bem-vindo, ${nome}! Seu foco contínuo ideal é de ${estado.bio.focoMaximo} minutos.`,
      { tipo: 'sucesso' }
    )
  }
}

async function trocarPerfil() {
  const ok = await confirmar({
    titulo: 'Trocar de perfil?',
    mensagem: 'Seus dados ficam salvos neste navegador e voltam quando você entrar com o mesmo nome.',
    rotuloConfirmar: 'Trocar perfil'
  })
  if (!ok) return

  salvar({ imediato: true })
  foco.pararFoco()
  tarefas.limparTodas()
  estado.perfil = { nome: '', idade: 0, cronotipo: 'intermediario' }
  estado.configuracoes = { ...CONFIG_PADRAO, interrupcoes: [] }
  estado.agendas = {}
  estado.agendaAtual = null
  estado.autenticado = false

  ui.limparPainel()
  if ($('#seu-nome')) $('#seu-nome').value = ''
  if ($('#sua-idade')) $('#sua-idade').value = ''
  ui.mostrarTela('tela-boas-vindas')
  $('#seu-nome')?.focus()
}

/* =========================================================================
   Tarefas
   ========================================================================= */

function adicionarTarefa(evento) {
  evento?.preventDefault()

  const nome = $('#nome-tarefa')?.value.trim() || ''
  const peso = Number($('#peso-tarefa')?.value)
  const tempo = Number($('#tempo-tarefa')?.value)
  const categoria = $('#categoria-tarefa')?.value
  const prazo = $('#prazo-tarefa')?.value || null

  if (nome.length < 2) {
    notificar('Dê um nome à tarefa (mínimo 2 letras).', { tipo: 'erro' })
    $('#nome-tarefa')?.focus()
    return
  }
  if (!Number.isFinite(peso) || peso < 1 || peso > 10) {
    notificar('O peso deve ficar entre 1 e 10.', { tipo: 'erro' })
    $('#peso-tarefa')?.focus()
    return
  }
  if (!Number.isFinite(tempo) || tempo < 1) {
    notificar('Informe a duração da tarefa em minutos.', { tipo: 'erro' })
    $('#tempo-tarefa')?.focus()
    return
  }

  const criada = tarefas.adicionar({ nome, peso, tempo, categoria, prazo })

  if (criada.tempo > estado.bio.focoMaximo) {
    notificar(
      `"${criada.nome}" passa do seu foco contínuo (${estado.bio.focoMaximo} min). Vamos dividir em blocos com pausas.`,
      { tipo: 'info', duracao: 6000 }
    )
  }

  $('#form-tarefa')?.reset()
  $('#categoria-tarefa').value = categoria
  ui.mostrarSugestao(null)
  $('#nome-tarefa')?.focus()

  ui.renderizarListaTarefas(tarefas.listaTarefas)
  atualizarPainel({ regerar: true })
  salvar()
}

async function editarTarefa(id) {
  const tarefa = tarefas.obter(id)
  if (!tarefa) return

  const dados = await abrirFormulario({
    titulo: 'Editar tarefa',
    descricao: 'Ajuste os dados e o planejamento é recalculado na hora.',
    rotuloConfirmar: 'Salvar alterações',
    campos: [
      { id: 'nome', rotulo: 'Nome da tarefa', valor: tarefa.nome },
      {
        id: 'categoria',
        rotulo: 'Categoria',
        tipo: 'select',
        valor: tarefa.categoria,
        opcoes: tarefas.CATEGORIAS.map(c => ({ valor: c.id, rotulo: `${c.icone} ${c.rotulo}` }))
      },
      { id: 'peso', rotulo: 'Peso (1 a 10)', tipo: 'number', min: 1, max: 10, step: 1, valor: tarefa.peso, largura: 'metade' },
      { id: 'tempo', rotulo: 'Minutos', tipo: 'number', min: 1, max: 1440, step: 5, valor: tarefa.tempo, largura: 'metade' },
      { id: 'prazo', rotulo: 'Prazo (opcional)', tipo: 'date', valor: tarefa.prazo || '' }
    ],
    validar: valores => {
      if (!valores.nome || valores.nome.trim().length < 2) return 'Informe um nome válido.'
      if (!(valores.peso >= 1 && valores.peso <= 10)) return 'O peso precisa ficar entre 1 e 10.'
      if (!(valores.tempo >= 1)) return 'A duração precisa ser de pelo menos 1 minuto.'
      return null
    }
  })
  if (!dados) return

  tarefas.editar(id, { ...dados, prazo: dados.prazo || null })
  ui.renderizarListaTarefas(tarefas.listaTarefas)
  atualizarPainel({ regerar: true })
  salvar()
  notificar('Tarefa atualizada.', { tipo: 'sucesso' })
}

function excluirTarefa(id) {
  const removida = tarefas.excluir(id)
  if (!removida) return

  ui.renderizarListaTarefas(tarefas.listaTarefas)
  atualizarPainel({ regerar: true })
  salvar()

  notificar(`"${removida.tarefa.nome}" foi removida.`, {
    tipo: 'info',
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => {
        tarefas.reinserir(removida.tarefa, removida.indice)
        ui.renderizarListaTarefas(tarefas.listaTarefas)
        atualizarPainel({ regerar: true })
        salvar()
      }
    }
  })
}

function alternarConcluida(id) {
  const tarefa = tarefas.toggleConcluida(id)
  if (!tarefa) return
  ui.renderizarListaTarefas(tarefas.listaTarefas)
  atualizarPainel({ regerar: true })
  salvar()
  if (tarefa.concluida) notificar(`"${tarefa.nome}" concluída. 🎉`, { tipo: 'sucesso', duracao: 2600 })
}

async function limparConcluidas() {
  const concluidas = tarefas.listaTarefas.filter(t => t.concluida)
  if (!concluidas.length) {
    notificar('Não há tarefas concluídas para limpar.', { tipo: 'info' })
    return
  }
  const ok = await confirmar({
    titulo: 'Limpar concluídas?',
    mensagem: `${concluidas.length} tarefa(s) serão removidas do inventário.`,
    rotuloConfirmar: 'Limpar'
  })
  if (!ok) return

  const removidas = tarefas.limparConcluidas()
  ui.renderizarListaTarefas(tarefas.listaTarefas)
  atualizarPainel({ regerar: true })
  salvar()
  notificar(`${removidas.length} tarefa(s) concluída(s) removida(s).`, {
    tipo: 'sucesso',
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => {
        removidas.forEach(t => tarefas.reinserir(t))
        ui.renderizarListaTarefas(tarefas.listaTarefas)
        atualizarPainel({ regerar: true })
        salvar()
      }
    }
  })
}

async function limparTodas() {
  if (!tarefas.listaTarefas.length) {
    notificar('O inventário já está vazio.', { tipo: 'info' })
    return
  }
  const ok = await confirmar({
    titulo: 'Apagar todas as tarefas?',
    mensagem: 'Esta ação remove o inventário inteiro. Você poderá desfazer logo em seguida.',
    rotuloConfirmar: 'Apagar tudo',
    perigo: true
  })
  if (!ok) return

  const removidas = tarefas.limparTodas()
  estado.agendaAtual = null
  ui.renderizarListaTarefas(tarefas.listaTarefas)
  ui.renderizarAgenda(null)
  atualizarPainel()
  salvar()
  notificar('Inventário apagado.', {
    tipo: 'info',
    duracao: 8000,
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => {
        tarefas.definirLista(removidas)
        ui.renderizarListaTarefas(tarefas.listaTarefas)
        atualizarPainel()
        salvar()
      }
    }
  })
}

/* =========================================================================
   Compromissos fixos (interrupções)
   ========================================================================= */

function adicionarInterrupcao(evento) {
  evento?.preventDefault()

  const tipo = $('#tipo-interrupcao')?.value || 'Outro'
  const nome = $('#nome-interrupcao')?.value.trim() || ''
  const inicio = $('#inicio-interrupcao')?.value
  const fim = $('#fim-interrupcao')?.value

  const inicioMin = alg.parseHorario(inicio)
  const fimMin = alg.parseHorario(fim)
  if (inicioMin === null || fimMin === null) {
    notificar('Informe início e fim do compromisso.', { tipo: 'erro' })
    return
  }
  if (inicioMin === fimMin) {
    notificar('O compromisso precisa ter duração maior que zero.', { tipo: 'erro' })
    return
  }

  estado.configuracoes.interrupcoes.push({ tipo, nome, inicio, fim })
  ui.renderizarInterrupcoes(estado.configuracoes.interrupcoes)
  if ($('#nome-interrupcao')) $('#nome-interrupcao').value = ''
  atualizarPainel({ regerar: true })
  salvar()
  notificar(`${tipo} adicionado à sua janela.`, { tipo: 'sucesso', duracao: 2600 })
}

function removerInterrupcao(indice) {
  const [removida] = estado.configuracoes.interrupcoes.splice(indice, 1)
  ui.renderizarInterrupcoes(estado.configuracoes.interrupcoes)
  atualizarPainel({ regerar: true })
  salvar()
  if (removida) {
    notificar('Compromisso removido.', {
      tipo: 'info',
      acao: {
        rotulo: 'Desfazer',
        aoClicar: () => {
          estado.configuracoes.interrupcoes.splice(indice, 0, removida)
          ui.renderizarInterrupcoes(estado.configuracoes.interrupcoes)
          atualizarPainel({ regerar: true })
          salvar()
        }
      }
    })
  }
}

/* =========================================================================
   Agenda
   ========================================================================= */

function definirDataAgenda(chave) {
  estado.dataAgenda = chave
  const campo = $('#data-agenda')
  if (campo) campo.value = chave
}

function gerarAgenda({ silencioso = false } = {}) {
  const ativas = tarefas.filtrarAtivas()
  if (!ativas.length) {
    // ao recalcular em segundo plano, preserva o plano já visível na tela
    if (silencioso) return estado.agendaAtual
    notificar('Adicione ao menos uma tarefa pendente antes de gerar a agenda.', { tipo: 'erro' })
    estado.agendaAtual = null
    ui.renderizarAgenda(null)
    return null
  }

  const janela = montarJanelaAtual()
  if (!janela) {
    if (!silencioso) notificar('A janela de trabalho está inválida. Confira os horários.', { tipo: 'erro' })
    return null
  }

  const agenda = alg.gerarAgenda({
    tarefas: ativas,
    janela,
    limiteMinutos: limiteMinutos(janela),
    perfil: estado.bio,
    referencia: dataReferencia()
  })

  estado.agendaAtual = agenda
  estado.agendas[estado.dataAgenda] = {
    eventos: agenda.eventos,
    stats: agenda.stats,
    geradoEm: new Date().toISOString()
  }

  ui.renderizarAgenda(agenda)
  ui.renderizarIndicadores(agenda)
  ui.definirEstadoAcoesAgenda(true)
  graficos.renderizarEnergia(estado.bio, janela, agenda.eventos)
  graficos.renderizarDistribuicao(agenda.stats)
  salvar()

  if (!silencioso) {
    const { stats } = agenda
    notificar(
      stats.naoAgendadas
        ? `Agenda pronta. ${stats.naoAgendadas} tarefa(s) não couberam — veja as sugestões no fim da lista.`
        : `Agenda pronta! ${alg.formatarDuracao(stats.minutosLivres)} de tempo livre preservados.`,
      { tipo: stats.naoAgendadas ? 'info' : 'sucesso', duracao: 6000 }
    )
    $('#resultado-agenda')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  return agenda
}

function enviarParaWhatsApp() {
  if (!estado.agendaAtual) return
  const texto = alg.gerarMensagemWhatsApp(estado.agendaAtual, estado.perfil.nome)
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
}

async function copiarAgenda() {
  if (!estado.agendaAtual) return
  const texto = alg.gerarMensagemWhatsApp(estado.agendaAtual, estado.perfil.nome)
  const ok = await copiarTexto(texto)
  notificar(ok ? 'Agenda copiada para a área de transferência.' : 'Não foi possível copiar automaticamente.', {
    tipo: ok ? 'sucesso' : 'erro'
  })
}

function exportarICS() {
  if (!estado.agendaAtual) return
  const conteudo = alg.gerarICS(estado.agendaAtual, dataReferencia(), estado.perfil.nome)
  baixarArquivo(`chronos-${estado.dataAgenda}.ics`, conteudo, 'text/calendar;charset=utf-8')
  notificar('Arquivo .ics baixado. Importe no Google Agenda, Outlook ou Apple Calendar.', {
    tipo: 'sucesso',
    duracao: 6000
  })
}

/* =========================================================================
   Navegação e tema
   ========================================================================= */

function abrirCalendario() {
  ui.mostrarTela('tela-calendario')
  calendario.renderizar()
}

/** Volta ao painel e redesenha os gráficos, que não medem enquanto ocultos. */
function voltarAoPainel() {
  ui.mostrarTela('tela-painel')
  if (estado.autenticado) atualizarPainel()
}

function alternarTema() {
  estado.tema = estado.tema === 'escuro' ? 'claro' : 'escuro'
  ui.aplicarTema(estado.tema)
  storage.salvarTema(estado.tema)
  const janela = montarJanelaAtual()
  graficos.atualizarTemaGraficos(
    estado.bio,
    janela,
    estado.agendaAtual?.eventos || [],
    estado.agendaAtual?.stats
  )
}

/* =========================================================================
   Ligação de eventos
   ========================================================================= */

function ligarEventosBoasVindas() {
  $('#form-boas-vindas')?.addEventListener('submit', entrarNoSistema)

  const ultimo = storage.ultimoPerfil()
  if (ultimo && $('#seu-nome')) {
    $('#seu-nome').value = ultimo.nome
    const documento = storage.carregarDocumento(ultimo.nome)
    if (documento?.perfil) {
      if ($('#sua-idade') && documento.perfil.idade) $('#sua-idade').value = documento.perfil.idade
      ui.preencherCronotipos(documento.perfil.cronotipo)
      return
    }
  }
  ui.preencherCronotipos('intermediario')
}

function ligarEventosInventario() {
  $('#form-tarefa')?.addEventListener('submit', adicionarTarefa)

  $('#lista-de-tarefas')?.addEventListener('click', evento => {
    const botao = evento.target.closest('[data-acao]')
    if (!botao) return
    const { acao, id } = botao.dataset
    if (acao === 'excluir') excluirTarefa(id)
    else if (acao === 'editar') editarTarefa(id)
    else if (acao === 'concluir') alternarConcluida(id)
  })

  $('#btn-limpar-concluidas')?.addEventListener('click', limparConcluidas)
  $('#btn-limpar-todas')?.addEventListener('click', limparTodas)

  const campoNome = $('#nome-tarefa')
  campoNome?.addEventListener('blur', () => {
    const sugestao = tarefas.obterSugestaoPorNome(campoNome.value, estado.historico)
    ui.mostrarSugestao(sugestao)
    if (!sugestao) return
    if (!$('#peso-tarefa').value) $('#peso-tarefa').value = sugestao.peso
    if (!$('#tempo-tarefa').value) $('#tempo-tarefa').value = sugestao.tempo
    if ($('#categoria-tarefa') && sugestao.categoria) $('#categoria-tarefa').value = sugestao.categoria
  })
  campoNome?.addEventListener('input', () => ui.mostrarSugestao(null))
}

function ligarEventosJanela() {
  ;['#inicio-disponivel', '#fim-disponivel', '#limite-horas'].forEach(seletor => {
    $(seletor)?.addEventListener('change', () => {
      atualizarPainel({ regerar: true })
      salvar()
    })
  })

  $('#form-interrupcao')?.addEventListener('submit', adicionarInterrupcao)
  $('#lista-interrupcoes')?.addEventListener('click', evento => {
    const botao = evento.target.closest('[data-remover-interrupcao]')
    if (botao) removerInterrupcao(Number(botao.dataset.removerInterrupcao))
  })
}

function ligarEventosAgenda() {
  $('#btn-gerar-agenda')?.addEventListener('click', () => gerarAgenda())
  $('#btn-whatsapp')?.addEventListener('click', enviarParaWhatsApp)
  $('#btn-copiar')?.addEventListener('click', copiarAgenda)
  $('#btn-ics')?.addEventListener('click', exportarICS)

  $('#data-agenda')?.addEventListener('change', evento => {
    definirDataAgenda(evento.target.value || calendario.chaveData(new Date()))
    const salva = estado.agendas[estado.dataAgenda]
    estado.agendaAtual = salva || null
    ui.renderizarAgenda(salva || null)
    atualizarPainel()
  })

  $('#resultado-agenda')?.addEventListener('click', evento => {
    const botao = evento.target.closest('[data-foco]')
    if (!botao) return
    foco.iniciarFoco({
      titulo: botao.dataset.titulo,
      minutos: Number(botao.dataset.minutos),
      aoConcluir: () => {
        const id = botao.dataset.tarefa
        const tarefa = id ? tarefas.obter(id) : null
        if (tarefa && !tarefa.concluida) alternarConcluida(id)
      }
    })
  })
}

function ligarEventosNavegacao() {
  $('#btn-ver-calendario')?.addEventListener('click', abrirCalendario)
  $('#btn-voltar-painel')?.addEventListener('click', voltarAoPainel)
  $('#btn-trocar-perfil')?.addEventListener('click', trocarPerfil)
  $('#btn-tema')?.addEventListener('click', alternarTema)

  $$('[data-visao]').forEach(botao => {
    botao.addEventListener('click', () => calendario.definirVisao(botao.dataset.visao))
  })
  $('#btn-periodo-anterior')?.addEventListener('click', () => calendario.navegar(-1))
  $('#btn-periodo-proximo')?.addEventListener('click', () => calendario.navegar(1))
  $('#btn-hoje')?.addEventListener('click', () => calendario.irParaHoje())
}

function ligarAtalhos() {
  document.addEventListener('keydown', evento => {
    const alvo = evento.target
    const digitando = alvo.matches('input, textarea, select') || alvo.isContentEditable
    if (digitando || evento.ctrlKey || evento.metaKey || evento.altKey) return
    if (!estado.autenticado) return

    if (evento.key === 'n') {
      evento.preventDefault()
      voltarAoPainel()
      $('#nome-tarefa')?.focus()
    } else if (evento.key === 'g') {
      evento.preventDefault()
      voltarAoPainel()
      gerarAgenda()
    } else if (evento.key === 'c') {
      evento.preventDefault()
      abrirCalendario()
    } else if (evento.key === 'Escape') {
      if (document.body.dataset.tela === 'tela-calendario') voltarAoPainel()
    }
  })
}

/* =========================================================================
   Inicialização
   ========================================================================= */

function iniciar() {
  estado.tema = storage.lerTema() || 'escuro'
  ui.aplicarTema(estado.tema)

  ui.preencherSelectCategorias($('#categoria-tarefa'), 'foco')
  ui.mostrarTela('tela-boas-vindas')

  calendario.inicializar({
    container: $('#calendario-conteudo'),
    rotuloPeriodo: $('#rotulo-periodo'),
    listaFeriados: $('#lista-feriados'),
    obterAgenda: chave => estado.agendas[chave] || null,
    aoMudarDia: data => {
      const chave = calendario.chaveData(data)
      definirDataAgenda(chave)
      estado.agendaAtual = estado.agendas[chave] || null
      ui.renderizarAgenda(estado.agendaAtual)
      if (estado.autenticado) atualizarPainel()
    }
  })

  ligarEventosBoasVindas()
  ligarEventosInventario()
  ligarEventosJanela()
  ligarEventosAgenda()
  ligarEventosNavegacao()
  ligarAtalhos()

  const anoRodape = $('#ano-atual')
  if (anoRodape) anoRodape.textContent = new Date().getFullYear()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar)
} else {
  iniciar()
}
