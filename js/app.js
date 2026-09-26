/**
 * Chronos Ultra — orquestrador da aplicação.
 *
 * Mantém o estado em memória, reage aos eventos da interface e delega:
 *  · regras de agendamento .......... algoritmo.js
 *  · desenho da tela ................ ui.js / calendario.js / graficos.js
 *  · persistência ................... Supabase por usuário autenticado
 */

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
import {
  supabase,
  cadastrarUsuario,
  entrarUsuario,
  sairUsuario,
  atualizarEmailUsuario,
  reenviarConfirmacaoEmail,
  solicitarRedefinicaoSenha,
  atualizarSenhaUsuario,
  iniciarDesafioMfa,
  listarFatoresTotp,
  inscreverFatorTotp,
  desafiarFatorTotp,
  verificarFatorTotp,
  desativarFatorTotp,
  enviarFotoPerfil,
  removerFotosAntigasPerfil,
  obterUsuarioAtual,
  obterPerfilUsuario,
  salvarPerfilUsuario,
  obterDocumentoUsuario,
  salvarDocumentoUsuario
} from './supabase.js'

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
  perfil: {
    nome: '',
    idade: 0,
    cronotipo: 'intermediario',
    avatar_url: '',
    email: '',
    data_nascimento: null,
    genero: 'prefiro-nao-dizer',
    objetivo: 'foco',
    tipo_trabalho: 'mental',
    horario_preferido: 'manha',
    horas_trabalho: 6,
    pausa_preferida: 'curta'
  },
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
  revisaoDocumento: 0,
  sincronizacaoPausada: false,
  ultimoBackup: null,
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
  const aprendizado = calibragem.resumoDeAprendizado(estado.sessoes, tarefas.CATEGORIAS)
  estado.bio = {
    ...alg.montarPerfilBiologico(estado.perfil),
    corrigirEnergia: calibragem.montarCorrecaoDeEnergia(estado.sessoes),
    focoAprendido: {
      melhorHora: aprendizado?.melhorHora || null,
      piorHora: aprendizado?.piorHora || null,
      precision: aprendizado?.precisao ?? null,
      sessoes: aprendizado?.sessoes ?? 0
    }
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
let filaPersistencia = Promise.resolve()
let avisoFalhaSincronizacao = false

const MAX_AGENDAS_GUARDADAS = 90

/** Mantém apenas as agendas mais recentes para limitar o documento remoto. */
function podarAgendas() {
  const chaves = Object.keys(estado.agendas).sort()
  chaves.slice(0, Math.max(0, chaves.length - MAX_AGENDAS_GUARDADAS)).forEach(chave => {
    delete estado.agendas[chave]
  })
}

function montarDocumentoUsuario() {
  podarAgendas()
  estado.historico = tarefas.montarHistorico(estado.historico)
  return {
    versao: 1,
    configuracoes: estado.configuracoes,
    tarefas: tarefas.listaTarefas,
    agendas: estado.agendas,
    historico: estado.historico,
    sessoes: estado.sessoes,
    tema: estado.tema,
    ultimoBackup: estado.ultimoBackup
  }
}

function persistirDocumentoUsuario() {
  const documento = montarDocumentoUsuario()
  const gravacao = filaPersistencia
    .catch(() => {})
    .then(async () => {
      if (estado.sincronizacaoPausada) return false
      const salvo = await salvarDocumentoUsuario(documento, estado.revisaoDocumento)
      estado.revisaoDocumento = Number(salvo.revision)
      avisoFalhaSincronizacao = false
      return true
    })
    .catch(erro => {
      console.error('Falha ao sincronizar dados com o Supabase:', erro)
      const conflito = erro?.code === '40001' || erro?.message?.includes('DOCUMENT_VERSION_CONFLICT')
      if (conflito) {
        estado.sincronizacaoPausada = true
        notificar('Os dados foram alterados em outra sessão. Recarregue o app antes de continuar para evitar sobrescrever a versão mais recente.', {
          tipo: 'erro',
          duracao: 9000
        })
      } else if (!avisoFalhaSincronizacao) {
        avisoFalhaSincronizacao = true
        notificar('Não foi possível sincronizar com o Supabase. Suas alterações ainda não foram salvas na nuvem.', {
          tipo: 'erro',
          duracao: 9000
        })
      }
      return false
    })

  filaPersistencia = gravacao
  return gravacao
}

function salvar({ imediato = false } = {}) {
  if (!estado.autenticado || !estado.perfil.nome) return Promise.resolve(false)
  clearTimeout(timerSalvar)
  if (imediato) return persistirDocumentoUsuario()
  timerSalvar = setTimeout(() => persistirDocumentoUsuario(), 500)
  return Promise.resolve(true)
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

function hidratarDocumentoUsuario(registro = {}) {
  const documento = registro.document || {}
  estado.revisaoDocumento = Number(registro.revision) || 0
  estado.sincronizacaoPausada = false
  estado.configuracoes = { ...CONFIG_PADRAO, ...(documento.configuracoes || {}) }
  estado.configuracoes.interrupcoes = Array.isArray(documento.configuracoes?.interrupcoes)
    ? documento.configuracoes.interrupcoes
    : []
  estado.agendas = documento.agendas && typeof documento.agendas === 'object' ? documento.agendas : {}
  estado.historico = Array.isArray(documento.historico) ? documento.historico : []
  estado.sessoes = Array.isArray(documento.sessoes) ? documento.sessoes : []
  estado.ultimoBackup = Number(documento.ultimoBackup) || null
  estado.tema = ['escuro', 'claro', 'auto'].includes(documento.tema) ? documento.tema : 'escuro'
  estado.agendaAtual = estado.agendas[estado.dataAgenda] || null

  tarefas.definirLista(Array.isArray(documento.tarefas) ? documento.tarefas : [])
  reconstruirBio()
  ui.aplicarTema(estado.tema)
  ui.atualizarCabecalho(estado.perfil, estado.bio)
  aplicarConfiguracaoNaTela()
  renderizarLista()
  ui.renderizarAgenda(estado.agendaAtual)
  definirDataAgenda(estado.dataAgenda)
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

async function abrirCadastroUsuario({ emailPadrao = '' } = {}) {
  const dados = await abrirFormulario({
    titulo: 'Criar conta no Chronos Ultra',
    descricao: 'Complete seus dados e defina sua conta para personalizar a rotina, pausas e foco.',
    rotuloConfirmar: 'Criar conta',
    campos: [
      { id: 'nome', rotulo: 'Nome completo', valor: '', placeholder: 'Seu nome' },
      {
        id: 'email',
        rotulo: 'E-mail',
        tipo: 'email',
        valor: emailPadrao,
        placeholder: 'seu@email.com',
        largura: 'metade'
      },
      {
        id: 'senha',
        rotulo: 'Senha',
        tipo: 'password',
        valor: '',
        minlength: 6,
        autocomplete: 'new-password',
        placeholder: '6+ caracteres, maiúscula, número e símbolo',
        largura: 'metade'
      },
      {
        id: 'data_nascimento',
        rotulo: 'Data de nascimento',
        tipo: 'date',
        valor: '',
        largura: 'metade'
      },
      {
        id: 'genero',
        rotulo: 'Gênero',
        tipo: 'select',
        valor: 'prefiro-nao-dizer',
        opcoes: [
          { valor: 'prefiro-nao-dizer', rotulo: 'Prefiro não dizer' },
          { valor: 'masculino', rotulo: 'Masculino' },
          { valor: 'feminino', rotulo: 'Feminino' },
          { valor: 'nao-binario', rotulo: 'Não binário' }
        ],
        largura: 'metade'
      },
      {
        id: 'objetivo',
        rotulo: 'Objetivo principal',
        tipo: 'select',
        valor: 'foco',
        opcoes: [
          { valor: 'foco', rotulo: 'Aumentar foco' },
          { valor: 'equilibrio', rotulo: 'Melhor equilíbrio' },
          { valor: 'estudo', rotulo: 'Estudar melhor' },
          { valor: 'trabalho', rotulo: 'Organizar trabalho' },
          { valor: 'criacao', rotulo: 'Criar e produzir' }
        ]
      },
      {
        id: 'tipo_trabalho',
        rotulo: 'Tipo de trabalho',
        tipo: 'select',
        valor: 'mental',
        opcoes: [
          { valor: 'mental', rotulo: 'Mental / analítico' },
          { valor: 'criativo', rotulo: 'Criativo' },
          { valor: 'operacional', rotulo: 'Operacional' },
          { valor: 'multitarefa', rotulo: 'Multitarefa' }
        ]
      },
      {
        id: 'horario_preferido',
        rotulo: 'Melhor horário para focar',
        tipo: 'select',
        valor: 'manha',
        opcoes: [
          { valor: 'manha', rotulo: 'Manhã' },
          { valor: 'tarde', rotulo: 'Tarde' },
          { valor: 'noite', rotulo: 'Noite' },
          { valor: 'variavel', rotulo: 'Variável' }
        ],
        largura: 'metade'
      },
      {
        id: 'horas_trabalho',
        rotulo: 'Horas de foco por dia',
        tipo: 'number',
        min: 2,
        max: 12,
        step: 1,
        valor: 6,
        largura: 'metade'
      },
      {
        id: 'pausa_preferida',
        rotulo: 'Como prefere pausar',
        tipo: 'select',
        valor: 'curta',
        opcoes: [
          { valor: 'curta', rotulo: 'Curta e frequente' },
          { valor: 'equilibrada', rotulo: 'Equilibrada' },
          { valor: 'longa', rotulo: 'Pausa mais longa' }
        ]
      }
    ],
    validar: valores => {
      if (!valores.nome || valores.nome.trim().length < 2) return 'Digite um nome válido.'
      if (!valores.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email)) return 'Informe um e-mail válido.'
      const erroSenha = validarPoliticaSenha(valores.senha)
      if (erroSenha) return erroSenha
      if (!valores.data_nascimento) return 'Selecione sua data de nascimento.'
      if (!Number.isFinite(Number(valores.horas_trabalho)) || Number(valores.horas_trabalho) < 2 || Number(valores.horas_trabalho) > 12) {
        return 'Informe entre 2 e 12 horas de foco por dia.'
      }
      return null
    }
  })

  if (!dados) return null

  const nascimento = String(dados.data_nascimento || '')
  const idade = nascimento
    ? Math.max(8, new Date().getFullYear() - new Date(nascimento).getFullYear())
    : 28

  return {
    nome: dados.nome.trim(),
    email: String(dados.email || '').trim(),
    senha: String(dados.senha || ''),
    idade,
    cronotipo: 'intermediario',
    data_nascimento: nascimento,
    genero: dados.genero,
    objetivo: dados.objetivo,
    tipo_trabalho: dados.tipo_trabalho,
    horario_preferido: dados.horario_preferido,
    horas_trabalho: Number(dados.horas_trabalho),
    pausa_preferida: dados.pausa_preferida,
    primeiro_acesso: true
  }
}

async function abrirQuestionarioPrimeiroAcesso() {
  const dados = await abrirFormulario({
    titulo: 'Seu perfil de foco',
    descricao: 'Responda em poucos passos para personalizar melhor a sua rotina e as pausas.',
    rotuloConfirmar: 'Salvar perfil',
    campos: [
      {
        id: 'cronotipo',
        rotulo: 'Quando você costuma render mais?',
        tipo: 'select',
        valor: 'intermediario',
        opcoes: [
          { valor: 'manhã', rotulo: 'Manhã' },
          { valor: 'intermediario', rotulo: 'Meio do dia' },
          { valor: 'noite', rotulo: 'Noite' }
        ]
      },
      {
        id: 'objetivo',
        rotulo: 'Seu maior objetivo hoje',
        tipo: 'select',
        valor: 'foco',
        opcoes: [
          { valor: 'foco', rotulo: 'Foco total' },
          { valor: 'equilibrio', rotulo: 'Equilíbrio' },
          { valor: 'aprendizado', rotulo: 'Aprender mais' },
          { valor: 'producao', rotulo: 'Produzir mais' }
        ]
      },
      {
        id: 'horario_preferido',
        rotulo: 'Qual momento do dia você prefere para as tarefas pesadas?',
        tipo: 'select',
        valor: 'manha',
        opcoes: [
          { valor: 'manha', rotulo: 'Manhã' },
          { valor: 'tarde', rotulo: 'Tarde' },
          { valor: 'noite', rotulo: 'Noite' },
          { valor: 'variavel', rotulo: 'Depende do dia' }
        ]
      },
      {
        id: 'pausa_preferida',
        rotulo: 'Como você gosta de pausar?',
        tipo: 'select',
        valor: 'curta',
        opcoes: [
          { valor: 'curta', rotulo: 'Pausas curtas e constantes' },
          { valor: 'equilibrada', rotulo: 'Pausas moderadas' },
          { valor: 'longa', rotulo: 'Pausas mais longas' }
        ]
      },
      {
        id: 'horas_trabalho',
        rotulo: 'Quantas horas de foco você quer manter por dia?',
        tipo: 'number',
        min: 2,
        max: 12,
        step: 1,
        valor: 6
      }
    ]
  })

  if (!dados) return null

  return {
    cronotipo: dados.cronotipo || 'intermediario',
    objetivo: dados.objetivo || 'foco',
    horario_preferido: dados.horario_preferido || 'manha',
    pausa_preferida: dados.pausa_preferida || 'curta',
    horas_trabalho: Number(dados.horas_trabalho) || 6,
    primeiro_acesso: false
  }
}

function normalizarPerfilUsuario(perfil = {}, emailFallback = '') {
  const nascimento = perfil.data_nascimento || null
  const idadeCalculada = nascimento
    ? Math.max(8, new Date().getFullYear() - new Date(nascimento).getFullYear())
    : 28

  return {
    nome: perfil.nome || emailFallback.split('@')[0] || 'Usuário',
    idade: Number(perfil.idade) || idadeCalculada,
    cronotipo: perfil.cronotipo || 'intermediario',
    avatar_url: perfil.avatar_url || '',
    email: perfil.email || emailFallback,
    data_nascimento: nascimento,
    genero: perfil.genero || 'prefiro-nao-dizer',
    objetivo: perfil.objetivo || 'foco',
    tipo_trabalho: perfil.tipo_trabalho || 'mental',
    horario_preferido: perfil.horario_preferido || 'manha',
    horas_trabalho: Number(perfil.horas_trabalho) || 6,
    pausa_preferida: perfil.pausa_preferida || 'curta'
  }
}

async function carregarContaNoPainel(usuario, perfilInicial = null) {
  const avisos = []
  let perfil = perfilInicial

  if (!perfil) {
    try {
      perfil = await obterPerfilUsuario()
    } catch (erro) {
      avisos.push('o perfil não foi carregado')
      console.warn('Perfil remoto indisponível:', erro)
    }
  }

  estado.perfil = normalizarPerfilUsuario(perfil || usuario.user_metadata || {}, usuario.email || '')
  estado.autenticado = true
  estado.filtros = { ...FILTROS_PADRAO }

  let registroDocumento = { document: null, revision: 0 }
  let documentoCarregado = false
  try {
    registroDocumento = await obterDocumentoUsuario()
    documentoCarregado = true
  } catch (erro) {
    avisos.push('as tarefas e agendas não foram carregadas')
    console.warn('Documento remoto indisponível:', erro)
  }

  hidratarDocumentoUsuario(registroDocumento)
  if (!documentoCarregado) estado.sincronizacaoPausada = true
  nav.irPara('tela-painel')

  if (documentoCarregado && !registroDocumento.document) {
    await salvar({ imediato: true })
  }
  if (avisos.length) {
    notificar(`Sessão restaurada, mas ${avisos.join(' e ')}. Confira o schema do Supabase; a sincronização permanecerá pausada até os dados carregarem.`, {
      tipo: 'erro',
      duracao: 9000
    })
  }

  return {
    perfil,
    documentoCarregado,
    primeiroAcesso: perfil?.primeiro_acesso ?? usuario.user_metadata?.primeiro_acesso
  }
}

const SIMBOLOS_SENHA = [
  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=',
  '[', ']', '{', '}', ';', "'", '\\', ':', '"', '|', '<', '>', '?', ',', '.', '/', '`', '~'
]

function validarPoliticaSenha(valor) {
  const senha = String(valor || '')
  if (senha.length < 6) return 'A senha deve ter pelo menos 6 caracteres.'
  if (!/[A-Z]/.test(senha)) return 'Inclua pelo menos uma letra maiúscula de A a Z.'
  if (!/[0-9]/.test(senha)) return 'Inclua pelo menos um número de 0 a 9.'
  if (!SIMBOLOS_SENHA.some(simbolo => senha.includes(simbolo))) return 'Inclua um símbolo aceito, como ! ou #.'
  return null
}

async function pedirCodigoTotp(titulo, descricao) {
  const dados = await abrirFormulario({
    titulo,
    descricao,
    rotuloConfirmar: 'Verificar código',
    campos: [{
      id: 'codigo',
      rotulo: 'Código de 6 dígitos',
      tipo: 'text',
      inputmode: 'numeric',
      minlength: 6,
      maxlength: 6,
      autocomplete: 'one-time-code',
      placeholder: '000000'
    }],
    validar: valores => /^\d{6}$/.test(String(valores.codigo || '').trim())
      ? null
      : 'Digite os 6 números exibidos no aplicativo autenticador.'
  })
  return dados?.codigo?.trim() || null
}

async function recuperarSenha() {
  const dados = await abrirFormulario({
    titulo: 'Recuperar senha',
    descricao: 'Enviaremos um link de recuperação para o endereço informado.',
    rotuloConfirmar: 'Enviar link',
    campos: [{
      id: 'email',
      rotulo: 'E-mail da conta',
      tipo: 'email',
      valor: $('#auth-email')?.value.trim() || '',
      placeholder: 'seu@email.com',
      autocomplete: 'email'
    }],
    validar: valores => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valores.email || '').trim())
      ? null
      : 'Informe um e-mail válido.'
  })
  if (!dados) return

  const retorno = new URL(window.location.href)
  retorno.search = ''
  retorno.hash = ''
  retorno.searchParams.set('redefinir-senha', '1')

  try {
    await solicitarRedefinicaoSenha(String(dados.email).trim(), retorno.toString())
    notificar('Se houver uma conta para esse e-mail, enviaremos as instruções de recuperação.', {
      tipo: 'sucesso'
    })
  } catch (erro) {
    notificar(erro?.message || 'Não foi possível enviar o link de recuperação.', { tipo: 'erro' })
  }
}

