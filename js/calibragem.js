/**
 * Recalibração automática.
 *
 * O agendador do Chronos é puramente preditivo: estima duração pelo que o
 * usuário declarou e energia por idade + cronotipo. Este módulo fecha o laço —
 * compara o que foi PLANEJADO com o que de fato ACONTECEU e devolve correções.
 *
 * Duas correções independentes:
 *
 *  1. DURAÇÃO — se as tarefas de "Estudo" sempre estouram em 40%, as próximas
 *     estimativas dessa categoria sobem 40%. Corrige o otimismo sistemático,
 *     que é o erro de planejamento mais comum.
 *
 *  2. ENERGIA — a curva circadiana é um palpite a partir do cronotipo. Se o
 *     usuário marca "ruim" às 15h onde o modelo previa pico, a curva dele cede
 *     naquele horário. Corrige o cronotipo declarado com evidência de uso.
 *
 * Regra que atravessa tudo: correções só entram com AMOSTRAS suficientes, e são
 * limitadas. Um dia ruim não pode reescrever o modelo.
 */

/** Abaixo disso é ruído, não padrão. */
const MINIMO_AMOSTRAS = 3

/** Nenhuma correção pode mais que dobrar ou reduzir à metade a estimativa. */
const FATOR_MIN = 0.6
const FATOR_MAX = 1.8

/** Teto do empurrão na curva de energia, em pontos percentuais. */
const AJUSTE_ENERGIA_MAX = 18

/** Sessões antigas demais não representam o usuário de hoje. */
const JANELA_DIAS = 60

const PESO_FEEDBACK = { bom: 1, medio: 0.5, ruim: 0 }

const limitar = (v, min, max) => Math.min(Math.max(v, min), max)

/* -------------------------------------------------------------------------
   Seleção das sessões utilizáveis
   ------------------------------------------------------------------------- */

/**
 * Só entram sessões com tempo real medido. Uma sessão abandonada em 2 minutos
 * não diz que a tarefa dura 2 minutos — diz que houve interrupção; por isso o
 * corte de 25% do planejado.
 */
function utilizaveis(sessoes = [], agora = Date.now()) {
  const limite = agora - JANELA_DIAS * 86400000
  return sessoes.filter(s => {
    if (!s || !s.minutosReais || !s.minutosPlanejados) return false
    if (s.minutosReais < s.minutosPlanejados * 0.25) return false
    const t = Date.parse(s.encerradaEm || s.iniciadaEm || '')
    return Number.isFinite(t) ? t >= limite : true
  })
}

/* -------------------------------------------------------------------------
   1. Calibragem de duração
   ------------------------------------------------------------------------- */

/**
 * Fator multiplicador por categoria: `real ÷ planejado`.
 * Acima de 1 = o usuário subestima aquela categoria.
 *
 * @returns {Object<string, {fator: number, amostras: number, desvio: number}>}
 */
export function fatoresPorCategoria(sessoes = []) {
  const grupos = {}

  utilizaveis(sessoes).forEach(s => {
    const chave = s.categoria || 'foco'
    ;(grupos[chave] ||= []).push(s.minutosReais / s.minutosPlanejados)
  })

  const saida = {}
  Object.entries(grupos).forEach(([categoria, razoes]) => {
    if (razoes.length < MINIMO_AMOSTRAS) return
    // mediana em vez de média: uma sessão anômala não desloca o resultado
    const ordenadas = [...razoes].sort((a, b) => a - b)
    const meio = Math.floor(ordenadas.length / 2)
    const mediana =
      ordenadas.length % 2 ? ordenadas[meio] : (ordenadas[meio - 1] + ordenadas[meio]) / 2

    saida[categoria] = {
      fator: limitar(mediana, FATOR_MIN, FATOR_MAX),
      amostras: razoes.length,
      desvio: Math.round((mediana - 1) * 100)
    }
  })
  return saida
}

/**
 * Ajusta uma estimativa de duração com o histórico da categoria.
 *
 * @param {number} minutos estimativa do usuário
 * @param {string} categoria
 * @param {Array} sessoes histórico
 * @returns {{minutos: number, ajustado: boolean, desvio: number, amostras: number}}
 */
export function ajustarDuracao(minutos, categoria, sessoes = []) {
  const base = Math.max(1, Math.round(Number(minutos) || 0))
  const info = fatoresPorCategoria(sessoes)[categoria || 'foco']
  if (!info) return { minutos: base, ajustado: false, desvio: 0, amostras: 0 }

  // arredonda em 5 min: precisão maior que isso é ilusória
  const corrigido = Math.max(5, Math.round((base * info.fator) / 5) * 5)
  return {
    minutos: corrigido,
    ajustado: corrigido !== base,
    desvio: info.desvio,
    amostras: info.amostras
  }
}

