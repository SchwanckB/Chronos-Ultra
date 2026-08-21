/**
 * Calendário com visões de mês, semana e dia.
 *
 * Não guarda agendas: recebe do app um leitor (`obterAgenda`) que devolve o
 * planejamento salvo para uma data, o que permite navegar por qualquer dia —
 * não apenas por hoje.
 */

import { escaparHTML } from './componentes.js'
import { icone } from './icones.js'
import { formatarHora, formatarDuracao } from './algoritmo.js'

const NOMES_DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

let estado = {
  container: null,
  rotuloPeriodo: null,
  listaFeriados: null,
  visao: 'mes',
  selecionada: new Date(),
  mes: new Date(),
  obterAgenda: () => null,
  aoMudarDia: () => {}
}

/* ---------------------------------------------------------------- datas --- */

export function chaveData(data) {
  const d = new Date(data)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDoDia(data) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

function mesmoDia(a, b) {
  return a && b && chaveData(a) === chaveData(b)
}

function formatarDataLonga(data) {
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

/* ------------------------------------------------------------- feriados --- */

function calcularPascoa(ano) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes, dia)
}

const cacheFeriados = new Map()

export function obterFeriados(ano) {
  if (cacheFeriados.has(ano)) return cacheFeriados.get(ano)

  const fixos = [
    ['Confraternização Universal', 0, 1],
    ['Tiradentes', 3, 21],
    ['Dia do Trabalho', 4, 1],
    ['Independência do Brasil', 8, 7],
    ['Nossa Senhora Aparecida', 9, 12],
    ['Finados', 10, 2],
    ['Proclamação da República', 10, 15],
    ['Dia da Consciência Negra', 10, 20],
    ['Natal', 11, 25]
  ].map(([nome, mes, dia]) => ({ nome, mes, dia }))

  const pascoa = calcularPascoa(ano)
  const movel = (nome, deslocamento) => {
    const data = new Date(pascoa)
    data.setDate(data.getDate() + deslocamento)
    return { nome, mes: data.getMonth(), dia: data.getDate() }
  }

  const lista = [
    ...fixos,
    movel('Carnaval', -47),
    movel('Sexta-feira Santa', -2),
    movel('Páscoa', 0),
    movel('Corpus Christi', 60)
  ].sort((a, b) => a.mes - b.mes || a.dia - b.dia)

  cacheFeriados.set(ano, lista)
  return lista
}

export function feriadoDoDia(data) {
  return obterFeriados(data.getFullYear()).find(
    f => f.mes === data.getMonth() && f.dia === data.getDate()
  )
}

/* ----------------------------------------------------------- renderização - */

function resumoDaAgenda(agenda) {
  if (!agenda || !agenda.eventos?.length) return null
  const tarefas = agenda.eventos.filter(e => e.tipo === 'tarefa')
  if (!tarefas.length) return null
  return {
    quantidade: new Set(tarefas.map(t => t.id ?? t.titulo)).size,
    minutos: tarefas.reduce((s, t) => s + t.duracao, 0),
    primeiro: Math.min(...tarefas.map(t => t.inicioMinutos)),
    ultimo: Math.max(...tarefas.map(t => t.fimMinutos))
  }
}

function cartaoEvento(evento) {
  const faixa = `${formatarHora(evento.inicioMinutos)} → ${formatarHora(evento.fimMinutos)}`
  const classe = evento.tipo === 'tarefa' ? 'evento--tarefa' : `evento--${evento.tipo}`
  const detalhe =
    evento.tipo === 'tarefa'
      ? `${formatarDuracao(evento.duracao)} • energia ${evento.energia}%`
      : escaparHTML(evento.descricao || formatarDuracao(evento.duracao))

  return `
    <article class="evento ${classe}">
      <span class="evento__faixa">${faixa}</span>
      <h4 class="evento__titulo">${evento.simbolo ? `${icone(evento.simbolo, { tamanho: 14 })} ` : ''}${escaparHTML(evento.titulo)}</h4>
      <p class="evento__detalhe">${detalhe}</p>
    </article>`
}

function avisoVazio(titulo, mensagem) {
  return `
    <div class="calendario__vazio">
      <h3>${escaparHTML(titulo)}</h3>
      <p>${escaparHTML(mensagem)}</p>
    </div>`
}

