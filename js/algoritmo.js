/**
 * Motor de agendamento do Chronos Ultra.
 *
 * Uma única passagem produz a lista de eventos do dia; HTML, WhatsApp, .ics e
 * calendário são apenas leitores desse resultado. Isso mantém as saídas sempre
 * coerentes entre si.
 *
 * Princípio do produto: o limite diário conta apenas MINUTOS DE TRABALHO.
 * Pausas consomem relógio, nunca o orçamento produtivo — é o que preserva o
 * tempo livre no fim do dia.
 */

import { obterCategoria } from './tarefas.js'

export const MINUTOS_DIA = 1440
const BLOCO_MINIMO = 10

export const CRONOTIPOS = [
  { id: 'matutino', rotulo: 'Matutino', descricao: 'Acordo cedo e rendo de manhã', icone: '🌅', simbolo: 'amanhecer', picoHora: 9.5 },
  { id: 'intermediario', rotulo: 'Intermediário', descricao: 'Meu pico é perto do meio-dia', icone: '☀️', simbolo: 'sol', picoHora: 11.5 },
  { id: 'vespertino', rotulo: 'Vespertino', descricao: 'Engreno mesmo à tarde', icone: '🌇', simbolo: 'entardecer', picoHora: 15 },
  { id: 'noturno', rotulo: 'Noturno', descricao: 'Produzo melhor à noite', icone: '🌙', simbolo: 'lua', picoHora: 19 }
]

export function obterCronotipo(id) {
  return CRONOTIPOS.find(c => c.id === id) || CRONOTIPOS[1]
}

const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo)
const arredondar5 = valor => Math.round(valor / 5) * 5

/* -------------------------------------------------------------------------
   Perfil biológico
   ------------------------------------------------------------------------- */

/**
 * Duração máxima de foco contínuo saudável, em minutos.
 * A capacidade sobe até o início da vida adulta e decai suavemente depois.
 */
export function calcularFocoMaximo(idade) {
  const anos = limitar(Number(idade) || 25, 8, 100)
  const penalidade = Math.abs(anos - 30) * (anos < 30 ? 2.2 : 0.9)
  return limitar(arredondar5(88 - penalidade), 25, 90)
}

/**
 * Hora do pico circadiano: parte do cronotipo declarado e recebe um pequeno
 * ajuste por idade (a maturidade tende a antecipar o pico).
 */
export function calcularPicoHora(cronotipoId, idade) {
  const base = obterCronotipo(cronotipoId).picoHora
  const anos = limitar(Number(idade) || 25, 8, 100)
  const ajuste = limitar((anos - 30) * 0.03, -0.7, 1.2)
  return limitar(base - ajuste, 6, 21)
}

export function montarPerfilBiologico({ idade, cronotipo } = {}) {
  const focoMaximo = calcularFocoMaximo(idade)
  return {
    idade: Number(idade) || 25,
    cronotipo: obterCronotipo(cronotipo).id,
    picoHora: calcularPicoHora(cronotipo, idade),
    focoMaximo,
    pausaCurta: limitar(arredondar5(focoMaximo / 5), 5, 15)
  }
}

/**
 * Curva de energia (0-100) com pico circadiano, vale pós-almoço e reagrupamento
 * no fim da tarde — o padrão descrito na literatura de cronobiologia aplicada.
 */
export function obterEnergia(hora, perfil) {
  const pico = typeof perfil === 'number' ? perfil : perfil?.picoHora ?? 11.5
  const h = ((hora % 24) + 24) % 24
  const fase = (((h - pico + 12) % 24) + 24) % 24 - 12
  const circadiano = 40 * Math.cos((fase * Math.PI) / 12)
  const vale = -18 * Math.exp(-Math.pow(fase - 3.4, 2) / 2)
  const rebote = 12 * Math.exp(-Math.pow(fase - 5.5, 2) / 1.5)
  return limitar(Math.round(50 + circadiano + vale + rebote), 3, 100)
}