async function reenviarConfirmacao() {
  const dados = await abrirFormulario({
    titulo: 'Reenviar confirmação',
    descricao: 'Informe o endereço usado no cadastro. Se a conta ainda precisar de confirmação, enviaremos outro link.',
    rotuloConfirmar: 'Enviar confirmação',
    campos: [{
      id: 'email',
      rotulo: 'E-mail da conta',
      tipo: 'email',
      valor: $('#auth-email')?.value.trim() || '',
      placeholder: 'seu@email.com',
      autocomplete: 'email'
    }],
    validar: valores => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valores.email || '').trim())
      ? null
      : 'Informe um e-mail válido.'
  })
  if (!dados) return

  const retorno = new URL(window.location.href)
  retorno.search = ''
  retorno.hash = ''
  try {
    await reenviarConfirmacaoEmail(String(dados.email).trim(), retorno.toString())
    notificar('Se a conta precisar de confirmação, um novo link foi enviado.', { tipo: 'sucesso' })
  } catch (erro) {
    notificar(erro?.message || 'Não foi possível reenviar a confirmação.', { tipo: 'erro' })
  }
}

async function autenticarUsuario({ cadastro = false } = {}) {
  const email = $('#auth-email')?.value.trim() || ''
  const senha = $('#auth-senha')?.value || ''

  if (cadastro) {
    const dadosCadastro = await abrirCadastroUsuario({ emailPadrao: email })
    if (!dadosCadastro) return

    const emailCadastro = String(dadosCadastro.email || '').trim()
    const senhaCadastro = String(dadosCadastro.senha || '')

    if (!emailCadastro || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCadastro)) {
      notificar('Informe um e-mail válido antes de criar a conta.', { tipo: 'erro' })
      return
    }

    const erroSenha = validarPoliticaSenha(senhaCadastro)
    if (erroSenha) {
      notificar(erroSenha, { tipo: 'erro' })
      return
    }

    try {
      const cadastroCriado = await cadastrarUsuario(emailCadastro, senhaCadastro, dadosCadastro)
      if ($('#auth-email')) $('#auth-email').value = emailCadastro
      if ($('#auth-senha')) $('#auth-senha').value = ''
      nav.irPara('tela-auth')
      notificar(
        cadastroCriado.session
          ? 'Conta criada. Entre para carregar seus dados sincronizados.'
          : 'Conta criada. Confirme o e-mail recebido e depois entre.',
        { tipo: 'sucesso' }
      )
      $('#auth-email')?.focus()
    } catch (erro) {
      notificar(erro?.message || 'Não foi possível criar a conta.', { tipo: 'erro' })
    }
    return
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notificar('Informe um e-mail válido antes de continuar.', { tipo: 'erro' })
    $('#auth-email')?.focus()
    return
  }

  if (senha.length < 6) {
    notificar('A senha precisa ter pelo menos 6 caracteres.', { tipo: 'erro' })
    $('#auth-senha')?.focus()
    return
  }

  let sessaoIniciada = false
  try {
    const resultado = await entrarUsuario(email, senha)
    sessaoIniciada = true
    const desafio = await iniciarDesafioMfa()
    if (desafio) {
      const codigo = await pedirCodigoTotp(
        'Verificação em duas etapas',
        'Digite o código atual do aplicativo autenticador vinculado à sua conta.'
      )
      if (!codigo) {
        await sairUsuario()
        sessaoIniciada = false
        return
      }
      await verificarFatorTotp(desafio.factorId, desafio.challengeId, codigo)
    }

    const usuario = resultado?.user || await obterUsuarioAtual()
    if (!usuario) throw new Error('A sessão autenticada não foi encontrada.')
    const conta = await carregarContaNoPainel(usuario)

    if (conta.primeiroAcesso !== false) {
      const respostas = await abrirQuestionarioPrimeiroAcesso()
      if (respostas) {
        try {
          const atualizado = await salvarPerfilUsuario({
            ...estado.perfil,
            ...respostas,
            primeiro_acesso: false
          })
          estado.perfil = normalizarPerfilUsuario(atualizado, usuario.email || email)
          reconstruirBio()
          ui.atualizarCabecalho(estado.perfil, estado.bio)
        } catch (erro) {
          notificar(erro?.message || 'Não foi possível salvar as preferências do perfil.', { tipo: 'erro' })
        }
      }
    }

    notificar(`Sua conta foi acessada com sucesso, ${estado.perfil.nome}.`, { tipo: 'sucesso' })
  } catch (erro) {
    if (sessaoIniciada) await sairUsuario().catch(() => {})
    estado.autenticado = false
    const mensagem =
      erro?.message?.includes('Credenciais inválidas')
        ? erro.message
        : erro?.message?.includes('E-mail ainda não foi confirmado')
          ? erro.message
          : erro?.message || 'Não foi possível concluir a autenticação.'

    notificar(mensagem, { tipo: 'erro' })
  }
}

