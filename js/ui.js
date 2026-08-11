/**
 * Camada de apresentação: transforma o estado em DOM.
 * Nenhuma regra de negócio mora aqui — apenas renderização e eventos de tela.
 */

import { escaparHTML } from './componentes.js'
import { CATEGORIAS, obterCategoria } from './tarefas.js'
import {
  CRONOTIPOS,
  obterCronotipo,
  formatarHora,
  formatarDuracao,
  classificarEnergia,
  calcularUrgencia
} from './algoritmo.js'

const $ = seletor => document.querySelector(seletor)
const $$ = seletor => Array.from(document.querySelectorAll(seletor))

/* ------------------------------------------------------------------ telas - */

export function mostrarTela(id) {
  $$('.tela').forEach(tela => {
    const ativa = tela.id === id
    tela.classList.toggle('ativa', ativa)
    tela.hidden = !ativa
  })
  document.body.dataset.tela = id
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema
  const botao = $('#btn-tema')
  if (botao) {
    const escuro = tema === 'escuro'
    botao.textContent = escuro ? '🌙' : '☀️'
    botao.setAttribute('aria-label', escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro')
    botao.setAttribute('title', escuro ? 'Tema escuro ativo' : 'Tema claro ativo')
  }
}

/* ---------------------------------------------------------------- perfil -- */

export function preencherCronotipos(selecionado) {
  const container = $('#grupo-cronotipo')
  if (!container) return
  container.innerHTML = CRONOTIPOS.map(
    tipo => `
      <label class="opcao-cronotipo">
        <input type="radio" name="cronotipo" value="${tipo.id}" ${tipo.id === selecionado ? 'checked' : ''} />
        <span class="opcao-cronotipo__icone" aria-hidden="true">${tipo.icone}</span>
        <span class="opcao-cronotipo__texto">
          <strong>${tipo.rotulo}</strong>
          <small>${escaparHTML(tipo.descricao)}</small>
        </span>
      </label>`
  ).join('')
}

export function atualizarCabecalho(perfil, bio) {
  const saudacao = $('#saudacao-nome')
  if (saudacao) saudacao.textContent = `Olá, ${perfil.nome}!`

  const inicial = $('#avatar-inicial')
  if (inicial) inicial.textContent = (perfil.nome || '?').trim().charAt(0).toUpperCase()

  const cronotipo = obterCronotipo(bio.cronotipo)
  const chips = [
    { icone: '🧬', rotulo: 'Foco contínuo', valor: `${bio.focoMaximo} min` },
    { icone: cronotipo.icone, rotulo: 'Cronotipo', valor: cronotipo.rotulo },
    { icone: '⚡', rotulo: 'Pico de energia', valor: `${formatarHora(bio.picoHora * 60)}` }
  ]

  const container = $('#chips-bio')
  if (container) {
    container.innerHTML = chips
      .map(
        chip => `
        <span class="chip" title="${escaparHTML(chip.rotulo)}">
          <span aria-hidden="true">${chip.icone}</span>
          <span class="chip__rotulo">${escaparHTML(chip.rotulo)}</span>
          <strong>${escaparHTML(chip.valor)}</strong>
        </span>`
      )
      .join('')
  }
}

/* -------------------------------------------------------------- inventário */

export function preencherSelectCategorias(select, selecionada) {
  if (!select) return
  select.innerHTML = CATEGORIAS.map(
    c => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${c.icone} ${c.rotulo}</option>`
  ).join('')
}

function etiquetaPrazo(prazo) {
  if (!prazo) return ''
  const urgencia = calcularUrgencia(prazo)
  const data = new Date(`${prazo}T12:00:00`)
  const texto = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const classe = urgencia >= 0.8 ? 'etiqueta--urgente' : urgencia >= 0.6 ? 'etiqueta--atencao' : ''
  return `<span class="etiqueta ${classe}" title="Prazo">📅 ${texto}</span>`
}

export function renderizarListaTarefas(lista) {
  const container = $('#lista-de-tarefas')
  if (!container) return

  if (!lista.length) {
    container.innerHTML = `
      <p class="estado-vazio">
        Nenhuma tarefa ainda. Comece adicionando o que precisa sair do papel hoje.
      </p>`
    return
  }

  const ordenadas = [...lista].sort((a, b) => {
    if (a.concluida !== b.concluida) return a.concluida ? 1 : -1
    return calcularUrgencia(b.prazo) - calcularUrgencia(a.prazo) || b.peso - a.peso
  })

  container.innerHTML = ordenadas
    .map(tarefa => {
      const categoria = obterCategoria(tarefa.categoria)
      return `
      <article class="tarefa ${tarefa.concluida ? 'tarefa--concluida' : ''}" data-id="${tarefa.id}">
        <button type="button" class="tarefa__check" data-acao="concluir" data-id="${tarefa.id}"
          aria-label="${tarefa.concluida ? 'Reabrir' : 'Concluir'} ${escaparHTML(tarefa.nome)}"
          aria-pressed="${tarefa.concluida}">
          ${tarefa.concluida ? '✓' : ''}
        </button>

        <div class="tarefa__conteudo">
          <h4 class="tarefa__nome" title="${escaparHTML(tarefa.nome)}">${escaparHTML(tarefa.nome)}</h4>
          <div class="tarefa__etiquetas">
            <span class="etiqueta etiqueta--categoria" title="Categoria">${categoria.icone} ${categoria.rotulo}</span>
            <span class="etiqueta" title="Peso da tarefa">⚖️ ${tarefa.peso}</span>
            <span class="etiqueta" title="Duração estimada">⏱️ ${formatarDuracao(tarefa.tempo)}</span>
            ${etiquetaPrazo(tarefa.prazo)}
          </div>
        </div>

        <div class="tarefa__acoes">
          <button type="button" class="botao botao--icone botao--fantasma" data-acao="editar" data-id="${tarefa.id}"
            aria-label="Editar ${escaparHTML(tarefa.nome)}">✏️</button>
          <button type="button" class="botao botao--icone botao--fantasma botao--perigo-suave" data-acao="excluir" data-id="${tarefa.id}"
            aria-label="Excluir ${escaparHTML(tarefa.nome)}">🗑️</button>
        </div>
      </article>`
    })
    .join('')
}

export function renderizarResumoInventario(stats, limiteMinutos) {
  const container = $('#resumo-inventario')
  if (!container) return

  const excedente = stats.minutosAtivos - limiteMinutos
  const proporcao = limiteMinutos > 0 ? Math.min(100, (stats.minutosAtivos / limiteMinutos) * 100) : 0
  const classe = excedente > 0 ? 'barra--excedida' : proporcao > 80 ? 'barra--cheia' : ''

  container.innerHTML = `
    <div class="resumo-linha">
      <span>${stats.ativas} pendente${stats.ativas === 1 ? '' : 's'} • ${formatarDuracao(stats.minutosAtivos)}</span>
      <span>${stats.concluidas} concluída${stats.concluidas === 1 ? '' : 's'}</span>
    </div>
    <div class="barra ${classe}" role="progressbar" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow="${Math.round(proporcao)}" aria-label="Ocupação do limite diário">
      <span style="width:${proporcao}%"></span>
    </div>
    <p class="resumo-nota">
      ${
        excedente > 0
          ? `⚠️ ${formatarDuracao(excedente)} acima do limite diário — algo ficará para outro dia.`
          : `Cabe no limite diário, com ${formatarDuracao(Math.max(0, limiteMinutos - stats.minutosAtivos))} de margem.`
      }
    </p>`
}

export function mostrarSugestao(sugestao) {
  const campo = $('#sugestao-tarefa')
  if (!campo) return
  if (!sugestao) {
    campo.textContent = ''
    campo.hidden = true
    return
  }
  campo.hidden = false
  campo.textContent = `Baseado em ${sugestao.amostras} registro${sugestao.amostras > 1 ? 's' : ''}: peso ${sugestao.peso}, ${sugestao.tempo} min.`
}

/* ---------------------------------------------------------- interrupções -- */

export function renderizarInterrupcoes(lista) {
  const container = $('#lista-interrupcoes')
  if (!container) return

  if (!lista.length) {
    container.innerHTML = '<p class="estado-vazio estado-vazio--compacto">Nenhum compromisso fixo cadastrado.</p>'
    return
  }

  container.innerHTML = lista
    .map(
      (item, indice) => `
      <div class="interrupcao">
        <div class="interrupcao__info">
          <strong>${escaparHTML(item.tipo || 'Compromisso')}</strong>
          ${item.nome ? `<span>${escaparHTML(item.nome)}</span>` : ''}
          <small>${escaparHTML(item.inicio)} – ${escaparHTML(item.fim)}</small>
        </div>
        <button type="button" class="botao botao--icone botao--fantasma botao--perigo-suave"
          data-remover-interrupcao="${indice}" aria-label="Remover compromisso ${escaparHTML(item.tipo || '')}">🗑️</button>
      </div>`
    )
    .join('')
}

/* --------------------------------------------------------------- agenda --- */

function blocoTarefa(evento) {
  const categoria = obterCategoria(evento.categoria)
  const energia = classificarEnergia(evento.energia)
  return `
    <article class="bloco bloco--tarefa ${evento.energiaClasse}" data-inicio="${evento.inicioMinutos}">
      <div class="bloco__horario">
        <strong>${formatarHora(evento.inicioMinutos)}</strong>
        <span>${formatarHora(evento.fimMinutos)}</span>
      </div>
      <div class="bloco__corpo">
        <h4 class="bloco__titulo">
          ${escaparHTML(evento.titulo)}
          ${evento.continuacao ? '<span class="bloco__tag">continuação</span>' : ''}
        </h4>
        <p class="bloco__meta">
          <span>${categoria.icone} ${categoria.rotulo}</span>
          <span>⏱️ ${formatarDuracao(evento.duracao)}</span>
          <span class="bloco__energia" title="${energia.rotulo}">⚡ ${evento.energia}%</span>
        </p>
        <p class="bloco__motivo">${escaparHTML(evento.motivo || '')}</p>
      </div>
      <button type="button" class="botao botao--fantasma botao--foco" data-foco
        data-titulo="${escaparHTML(evento.titulo)}" data-minutos="${evento.duracao}"
        data-tarefa="${evento.id ?? ''}">▶ Focar</button>
    </article>`
}

function blocoPausa(evento) {
  return `
    <article class="bloco bloco--pausa">
      <div class="bloco__horario">
        <strong>${formatarHora(evento.inicioMinutos)}</strong>
        <span>${formatarHora(evento.fimMinutos)}</span>
      </div>
      <div class="bloco__corpo">
        <h4 class="bloco__titulo">${evento.icone || '☕'} ${escaparHTML(evento.titulo)} · ${evento.duracao} min</h4>
        <p class="bloco__motivo">${escaparHTML(evento.descricao || '')}</p>
      </div>
    </article>`
}

function blocoInterrupcao(evento) {
  return `
    <article class="bloco bloco--interrupcao">
      <div class="bloco__horario">
        <strong>${formatarHora(evento.inicioMinutos)}</strong>
        <span>${formatarHora(evento.fimMinutos)}</span>
      </div>
      <div class="bloco__corpo">
        <h4 class="bloco__titulo">⏸️ ${escaparHTML(evento.titulo)}</h4>
        <p class="bloco__motivo">${escaparHTML(evento.descricao || '')}</p>
      </div>
    </article>`
}

export function renderizarAgenda(agenda) {
  const container = $('#resultado-agenda')
  if (!container) return

  if (!agenda || !agenda.eventos.length) {
    container.innerHTML = `
      <div class="estado-vazio estado-vazio--ilustrado">
        <span aria-hidden="true">🗓️</span>
        <h3>Sua agenda aparece aqui</h3>
        <p>Cadastre as tarefas, ajuste a janela de trabalho e gere o planejamento otimizado pela sua curva de energia.</p>
      </div>`
    return
  }

  const agendados = agenda.eventos.filter(e => e.tipo !== 'nao-agendada')
  const pendentes = agenda.eventos.filter(e => e.tipo === 'nao-agendada')

  const linhaDoTempo = agendados
    .map(evento => {
      if (evento.tipo === 'tarefa') return blocoTarefa(evento)
      if (evento.tipo === 'pausa') return blocoPausa(evento)
      return blocoInterrupcao(evento)
    })
    .join('')

  const livre =
    agenda.stats.minutosLivres > 0
      ? `<div class="faixa-livre">
           🌤️ <strong>${formatarDuracao(agenda.stats.minutosLivres)} de tempo livre</strong> preservados
           a partir das ${formatarHora(agenda.stats.fimAgendaMinutos)}.
         </div>`
      : ''

  const naoAgendadas = pendentes.length
    ? `<section class="pendencias">
         <h4>⚠️ Não coube hoje (${pendentes.length})</h4>
         <ul>
           ${pendentes
             .map(
               e => `<li>
                       <strong>${escaparHTML(e.titulo)}</strong>
                       <span>${escaparHTML(e.descricao)}</span>
                     </li>`
             )
             .join('')}
         </ul>
         <p class="pendencias__dica">Aumente o limite diário, amplie a janela ou reduza o peso de alguma tarefa.</p>
       </section>`
    : ''

  container.innerHTML = `<div class="linha-do-tempo">${linhaDoTempo}</div>${livre}${naoAgendadas}`
}

export function renderizarIndicadores(agenda) {
  const container = $('#indicadores')
  if (!container) return

  const stats = agenda?.stats
  if (!stats) {
    container.hidden = true
    return
  }
  container.hidden = false

  const cartoes = [
    { icone: '🎯', rotulo: 'Trabalho planejado', valor: formatarDuracao(stats.trabalhados), detalhe: `${stats.ocupacao}% da janela` },
    { icone: '☕', rotulo: 'Pausas programadas', valor: formatarDuracao(stats.minutosPausa), detalhe: `${stats.eficiencia}% de eficiência` },
    { icone: '🌤️', rotulo: 'Tempo livre', valor: formatarDuracao(stats.minutosLivres), detalhe: stats.minutosLivres ? `livre às ${formatarHora(stats.fimAgendaMinutos)}` : 'dia cheio' },
    {
      icone: stats.naoAgendadas ? '⚠️' : '✅',
      rotulo: 'Pendências',
      valor: stats.naoAgendadas ? String(stats.naoAgendadas) : 'Nenhuma',
      detalhe: stats.naoAgendadas ? `${formatarDuracao(stats.minutosNaoAgendados)} sobrando` : 'tudo encaixado'
    }
  ]

  container.innerHTML = cartoes
    .map(
      c => `
      <div class="indicador">
        <span class="indicador__icone" aria-hidden="true">${c.icone}</span>
        <div>
          <strong class="indicador__valor">${escaparHTML(c.valor)}</strong>
          <span class="indicador__rotulo">${escaparHTML(c.rotulo)}</span>
          <small class="indicador__detalhe">${escaparHTML(c.detalhe)}</small>
        </div>
      </div>`
    )
    .join('')
}

export function definirEstadoAcoesAgenda(temAgenda) {
  $$('[data-requer-agenda]').forEach(botao => {
    botao.disabled = !temAgenda
  })
}

export function limparPainel() {
  renderizarListaTarefas([])
  renderizarAgenda(null)
  renderizarInterrupcoes([])
  mostrarSugestao(null)
  const indicadores = $('#indicadores')
  if (indicadores) indicadores.hidden = true
  const resumo = $('#resumo-inventario')
  if (resumo) resumo.innerHTML = ''
  ;['#nome-tarefa', '#peso-tarefa', '#tempo-tarefa', '#prazo-tarefa'].forEach(seletor => {
    const campo = $(seletor)
    if (campo) campo.value = ''
  })
}