function renderizarMes() {
  const ano = estado.mes.getFullYear()
  const mes = estado.mes.getMonth()
  const primeiroIndice = (new Date(ano, mes, 1).getDay() + 6) % 7
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const feriadosMes = obterFeriados(ano).filter(f => f.mes === mes)
  const hoje = inicioDoDia(new Date())

  const celulas = []
  for (let i = 0; i < primeiroIndice; i += 1) {
    celulas.push('<div class="dia dia--vazio" aria-hidden="true"></div>')
  }

  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    const data = new Date(ano, mes, dia)
    const feriado = feriadosMes.find(f => f.dia === dia)
    const resumo = resumoDaAgenda(estado.obterAgenda(chaveData(data)))
    const fimDeSemana = [0, 6].includes(data.getDay())

    const classes = ['dia']
    if (mesmoDia(data, estado.selecionada)) classes.push('dia--ativo')
    if (mesmoDia(data, hoje)) classes.push('dia--hoje')
    if (feriado) classes.push('dia--feriado')
    if (fimDeSemana) classes.push('dia--fds')
    if (resumo) classes.push('dia--com-agenda')

    const etiquetas = []
    if (feriado) etiquetas.push(`<span class="dia__etiqueta dia__etiqueta--feriado" title="${escaparHTML(feriado.nome)}">${escaparHTML(feriado.nome)}</span>`)
    if (resumo) {
      etiquetas.push(
        `<span class="dia__etiqueta dia__etiqueta--agenda">${resumo.quantidade} tarefa${resumo.quantidade > 1 ? 's' : ''} • ${formatarDuracao(resumo.minutos)}</span>`
      )
    }

    celulas.push(`
      <button type="button" class="${classes.join(' ')}" data-dia="${dia}"
        aria-pressed="${mesmoDia(data, estado.selecionada)}"
        aria-label="${escaparHTML(formatarDataLonga(data))}">
        <span class="dia__numero">${dia}</span>
        <span class="dia__etiquetas">${etiquetas.join('')}</span>
      </button>`)
  }

  const totalCelulas = primeiroIndice + diasNoMes
  for (let i = totalCelulas; i % 7 !== 0; i += 1) {
    celulas.push('<div class="dia dia--vazio" aria-hidden="true"></div>')
  }

  const comAgenda = celulas.filter(c => c.includes('dia--com-agenda')).length

  return `
    <div class="calendario__grade" role="grid">
      ${NOMES_DIAS.map(nome => `<div class="calendario__cabecalho-dia" role="columnheader">${nome}</div>`).join('')}
      ${celulas.join('')}
    </div>
    <p class="calendario__legenda">
      ${feriadosMes.length} feriado(s) no mês • ${comAgenda} dia(s) com agenda salva.
      Selecione um dia para ver o planejamento.
    </p>`
}

function renderizarSemana() {
  const base = new Date(estado.selecionada)
  const deslocamento = (base.getDay() + 6) % 7
  const inicio = inicioDoDia(new Date(base.setDate(base.getDate() - deslocamento)))

  const colunas = Array.from({ length: 7 }, (_, i) => {
    const data = new Date(inicio)
    data.setDate(inicio.getDate() + i)
    const agenda = estado.obterAgenda(chaveData(data))
    const eventos = (agenda?.eventos || []).filter(e => e.tipo !== 'nao-agendada')
    const feriado = feriadoDoDia(data)

    const corpo = eventos.length
      ? eventos
          .map(
            e => `<li class="semana__item semana__item--${e.tipo}">
                    <span>${formatarHora(e.inicioMinutos)}</span>
                    <strong>${escaparHTML(e.titulo)}</strong>
                  </li>`
          )
          .join('')
      : '<li class="semana__item semana__item--vazio">Sem agenda</li>'

    return `
      <section class="semana__coluna ${mesmoDia(data, new Date()) ? 'semana__coluna--hoje' : ''}">
        <header class="semana__cabecalho">
          <span class="semana__dia-semana">${NOMES_DIAS[i]}</span>
          <button type="button" class="semana__numero" data-data="${chaveData(data)}">${data.getDate()}</button>
          ${feriado ? `<span class="semana__feriado" title="${escaparHTML(feriado.nome)}">${escaparHTML(feriado.nome)}</span>` : ''}
        </header>
        <ul class="semana__lista">${corpo}</ul>
      </section>`
  })

  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 6)

  return `
    <p class="calendario__legenda">
      Semana de ${inicio.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')}
    </p>
    <div class="semana">${colunas.join('')}</div>`
}