async function entrarNoSistema(evento) {
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

  try {
    const perfilAtual = await obterPerfilUsuario()
    if (!perfilAtual) throw new Error('Entre na sua conta antes de completar o perfil.')

    const perfilSalvo = await salvarPerfilUsuario({
      ...perfilAtual,
      nome,
      idade,
      cronotipo,
      primeiro_acesso: false
    })
    estado.perfil = normalizarPerfilUsuario(perfilSalvo, perfilSalvo.email)
    estado.autenticado = true
    estado.filtros = { ...FILTROS_PADRAO }
    hidratarDocumentoUsuario(await obterDocumentoUsuario())
    nav.irPara('tela-painel')
    anim.revelar('.cartao')
    await salvar({ imediato: true })
    aplicarAcaoDaURL()
    notificar(`Perfil sincronizado. Seu foco contínuo ideal é de ${estado.bio.focoMaximo} minutos.`, {
      tipo: 'sucesso'
    })
  } catch (erro) {
    estado.autenticado = false
    nav.irPara('tela-auth')
    notificar(erro?.message || 'Não foi possível salvar seu perfil no Supabase.', { tipo: 'erro' })
  }
}

async function trocarPerfil() {
  const ok = await confirmar({
    titulo: 'Trocar de perfil?',
    mensagem: 'Seus dados permanecem na sua conta Chronos Ultra; a sessão deste dispositivo será encerrada.',
    rotuloConfirmar: 'Trocar perfil'
  })
  if (!ok) return

  foco.pararFoco()
  const sincronizado = await salvar({ imediato: true })
  if (!sincronizado) {
    const sairSemSalvar = await confirmar({
      titulo: 'Sair sem sincronizar?',
      mensagem: 'As alterações pendentes não foram gravadas na nuvem e serão descartadas neste dispositivo.',
      rotuloConfirmar: 'Sair mesmo assim',
      perigo: true
    })
    if (!sairSemSalvar) return
  }

  try {
    await sairUsuario()
  } catch (erro) {
    notificar(erro?.message || 'Não foi possível encerrar a sessão no Supabase.', { tipo: 'erro' })
    return
  }

  tarefas.limparTodas()
  estado.perfil = {
    nome: '', idade: 0, cronotipo: 'intermediario', avatar_url: '', email: '',
    data_nascimento: null, genero: 'prefiro-nao-dizer', objetivo: 'foco',
    tipo_trabalho: 'mental', horario_preferido: 'manha', horas_trabalho: 6,
    pausa_preferida: 'curta'
  }
  estado.configuracoes = { ...CONFIG_PADRAO, interrupcoes: [] }
  estado.agendas = {}
  estado.historico = []
  estado.sessoes = []
  estado.agendaAtual = null
  estado.autenticado = false
  estado.filtros = { ...FILTROS_PADRAO }
  estado.revisaoDocumento = 0
  estado.sincronizacaoPausada = false
  estado.ultimoBackup = null
  estado.tema = 'escuro'
  avisoFalhaSincronizacao = false
  ui.aplicarTema(estado.tema)

  ui.limparPainel()
  if ($('#seu-nome')) $('#seu-nome').value = ''
  if ($('#sua-idade')) $('#sua-idade').value = ''
  if ($('#auth-email')) $('#auth-email').value = ''
  if ($('#auth-senha')) $('#auth-senha').value = ''
  nav.irPara('tela-auth')
  $('#auth-email')?.focus()
}

