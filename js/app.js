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
import * as nav from './navegacao.js'
import * as alg from './algoritmo.js'
import * as calendario from './calendario.js'
import * as graficos from './graficos.js'
import * as foco from './foco.js'
import * as agora from './agora.js'
import * as anim from './animacoes.js'
import * as calibragem from './calibragem.js'
import { icone, aplicarIcones } from './icones.js'
import {
  notificar,
  confirmar,
  abrirFormulario,
  abrirPainel,
  perguntarFeedback,
  copiarTexto,
  baixarArquivo,
  escaparHTML
} from './componentes.js'

const $ = seletor => document.querySelector(seletor)
const $$ = seletor => Array.from(document.querySelectorAll(seletor))

const CONFIG_PADRAO = {
  limiteHoras: 6,
  inicioDisponivel: '08:00',
  fimDisponivel: '18:00',
  interrupcoes: []
}

const FILTROS_PADRAO = { busca: '', status: 'todas', categoria: 'todas', ordem: 'manual' }

const estado = {
  perfil: { nome: '', idade: 0, cronotipo: 'intermediario' },
  bio: alg.montarPerfilBiologico({ idade: 25, cronotipo: 'intermediario' }),
  configuracoes: { ...CONFIG_PADRAO },
  agendas: {},
  historico: [],
  /* v4 — sessões de foco reais, insumo da recalibração */
  sessoes: [],
  agendaAtual: null,
  dataAgenda: calendario.chaveData(new Date()),
  filtros: { ...FILTROS_PADRAO },
  tema: 'escuro',
  autenticado: false,
  /* preferências da tela de Foco */
  minutosFoco: 25,
  imersivo: false
}

/** Único ponto de redesenho da lista, para os filtros valerem em toda ação. */
function renderizarLista() {
  ui.renderizarListaTarefas(tarefas.listaTarefas, estado.filtros)
}

/**
 * Monta o perfil biológico já com a correção aprendida acoplada.
 *
 * Precisa ser refeito sempre que o perfil OU as sessões mudarem — é o ponto em
 * que a evidência de uso entra na curva de energia usada pelo agendador.
 */
function reconstruirBio() {
  estado.bio = {
    ...alg.montarPerfilBiologico(estado.perfil),
    corrigirEnergia: calibragem.montarCorrecaoDeEnergia(estado.sessoes)
  }
  return estado.bio
}

/** Agenda de hoje, se houver — alimenta o painel "Agora". */
function agendaDeHoje() {
  return estado.agendas[calendario.chaveData(new Date())] || null
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
      historico: estado.historico,
      sessoes: estado.sessoes
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
  graficos.renderizarSemana(estado.agendas)
  graficos.renderizarCategorias(tarefas.listaTarefas, tarefas.CATEGORIAS)
  ui.renderizarIndicadores(agenda)
  ui.definirEstadoAcoesAgenda(Boolean(agenda?.eventos?.length))
  atualizarPaineisDerivados(agenda)
  agora.atualizar()
}

/**
 * Blocos que vivem fora do cartão da agenda mas bebem da mesma fonte:
 * dashboard (próximas / agenda do dia), tela de Foco e estatísticas.
 */
function atualizarPaineisDerivados(agenda = estado.agendaAtual) {
  const doDia = agendaDeHoje()
  const stats = tarefas.estatisticas()

  ui.renderizarProximas(agenda)
  ui.renderizarAgendaDoDia(agenda)
  ui.renderizarFilaFoco(doDia || agenda)
  ui.renderizarTotais({ agendas: estado.agendas, estatisticasTarefas: stats, bio: estado.bio })
  ui.renderizarAprendizado(calibragem.resumoDeAprendizado(estado.sessoes, tarefas.CATEGORIAS))
  ui.atualizarContadorAvisos(contarAlertas(agenda))
  avaliarLembreteDeBackup()
}

/**
 * Quantos ALERTAS reais existem — o número do sino.
 *
 * Antes ele mostrava o total de tarefas pendentes, então subia a cada tarefa
 * cadastrada e nunca descia: virava ruído permanente em vez de sinal. Agora só
 * conta o que pede uma ação do usuário HOJE.
 */
