/**
 * Cronômetro de foco: executa um bloco da agenda em tempo real, com anel de
 * progresso, pausa/retomada e aviso ao concluir.
 *
 * O tempo é medido por relógio absoluto (`Date.now`), então continua correto
 * mesmo se a aba ficar em segundo plano e o `setInterval` for estrangulado.
 */

import { criarElemento, notificar } from './componentes.js'

let sessao = null
let intervalo = null
let painel = null
let tituloOriginal = ''

const formatar = segundos => {
  const total = Math.max(0, Math.round(segundos))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function montarPainel() {
  painel = criarElemento('section', {
    classe: 'painel-foco',
    atributos: { 'aria-live': 'polite', 'aria-label': 'Sessão de foco em andamento' }
  })

  painel.innerHTML = `
    <div class="painel-foco__anel">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="painel-foco__trilha" cx="22" cy="22" r="19" />
        <circle class="painel-foco__progresso" cx="22" cy="22" r="19" data-progresso />
      </svg>
      <span class="painel-foco__relogio" data-relogio>00:00</span>
    </div>
    <div class="painel-foco__info">
      <strong class="painel-foco__titulo" data-titulo></strong>
      <span class="painel-foco__estado" data-estado></span>
    </div>
    <div class="painel-foco__acoes">
      <button type="button" class="botao botao--fantasma botao--icone" data-alternar aria-label="Pausar sessão">⏸️</button>
      <button type="button" class="botao botao--fantasma botao--icone" data-encerrar aria-label="Encerrar sessão">⏹️</button>
    </div>`

  painel.querySelector('[data-alternar]').addEventListener('click', alternarPausa)
  painel.querySelector('[data-encerrar]').addEventListener('click', () => encerrar(false))
  document.body.appendChild(painel)
  return painel
}

function atualizarPainel() {
  if (!sessao || !painel) return

  const restante = calcularRestante()
  const proporcao = 1 - restante / sessao.totalSegundos
  const circunferencia = 2 * Math.PI * 19

  painel.querySelector('[data-relogio]').textContent = formatar(restante)
  painel.querySelector('[data-titulo]').textContent = sessao.titulo
  painel.querySelector('[data-estado]').textContent = sessao.pausada
    ? 'Pausado'
    : `${Math.round(proporcao * 100)}% do bloco concluído`
  painel.querySelector('[data-progresso]').style.strokeDasharray = `${circunferencia}`
  painel.querySelector('[data-progresso]').style.strokeDashoffset = `${circunferencia * (1 - proporcao)}`
  painel.classList.toggle('painel-foco--pausado', sessao.pausada)

  const alternar = painel.querySelector('[data-alternar]')
  alternar.textContent = sessao.pausada ? '▶️' : '⏸️'
  alternar.setAttribute('aria-label', sessao.pausada ? 'Retomar sessão' : 'Pausar sessão')

  document.title = `${formatar(restante)} • ${sessao.titulo}`

  if (restante <= 0) encerrar(true)
}

function calcularRestante() {
  if (!sessao) return 0
  if (sessao.pausada) return sessao.restanteCongelado
  return sessao.restanteCongelado - (Date.now() - sessao.retomadaEm) / 1000
}

function alternarPausa() {
  if (!sessao) return
  if (sessao.pausada) {
    sessao.retomadaEm = Date.now()
    sessao.pausada = false
  } else {
    sessao.restanteCongelado = calcularRestante()
    sessao.pausada = true
  }
  atualizarPainel()
}

function encerrar(concluida) {
  if (!sessao) return
  const { titulo, aoConcluir } = sessao

  clearInterval(intervalo)
  intervalo = null
  sessao = null
  painel?.remove()
  painel = null
  document.title = tituloOriginal || document.title

  if (concluida) {
    notificar(`Bloco "${titulo}" concluído. Faça a pausa antes do próximo.`, {
      tipo: 'sucesso',
      duracao: 8000
    })
    tocarAviso()
    avisarNoSistema('Bloco concluído ✅', `${titulo} — hora de pausar.`)
    aoConcluir?.()
  } else {
    notificar('Sessão de foco encerrada.', { tipo: 'info' })
  }
}

/** Pede permissão de notificação sem bloquear o fluxo. */
export function prepararNotificacoes() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  Notification.requestPermission().catch(() => {})
}

/** Notificação do sistema — útil quando a aba está em segundo plano. */
function avisarNoSistema(titulo, corpo) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const aviso = new Notification(titulo, {
      body: corpo,
      icon: 'img/icone-192.png',
      badge: 'img/icone-192.png',
      tag: 'chronos-foco'
    })
    aviso.addEventListener('click', () => {
      window.focus()
      aviso.close()
    })
  } catch {
    /* notificação é um extra */
  }
}

/** Bip curto via Web Audio — não depende de arquivo externo. */
function tocarAviso() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext
    if (!Contexto) return
    const ctx = new Contexto()
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.connect(ganho)
    ganho.connect(ctx.destination)
    osc.frequency.value = 660
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime)
    ganho.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05)
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9)
    osc.start()
    osc.stop(ctx.currentTime + 0.95)
    setTimeout(() => ctx.close(), 1200)
  } catch {
    /* som é opcional */
  }
}

export function estaAtivo() {
  return Boolean(sessao)
}

export function sessaoAtual() {
  return sessao ? { titulo: sessao.titulo, restante: calcularRestante() } : null
}

/**
 * @param {object} opcoes
 * @param {string} opcoes.titulo    nome exibido no painel
 * @param {number} opcoes.minutos   duração do bloco
 * @param {Function} [opcoes.aoConcluir] chamado quando o tempo termina
 */
export function iniciarFoco({ titulo, minutos, aoConcluir }) {
  if (sessao) encerrar(false)
  if (!minutos || minutos <= 0) return

  tituloOriginal = tituloOriginal || document.title
  const totalSegundos = Math.round(minutos * 60)

  sessao = {
    titulo,
    totalSegundos,
    restanteCongelado: totalSegundos,
    retomadaEm: Date.now(),
    pausada: false,
    aoConcluir
  }

  prepararNotificacoes()
  montarPainel()
  atualizarPainel()
  intervalo = setInterval(atualizarPainel, 500)
  notificar(`Foco iniciado: ${titulo} (${minutos} min).`, { tipo: 'foco' })
}

export function pararFoco() {
  encerrar(false)
}