/* -------------------------------------------------------------------------
   2. Calibragem da curva de energia
   ------------------------------------------------------------------------- */

/**
 * Empurrão por hora do dia, derivado da diferença entre a energia PREVISTA e a
 * qualidade RELATADA. Se o modelo previa 80% e o usuário só marca "ruim"
 * naquele horário, a hora recebe um ajuste negativo.
 *
 * @returns {Object<number, {ajuste: number, amostras: number}>} indexado por hora
 */
export function ajustesDeEnergia(sessoes = []) {
  const porHora = {}

  utilizaveis(sessoes).forEach(s => {
    if (!s.feedback || !(s.feedback in PESO_FEEDBACK)) return
    const inicio = Date.parse(s.iniciadaEm || '')
    if (!Number.isFinite(inicio)) return

    const hora = new Date(inicio).getHours()
    const relatada = PESO_FEEDBACK[s.feedback] * 100
    const prevista = Number.isFinite(s.energiaPrevista) ? s.energiaPrevista : 50
    ;(porHora[hora] ||= []).push(relatada - prevista)
  })

  const saida = {}
  Object.entries(porHora).forEach(([hora, diffs]) => {
    if (diffs.length < MINIMO_AMOSTRAS) return
    const media = diffs.reduce((a, b) => a + b, 0) / diffs.length
    // amortecido: a percepção do usuário informa a curva, não a substitui
    saida[Number(hora)] = {
      ajuste: limitar(Math.round(media * 0.35), -AJUSTE_ENERGIA_MAX, AJUSTE_ENERGIA_MAX),
      amostras: diffs.length
    }
  })
  return saida
}

/**
 * Constrói a função de correção consumida pelo motor de agendamento.
 * Horas vizinhas recebem metade do ajuste, para a curva não ganhar degraus.
 *
 * @returns {(hora: number) => number} delta em pontos percentuais
 */
export function montarCorrecaoDeEnergia(sessoes = []) {
  const ajustes = ajustesDeEnergia(sessoes)
  if (!Object.keys(ajustes).length) return () => 0

  return hora => {
    const h = ((Math.round(hora) % 24) + 24) % 24
    const cheio = ajustes[h]?.ajuste ?? 0
    const antes = ajustes[(h + 23) % 24]?.ajuste ?? 0
    const depois = ajustes[(h + 1) % 24]?.ajuste ?? 0
    return limitar(cheio + (antes + depois) * 0.25, -AJUSTE_ENERGIA_MAX, AJUSTE_ENERGIA_MAX)
  }
}

/* -------------------------------------------------------------------------
   Leitura para a interface
   ------------------------------------------------------------------------- */

/**
 * Resumo do que o app aprendeu. Alimenta o cartão de Estatísticas.
 */
export function resumoDeAprendizado(sessoes = [], categorias = []) {
  const aptas = utilizaveis(sessoes)
  const fatores = fatoresPorCategoria(sessoes)
  const energia = ajustesDeEnergia(sessoes)

  const rotulo = id => categorias.find(c => c.id === id)?.rotulo || id

  const porCategoria = Object.entries(fatores)
    .map(([id, info]) => ({
      categoria: id,
      rotulo: rotulo(id),
      desvio: info.desvio,
      amostras: info.amostras,
      texto:
        info.desvio > 0
          ? `costuma levar ${info.desvio}% a mais que o estimado`
          : info.desvio < 0
            ? `costuma levar ${Math.abs(info.desvio)}% a menos que o estimado`
            : 'estimativa batendo com a realidade'
    }))
    .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio))

  const horas = Object.entries(energia)
    .map(([hora, info]) => ({ hora: Number(hora), ...info }))
    .sort((a, b) => b.ajuste - a.ajuste)

  const comFeedback = aptas.filter(s => s.feedback).length

  return {
    sessoes: aptas.length,
    comFeedback,
    faltamParaCalibrar: Math.max(0, MINIMO_AMOSTRAS - aptas.length),
    porCategoria,
    melhorHora: horas[0]?.ajuste > 2 ? horas[0] : null,
    piorHora: horas.at(-1)?.ajuste < -2 ? horas.at(-1) : null,
    minutosReais: aptas.reduce((s, x) => s + x.minutosReais, 0),
    precisao: aptas.length
      ? Math.round(
          100 -
            (aptas.reduce(
              (soma, s) => soma + Math.abs(s.minutosReais - s.minutosPlanejados) / s.minutosPlanejados,
              0
            ) /
              aptas.length) *
              100
        )
      : null
  }
}

/** Mantém o histórico de sessões enxuto antes da sincronização remota. */
export function podarSessoes(sessoes = [], maximo = 300) {
  return sessoes.slice(-maximo)
}

export const CONSTANTES = { MINIMO_AMOSTRAS, FATOR_MIN, FATOR_MAX, AJUSTE_ENERGIA_MAX, JANELA_DIAS }