function contarAlertas(agenda = estado.agendaAtual) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const atrasadas = tarefas.listaTarefas.filter(t => {
    if (t.concluida || !t.prazo) return false
    return new Date(`${t.prazo}T23:59:59`) < hoje
  }).length

  const naoCoube = agenda?.stats?.naoAgendadas || 0
  const semAgenda = tarefas.filtrarAtivas().length && !agendaDeHoje() ? 1 : 0

  return atrasadas + naoCoube + semAgenda
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
  estado.configuracoes = { ...CONFIG_PADRAO, ...documento.configuracoes }
  estado.configuracoes.interrupcoes = Array.isArray(documento.configuracoes?.interrupcoes)
    ? documento.configuracoes.interrupcoes
    : []
  estado.agendas = documento.agendas || {}
  estado.historico = documento.historico || []
  estado.sessoes = Array.isArray(documento.sessoes) ? documento.sessoes : []
  estado.agendaAtual = null
  estado.autenticado = true

  // Só agora: a correção da curva é derivada das sessões, que acabaram de ser
  // carregadas. Chamar antes disso montaria um perfil sem nenhum aprendizado.
  reconstruirBio()

  tarefas.definirLista(documento.tarefas || [])

  ui.atualizarCabecalho(estado.perfil, estado.bio)
  aplicarConfiguracaoNaTela()
  renderizarLista()
  ui.renderizarAgenda(null)
  definirDataAgenda(calendario.chaveData(new Date()))
  nav.irPara('tela-painel')
  atualizarPainel()
  anim.revelar('.cartao')
  salvar({ imediato: true })
  aplicarAcaoDaURL()

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
  estado.sessoes = []
  estado.agendaAtual = null
  estado.autenticado = false
  estado.filtros = { ...FILTROS_PADRAO }

  ui.limparPainel()
  if ($('#seu-nome')) $('#seu-nome').value = ''
  if ($('#sua-idade')) $('#sua-idade').value = ''
  nav.irPara('tela-boas-vindas')
  $('#seu-nome')?.focus()
}

/** Edita nome, idade e cronotipo sem precisar sair e voltar ao perfil. */
async function editarPerfil() {
  const dados = await abrirFormulario({
    titulo: 'Editar perfil',
    descricao: 'A curva de energia é recalculada assim que você salvar.',
    rotuloConfirmar: 'Salvar perfil',
    campos: [
      { id: 'nome', rotulo: 'Nome', valor: estado.perfil.nome },
      {
        id: 'idade',
        rotulo: 'Idade',
        tipo: 'number',
        min: 8,
        max: 100,
        step: 1,
        valor: estado.perfil.idade,
        largura: 'metade'
      },
      {
        id: 'cronotipo',
        rotulo: 'Cronotipo',
        tipo: 'select',
        valor: estado.perfil.cronotipo,
        opcoes: alg.CRONOTIPOS.map(c => ({ valor: c.id, rotulo: c.rotulo }))
      }
    ],
    validar: valores => {
      if (!valores.nome || valores.nome.trim().length < 2) return 'Informe um nome válido.'
      if (!(valores.idade >= 8 && valores.idade <= 100)) return 'A idade precisa ficar entre 8 e 100 anos.'
      return null
    }
  })
  if (!dados) return

  const nomeAnterior = estado.perfil.nome
  estado.perfil = { nome: dados.nome.trim(), idade: dados.idade, cronotipo: dados.cronotipo }
  reconstruirBio()

  ui.atualizarCabecalho(estado.perfil, estado.bio)
  atualizarPainel({ regerar: true })
  salvar({ imediato: true })

  notificar(
    nomeAnterior !== estado.perfil.nome
      ? `Perfil atualizado. Os dados antigos continuam salvos em "${nomeAnterior}".`
      : `Perfil atualizado. Foco contínuo ideal: ${estado.bio.focoMaximo} min.`,
    { tipo: 'sucesso', duracao: 5000 }
  )
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

  // mantém a categoria escolhida: normalmente se cadastra várias do mesmo tipo
  $('#form-tarefa')?.reset()
  const seletorCategoria = $('#categoria-tarefa')
  if (seletorCategoria) seletorCategoria.value = categoria
  ui.mostrarSugestao(null)
  $('#nome-tarefa')?.focus()

  renderizarLista()
  anim.pulsar(document.querySelector(`.tarefa[data-id="${CSS.escape(criada.id)}"]`))
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
        opcoes: tarefas.CATEGORIAS.map(c => ({ valor: c.id, rotulo: c.rotulo }))
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
  renderizarLista()
  atualizarPainel({ regerar: true })
  salvar()
  notificar('Tarefa atualizada.', { tipo: 'sucesso' })
}

function excluirTarefa(id) {
  const cartao = document.querySelector(`.tarefa[data-id="${CSS.escape(id)}"]`)
  anim.removerComAnimacao(cartao, () => concluirExclusao(id))
}

function concluirExclusao(id) {
  const removida = tarefas.excluir(id)
  if (!removida) return

  renderizarLista()
  atualizarPainel({ regerar: true })
  salvar()

  notificar(`"${removida.tarefa.nome}" foi removida.`, {
    tipo: 'info',
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => {
        tarefas.reinserir(removida.tarefa, removida.indice)
        renderizarLista()
        atualizarPainel({ regerar: true })
        salvar()
      }
    }
  })
}