function renderizarDia() {
  const agenda = estado.obterAgenda(chaveData(estado.selecionada))
  const feriado = feriadoDoDia(estado.selecionada)
  const eventos = (agenda?.eventos || []).filter(e => e.tipo !== 'nao-agendada')

  const cabecalho = `
    <header class="calendario__resumo">
      <h3>${escaparHTML(formatarDataLonga(estado.selecionada))}</h3>
      ${feriado ? `<p class="calendario__feriado">🎉 Feriado nacional: ${escaparHTML(feriado.nome)}</p>` : ''}
      ${
        agenda?.stats
          ? `<p>Trabalho ${formatarDuracao(agenda.stats.trabalhados)} • Pausas ${formatarDuracao(
              agenda.stats.minutosPausa
            )} • Livre ${formatarDuracao(agenda.stats.minutosLivres)}</p>`
          : ''
      }
    </header>`

  if (!eventos.length) {
    return (
      cabecalho +
      avisoVazio(
        'Nenhum planejamento salvo para este dia',
        'Volte ao painel, gere a agenda e ela ficará disponível aqui.'
      )
    )
  }

  const inicio = Math.floor(Math.min(...eventos.map(e => e.inicioMinutos)) / 60) * 60
  const fim = Math.ceil(Math.max(...eventos.map(e => e.fimMinutos)) / 60) * 60

  const linhas = []
  for (let hora = inicio; hora < fim; hora += 60) {
    const naFaixa = eventos.filter(e => e.inicioMinutos < hora + 60 && e.fimMinutos > hora)
    linhas.push(`
      <div class="linha-hora ${naFaixa.length ? '' : 'linha-hora--vazia'}">
        <span class="linha-hora__rotulo">${formatarHora(hora)}</span>
        <div class="linha-hora__conteudo">
          ${naFaixa.length ? naFaixa.map(cartaoEvento).join('') : '<span class="linha-hora__livre">Livre</span>'}
        </div>
      </div>`)
  }

  return `${cabecalho}<div class="linha-hora-lista">${linhas.join('')}</div>`
}

function atualizarPainelLateral() {
  if (estado.rotuloPeriodo) {
    const rotulo =
      estado.visao === 'dia'
        ? estado.selecionada.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
        : estado.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    estado.rotuloPeriodo.textContent = rotulo.charAt(0).toUpperCase() + rotulo.slice(1)
  }

  if (!estado.listaFeriados) return
  const feriados = obterFeriados(estado.mes.getFullYear()).filter(f => f.mes === estado.mes.getMonth())
  estado.listaFeriados.innerHTML = feriados.length
    ? feriados
        .map(
          f => `<li class="feriado">
                  <span class="feriado__data">${String(f.dia).padStart(2, '0')}/${String(f.mes + 1).padStart(2, '0')}</span>
                  <span class="feriado__nome">${escaparHTML(f.nome)}</span>
                </li>`
        )
        .join('')
    : '<li class="feriado feriado--vazio">Nenhum feriado nacional neste mês.</li>'
}

export function renderizar() {
  if (!estado.container) return
  atualizarPainelLateral()

  if (estado.visao === 'semana') estado.container.innerHTML = renderizarSemana()
  else if (estado.visao === 'dia') estado.container.innerHTML = renderizarDia()
  else estado.container.innerHTML = renderizarMes()
}

/* ------------------------------------------------------------------ api --- */

export function inicializar(opcoes) {
  estado = { ...estado, ...opcoes }
  estado.selecionada = inicioDoDia(new Date())
  estado.mes = new Date(estado.selecionada.getFullYear(), estado.selecionada.getMonth(), 1)

  estado.container?.addEventListener('click', evento => {
    const celulaMes = evento.target.closest('[data-dia]')
    if (celulaMes) {
      selecionarDia(new Date(estado.mes.getFullYear(), estado.mes.getMonth(), Number(celulaMes.dataset.dia)))
      return
    }
    const celulaSemana = evento.target.closest('[data-data]')
    if (celulaSemana) {
      const [ano, mes, dia] = celulaSemana.dataset.data.split('-').map(Number)
      selecionarDia(new Date(ano, mes - 1, dia))
      definirVisao('dia')
    }
  })
}

export function definirVisao(visao) {
  estado.visao = visao
  document.querySelectorAll('[data-visao]').forEach(botao => {
    const ativo = botao.dataset.visao === visao
    botao.classList.toggle('ativo', ativo)
    botao.setAttribute('aria-pressed', String(ativo))
  })
  renderizar()
}

export function selecionarDia(data) {
  estado.selecionada = inicioDoDia(data)
  estado.mes = new Date(estado.selecionada.getFullYear(), estado.selecionada.getMonth(), 1)
  estado.aoMudarDia?.(estado.selecionada)
  renderizar()
}

export function navegar(delta) {
  if (estado.visao === 'dia') {
    const proxima = new Date(estado.selecionada)
    proxima.setDate(proxima.getDate() + delta)
    selecionarDia(proxima)
    return
  }
  if (estado.visao === 'semana') {
    const proxima = new Date(estado.selecionada)
    proxima.setDate(proxima.getDate() + delta * 7)
    selecionarDia(proxima)
    return
  }
  estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + delta, 1)
  renderizar()
}

export function irParaHoje() {
  selecionarDia(new Date())
}

export function obterSelecionada() {
  return new Date(estado.selecionada)
}

export function ehHoje() {
  return mesmoDia(estado.selecionada, new Date())
}