/** Edita nome, idade e cronotipo sem precisar sair e voltar ao perfil. */
async function editarPerfil() {
  const dados = await abrirFormulario({
    titulo: 'Editar perfil do Chronos',
    descricao: 'Atualize seus dados pessoais, preferências e aparência sem sair do fluxo.',
    rotuloConfirmar: 'Salvar perfil',
    campos: [
      { id: 'nome', rotulo: 'Nome', valor: estado.perfil.nome || '' },
      {
        id: 'email',
        rotulo: 'E-mail',
        tipo: 'email',
        valor: estado.perfil.email || $('#auth-email')?.value || '',
        ajuda: 'Troca de e-mail pode exigir confirmação.'
      },
      {
        id: 'avatar_file',
        rotulo: 'Alterar foto de perfil',
        tipo: 'file',
        accept: 'image/jpeg,image/png,image/webp',
        ajuda: 'JPG, PNG ou WebP, até 5 MB. A imagem será guardada na sua conta Chronos Ultra.'
      },
      {
        id: 'data_nascimento',
        rotulo: 'Data de nascimento',
        tipo: 'date',
        valor: estado.perfil.data_nascimento || '',
        largura: 'metade'
      },
      {
        id: 'genero',
        rotulo: 'Gênero',
        tipo: 'select',
        valor: estado.perfil.genero || 'prefiro-nao-dizer',
        opcoes: [
          { valor: 'prefiro-nao-dizer', rotulo: 'Prefiro não dizer' },
          { valor: 'masculino', rotulo: 'Masculino' },
          { valor: 'feminino', rotulo: 'Feminino' },
          { valor: 'nao-binario', rotulo: 'Não binário' }
        ],
        largura: 'metade'
      },
      {
        id: 'objetivo',
        rotulo: 'Objetivo principal',
        tipo: 'select',
        valor: estado.perfil.objetivo || 'foco',
        opcoes: [
          { valor: 'foco', rotulo: 'Aumentar foco' },
          { valor: 'equilibrio', rotulo: 'Melhor equilíbrio' },
          { valor: 'estudo', rotulo: 'Estudar melhor' },
          { valor: 'trabalho', rotulo: 'Organizar trabalho' },
          { valor: 'criacao', rotulo: 'Criar e produzir' }
        ]
      },
      {
        id: 'tipo_trabalho',
        rotulo: 'Tipo de trabalho',
        tipo: 'select',
        valor: estado.perfil.tipo_trabalho || 'mental',
        opcoes: [
          { valor: 'mental', rotulo: 'Mental / analítico' },
          { valor: 'criativo', rotulo: 'Criativo' },
          { valor: 'operacional', rotulo: 'Operacional' },
          { valor: 'multitarefa', rotulo: 'Multitarefa' }
        ]
      },
      {
        id: 'cronotipo',
        rotulo: 'Cronotipo',
        tipo: 'select',
        valor: estado.perfil.cronotipo || 'intermediario',
        opcoes: alg.CRONOTIPOS.map(c => ({ valor: c.id, rotulo: c.rotulo })),
        largura: 'metade'
      },
      {
        id: 'horario_preferido',
        rotulo: 'Melhor horário para focar',
        tipo: 'select',
        valor: estado.perfil.horario_preferido || 'manha',
        opcoes: [
          { valor: 'manha', rotulo: 'Manhã' },
          { valor: 'tarde', rotulo: 'Tarde' },
          { valor: 'noite', rotulo: 'Noite' },
          { valor: 'variavel', rotulo: 'Variável' }
        ],
        largura: 'metade'
      },
      {
        id: 'horas_trabalho',
        rotulo: 'Horas de foco por dia',
        tipo: 'number',
        min: 2,
        max: 12,
        step: 1,
        valor: estado.perfil.horas_trabalho || 6,
        largura: 'metade'
      },
      {
        id: 'pausa_preferida',
        rotulo: 'Pausa preferida',
        tipo: 'select',
        valor: estado.perfil.pausa_preferida || 'curta',
        opcoes: [
          { valor: 'curta', rotulo: 'Curta e frequente' },
          { valor: 'equilibrada', rotulo: 'Equilibrada' },
          { valor: 'longa', rotulo: 'Pausa mais longa' }
        ],
        largura: 'metade'
      }
    ],
    validar: valores => {
      if (!valores.nome || valores.nome.trim().length < 2) return 'Informe um nome válido.'
      if (!valores.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email)) return 'Informe um e-mail válido.'
      if (valores.avatar_file && !['image/jpeg', 'image/png', 'image/webp'].includes(valores.avatar_file.type)) {
        return 'A foto precisa estar em JPG, PNG ou WebP.'
      }
      if (valores.avatar_file && valores.avatar_file.size > 5 * 1024 * 1024) return 'A foto deve ter no máximo 5 MB.'
      if (!valores.data_nascimento) return 'Selecione sua data de nascimento.'
      if (!Number.isFinite(Number(valores.horas_trabalho)) || Number(valores.horas_trabalho) < 2 || Number(valores.horas_trabalho) > 12) {
        return 'As horas de foco precisam ficar entre 2 e 12.'
      }
      return null
    }
  })
  if (!dados) return

  const nomeAnterior = estado.perfil.nome
  const emailAnterior = estado.perfil.email || $('#auth-email')?.value || ''
  const idadeNova = dados.data_nascimento
    ? Math.max(8, new Date().getFullYear() - new Date(dados.data_nascimento).getFullYear())
    : estado.perfil.idade || 28

  const proximoPerfil = {
    ...estado.perfil,
    nome: dados.nome.trim(),
    email: String(dados.email || '').trim(),
    avatar_url: estado.perfil.avatar_url || '',
    idade: idadeNova,
    cronotipo: dados.cronotipo || estado.perfil.cronotipo,
    data_nascimento: dados.data_nascimento || null,
    genero: dados.genero || estado.perfil.genero,
    objetivo: dados.objetivo || estado.perfil.objetivo,
    tipo_trabalho: dados.tipo_trabalho || estado.perfil.tipo_trabalho,
    horario_preferido: dados.horario_preferido || estado.perfil.horario_preferido,
    horas_trabalho: Number(dados.horas_trabalho) || estado.perfil.horas_trabalho || 6,
    pausa_preferida: dados.pausa_preferida || estado.perfil.pausa_preferida
  }

  try {
    const emailNovo = String(dados.email || '').trim()
    if (dados.avatar_file) {
      proximoPerfil.avatar_url = await enviarFotoPerfil(dados.avatar_file)
    }
    if (emailNovo && emailNovo !== emailAnterior) {
      await atualizarEmailUsuario(emailNovo)
      notificar('E-mail atualizado. Verifique sua caixa e confirme a troca.', { tipo: 'info' })
    }

    const avatarAnterior = estado.perfil.avatar_url
    const perfilSalvo = await salvarPerfilUsuario(proximoPerfil)
    if (dados.avatar_file && perfilSalvo.avatar_url) {
      await removerFotosAntigasPerfil(perfilSalvo.avatar_url)
      if (avatarAnterior && avatarAnterior !== perfilSalvo.avatar_url) {
        await removerFotosAntigasPerfil(perfilSalvo.avatar_url)
      }
    }
    estado.perfil = normalizarPerfilUsuario(perfilSalvo, emailNovo)
    reconstruirBio()
    ui.atualizarCabecalho(estado.perfil, estado.bio)
    atualizarPainel({ regerar: true })
    const sincronizado = await salvar({ imediato: true })
    if (!sincronizado) return
  } catch (erro) {
    notificar(erro?.message || 'Não foi possível sincronizar o perfil.', { tipo: 'erro' })
    return
  }

  notificar(
    nomeAnterior !== estado.perfil.nome
      ? `Perfil atualizado. Os dados antigos continuam salvos em "${nomeAnterior}".`
      : `Perfil atualizado. Foco contínuo ideal: ${estado.bio.focoMaximo} min.`,
    { tipo: 'sucesso', duracao: 5000 }
  )
}