function alternarConcluida(id) {
  const tarefa = tarefas.toggleConcluida(id)
  if (!tarefa) return
  renderizarLista()
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
  renderizarLista()
  atualizarPainel({ regerar: true })
  salvar()
  notificar(`${removidas.length} tarefa(s) concluída(s) removida(s).`, {
    tipo: 'sucesso',
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => {
        removidas.forEach(t => tarefas.reinserir(t))
        renderizarLista()
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
  renderizarLista()
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
        renderizarLista()
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

  // PRECISÃO: agenda sobre a duração CALIBRADA, não sobre a declarada.
  // Antes a calibragem só corrigia a sugestão no formulário — quem digitasse o
  // tempo à mão continuava recebendo um cronograma otimista demais, e o dia
  // estourava. Aqui a correção passa a valer para todo o planejamento.
  const calibradas = ativas.map(tarefa => {
    const ajuste = calibragem.ajustarDuracao(tarefa.tempo, tarefa.categoria, estado.sessoes)
    return ajuste.ajustado
      ? { ...tarefa, tempo: ajuste.minutos, tempoDeclarado: tarefa.tempo, desvioCalibragem: ajuste.desvio }
      : tarefa
  })

  const agenda = alg.gerarAgenda({
    tarefas: calibradas,
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
  graficos.renderizarSemana(estado.agendas)
  atualizarPaineisDerivados(agenda)
  agora.atualizar()
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

/** Copia a agenda visível para outra data, sem precisar recadastrar nada. */
async function duplicarAgenda() {
  if (!estado.agendaAtual) return

  const amanha = new Date(dataReferencia())
  amanha.setDate(amanha.getDate() + 1)

  const dados = await abrirFormulario({
    titulo: 'Duplicar agenda',
    descricao: `O planejamento de ${estado.dataAgenda.split('-').reverse().join('/')} será copiado para a data escolhida.`,
    rotuloConfirmar: 'Duplicar',
    campos: [{ id: 'data', rotulo: 'Data de destino', tipo: 'date', valor: calendario.chaveData(amanha) }],
    validar: valores => (valores.data ? null : 'Escolha uma data de destino.')
  })
  if (!dados) return

  if (estado.agendas[dados.data]) {
    const ok = await confirmar({
      titulo: 'Substituir agenda existente?',
      mensagem: 'Já existe um planejamento salvo nessa data.',
      rotuloConfirmar: 'Substituir',
      perigo: true
    })
    if (!ok) return
  }

  estado.agendas[dados.data] = {
    eventos: estado.agendaAtual.eventos,
    stats: estado.agendaAtual.stats,
    geradoEm: new Date().toISOString(),
    duplicadaDe: estado.dataAgenda
  }
  salvar({ imediato: true })
  graficos.renderizarSemana(estado.agendas)
  notificar(`Agenda copiada para ${dados.data.split('-').reverse().join('/')}.`, { tipo: 'sucesso' })
}

/* =========================================================================
   Backup
   ========================================================================= */

/* -------------------------------------------------------------- backup --- */

const DIAS_ATE_LEMBRAR_BACKUP = 14
const TAREFAS_ATE_LEMBRAR_BACKUP = 8

/**
 * Tudo vive no localStorage: limpar o navegador apaga o histórico inteiro.
 * O lembrete só aparece quando há algo que valha a pena perder — e some por
 * 30 dias assim que o usuário exporta ou dispensa.
 */
function avaliarLembreteDeBackup() {
  const faixa = document.getElementById('faixa-backup')
  if (!faixa || !estado.autenticado) return

  const ultimo = Number(storage.lerMarcaBackup()) || 0
  const dias = ultimo ? (Date.now() - ultimo) / 86400000 : Infinity
  const volume = tarefas.listaTarefas.length + Object.keys(estado.agendas).length

  const mostrar = volume >= TAREFAS_ATE_LEMBRAR_BACKUP && dias >= DIAS_ATE_LEMBRAR_BACKUP
  faixa.hidden = !mostrar
  if (!mostrar) return

  const quando = faixa.querySelector('[data-quando]')
  if (quando) {
    quando.textContent = ultimo
      ? `Último backup há ${Math.floor(dias)} dias.`
      : 'Você ainda não exportou nenhuma cópia.'
  }
}

function adiarLembreteDeBackup() {
  // adia por 30 dias marcando "agora" com um desconto
  storage.salvarMarcaBackup(Date.now() - (DIAS_ATE_LEMBRAR_BACKUP - 30) * 86400000)
  const faixa = document.getElementById('faixa-backup')
  if (faixa) faixa.hidden = true
}

function exportarDados() {
  const pacote = {
    aplicativo: 'chronos-ultra',
    versao: 3,
    exportadoEm: new Date().toISOString(),
    perfil: { ...estado.perfil, focoMaximo: estado.bio.focoMaximo },
    configuracoes: estado.configuracoes,
    tarefas: tarefas.listaTarefas,
    agendas: estado.agendas,
    historico: estado.historico
  }
  baixarArquivo(
    `chronos-backup-${calendario.chaveData(new Date())}.json`,
    JSON.stringify(pacote, null, 2),
    'application/json;charset=utf-8'
  )
  storage.salvarMarcaBackup(Date.now())
  avaliarLembreteDeBackup()
  notificar('Backup exportado. Guarde o arquivo fora do navegador.', { tipo: 'sucesso' })
}

async function importarDados(arquivo) {
  if (!arquivo) return
  try {
    const pacote = JSON.parse(await arquivo.text())
    if (!pacote || typeof pacote !== 'object' || !Array.isArray(pacote.tarefas)) {
      throw new Error('formato inesperado')
    }

    const ok = await confirmar({
      titulo: 'Importar este backup?',
      mensagem: `${pacote.tarefas.length} tarefa(s) e ${Object.keys(pacote.agendas || {}).length} agenda(s) substituirão os dados atuais deste perfil.`,
      rotuloConfirmar: 'Importar',
      perigo: true
    })
    if (!ok) return

    estado.configuracoes = { ...CONFIG_PADRAO, ...(pacote.configuracoes || {}) }
    estado.configuracoes.interrupcoes = Array.isArray(pacote.configuracoes?.interrupcoes)
      ? pacote.configuracoes.interrupcoes
      : []
    estado.agendas = pacote.agendas && typeof pacote.agendas === 'object' ? pacote.agendas : {}
    estado.historico = Array.isArray(pacote.historico) ? pacote.historico : []
    estado.agendaAtual = estado.agendas[estado.dataAgenda] || null

    if (pacote.perfil?.idade) {
      estado.perfil = { ...estado.perfil, idade: pacote.perfil.idade, cronotipo: pacote.perfil.cronotipo || estado.perfil.cronotipo }
      reconstruirBio()
      ui.atualizarCabecalho(estado.perfil, estado.bio)
    }

    tarefas.definirLista(pacote.tarefas)
    aplicarConfiguracaoNaTela()
    renderizarLista()
    ui.renderizarAgenda(estado.agendaAtual)
    atualizarPainel()
    salvar({ imediato: true })
    notificar('Backup importado com sucesso.', { tipo: 'sucesso' })
  } catch {
    notificar('Não foi possível ler esse arquivo. Verifique se é um backup do Chronos Ultra.', {
      tipo: 'erro',
      duracao: 6000
    })
  }
}

/* =========================================================================
   Navegação e tema
   ========================================================================= */

const ATALHOS = [
  ['N', 'Nova tarefa (foca o campo de nome)'],
  ['G', 'Gerar a agenda do dia selecionado'],
  ['C', 'Abrir o calendário'],
  ['T', 'Alternar o tema (escuro → claro → sistema)'],
  ['F', 'Focar no bloco que está acontecendo agora'],
  ['?', 'Abrir esta lista de atalhos'],
  ['Esc', 'Voltar ao painel / fechar diálogos']
]

function mostrarAtalhos() {
  abrirPainel({
    titulo: 'Atalhos de teclado',
    descricao: 'Funcionam sempre que você não estiver digitando em um campo.',
    html: `<ul class="lista-atalhos">
      ${ATALHOS.map(([tecla, descricao]) => `<li><kbd>${escaparHTML(tecla)}</kbd><span>${escaparHTML(descricao)}</span></li>`).join('')}
    </ul>`
  })
}

/** Inicia o foco no bloco que está acontecendo agora. */
function focarAgora() {
  const botao = document.querySelector('#painel-agora [data-focar-agora]')
  if (!botao) {
    notificar('Nenhum bloco de tarefa em andamento neste momento.', { tipo: 'info' })
    return
  }
  botao.click()
}

function abrirCalendario() {
  nav.irPara('tela-calendario')
}

function voltarAoPainel() {
  nav.irPara('tela-painel')
}

/**
 * Gancho de entrada em cada tela.
 *
 * Existe porque o Chart.js mede o canvas no momento em que desenha: em uma
 * tela oculta a medida é zero. Redesenhar ao entrar mantém os gráficos
 * corretos sem precisar recalcular nada em segundo plano.
 */
function aoEntrarNaTela(id) {
  if (!estado.autenticado) return

  if (id === 'tela-calendario') {
    calendario.renderizar()
    return
  }
  if (id === 'tela-painel') {
    atualizarPainel()
    return
  }
  if (id === 'tela-estatisticas') {
    redesenharGraficos()
    ui.renderizarTotais({
      agendas: estado.agendas,
      estatisticasTarefas: tarefas.estatisticas(),
      bio: estado.bio
    })
    ui.renderizarAprendizado(
      calibragem.resumoDeAprendizado(estado.sessoes, tarefas.CATEGORIAS)
    )
    return
  }
  if (id === 'tela-foco') {
    ui.renderizarFilaFoco(agendaDeHoje() || estado.agendaAtual)
    ui.renderizarSessaoFoco(foco.sessaoAtual(), { minutosPadrao: estado.minutosFoco })
  }
}

/* -------------------------------------------------------------- resumo --- */

/** Panorama rápido do dia, aberto pelo sino do topo. */
function mostrarResumoDoDia() {
  const stats = tarefas.estatisticas()
  const agenda = agendaDeHoje() || estado.agendaAtual
  const s = agenda?.stats

  const linhas = [
    ['lista', `${stats.ativas} tarefa(s) pendente(s)`, `${alg.formatarDuracao(stats.minutosAtivos)} no inventário`],
    ['sucesso', `${stats.concluidas} concluída(s)`, 'bom trabalho'],
    s ? ['alvo', alg.formatarDuracao(s.trabalhados), `${s.ocupacao}% da janela ocupada`] : null,
    s ? ['sol-nuvem', alg.formatarDuracao(s.minutosLivres), 'de tempo livre preservado'] : null,
    s?.naoAgendadas ? ['alerta', `${s.naoAgendadas} tarefa(s) fora do dia`, 'reveja o limite diário'] : null
  ].filter(Boolean)

  abrirPainel({
    titulo: 'Resumo do dia',
    descricao: agenda ? 'Como está o seu plano de hoje.' : 'Você ainda não gerou a agenda de hoje.',
    html: `<ul class="lista-resumo">
      ${linhas
        .map(
          ([simbolo, titulo, detalhe]) =>
            `<li>
               <span class="lista-resumo__icone">${icone(simbolo, { tamanho: 17 })}</span>
               <span><strong>${escaparHTML(titulo)}</strong> — ${escaparHTML(detalhe)}</span>
             </li>`
        )
        .join('')}
    </ul>`
  })
}

/* ---------------------------------------------------------------- tema --- */

const CICLO_TEMA = { escuro: 'claro', claro: 'auto', auto: 'escuro' }

function definirTema(tema) {
  estado.tema = ['escuro', 'claro', 'auto'].includes(tema) ? tema : 'escuro'
  anim.transicionar(() => ui.aplicarTema(estado.tema))
  storage.salvarTema(estado.tema)
  redesenharGraficos()
}

function alternarTema() {
  definirTema(CICLO_TEMA[estado.tema] || 'escuro')
}

function redesenharGraficos() {
  graficos.atualizarTemaGraficos(
    estado.bio,
    montarJanelaAtual(),
    estado.agendaAtual?.eventos || [],
    estado.agendaAtual?.stats,
    estado.agendas,
    tarefas.listaTarefas,
    tarefas.CATEGORIAS
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

  ui.ligarArrasteDeTarefas((idOrigem, idDestino) => {
    if (!tarefas.mover(idOrigem, idDestino)) return
    renderizarLista()
    salvar()
  })

  ligarFiltros()
  ligarBackup()

  // a sugestão só preenche o que o usuário ainda não decidiu
  const campoCategoria = $('#categoria-tarefa')
  campoCategoria?.addEventListener('change', () => {
    campoCategoria.dataset.escolhida = 'sim'
  })

  const campoNome = $('#nome-tarefa')
  campoNome?.addEventListener('blur', () => {
    const sugestao = tarefas.obterSugestaoPorNome(campoNome.value, estado.historico)
    if (!sugestao) {
      ui.mostrarSugestao(null)
      return
    }

    // A sugestão vem do que o usuário DECLAROU antes; a calibragem corrige pelo
    // que ele de fato levou. Sem esta linha o app repetiria o mesmo otimismo.
    const corrigida = calibragem.ajustarDuracao(
      sugestao.tempo,
      sugestao.categoria || campoCategoria?.value,
      estado.sessoes
    )

    ui.mostrarSugestao({ ...sugestao, tempo: corrigida.minutos, calibragem: corrigida })
    if (!$('#peso-tarefa').value) $('#peso-tarefa').value = sugestao.peso
    if (!$('#tempo-tarefa').value) $('#tempo-tarefa').value = corrigida.minutos
    if (campoCategoria && sugestao.categoria && !campoCategoria.dataset.escolhida) {
      campoCategoria.value = sugestao.categoria
    }
  })
  campoNome?.addEventListener('input', () => ui.mostrarSugestao(null))
}

function ligarFiltros() {
  let debounce = null
  $('#busca-tarefa')?.addEventListener('input', evento => {
    clearTimeout(debounce)
    const valor = evento.target.value
    debounce = setTimeout(() => {
      estado.filtros.busca = valor
      const espelho = $('#busca-global')
      if (espelho) espelho.value = valor
      renderizarLista()
    }, 140)
  })

  $('#filtro-categoria')?.addEventListener('change', evento => {
    estado.filtros.categoria = evento.target.value
    renderizarLista()
  })

  $('#ordenar-tarefas')?.addEventListener('change', evento => {
    estado.filtros.ordem = evento.target.value
    renderizarLista()
  })

  // escopado ao seletor de situação: existe outro segmentado (tema) na tela
  // de Configurações, e ele não pode ser desmarcado por este clique
  $('#segmentado-status')?.addEventListener('click', evento => {
    const opcao = evento.target.closest('[data-status]')
    if (!opcao) return
    estado.filtros.status = opcao.dataset.status
    $$('[data-status]').forEach(botao => {
      const ativo = botao === opcao
      botao.classList.toggle('ativo', ativo)
      botao.setAttribute('aria-pressed', String(ativo))
    })
    renderizarLista()
  })
}

/**
 * Busca do topo: filtra o inventário de qualquer tela e, ao confirmar,
 * leva o usuário para Rotinas, onde a lista filtrada está visível.
 */
function ligarBuscaGlobal() {
  const campo = $('#busca-global')
  const formulario = $('#form-busca-global')
  if (!campo) return

  let debounce = null
  campo.addEventListener('input', evento => {
    clearTimeout(debounce)
    const valor = evento.target.value
    debounce = setTimeout(() => {
      estado.filtros.busca = valor
      const espelho = $('#busca-tarefa')
      if (espelho) espelho.value = valor
      renderizarLista()
    }, 140)
  })

  formulario?.addEventListener('submit', evento => {
    evento.preventDefault()
    nav.irPara('tela-rotinas')
    $('#lista-de-tarefas')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function ligarBackup() {
  $('#btn-exportar-dados')?.addEventListener('click', exportarDados)
  $('#btn-importar-dados')?.addEventListener('click', () => $('#arquivo-importacao')?.click())
  $('#arquivo-importacao')?.addEventListener('change', async evento => {
    await importarDados(evento.target.files?.[0])
    evento.target.value = ''
  })
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
  $('#btn-duplicar')?.addEventListener('click', duplicarAgenda)

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
    iniciarSessaoDeFoco({
      titulo: botao.dataset.titulo,
      minutos: Number(botao.dataset.minutos),
      tarefa: botao.dataset.tarefa
    })
  })
}

/* =========================================================================
   Modo Foco
   ========================================================================= */

/**
 * Ponto único de partida de qualquer sessão: o cronômetro é o mesmo, venha
 * o comando do cronograma, do painel "Agora" ou da tela de Foco.
 *
 * É aqui que a sessão ganha o contexto que a recalibração precisa — categoria
 * e energia prevista para o horário. Sem isso o registro vira só um número de
 * minutos, sem nada a que comparar.
 */
function iniciarSessaoDeFoco({ titulo, minutos, tarefa = '' }) {
  const alvo = tarefa ? tarefas.obter(tarefa) : null
  const agoraHoras = new Date().getHours() + new Date().getMinutes() / 60

  foco.iniciarFoco({
    titulo,
    minutos,
    tarefaId: tarefa || null,
    categoria: alvo?.categoria || null,
    energiaPrevista: alg.obterEnergia(agoraHoras, estado.bio),
    aoConcluir: () => {
      const t = tarefa ? tarefas.obter(tarefa) : null
      if (t && !t.concluida) alternarConcluida(tarefa)
    },
    aoRegistrar: registrarSessaoDeFoco
  })
}

/**
 * Guarda a sessão encerrada e, se ela teve substância, pergunta como foi.
 *
 * O corte de 5 minutos existe para não interrogar o usuário sobre um bloco que
 * ele abandonou em segundos — nesses casos a resposta não informaria nada.
 */
async function registrarSessaoDeFoco(registro) {
  if (!registro || !estado.autenticado) return

  const sessao = { id: `s${Date.now().toString(36)}`, ...registro, feedback: null }
  estado.sessoes.push(sessao)
  estado.sessoes = calibragem.podarSessoes(estado.sessoes)
  salvar()

  if (registro.minutosReais < 5) {
    atualizarPaineisDerivados()
    return
  }

  const resposta = await perguntarFeedback({
    titulo: registro.titulo,
    minutos: registro.minutosReais
  })

  if (resposta) {
    sessao.feedback = resposta
    salvar({ imediato: true })
    // o feedback muda a curva de energia: refaz o perfil e o painel
    reconstruirBio()
    comentarAprendizado(sessao)
  }

  atualizarPaineisDerivados()
}

/** Conta ao usuário, sem alarde, o que o app acabou de aprender com o bloco. */
function comentarAprendizado(sessao) {
  const desvio = sessao.minutosReais - sessao.minutosPlanejados
  const info = calibragem.fatoresPorCategoria(estado.sessoes)[sessao.categoria]

  if (info && Math.abs(info.desvio) >= 10) {
    const cat = tarefas.CATEGORIAS.find(c => c.id === sessao.categoria)
    notificar(
      `Anotado. "${cat?.rotulo || 'Essa categoria'}" costuma levar ${Math.abs(info.desvio)}% ${
        info.desvio > 0 ? 'a mais' : 'a menos'
      } do que você estima — já estou ajustando as sugestões.`,
      { tipo: 'info', duracao: 7000 }
    )
    return
  }

  if (Math.abs(desvio) >= 10) {
    notificar(
      `Registrado: ${alg.formatarDuracao(Math.abs(desvio))} ${desvio > 0 ? 'além' : 'aquém'} do previsto.`,
      { tipo: 'info', duracao: 4000 }
    )
  }
}

function definirMinutosDeFoco(minutos) {
  estado.minutosFoco = Math.min(Math.max(Number(minutos) || 25, 1), 180)
  $$('.foco-preset').forEach(preset => {
    preset.classList.toggle('ativo', Number(preset.dataset.minutos) === estado.minutosFoco)
  })
  if (!foco.estaAtivo()) {
    ui.renderizarSessaoFoco(null, { minutosPadrao: estado.minutosFoco })
  }
}

/** Tela cheia + menus escondidos: o "bloquear distrações" do layout. */
async function alternarImersivo(ligar) {
  estado.imersivo = ligar
  document.body.classList.toggle('imersivo', ligar)

  try {
    if (ligar && !document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    else if (!ligar && document.fullscreenElement) await document.exitFullscreen?.()
  } catch {
    /* alguns navegadores exigem gesto direto ou bloqueiam tela cheia */
  }

  sincronizarInterruptorImersivo()
}

function sincronizarInterruptorImersivo() {
  const botao = $('#interruptor-imersivo')
  if (botao) botao.setAttribute('aria-checked', String(estado.imersivo))
}

function sincronizarInterruptorNotificacoes() {
  const botao = $('#interruptor-notificacoes')
  if (!botao) return
  const permitido = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  botao.setAttribute('aria-checked', String(permitido))
}

function ligarEventosFoco() {
  $('#btn-foco-iniciar')?.addEventListener('click', () => {
    iniciarSessaoDeFoco({ titulo: 'Sessão livre', minutos: estado.minutosFoco })
  })
  $('#btn-foco-pausar')?.addEventListener('click', () => foco.alternarPausa())
  $('#btn-foco-encerrar')?.addEventListener('click', () => foco.pararFoco())

  $$('.foco-preset').forEach(preset => {
    preset.addEventListener('click', () => definirMinutosDeFoco(preset.dataset.minutos))
  })

  $('#fila-foco')?.addEventListener('click', evento => {
    const botao = evento.target.closest('[data-foco-bloco]')
    if (!botao) return
    iniciarSessaoDeFoco({
      titulo: botao.dataset.titulo,
      minutos: Number(botao.dataset.minutos),
      tarefa: botao.dataset.tarefa
    })
  })

  $('#interruptor-imersivo')?.addEventListener('click', () => {
    alternarImersivo(!estado.imersivo)
  })

  $('#interruptor-notificacoes')?.addEventListener('click', () => {
    if (typeof Notification === 'undefined') {
      notificar('Este navegador não oferece notificações do sistema.', { tipo: 'info' })
      return
    }
    if (Notification.permission === 'granted') {
      notificar('Para desativar, ajuste as permissões do site no navegador.', { tipo: 'info', duracao: 5000 })
      return
    }
    if (Notification.permission === 'denied') {
      notificar('As notificações estão bloqueadas nas permissões deste site.', { tipo: 'erro', duracao: 5000 })
      return
    }
    Notification.requestPermission()
      .then(sincronizarInterruptorNotificacoes)
      .catch(() => {})
  })

  // sai do modo imersivo se o usuário fechar a tela cheia pelo Esc do navegador
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && estado.imersivo) {
      estado.imersivo = false
      document.body.classList.remove('imersivo')
      sincronizarInterruptorImersivo()
    }
  })

  // o anel grande é apenas um espelho do cronômetro
  foco.assinar(sessao => ui.renderizarSessaoFoco(sessao, { minutosPadrao: estado.minutosFoco }))
}

function ligarEventosNavegacao() {
  $('#btn-ver-calendario')?.addEventListener('click', abrirCalendario)
  $('#btn-voltar-painel')?.addEventListener('click', voltarAoPainel)
  $('#btn-trocar-perfil')?.addEventListener('click', trocarPerfil)
  $('#btn-sair-lateral')?.addEventListener('click', trocarPerfil)
  $('#btn-tema')?.addEventListener('click', alternarTema)
  $('#btn-atalhos')?.addEventListener('click', mostrarAtalhos)
  $('#btn-resumo')?.addEventListener('click', mostrarResumoDoDia)
  $('#btn-editar-perfil')?.addEventListener('click', editarPerfil)
  $('#btn-backup-agora')?.addEventListener('click', exportarDados)
  $('#btn-backup-depois')?.addEventListener('click', adiarLembreteDeBackup)

  $('#btn-gerar-rapido')?.addEventListener('click', () => {
    nav.irPara('tela-rotinas')
    gerarAgenda()
  })

  $('#segmentado-tema')?.addEventListener('click', evento => {
    const opcao = evento.target.closest('[data-tema-opcao]')
    if (opcao) definirTema(opcao.dataset.temaOpcao)
  })

  ligarBuscaGlobal()

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

    const tecla = evento.key.toLowerCase()

    if (tecla === 'n') {
      evento.preventDefault()
      nav.irPara('tela-rotinas')
      $('#nome-tarefa')?.focus()
    } else if (tecla === 'g') {
      evento.preventDefault()
      nav.irPara('tela-rotinas')
      gerarAgenda()
    } else if (tecla === 'c') {
      evento.preventDefault()
      abrirCalendario()
    } else if (tecla === 't') {
      evento.preventDefault()
      alternarTema()
    } else if (tecla === 'f') {
      evento.preventDefault()
      focarAgora()
    } else if (evento.key === '?') {
      evento.preventDefault()
      mostrarAtalhos()
    } else if (evento.key === 'Escape') {
      // no modo imersivo o Esc pertence à tela cheia, não à navegação
      if (estado.imersivo) return
      if (nav.telaAtual() !== 'tela-painel') voltarAoPainel()
    }
  })
}

/* =========================================================================
   Inicialização
   ========================================================================= */

/** Registra o service worker e o botão de instalação, quando disponíveis. */
function ligarPWA() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline é um extra: falhar aqui não afeta o app */
      })
    })
  }

  let promptInstalacao = null
  const botao = $('#btn-instalar')
  const aviso = $('#instalar-indisponivel')

  /** O app já está rodando como PWA instalado? */
  const jaInstalado = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true

  /**
   * Botão e legenda são exclusivos. A legenda deixou de ser o genérico
   * "já instalado ou indisponível" — ela agora distingue os três estados
   * reais, porque dizer "já instalado" para quem não instalou é mentira.
   */
  const definirDisponibilidade = (disponivel, instalado = jaInstalado()) => {
    if (botao) botao.hidden = !disponivel
    if (!aviso) return
    aviso.hidden = disponivel
    aviso.textContent = instalado
      ? 'Aplicativo já instalado neste dispositivo'
      : 'Seu navegador não oferece instalação — no iPhone, use Compartilhar › Adicionar à Tela de Início'
  }

  definirDisponibilidade(false)

  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault()
    promptInstalacao = evento
    definirDisponibilidade(true)
  })

  botao?.addEventListener('click', async () => {
    if (!promptInstalacao) return
    promptInstalacao.prompt()
    const escolha = await promptInstalacao.userChoice
    promptInstalacao = null
    definirDisponibilidade(false)
    if (escolha.outcome === 'accepted') {
      notificar('Chronos Ultra instalado. Ele abre offline também.', { tipo: 'sucesso' })
    }
  })

  window.addEventListener('appinstalled', () => definirDisponibilidade(false, true))
}