export function classificarEnergia(valor) {
  if (valor >= 72) return { nivel: 'alta', rotulo: 'Pico de energia', classe: 'alto-energia' }
  if (valor >= 45) return { nivel: 'media', rotulo: 'Energia estável', classe: 'media-energia' }
  return { nivel: 'baixa', rotulo: 'Energia baixa', classe: 'baixo-energia' }
}

/* -------------------------------------------------------------------------
   Tempo
   ------------------------------------------------------------------------- */

export function parseHorario(horario) {
  if (typeof horario !== 'string') return null
  const partes = horario.split(':')
  if (partes.length < 2) return null
  const h = Number(partes[0])
  const m = Number(partes[1])
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

export function formatarHora(minutosTotais) {
  const total = Math.round(minutosTotais)
  const h = ((Math.floor(total / 60) % 24) + 24) % 24
  const m = ((total % 60) + 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Mantido pelo nome antigo para não quebrar integrações existentes. */
export const formatarHoraTrabalho = formatarHora

export function formatarDuracao(minutos) {
  const total = Math.max(0, Math.round(minutos))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  if (!m) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}min`
}

/** Une interrupções sobrepostas e recorta tudo ao intervalo da janela. */
export function normalizarInterrupcoes(interrupcoes, inicioMinutos, fimMinutos) {
  const ordenadas = (interrupcoes || [])
    .map(item => {
      let inicio = item.inicioMinutos ?? parseHorario(item.inicio)
      let fim = item.fimMinutos ?? parseHorario(item.fim)
      if (inicio == null || fim == null) return null
      if (fim <= inicio) fim += MINUTOS_DIA
      if (inicio < inicioMinutos && inicio + MINUTOS_DIA < fimMinutos) {
        inicio += MINUTOS_DIA
        fim += MINUTOS_DIA
      }
      return {
        inicioMinutos: Math.max(inicioMinutos, inicio),
        fimMinutos: Math.min(fimMinutos, fim),
        descricao: [item.tipo, item.nome].filter(Boolean).join(': ') || item.descricao || 'Interrupção'
      }
    })
    .filter(item => item && item.fimMinutos > item.inicioMinutos)
    .sort((a, b) => a.inicioMinutos - b.inicioMinutos)

  const resultado = []
  ordenadas.forEach(item => {
    const anterior = resultado[resultado.length - 1]
    if (anterior && item.inicioMinutos <= anterior.fimMinutos) {
      anterior.fimMinutos = Math.max(anterior.fimMinutos, item.fimMinutos)
      if (!anterior.descricao.includes(item.descricao)) {
        anterior.descricao += ` / ${item.descricao}`
      }
      return
    }
    resultado.push({ ...item })
  })
  return resultado
}

/** Constrói a janela de trabalho, aceitando turnos que cruzam a meia-noite. */
export function montarJanela({ inicio, fim, interrupcoes = [] }) {
  const inicioMinutos = parseHorario(inicio)
  let fimMinutos = parseHorario(fim)
  if (inicioMinutos == null || fimMinutos == null) return null
  if (fimMinutos <= inicioMinutos) fimMinutos += MINUTOS_DIA
  if (fimMinutos - inicioMinutos < BLOCO_MINIMO) return null

  const normalizadas = normalizarInterrupcoes(interrupcoes, inicioMinutos, fimMinutos)
  const bloqueado = normalizadas.reduce((soma, i) => soma + (i.fimMinutos - i.inicioMinutos), 0)
  const total = fimMinutos - inicioMinutos

  return {
    inicio,
    fim,
    inicioMinutos,
    fimMinutos,
    total,
    bloqueado,
    disponivel: Math.max(0, total - bloqueado),
    cruzaMeiaNoite: fimMinutos > MINUTOS_DIA,
    interrupcoes: normalizadas
  }
}

function montarTimeline(janela) {
  const timeline = []
  let cursor = janela.inicioMinutos

  janela.interrupcoes.forEach(item => {
    if (item.inicioMinutos > cursor) {
      timeline.push({ tipo: 'livre', inicioMinutos: cursor, fimMinutos: item.inicioMinutos })
    }
    timeline.push({
      tipo: 'interrupcao',
      inicioMinutos: item.inicioMinutos,
      fimMinutos: item.fimMinutos,
      descricao: item.descricao
    })
    cursor = Math.max(cursor, item.fimMinutos)
  })

  if (cursor < janela.fimMinutos) {
    timeline.push({ tipo: 'livre', inicioMinutos: cursor, fimMinutos: janela.fimMinutos })
  }
  return timeline
}

/* -------------------------------------------------------------------------
   Priorização
   ------------------------------------------------------------------------- */

const PESOS_SCORE = { peso: 0.4, afinidade: 0.22, urgencia: 0.26, encaixe: 0.12 }

function diasAtePrazo(prazo, referencia) {
  if (!prazo) return null
  const alvo = new Date(`${prazo}T23:59:59`)
  if (Number.isNaN(alvo.getTime())) return null
  const base = new Date(referencia)
  base.setHours(0, 0, 0, 0)
  return Math.round((alvo - base) / 86400000)
}

export function calcularUrgencia(prazo, referencia = new Date()) {
  const dias = diasAtePrazo(prazo, referencia)
  if (dias === null) return 0.35
  if (dias <= 0) return 1
  if (dias === 1) return 0.8
  if (dias <= 3) return 0.6
  if (dias <= 7) return 0.45
  return 0.3
}

/** Quanto de energia a tarefa exige (0-1): peso declarado + natureza da categoria. */
export function calcularExigencia(tarefa) {
  const pesoNorm = (limitar(tarefa.peso, 1, 10) - 1) / 9
  return limitar(pesoNorm * 0.65 + obterCategoria(tarefa.categoria).exigencia * 0.35, 0, 1)
}

/**
 * Nota da tarefa para o instante avaliado. Combina importância, casamento com
 * a energia disponível, urgência do prazo e aproveitamento do espaço restante.
 */
export function pontuarTarefa(tarefa, contexto) {
  const { minutos, perfil, espacoDisponivel, referencia } = contexto
  const pesoNorm = (limitar(tarefa.peso, 1, 10) - 1) / 9
  const exigencia = calcularExigencia(tarefa)
  const energia = obterEnergia(minutos / 60, perfil) / 100
  const afinidade = 1 - Math.abs(exigencia - energia)
  const urgencia = calcularUrgencia(tarefa.prazo, referencia)
  const restante = tarefa.restante ?? tarefa.tempo
  const encaixe = espacoDisponivel >= restante ? 1 : limitar(espacoDisponivel / Math.max(restante, 1), 0, 1)

  const total =
    PESOS_SCORE.peso * pesoNorm +
    PESOS_SCORE.afinidade * afinidade +
    PESOS_SCORE.urgencia * urgencia +
    PESOS_SCORE.encaixe * encaixe

  return { total, pesoNorm, exigencia, energia, afinidade, urgencia, encaixe }
}

/** Frase curta explicando por que a tarefa caiu naquele horário. */
export function explicarEncaixe(detalhe) {
  if (!detalhe) return ''
  const energia = Math.round(detalhe.energia * 100)
  if (detalhe.urgencia >= 0.8) return `Prazo apertado — encaixada assim que houve espaço (energia ${energia}%).`
  if (detalhe.exigencia >= 0.66 && detalhe.energia >= 0.7) return `Tarefa exigente alocada no seu pico de energia (${energia}%).`
  if (detalhe.exigencia <= 0.4 && detalhe.energia < 0.5) return `Tarefa leve aproveitando um vale de energia (${energia}%).`
  if (detalhe.afinidade >= 0.8) return `Boa afinidade entre a exigência da tarefa e sua energia (${energia}%).`
  return `Melhor encaixe possível no tempo restante (energia ${energia}%).`
}

/* -------------------------------------------------------------------------
   Pausas
   ------------------------------------------------------------------------- */

function definirPausa({ continuos, perfil, trocaDeTarefa }) {
  const curta = perfil.pausaCurta
  if (continuos >= perfil.focoMaximo * 2.5) {
    return { duracao: Math.max(30, curta * 3), tipo: 'Descanso profundo', icone: '🛌', simbolo: 'descanso', motivo: 'Você acumulou muito tempo em foco — o corpo precisa reiniciar.' }
  }
  if (continuos >= perfil.focoMaximo * 1.5) {
    return { duracao: Math.max(20, curta * 2), tipo: 'Descanso recuperador', icone: '🌿', simbolo: 'folha', motivo: 'Recuperação proporcional ao esforço já realizado.' }
  }
  if (trocaDeTarefa) {
    return { duracao: curta + 5, tipo: 'Troca de contexto', icone: '☕', simbolo: 'cafe', motivo: 'Tarefa concluída. Feche o ciclo antes de começar a próxima.' }
  }
  return { duracao: curta, tipo: 'Pausa de foco', icone: '💧', simbolo: 'gota', motivo: 'Respiro curto para sustentar a atenção no próximo bloco.' }
}

/* -------------------------------------------------------------------------
   Motor principal
   ------------------------------------------------------------------------- */

/**
 * @param {object} opcoes
 * @param {Array}  opcoes.tarefas       tarefas ativas do inventário
 * @param {object} opcoes.janela        resultado de `montarJanela`
 * @param {number} opcoes.limiteMinutos teto de minutos de TRABALHO no dia
 * @param {object} opcoes.perfil        resultado de `montarPerfilBiologico`
 * @param {Date}   [opcoes.referencia]  data usada para calcular urgência
 */
export function gerarAgenda({ tarefas = [], janela, limiteMinutos, perfil, referencia = new Date() }) {
  const eventos = []
  if (!janela) {
    return { eventos, stats: statsVazias(0, limiteMinutos), janela: null, perfil }
  }

  const orcamento = Math.max(0, Math.min(limiteMinutos, janela.disponivel))
  const fila = tarefas
    .filter(t => t && t.tempo > 0)
    .map(t => ({ ...t, restante: t.tempo, agendado: 0 }))

  const timeline = montarTimeline(janela)
  let trabalhados = 0
  let minutosPausa = 0
  let continuos = 0
  let emAndamento = null

  for (const bloco of timeline) {
    if (bloco.tipo === 'interrupcao') {
      eventos.push({
        tipo: 'interrupcao',
        titulo: bloco.descricao,
        descricao: 'Tempo bloqueado na sua janela.',
        icone: '⏸️',
        simbolo: 'pausado',
        inicioMinutos: bloco.inicioMinutos,
        fimMinutos: bloco.fimMinutos,
        duracao: bloco.fimMinutos - bloco.inicioMinutos
      })
      continuos = 0
      emAndamento = null
      continue
    }

    let cursor = bloco.inicioMinutos

    while (cursor < bloco.fimMinutos && trabalhados < orcamento) {
      const pendentes = fila.filter(t => t.restante > 0)
      if (!pendentes.length) break

      const espacoBloco = bloco.fimMinutos - cursor
      const espacoOrcamento = orcamento - trabalhados

      // continua a tarefa em andamento para não fragmentar o raciocínio
      let tarefa = emAndamento && emAndamento.restante > 0 ? emAndamento : null
      let detalhe = null

      if (!tarefa) {
        const contexto = {
          minutos: cursor,
          perfil,
          espacoDisponivel: Math.min(espacoBloco, espacoOrcamento),
          referencia
        }
        let melhorNota = -Infinity
        pendentes.forEach(candidata => {
          const nota = pontuarTarefa(candidata, contexto)
          if (nota.total > melhorNota) {
            melhorNota = nota.total
            tarefa = candidata
            detalhe = nota
          }
        })
      }
      if (!tarefa) break

      const duracao = Math.min(perfil.focoMaximo, tarefa.restante, espacoBloco, espacoOrcamento)

      // sobra curta demais para render: encerra o bloco em vez de picotar
      if (duracao < BLOCO_MINIMO && tarefa.restante > duracao) break
      if (duracao <= 0) break

      if (!detalhe) {
        detalhe = pontuarTarefa(tarefa, {
          minutos: cursor,
          perfil,
          espacoDisponivel: Math.min(espacoBloco, espacoOrcamento),
          referencia
        })
      }

      const energia = obterEnergia(cursor / 60, perfil)
      const continuacao = tarefa.agendado > 0

      eventos.push({
        tipo: 'tarefa',
        id: tarefa.id,
        titulo: tarefa.nome,
        continuacao,
        categoria: tarefa.categoria,
        peso: tarefa.peso,
        prazo: tarefa.prazo || null,
        inicioMinutos: cursor,
        fimMinutos: cursor + duracao,
        duracao,
        energia,
        energiaClasse: classificarEnergia(energia).classe,
        motivo: explicarEncaixe(detalhe),
        score: Number(detalhe.total.toFixed(3))
      })

      cursor += duracao
      trabalhados += duracao
      continuos += duracao
      tarefa.restante -= duracao
      tarefa.agendado += duracao

      const concluiu = tarefa.restante <= 0
      emAndamento = concluiu ? null : tarefa

      const aindaHaTrabalho =
        fila.some(t => t.restante > 0) && trabalhados < orcamento && cursor < bloco.fimMinutos
      if (!aindaHaTrabalho) break

      const pausa = definirPausa({ continuos, perfil, trocaDeTarefa: concluiu })
      if (cursor + pausa.duracao > bloco.fimMinutos) break

      eventos.push({
        tipo: 'pausa',
        titulo: pausa.tipo,
        descricao: pausa.motivo,
        icone: pausa.icone,
        simbolo: pausa.simbolo,
        inicioMinutos: cursor,
        fimMinutos: cursor + pausa.duracao,
        duracao: pausa.duracao
      })

      cursor += pausa.duracao
      minutosPausa += pausa.duracao
      if (pausa.tipo !== 'Pausa de foco') continuos = 0
    }
  }

  const naoAgendadas = fila.filter(t => t.restante > 0)
  naoAgendadas.forEach(t => {
    eventos.push({
      tipo: 'nao-agendada',
      id: t.id,
      titulo: t.nome,
      categoria: t.categoria,
      peso: t.peso,
      prazo: t.prazo || null,
      duracao: t.restante,
      parcial: t.agendado > 0,
      descricao: t.agendado > 0
        ? `${t.restante} min ainda pendentes (${t.agendado} min já agendados).`
        : `${t.restante} min não couberam no dia.`
    })
  })

  eventos.sort((a, b) => {
    if (a.tipo === 'nao-agendada') return b.tipo === 'nao-agendada' ? 0 : 1
    if (b.tipo === 'nao-agendada') return -1
    return a.inicioMinutos - b.inicioMinutos
  })

  const agendados = eventos.filter(e => e.tipo !== 'nao-agendada')
  const fimAgenda = agendados.length
    ? Math.max(...agendados.map(e => e.fimMinutos))
    : janela.inicioMinutos

  return {
    eventos,
    janela,
    perfil,
    stats: {
      limite: orcamento,
      trabalhados,
      minutosPausa,
      minutosInterrupcao: janela.bloqueado,
      janelaTotal: janela.total,
      naoAgendadas: naoAgendadas.length,
      minutosNaoAgendados: naoAgendadas.reduce((s, t) => s + t.restante, 0),
      minutosLivres: Math.max(0, janela.fimMinutos - fimAgenda),
      folgaNoOrcamento: Math.max(0, orcamento - trabalhados),
      fimAgendaMinutos: fimAgenda,
      ocupacao: janela.total ? Math.round((trabalhados / janela.total) * 100) : 0,
      eficiencia: trabalhados + minutosPausa
        ? Math.round((trabalhados / (trabalhados + minutosPausa)) * 100)
        : 0
    }
  }
}

function statsVazias(trabalhados, limite) {
  return {
    limite: limite || 0,
    trabalhados,
    minutosPausa: 0,
    minutosInterrupcao: 0,
    janelaTotal: 0,
    naoAgendadas: 0,
    minutosNaoAgendados: 0,
    minutosLivres: 0,
    folgaNoOrcamento: 0,
    fimAgendaMinutos: 0,
    ocupacao: 0,
    eficiencia: 0
  }
}

/* -------------------------------------------------------------------------
   Saídas derivadas
   ------------------------------------------------------------------------- */

export function gerarMensagemWhatsApp(agenda, nome = '') {
  const { eventos, stats } = agenda
  const linhas = [`🕒 *Agenda otimizada${nome ? ` — ${nome}` : ''}*`, '']

  eventos
    .filter(e => e.tipo !== 'nao-agendada')
    .forEach(evento => {
      const faixa = `${formatarHora(evento.inicioMinutos)}–${formatarHora(evento.fimMinutos)}`
      if (evento.tipo === 'tarefa') {
        linhas.push(`${faixa} • ${evento.titulo}${evento.continuacao ? ' (continuação)' : ''} — ${evento.duracao} min`)
      } else {
        linhas.push(`${faixa} • ${evento.icone || '⏸️'} ${evento.titulo}`)
      }
    })

  const pendentes = eventos.filter(e => e.tipo === 'nao-agendada')
  if (pendentes.length) {
    linhas.push('', `⚠️ *Não couberam hoje (${pendentes.length}):*`)
    pendentes.forEach(e => linhas.push(`• ${e.titulo} — ${e.duracao} min`))
  }

  linhas.push(
    '',
    `📊 Trabalho: ${formatarDuracao(stats.trabalhados)} | Pausas: ${formatarDuracao(stats.minutosPausa)}`,
    `🌤️ Tempo livre preservado: ${formatarDuracao(stats.minutosLivres)}`,
    '',
    '📅 Gerado pelo Chronos Ultra'
  )
  return linhas.join('\n')
}

function formatarDataICS(data, minutos) {
  const base = new Date(data)
  base.setHours(0, 0, 0, 0)
  base.setMinutes(minutos)
  const pad = n => String(n).padStart(2, '0')
  return (
    `${base.getFullYear()}${pad(base.getMonth() + 1)}${pad(base.getDate())}` +
    `T${pad(base.getHours())}${pad(base.getMinutes())}00`
  )
}

/** Exporta a agenda como calendário .ics importável no Google/Outlook/Apple. */
export function gerarICS(agenda, data = new Date(), nome = '') {
  const escapar = texto => String(texto).replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n')
  const agora = new Date()
  const carimbo = formatarDataICS(agora, agora.getHours() * 60 + agora.getMinutes())
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronos Ultra//PT-BR//',
    'CALSCALE:GREGORIAN'
  ]

  agenda.eventos
    .filter(e => e.tipo !== 'nao-agendada')
    .forEach((evento, indice) => {
      linhas.push(
        'BEGIN:VEVENT',
        `UID:chronos-${formatarDataICS(data, evento.inicioMinutos)}-${indice}@chronos-ultra`,
        `DTSTAMP:${carimbo}`,
        `DTSTART:${formatarDataICS(data, evento.inicioMinutos)}`,
        `DTEND:${formatarDataICS(data, evento.fimMinutos)}`,
        `SUMMARY:${escapar(`${evento.tipo === 'tarefa' ? '🎯' : evento.icone || '⏸️'} ${evento.titulo}`)}`,
        `DESCRIPTION:${escapar(evento.motivo || evento.descricao || `Agenda de ${nome || 'Chronos Ultra'}`)}`,
        'END:VEVENT'
      )
    })

  linhas.push('END:VCALENDAR')
  return linhas.join('\r\n')
}

export function gerarTextoSimples(agenda) {
  return agenda.eventos
    .filter(e => e.tipo !== 'nao-agendada')
    .map(e => `${formatarHora(e.inicioMinutos)}-${formatarHora(e.fimMinutos)}  ${e.titulo}`)
    .join('\n')
}