let dialogoNovaSenhaAberto = false

async function abrirFormularioNovaSenha() {
  if (dialogoNovaSenhaAberto) return
  dialogoNovaSenhaAberto = true

  try {
    const dados = await abrirFormulario({
      titulo: 'Defina uma nova senha',
      descricao: 'Use 6 ou mais caracteres, uma maiúscula, um número e um símbolo. Não reutilize senhas.',
      rotuloConfirmar: 'Atualizar senha',
      campos: [
        {
          id: 'senha',
          rotulo: 'Nova senha',
          tipo: 'password',
          minlength: 6,
          autocomplete: 'new-password'
        },
        {
          id: 'confirmacao',
          rotulo: 'Confirme a nova senha',
          tipo: 'password',
          minlength: 6,
          autocomplete: 'new-password'
        }
      ],
      validar: valores => {
        const erroSenha = validarPoliticaSenha(valores.senha)
        if (erroSenha) return erroSenha
        if (valores.senha !== valores.confirmacao) return 'As senhas não coincidem.'
        return null
      }
    })
    if (!dados) return

    const desafio = await iniciarDesafioMfa()
    if (desafio) {
      const codigo = await pedirCodigoTotp(
        'Verificação em duas etapas',
        'Confirme sua identidade com o autenticador antes de alterar a senha.'
      )
      if (!codigo) return
      await verificarFatorTotp(desafio.factorId, desafio.challengeId, codigo)
    }

    await atualizarSenhaUsuario(dados.senha)
    const url = new URL(window.location.href)
    url.searchParams.delete('redefinir-senha')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    notificar('Senha atualizada com sucesso.', { tipo: 'sucesso' })
  } catch (erro) {
    notificar(erro?.message || 'Não foi possível atualizar a senha.', { tipo: 'erro' })
  } finally {
    dialogoNovaSenhaAberto = false
  }
}