/** Executa `?acao=` do atalho do app instalado. */
function aplicarAcaoDaURL() {
  const acao = new URLSearchParams(location.search).get('acao')
  if (!acao || !estado.autenticado) return
  if (acao === 'gerar') gerarAgenda()
  else if (acao === 'calendario') abrirCalendario()
}

function iniciar() {
  estado.tema = storage.lerTema() || 'escuro'
  ui.aplicarTema(estado.tema)

  window
    .matchMedia?.('(prefers-color-scheme: light)')
    .addEventListener?.('change', () => {
      if (estado.tema !== 'auto') return
      ui.aplicarTema('auto')
      redesenharGraficos()
    })

  aplicarIcones()

  // O acordeão de compromissos vem aberto no HTML porque no desktop há coluna
  // sobrando. No mobile ele volta a ser um clique — aberto, empurraria o
  // inventário de tarefas para fora da primeira tela.
  const compromissos = $('.acordeao--compromissos')
  if (compromissos && window.matchMedia?.('(max-width: 47.999rem)').matches) {
    compromissos.open = false
  }

  ui.preencherSelectCategorias($('#categoria-tarefa'), 'foco')
  ui.preencherControlesInventario()

  nav.inicializar({ aoEntrar: aoEntrarNaTela })
  nav.irPara('tela-boas-vindas', { imediato: true })

  anim.ligarOndas()
  anim.ligarCabecalhoElevado()
  anim.revelar('.cartao, .calendario__lateral')

  agora.iniciarMonitor({
    obterAgenda: agendaDeHoje,
    aoFocar: iniciarSessaoDeFoco
  })

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
  ligarEventosFoco()
  ligarAtalhos()
  ligarPWA()

  definirMinutosDeFoco(estado.minutosFoco)
  sincronizarInterruptorImersivo()
  sincronizarInterruptorNotificacoes()

  const anoRodape = $('#ano-atual')
  if (anoRodape) anoRodape.textContent = new Date().getFullYear()

  ui.esconderSplash()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar)
} else {
  iniciar()
}
