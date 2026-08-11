/**
 * Camada de movimento do app.
 *
 * Tudo aqui é opcional por definição: se o usuário pediu menos movimento no
 * sistema operacional, cada função vira um atalho para o estado final.
 */

const consulta = window.matchMedia?.('(prefers-reduced-motion: reduce)')

export function prefereMenosMovimento() {
  return Boolean(consulta?.matches)
}

/* -------------------------------------------------------------------------
   Revelação ao entrar na viewport
   ------------------------------------------------------------------------- */

let observador = null

function obterObservador() {
  if (observador || typeof IntersectionObserver === 'undefined') return observador
  observador = new IntersectionObserver(
    entradas => {
      entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return
        entrada.target.classList.add('revelado')
        observador.unobserve(entrada.target)
      })
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
  )
  return observador
}

/**
 * Marca elementos para surgirem quando entram na tela, em cascata.
 * @param {string|Element[]} alvo seletor ou lista de elementos
 */
export function revelar(alvo, { atraso = 60 } = {}) {
  const elementos = typeof alvo === 'string' ? Array.from(document.querySelectorAll(alvo)) : alvo || []
  if (!elementos.length) return

  if (prefereMenosMovimento() || typeof IntersectionObserver === 'undefined') {
    elementos.forEach(el => el.classList.add('revelar', 'revelado'))
    return
  }

  const io = obterObservador()
  elementos.forEach((el, indice) => {
    if (el.classList.contains('revelado')) return
    el.classList.add('revelar')
    el.style.setProperty('--atraso', `${Math.min(indice * atraso, 420)}ms`)
    io.observe(el)
  })
}

/** Aplica atraso incremental (`--i`) aos filhos, para entradas em cascata. */
export function escalonar(container, seletor = ':scope > *') {
  if (!container) return
  const filhos = Array.from(container.querySelectorAll(seletor))
  filhos.forEach((filho, indice) => filho.style.setProperty('--i', indice))
}

/* -------------------------------------------------------------------------
   Contadores
   ------------------------------------------------------------------------- */

const emAndamento = new WeakMap()

/**
 * Anima um número de 0 até `valor`, formatando cada quadro.
 * @param {Element} elemento destino do texto
 * @param {number} valor alvo final
 * @param {Function} [formatar] recebe o número do quadro e devolve o texto
 */
export function animarNumero(elemento, valor, formatar = n => String(Math.round(n))) {
  if (!elemento) return
  cancelAnimationFrame(emAndamento.get(elemento))

  const alvo = Number(valor) || 0
  if (prefereMenosMovimento() || alvo === 0) {
    elemento.textContent = formatar(alvo)
    return
  }

  const duracao = Math.min(900, 320 + Math.abs(alvo) * 1.4)
  const inicio = performance.now()
  const suavizar = t => 1 - Math.pow(1 - t, 3)

  const passo = agora => {
    const progresso = Math.min(1, (agora - inicio) / duracao)
    elemento.textContent = formatar(alvo * suavizar(progresso))
    if (progresso < 1) emAndamento.set(elemento, requestAnimationFrame(passo))
    else elemento.textContent = formatar(alvo)
  }
  emAndamento.set(elemento, requestAnimationFrame(passo))
}

/* -------------------------------------------------------------------------
   Micro-interações
   ------------------------------------------------------------------------- */

/** Onda de toque nos botões, ancorada no ponto do clique. */
export function ligarOndas(raiz = document) {
  raiz.addEventListener(
    'pointerdown',
    evento => {
      const botao = evento.target.closest('.botao, .tarefa__check, .dia')
      if (!botao || botao.disabled || prefereMenosMovimento()) return

      const caixa = botao.getBoundingClientRect()
      const onda = document.createElement('span')
      onda.className = 'onda'
      const tamanho = Math.max(caixa.width, caixa.height) * 2
      onda.style.width = onda.style.height = `${tamanho}px`
      onda.style.left = `${evento.clientX - caixa.left - tamanho / 2}px`
      onda.style.top = `${evento.clientY - caixa.top - tamanho / 2}px`

      botao.appendChild(onda)
      onda.addEventListener('animationend', () => onda.remove(), { once: true })
      setTimeout(() => onda.remove(), 700)
    },
    { passive: true }
  )
}

/** Dá um destaque rápido no elemento (usado após criar/editar itens). */
export function pulsar(elemento) {
  if (!elemento || prefereMenosMovimento()) return
  elemento.classList.remove('pulso')
  void elemento.offsetWidth // reinicia a animação
  elemento.classList.add('pulso')
  elemento.addEventListener('animationend', () => elemento.classList.remove('pulso'), { once: true })
}

/** Remove um item com animação de saída antes de executar `aoTerminar`. */
export function removerComAnimacao(elemento, aoTerminar) {
  if (!elemento || prefereMenosMovimento()) {
    aoTerminar?.()
    return
  }
  elemento.style.setProperty('--altura-saida', `${elemento.offsetHeight}px`)
  elemento.classList.add('saindo')
  let concluido = false
  const finalizar = () => {
    if (concluido) return
    concluido = true
    aoTerminar?.()
  }
  elemento.addEventListener('animationend', finalizar, { once: true })
  setTimeout(finalizar, 400)
}

/* -------------------------------------------------------------------------
   Transições de tela
   ------------------------------------------------------------------------- */

/**
 * Executa a mudança dentro de uma View Transition quando o navegador suporta,
 * produzindo um crossfade nativo entre os dois estados.
 */
export function transicionar(mudanca) {
  if (prefereMenosMovimento() || typeof document.startViewTransition !== 'function') {
    mudanca()
    return
  }
  document.startViewTransition(mudanca)
}

/**
 * Estados do cabeçalho conforme a rolagem:
 *  · `rolado`   — a página saiu do topo, então o cabeçalho ganha sombra;
 *  · `compacto` — o usuário está descendo, então ele encolhe e libera a tela.
 *
 * A troca exige um gesto acumulado numa direção, não um quadro isolado: assim
 * uma tremida de dedo ou o reajuste de altura provocado pelo próprio
 * encolhimento não alternam o estado. A leitura roda dentro de
 * `requestAnimationFrame` para não forçar layout a cada evento de scroll.
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.limiteCompacto] rolagem mínima para poder encolher
 * @param {number} [opcoes.limiteTopo] abaixo disso o cabeçalho sempre volta inteiro
 * @param {number} [opcoes.gesto] pixels acumulados numa direção para trocar de estado
 */
export function ligarCabecalhoElevado({ limiteCompacto = 96, limiteTopo = 48, gesto = 28 } = {}) {
  const corpo = document.body
  let ultimoY = window.scrollY
  let acumulado = 0
  let agendado = false

  const definir = compacto => {
    if (corpo.classList.contains('compacto') === compacto) return
    corpo.classList.toggle('compacto', compacto)
    acumulado = 0
  }

  const avaliar = () => {
    agendado = false
    const y = Math.max(0, window.scrollY)
    const delta = y - ultimoY
    ultimoY = y

    corpo.classList.toggle('rolado', y > 8)

    // inverteu o sentido? o acumulador recomeça
    if (delta > 0 !== acumulado > 0) acumulado = 0
    acumulado += delta

    if (y <= limiteTopo) {
      definir(false)
      return
    }
    if (acumulado > gesto && y > limiteCompacto) definir(true)
    else if (acumulado < -gesto) definir(false)
  }

  const aoRolar = () => {
    if (agendado) return
    agendado = true
    requestAnimationFrame(avaliar)
  }

  avaliar()
  window.addEventListener('scroll', aoRolar, { passive: true })
}