function ligarRetornoRecuperacaoSenha() {
  supabase.auth.onAuthStateChange(evento => {
    if (evento === 'PASSWORD_RECOVERY') {
      window.setTimeout(() => abrirFormularioNovaSenha(), 0)
    }
  })

  if (new URLSearchParams(window.location.search).get('redefinir-senha') === '1') {
    supabase.auth.getSession().then(({ data, error }) => {
      if (!error && data.session) window.setTimeout(() => abrirFormularioNovaSenha(), 0)
    })
  }
}

async function atualizarStatusSeguranca() {
  const status = $('#mfa-status')
  const ativar = $('#btn-mfa-ativar')
  const desativar = $('#btn-mfa-desativar')
  if (!status || !ativar || !desativar) return

  if (!estado.autenticado) {
    status.textContent = 'Entre na sua conta para consultar o status.'
    ativar.hidden = true
    desativar.hidden = true
    return
  }

  status.textContent = 'Consultando status…'
  try {
    const fatores = await listarFatoresTotp()
    const verificado = fatores.some(fator => fator.status === 'verified')
    const pendente = fatores.some(fator => fator.status === 'unverified')
    status.textContent = verificado
      ? 'Ativo. Um código do autenticador será solicitado ao entrar.'
      : pendente
        ? 'Há uma configuração pendente. Inicie novamente para concluir.'
        : 'Desativado. A conta usa e-mail e senha.'
    ativar.hidden = verificado
    desativar.hidden = !verificado
  } catch (erro) {
    status.textContent = 'Não foi possível consultar o status do autenticador.'
    ativar.hidden = true
    desativar.hidden = true
    console.warn('Não foi possível consultar os fatores MFA:', erro)
  }
}

async function ativarMfa() {
  let fatorId = null
  let verificado = false
  try {
    const fator = await inscreverFatorTotp()
    fatorId = fator.id
    const qrCode = fator.totp?.qr_code
    const segredo = fator.totp?.secret
    if (!qrCode || !segredo) throw new Error('O Supabase não retornou os dados do autenticador.')

    await abrirPainel({
      titulo: 'Conecte seu aplicativo autenticador',
      descricao: 'Escaneie o QR com um autenticador compatível. Se não puder, adicione a chave manualmente.',
      largura: '30rem',
      html: `<div class="mfa-configuracao">
        <img class="mfa-configuracao__qr" src="${escaparHTML(qrCode)}" alt="QR para configurar o autenticador" width="200" height="200" />
        <p>Chave para configuração manual</p>
        <code class="mfa-configuracao__segredo">${escaparHTML(segredo)}</code>
        <p>Não compartilhe esta chave. Ela permite gerar códigos para sua conta.</p>
      </div>`
    })

    const codigo = await pedirCodigoTotp(
      'Confirme o autenticador',
      'Digite o código de 6 dígitos gerado pelo aplicativo para concluir a ativação.'
    )
    if (!codigo) {
      await desativarFatorTotp(fatorId)
      fatorId = null
      return
    }

    const desafio = await desafiarFatorTotp(fatorId)
    await verificarFatorTotp(fatorId, desafio.id, codigo)
    verificado = true
    await atualizarStatusSeguranca()
    notificar('Autenticação em duas etapas ativada.', { tipo: 'sucesso' })
  } catch (erro) {
    if (fatorId && !verificado) await desativarFatorTotp(fatorId).catch(() => {})
    notificar(erro?.message || 'Não foi possível ativar o autenticador.', { tipo: 'erro' })
    await atualizarStatusSeguranca()
  }
}

async function desativarMfa() {
  const fatores = await listarFatoresTotp().catch(erro => {
    notificar(erro?.message || 'Não foi possível consultar o autenticador.', { tipo: 'erro' })
    return []
  })
  const fator = fatores.find(item => item.status === 'verified')
  if (!fator) {
    await atualizarStatusSeguranca()
    return
  }

  const autorizado = await confirmar({
    titulo: 'Remover autenticação em duas etapas?',
    mensagem: 'A conta voltará a exigir somente e-mail e senha. Você poderá ativar o autenticador novamente nas configurações.',
    rotuloConfirmar: 'Remover MFA',
    perigo: true
  })
  if (!autorizado) return

  try {
    const desafio = await iniciarDesafioMfa()
    if (desafio) {
      const codigo = await pedirCodigoTotp(
        'Confirme sua identidade',
        'Digite um código do autenticador antes de removê-lo.'
      )
      if (!codigo) return
      await verificarFatorTotp(desafio.factorId, desafio.challengeId, codigo)
    }

    await desativarFatorTotp(fator.id)
    await atualizarStatusSeguranca()
    notificar('Autenticação em duas etapas removida.', { tipo: 'info' })
  } catch (erro) {
    notificar(erro?.message || 'Não foi possível remover o autenticador.', { tipo: 'erro' })
  }
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

  const tipoRepeticao = $('#recorrencia-tarefa')?.value || 'nunca'
  const recorrencia =
    tipoRepeticao === 'nunca'
      ? null
      : { tipo: tipoRepeticao, dias: tipoRepeticao === 'semanal' ? ui.lerDiasRecorrencia() : [] }

  const criada = tarefas.adicionar({ nome, peso, tempo, categoria, prazo, recorrencia })

  if (criada.tempo > estado.bio.focoMaximo) {
    notificar(
      `"${criada.nome}" passa do seu foco contínuo (${estado.bio.focoMaximo} min). Vamos dividir em blocos com pausas.`,
      { tipo: 'info', duracao: 6000 }
    )
  }

  // mantém a categoria escolhida: normalmente se cadastra várias do mesmo tipo
  $('#form-tarefa')?.reset()
  // o reset do <form> devolve o select de recorrência ao padrão, então a
  // fileira de dias precisa acompanhar para não ficar visível sem contexto
  ui.alternarDiasRecorrencia($('#recorrencia-tarefa')?.value || 'nunca')
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

function duplicarTarefa(id) {
  const tarefa = tarefas.obter(id)
  if (!tarefa) return

  const copia = tarefas.adicionar({
    ...tarefa,
    id: undefined,
    nome: `${tarefa.nome} (cópia)`,
    concluida: false,
    concluidaEm: null,
    recorrencia: tarefa.recorrencia ? { ...tarefa.recorrencia } : null,
    concluidas: [],
    adiadaPara: null,
    criadaEm: new Date().toISOString()
  })

  renderizarLista()
  atualizarPainel({ regerar: true })
  salvar()
  notificar(`"${copia.nome}" foi duplicada.` , { tipo: 'sucesso', duracao: 2800 })
}

function focarTarefa(id) {
  const tarefa = tarefas.obter(id)
  if (!tarefa) return

  const minutos = Math.min(Math.max(Number(tarefa.tempo) || 25, 5), Math.max(25, estado.bio.focoMaximo || 50))
  nav.irPara('tela-foco')
  setTimeout(() => {
    iniciarSessaoDeFoco({
      titulo: tarefa.nome,
      minutos,
      tarefa: tarefa.id
    })
  }, 120)
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
  const tarefa = tarefas.toggleConcluida(id, dataReferencia())
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

function abrirFormularioTarefa() {
  nav.irPara('tela-rotinas')
  setTimeout(() => {
    const campo = $('#nome-tarefa')
    if (!campo) return
    campo.focus()
    campo.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 150)
}

function limparFiltros() {
  estado.filtros = { ...FILTROS_PADRAO }

  const buscaTarefa = $('#busca-tarefa')
  const buscaGlobal = $('#busca-global')
  const campoCategoria = $('#filtro-categoria')
  const campoOrdem = $('#ordenar-tarefas')

  if (buscaTarefa) buscaTarefa.value = ''
  if (buscaGlobal) buscaGlobal.value = ''
  if (campoCategoria) campoCategoria.value = 'todas'
  if (campoOrdem) campoOrdem.value = 'manual'

  $$('[data-status]').forEach(botao => {
    const ativo = botao.dataset.status === 'todas'
    botao.classList.toggle('ativo', ativo)
    botao.setAttribute('aria-pressed', String(ativo))
  })

  renderizarLista()
  notificar('Filtros resetados.', { tipo: 'info', duracao: 2400 })
}

async function concluirVisiveis() {
  const lista = $('#lista-de-tarefas')
  const ids = Array.from(lista?.querySelectorAll('.tarefa[data-id]') || []).map(item => item.dataset.id).filter(Boolean)

  if (!ids.length) {
    notificar('Não há tarefas visíveis para concluir no filtro atual.', { tipo: 'info', duracao: 2600 })
    return
  }

  const ok = await confirmar({
    titulo: 'Concluir tarefas visíveis?',
    mensagem: `Marcar ${ids.length} tarefa(s) do filtro atual como concluída(s)?`,
    rotuloConfirmar: 'Sim, concluir',
    perigo: false
  })

  if (!ok) return

  let concluidas = 0
  ids.forEach(id => {
    const tarefa = tarefas.obter(id)
    if (!tarefa || tarefa.concluida) return
    tarefas.toggleConcluida(id)
    concluidas += 1
  })

  renderizarLista()
  atualizarPainel({ regerar: true })
  salvar()

  notificar(
    concluidas > 0
      ? `${concluidas} tarefa(s) concluída(s) no filtro atual.`
      : 'Nenhuma tarefa pendente foi alterada.',
    { tipo: concluidas > 0 ? 'sucesso' : 'info', duracao: 2600 }
  )
}

function priorizarUrgentes() {
  estado.filtros.status = 'urgentes'
  $$('[data-status]').forEach(botao => {
    const ativo = botao.dataset.status === 'urgentes'
    botao.classList.toggle('ativo', ativo)
    botao.setAttribute('aria-pressed', String(ativo))
  })
  renderizarLista()
  notificar('Mostrando tarefas urgentes primeiro.', { tipo: 'info', duracao: 2600 })
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
  // As recorrentes entram só nos dias em que a repetição cai — por isso a data.
  const ativas = tarefas.filtrarAtivas(dataReferencia())
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

/* ------------------------------------------------- sobrecarga do dia ----- */

/**
 * Tira a tarefa do dia atual empurrando-a para o seguinte.
 *
 * Não apaga nem conclui — a tarefa continua no inventário, apenas deixa de
 * disputar espaço hoje. É reversível pelo "Desfazer" do aviso.
 */
function adiarTarefa(id) {
  const tarefa = tarefas.obter(id)
  if (!tarefa) return

  const seguinte = new Date(dataReferencia())
  seguinte.setDate(seguinte.getDate() + 1)
  const destino = calendario.chaveData(seguinte)
  const anterior = tarefa.adiadaPara

  tarefas.editar(id, { adiadaPara: destino })
  renderizarLista()
  gerarAgenda({ silencioso: true })
  atualizarPainel()
  salvar()

  notificar(`"${tarefa.nome}" saiu de hoje e volta em ${destino.split('-').reverse().join('/')}.`, {
    tipo: 'sucesso',
    acao: {
      rotulo: 'Desfazer',
      aoClicar: () => {
        tarefas.editar(id, { adiadaPara: anterior })
        renderizarLista()
        gerarAgenda({ silencioso: true })
        atualizarPainel()
        salvar()
      }
    }
  })
}

/** Reduz a duração da tarefa para o que ainda cabe no dia. */
async function encurtarTarefa(id) {
  const tarefa = tarefas.obter(id)
  if (!tarefa) return

  const sobra = Math.max(0, (estado.agendaAtual?.stats?.minutosLivres || 0))
  const sugerido = sobra >= 15 ? Math.floor(sobra / 5) * 5 : Math.max(15, Math.round(tarefa.tempo / 2 / 5) * 5)

  const dados = await abrirFormulario({
    titulo: `Encurtar "${tarefa.nome}"`,
    descricao:
      sobra >= 15
        ? `Ainda restam ${alg.formatarDuracao(sobra)} livres hoje. Reduzir a tarefa a esse tamanho faz ela caber.`
        : 'Não há folga hoje. Reduzir pela metade permite ao menos começar a tarefa.',
    rotuloConfirmar: 'Encurtar',
    campos: [
      {
        id: 'tempo',
        rotulo: 'Nova duração (minutos)',
        tipo: 'number',
        min: 5,
        max: 1440,
        step: 5,
        valor: sugerido
      }
    ],
    validar: v => (v.tempo >= 5 ? null : 'A duração precisa ser de ao menos 5 minutos.')
  })
  if (!dados) return

  const antes = tarefa.tempo
  tarefas.editar(id, { tempo: dados.tempo })
  renderizarLista()
  gerarAgenda({ silencioso: true })
  atualizarPainel()
  salvar()
  notificar(`"${tarefa.nome}": ${antes} min → ${dados.tempo} min.`, { tipo: 'sucesso' })
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
 * Os dados ficam associados à conta Supabase; o arquivo exportado é a cópia
 * independente que o usuário pode guardar fora do serviço.
 * O lembrete só aparece quando há algo que valha a pena perder — e some por
 * 30 dias assim que o usuário exporta ou dispensa.
 */
function avaliarLembreteDeBackup() {
  const faixa = document.getElementById('faixa-backup')
  if (!faixa || !estado.autenticado) return

  const ultimo = Number(estado.ultimoBackup) || 0
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
  estado.ultimoBackup = Date.now() - (DIAS_ATE_LEMBRAR_BACKUP - 30) * 86400000
  salvar()
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
    historico: estado.historico,
    sessoes: estado.sessoes,
    tema: estado.tema
  }
  baixarArquivo(
    `chronos-backup-${calendario.chaveData(new Date())}.json`,
    JSON.stringify(pacote, null, 2),
    'application/json;charset=utf-8'
  )
  estado.ultimoBackup = Date.now()
  salvar({ imediato: true })
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
    estado.sessoes = Array.isArray(pacote.sessoes) ? pacote.sessoes : []
    estado.ultimoBackup = Number(pacote.ultimoBackup) || estado.ultimoBackup
    if (['escuro', 'claro', 'auto'].includes(pacote.tema)) {
      estado.tema = pacote.tema
      ui.aplicarTema(estado.tema)
    }
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
    const sincronizado = await salvar({ imediato: true })
    if (!sincronizado) return
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

function focarPrioridade() {
  const pendentes = tarefas.filtrarAtivas(new Date())

  if (!pendentes.length) {
    notificar('Não há tarefas pendentes para focar agora.', { tipo: 'info', duracao: 2600 })
    return
  }

  const prioritaria = [...pendentes].sort((a, b) => {
    const urgA = a.prazo ? alg.calcularUrgencia(a.prazo) : 0.15
    const urgB = b.prazo ? alg.calcularUrgencia(b.prazo) : 0.15
    return urgB * 10 + b.peso - (urgA * 10 + a.peso)
  })[0]

  if (!prioritaria) {
    notificar('Não consegui escolher uma tarefa prioritária no momento.', { tipo: 'info', duracao: 2600 })
    return
  }

  nav.irPara('tela-foco')
  setTimeout(() => {
    iniciarSessaoDeFoco({
      titulo: prioritaria.nome,
      minutos: Math.min(Math.max(Number(prioritaria.tempo) || 25, 10), Math.max(25, estado.bio.focoMaximo || 50)),
      tarefa: prioritaria.id
    })
  }, 120)
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

  if (id === 'tela-configuracoes') {
    atualizarStatusSeguranca()
    return
  }

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
  salvar()
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
  $('#btn-auth-login')?.addEventListener('click', () => autenticarUsuario({ cadastro: false }))
  $('#btn-auth-cadastro')?.addEventListener('click', () => autenticarUsuario({ cadastro: true }))
  $('#btn-auth-recuperar')?.addEventListener('click', recuperarSenha)
  $('#btn-auth-reenviar-confirmacao')?.addEventListener('click', reenviarConfirmacao)
  $('#form-auth')?.addEventListener('submit', evento => {
    evento.preventDefault()
    autenticarUsuario({ cadastro: false })
  })

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
    else if (acao === 'duplicar') duplicarTarefa(id)
    else if (acao === 'focar') focarTarefa(id)
    else if (acao === 'concluir') alternarConcluida(id)
  })

  $('#btn-limpar-concluidas')?.addEventListener('click', limparConcluidas)
  $('#btn-limpar-todas')?.addEventListener('click', limparTodas)
  $('#btn-nova-tarefa-rotinas')?.addEventListener('click', abrirFormularioTarefa)
  $('#btn-concluir-visiveis')?.addEventListener('click', concluirVisiveis)
  $('#btn-priorizar-urgentes')?.addEventListener('click', priorizarUrgentes)
  $('#btn-limpar-filtros')?.addEventListener('click', limparFiltros)

  ui.ligarArrasteDeTarefas((idOrigem, idDestino) => {
    if (!tarefas.mover(idOrigem, idDestino)) return
    renderizarLista()
    salvar()
  })

  // Recorrência: os dias da semana só fazem sentido no tipo "semanal".
  const seletorRepeticao = $('#recorrencia-tarefa')
  seletorRepeticao?.addEventListener('change', () => {
    ui.alternarDiasRecorrencia(seletorRepeticao.value)
    // sem nenhum dia marcado, "semanal" nunca cairia — sugere o dia de hoje
    if (seletorRepeticao.value === 'semanal' && !ui.lerDiasRecorrencia().length) {
      ui.definirDiasRecorrencia([new Date().getDay()])
    }
  })

  $('#dias-recorrencia')?.addEventListener('click', evento => {
    const botao = evento.target.closest('.dia-semana')
    if (!botao) return
    botao.setAttribute('aria-pressed', botao.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')
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
    const foco = evento.target.closest('[data-foco]')
    if (foco) {
      iniciarSessaoDeFoco({
        titulo: foco.dataset.titulo,
        minutos: Number(foco.dataset.minutos),
        tarefa: foco.dataset.tarefa
      })
      return
    }

    const adiar = evento.target.closest('[data-adiar]')
    if (adiar) return adiarTarefa(adiar.dataset.adiar)

    const encolher = evento.target.closest('[data-encolher]')
    if (encolher) return encurtarTarefa(encolher.dataset.encolher)
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
    perfil: estado.bio,
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
    const ehPersonalizado = preset.dataset.personalizado === 'true'
    const ativo = ehPersonalizado ? false : Number(preset.dataset.minutos) === estado.minutosFoco
    preset.classList.toggle('ativo', ativo)
  })
  if (!foco.estaAtivo()) {
    ui.renderizarSessaoFoco(null, { minutosPadrao: estado.minutosFoco })
  }
}

async function abrirSessaoPersonalizada() {
  const dados = await abrirFormulario({
    titulo: 'Sessão personalizada',
    descricao: 'Escolha a duração da sua próxima sessão de foco.',
    rotuloConfirmar: 'Salvar duração',
    campos: [
      {
        id: 'minutos',
        rotulo: 'Tempo em minutos',
        tipo: 'number',
        min: 5,
        max: 180,
        step: 5,
        valor: estado.minutosFoco,
        largura: 'total'
      }
    ],
    validar: valores => {
      const minutos = Number(valores.minutos)
      if (!Number.isFinite(minutos) || minutos < 5 || minutos > 180) {
        return 'Escolha um valor entre 5 e 180 minutos.'
      }
      return null
    }
  })

  if (!dados) return

  const minutos = Math.round(Number(dados.minutos))
  definirMinutosDeFoco(minutos)
  notificar(`Sessão ajustada para ${minutos} min.`, { tipo: 'info', duracao: 2200 })
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
  $('#btn-foco-personalizado')?.addEventListener('click', abrirSessaoPersonalizada)

  $$('.foco-preset').forEach(preset => {
    if (preset.dataset.personalizado === 'true') return
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
  $('#btn-foco-prioritario')?.addEventListener('click', focarPrioridade)
  $('#btn-editar-perfil')?.addEventListener('click', editarPerfil)
  $('#btn-mfa-ativar')?.addEventListener('click', ativarMfa)
  $('#btn-mfa-desativar')?.addEventListener('click', desativarMfa)
  $('#btn-backup-agora')?.addEventListener('click', exportarDados)
  $('#btn-backup-depois')?.addEventListener('click', adiarLembreteDeBackup)
  $('#btn-nova-tarefa')?.addEventListener('click', abrirFormularioTarefa)

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

async function restaurarSessaoDoSupabase() {
  let usuario
  try {
    usuario = await obterUsuarioAtual()
  } catch (erro) {
    estado.autenticado = false
    console.warn('Sessão do Supabase não pôde ser verificada:', erro)
    notificar(erro?.message || 'Não foi possível verificar sua sessão. Tente novamente.', { tipo: 'erro' })
    return
  }

  if (!usuario) return
  try {
    await carregarContaNoPainel(usuario)
    aplicarAcaoDaURL()
  } catch (erro) {
    estado.autenticado = false
    console.error('A sessão foi validada, mas a interface não pôde ser restaurada:', erro)
    notificar(erro?.message || 'Não foi possível abrir o dashboard. Tente novamente.', { tipo: 'erro' })
  }
}

function iniciar() {
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
  ui.preencherRecorrencia()

  nav.inicializar({ aoEntrar: aoEntrarNaTela })
  nav.irPara('tela-auth', { imediato: true })

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

  ligarRetornoRecuperacaoSenha()
  restaurarSessaoDoSupabase().finally(() => ui.esconderSplash())
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar)
} else {
  iniciar()
}
