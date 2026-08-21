/**
 * Camada de apresentação: transforma o estado em DOM.
 * Nenhuma regra de negócio mora aqui — apenas renderização e eventos de tela.
 */

import { escaparHTML } from './componentes.js'
import { icone } from './icones.js'
import { animarNumero } from './animacoes.js'
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

  // O shell (menu lateral, topo e barra inferior) só existe depois do login:
  // no onboarding a tela ocupa a página inteira.
  const shell = $('#app')
  if (shell) shell.hidden = id === 'tela-boas-vindas'

  document.body.dataset.tela = id
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Some com a splash inicial assim que o app está pronto para uso. */
export function esconderSplash() {
  const splash = $('#splash')
  if (!splash) return
  splash.classList.add('splash--saindo')
  setTimeout(() => splash.remove(), 500)
}

const TEMAS = {
  escuro: { icone: 'lua', rotulo: 'Tema escuro' },
  claro: { icone: 'sol', rotulo: 'Tema claro' },
  auto: { icone: 'sistema', rotulo: 'Tema do sistema' }
}

/**
 * Aplica o tema escolhido. Em `auto`, segue a preferência do sistema.
 * @returns {string} o tema efetivamente aplicado (`escuro` ou `claro`)
 */
export function aplicarTema(tema) {
  const preferencia = TEMAS[tema] ? tema : 'escuro'
  const sistemaClaro = window.matchMedia?.('(prefers-color-scheme: light)').matches
  const resolvido = preferencia === 'auto' ? (sistemaClaro ? 'claro' : 'escuro') : preferencia

  document.documentElement.dataset.tema = resolvido
  document.documentElement.dataset.temaPreferido = preferencia

  const botao = $('#btn-tema')
  if (botao) {
    botao.innerHTML = icone(TEMAS[preferencia].icone, { tamanho: 19 })
    botao.setAttribute('aria-label', `${TEMAS[preferencia].rotulo} — clique para alternar`)
    botao.setAttribute('title', `${TEMAS[preferencia].rotulo} (clique para alternar)`)
  }

  // espelha a escolha no seletor segmentado da tela de Configurações
  $$('[data-tema-opcao]').forEach(opcao => {
    const ativo = opcao.dataset.temaOpcao === preferencia
    opcao.classList.toggle('ativo', ativo)
    opcao.setAttribute('aria-pressed', String(ativo))
  })

  return resolvido
}

/* ---------------------------------------------------------------- perfil -- */

export function preencherCronotipos(selecionado) {
  const container = $('#grupo-cronotipo')
  if (!container) return
  container.innerHTML = CRONOTIPOS.map(
    tipo => `
      <label class="opcao-cronotipo">
        <input type="radio" name="cronotipo" value="${tipo.id}" ${tipo.id === selecionado ? 'checked' : ''} />
        <span class="opcao-cronotipo__icone">${icone(tipo.simbolo, { tamanho: 22 })}</span>
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

  // A inicial alimenta os três avatares do app: topo, menu lateral e perfil.
  const inicial = (perfil.nome || '?').trim().charAt(0).toUpperCase()
  ;['#avatar-inicial', '#avatar-lateral', '#avatar-config'].forEach(seletor => {
    const alvo = $(seletor)
    if (alvo) alvo.textContent = inicial
  })
  ;['#nome-lateral', '#nome-config'].forEach(seletor => {
    const alvo = $(seletor)
    if (alvo) alvo.textContent = perfil.nome || 'Chronos'
  })

  const cronotipo = obterCronotipo(bio.cronotipo)

  const detalhe = $('#detalhe-config')
  if (detalhe) {
    detalhe.textContent = `${perfil.idade} anos · ${cronotipo.rotulo} · foco de ${bio.focoMaximo} min`
  }

  const chips = [
    { simbolo: 'ampulheta', rotulo: 'Foco contínuo', valor: `${bio.focoMaximo} min` },
    { simbolo: cronotipo.simbolo, rotulo: 'Cronotipo', valor: cronotipo.rotulo },
    { simbolo: 'raio', rotulo: 'Pico de energia', valor: `${formatarHora(bio.picoHora * 60)}` }
  ]

  const container = $('#chips-bio')
  if (container) {
    container.innerHTML = chips
      .map(
        chip => `
        <span class="chip" title="${escaparHTML(chip.rotulo)}">
          ${icone(chip.simbolo, { tamanho: 15 })}
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
    c => `<option value="${c.id}" ${c.id === selecionada ? 'selected' : ''}>${c.rotulo}</option>`
  ).join('')
}

/** Popula os controles de filtro e ordenação do inventário. */
export function preencherControlesInventario() {
  const filtro = $('#filtro-categoria')
  if (filtro) {
    filtro.innerHTML =
      '<option value="todas">Todas as categorias</option>' +
      CATEGORIAS.map(c => `<option value="${c.id}">${c.rotulo}</option>`).join('')
  }

  const ordenar = $('#ordenar-tarefas')
  if (ordenar) {
    ordenar.innerHTML = ORDENACOES.map(o => `<option value="${o.id}">${o.rotulo}</option>`).join('')
  }
}

function etiquetaPrazo(prazo) {
  if (!prazo) return ''
  const urgencia = calcularUrgencia(prazo)
  const data = new Date(`${prazo}T12:00:00`)
  const texto = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const classe = urgencia >= 0.8 ? 'etiqueta--urgente' : urgencia >= 0.6 ? 'etiqueta--atencao' : ''
  return `<span class="etiqueta ${classe}" title="Prazo">${icone('calendario', { tamanho: 14 })} ${texto}</span>`
}

export const ORDENACOES = [
  { id: 'manual', rotulo: 'Ordem manual' },
  { id: 'prioridade', rotulo: 'Prioridade' },
  { id: 'prazo', rotulo: 'Prazo' },
  { id: 'duracao', rotulo: 'Duração' }
]

function aplicarFiltros(lista, { busca = '', status = 'todas', categoria = 'todas' }) {
  const termo = busca.trim().toLowerCase()
  return lista.filter(tarefa => {
    if (status === 'pendentes' && tarefa.concluida) return false
    if (status === 'concluidas' && !tarefa.concluida) return false
    if (categoria !== 'todas' && tarefa.categoria !== categoria) return false
    if (termo && !tarefa.nome.toLowerCase().includes(termo)) return false
    return true
  })
}

function aplicarOrdenacao(lista, ordem) {
  const copia = [...lista]
  if (ordem === 'manual') {
    return copia.sort((a, b) => Number(a.concluida) - Number(b.concluida))
  }
  return copia.sort((a, b) => {
    if (a.concluida !== b.concluida) return a.concluida ? 1 : -1
    if (ordem === 'prazo') {
      return calcularUrgencia(b.prazo) - calcularUrgencia(a.prazo) || b.peso - a.peso
    }
    if (ordem === 'duracao') return b.tempo - a.tempo
    return b.peso - a.peso || calcularUrgencia(b.prazo) - calcularUrgencia(a.prazo)
  })
}

/**
 * @param {Array} lista inventário completo
 * @param {object} [filtros] `{ busca, status, categoria, ordem }`
 */
export function renderizarListaTarefas(lista, filtros = {}) {
  const container = $('#lista-de-tarefas')
  if (!container) return

  const { ordem = 'manual' } = filtros
  const contador = $('#contador-filtro')

  if (!lista.length) {
    if (contador) contador.textContent = ''
    container.innerHTML = `
      <p class="estado-vazio">
        Nenhuma tarefa ainda. Comece adicionando o que precisa sair do papel hoje.
      </p>`
    return
  }

  const filtradas = aplicarFiltros(lista, filtros)
  if (contador) {
    contador.textContent =
      filtradas.length === lista.length
        ? `${lista.length} tarefa${lista.length === 1 ? '' : 's'}`
        : `${filtradas.length} de ${lista.length}`
  }

  if (!filtradas.length) {
    container.innerHTML = `
      <p class="estado-vazio estado-vazio--compacto">
        Nenhuma tarefa corresponde ao filtro atual.
      </p>`
    return
  }

  const ordenadas = aplicarOrdenacao(filtradas, ordem)
  const arrastavel = ordem === 'manual'

  container.classList.toggle('lista--arrastavel', arrastavel)
  container.innerHTML = ordenadas
    .map((tarefa, indice) => {
      const categoria = obterCategoria(tarefa.categoria)
      return `
      <article class="tarefa ${tarefa.concluida ? 'tarefa--concluida' : ''}" data-id="${tarefa.id}"
        style="--i:${indice}" ${arrastavel ? 'draggable="true"' : ''}>
        <button type="button" class="tarefa__check" data-acao="concluir" data-id="${tarefa.id}"
          aria-label="${tarefa.concluida ? 'Reabrir' : 'Concluir'} ${escaparHTML(tarefa.nome)}"
          aria-pressed="${tarefa.concluida}">
          ${tarefa.concluida ? icone('check', { tamanho: 14 }) : ''}
        </button>

        <div class="tarefa__conteudo">
          <h4 class="tarefa__nome" title="${escaparHTML(tarefa.nome)}">${escaparHTML(tarefa.nome)}</h4>
          <div class="tarefa__etiquetas">
            <span class="etiqueta etiqueta--categoria" title="Categoria">
              ${icone(categoria.simbolo, { tamanho: 14 })} ${categoria.rotulo}
            </span>
            <span class="etiqueta" title="Peso da tarefa">${icone('medidor', { tamanho: 14 })} ${tarefa.peso}</span>
            <span class="etiqueta" title="Duração estimada">
              ${icone('relogio', { tamanho: 14 })} ${formatarDuracao(tarefa.tempo)}
            </span>
            ${etiquetaPrazo(tarefa.prazo)}
          </div>
        </div>

        <div class="tarefa__acoes">
          ${
            arrastavel
              ? `<span class="tarefa__alca" title="Arraste para reordenar">${icone('alca', { tamanho: 16 })}</span>`
              : ''
          }
          <button type="button" class="botao botao--icone botao--fantasma" data-acao="editar" data-id="${tarefa.id}"
            aria-label="Editar ${escaparHTML(tarefa.nome)}">${icone('editar', { tamanho: 15 })}</button>
          <button type="button" class="botao botao--icone botao--fantasma botao--perigo-suave" data-acao="excluir" data-id="${tarefa.id}"
            aria-label="Excluir ${escaparHTML(tarefa.nome)}">${icone('lixeira', { tamanho: 15 })}</button>
        </div>
      </article>`
    })
    .join('')
}

/** Liga o arraste de reordenação usando HTML5 drag and drop. */
export function ligarArrasteDeTarefas(aoReordenar) {
  const container = $('#lista-de-tarefas')
  if (!container) return
  let arrastando = null

  container.addEventListener('dragstart', evento => {
    const item = evento.target.closest('.tarefa[draggable="true"]')
    if (!item) return
    arrastando = item
    item.classList.add('tarefa--arrastando')
    evento.dataTransfer.effectAllowed = 'move'
    evento.dataTransfer.setData('text/plain', item.dataset.id)
  })

  container.addEventListener('dragover', evento => {
    if (!arrastando) return
    evento.preventDefault()
    evento.dataTransfer.dropEffect = 'move'
    const alvo = evento.target.closest('.tarefa')
    container.querySelectorAll('.tarefa--alvo').forEach(el => el.classList.remove('tarefa--alvo'))
    if (alvo && alvo !== arrastando) alvo.classList.add('tarefa--alvo')
  })

  const encerrar = () => {
    arrastando?.classList.remove('tarefa--arrastando')
    container.querySelectorAll('.tarefa--alvo').forEach(el => el.classList.remove('tarefa--alvo'))
    arrastando = null
  }

  container.addEventListener('drop', evento => {
    evento.preventDefault()
    const alvo = evento.target.closest('.tarefa')
    const origem = arrastando?.dataset.id
    encerrar()
    if (alvo && origem && alvo.dataset.id !== origem) aoReordenar(origem, alvo.dataset.id)
  })

  container.addEventListener('dragend', encerrar)
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
          ? `${icone('alerta', { tamanho: 14 })} ${formatarDuracao(excedente)} acima do limite diário — algo ficará para outro dia.`
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

function blocoTarefa(evento, indice) {
  const categoria = obterCategoria(evento.categoria)
  const energia = classificarEnergia(evento.energia)
  return `
    <article class="bloco bloco--tarefa ${evento.energiaClasse}" style="--i:${indice}" data-inicio="${evento.inicioMinutos}">
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
          <span>${icone(categoria.simbolo, { tamanho: 14 })} ${categoria.rotulo}</span>
          <span>${icone('relogio', { tamanho: 14 })} ${formatarDuracao(evento.duracao)}</span>
          <span class="bloco__energia" title="${energia.rotulo}">
            ${icone('raio', { tamanho: 14 })} ${evento.energia}%
          </span>
        </p>
        <p class="bloco__motivo">${escaparHTML(evento.motivo || '')}</p>
      </div>
      <button type="button" class="botao botao--fantasma botao--foco" data-foco
        data-titulo="${escaparHTML(evento.titulo)}" data-minutos="${evento.duracao}"
        data-tarefa="${evento.id ?? ''}">${icone('play', { tamanho: 14 })} Focar</button>
    </article>`
}

function blocoPausa(evento, indice) {
  return `
    <article class="bloco bloco--pausa" style="--i:${indice}">
      <div class="bloco__horario">
        <strong>${formatarHora(evento.inicioMinutos)}</strong>
        <span>${formatarHora(evento.fimMinutos)}</span>
      </div>
      <div class="bloco__corpo">
        <h4 class="bloco__titulo">
          ${icone(evento.simbolo || 'cafe', { tamanho: 14 })}
          ${escaparHTML(evento.titulo)} · ${evento.duracao} min
        </h4>
        <p class="bloco__motivo">${escaparHTML(evento.descricao || '')}</p>
      </div>
    </article>`
}

function blocoInterrupcao(evento, indice) {
  return `
    <article class="bloco bloco--interrupcao" style="--i:${indice}">
      <div class="bloco__horario">
        <strong>${formatarHora(evento.inicioMinutos)}</strong>
        <span>${formatarHora(evento.fimMinutos)}</span>
      </div>
      <div class="bloco__corpo">
        <h4 class="bloco__titulo">${icone('pausado', { tamanho: 14 })} ${escaparHTML(evento.titulo)}</h4>
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
        <span>${icone("calendario", { tamanho: 40 })}</span>
        <h3>Sua agenda aparece aqui</h3>
        <p>Cadastre as tarefas, ajuste a janela de trabalho e gere o planejamento otimizado pela sua curva de energia.</p>
      </div>`
    return
  }

  const agendados = agenda.eventos.filter(e => e.tipo !== 'nao-agendada')
  const pendentes = agenda.eventos.filter(e => e.tipo === 'nao-agendada')

  const linhaDoTempo = agendados
    .map((evento, indice) => {
      if (evento.tipo === 'tarefa') return blocoTarefa(evento, indice)
      if (evento.tipo === 'pausa') return blocoPausa(evento, indice)
      return blocoInterrupcao(evento, indice)
    })
    .join('')

  const livre =
    agenda.stats.minutosLivres > 0
      ? `<div class="faixa-livre">
           ${icone('sol-nuvem', { tamanho: 16 })} <strong>${formatarDuracao(agenda.stats.minutosLivres)} de tempo livre</strong> preservados
           a partir das ${formatarHora(agenda.stats.fimAgendaMinutos)}.
         </div>`
      : ''

  const naoAgendadas = pendentes.length
    ? `<section class="pendencias">
         <h4>${icone('alerta', { tamanho: 15 })} Não coube hoje (${pendentes.length})</h4>
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
    container.innerHTML = ''
    return
  }
  container.hidden = false

  // `proporcao` alimenta a barrinha de leitura rápida sob o número — é o que
  // transforma o cartão num KPI de verdade, e não só num texto grande.
  const totalDia = Math.max(1, stats.trabalhados + stats.minutosPausa + stats.minutosLivres)

  const cartoes = [
    {
      simbolo: 'alvo',
      rotulo: 'Trabalho planejado',
      numero: stats.trabalhados,
      formatar: formatarDuracao,
      detalhe: `${stats.ocupacao}% da janela`,
      proporcao: stats.ocupacao,
      tom: 'primaria'
    },
    {
      simbolo: 'cafe',
      rotulo: 'Pausas programadas',
      numero: stats.minutosPausa,
      formatar: formatarDuracao,
      detalhe: `${stats.eficiencia}% de eficiência`,
      proporcao: stats.eficiencia,
      tom: 'aviso'
    },
    {
      simbolo: 'sol-nuvem',
      rotulo: 'Tempo livre',
      numero: stats.minutosLivres,
      formatar: formatarDuracao,
      detalhe: stats.minutosLivres ? `livre às ${formatarHora(stats.fimAgendaMinutos)}` : 'dia cheio',
      proporcao: (stats.minutosLivres / totalDia) * 100,
      tom: 'sucesso'
    },
    {
      simbolo: stats.naoAgendadas ? 'alerta' : 'sucesso',
      rotulo: 'Pendências',
      numero: stats.naoAgendadas,
      formatar: n => (Math.round(n) ? String(Math.round(n)) : 'Nenhuma'),
      detalhe: stats.naoAgendadas ? `${formatarDuracao(stats.minutosNaoAgendados)} sobrando` : 'tudo encaixado',
      proporcao: stats.naoAgendadas ? 100 : 0,
      tom: stats.naoAgendadas ? 'perigo' : 'sucesso'
    }
  ]

  const limitar = valor => Math.max(0, Math.min(100, Math.round(Number(valor) || 0)))

  container.innerHTML = cartoes
    .map(
      (c, i) => `
      <div class="indicador indicador--${c.tom}" style="--i:${i}">
        <span class="indicador__icone">${icone(c.simbolo, { tamanho: 18 })}</span>
        <div>
          <span class="indicador__rotulo">${escaparHTML(c.rotulo)}</span>
          <strong class="indicador__valor" data-valor>—</strong>
          <span class="indicador__barra" aria-hidden="true"><span style="width:${limitar(c.proporcao)}%"></span></span>
          <small class="indicador__detalhe">${escaparHTML(c.detalhe)}</small>
        </div>
      </div>`
    )
    .join('')

  container.querySelectorAll('[data-valor]').forEach((alvo, i) => {
    animarNumero(alvo, cartoes[i].numero, cartoes[i].formatar)
  })
}

export function definirEstadoAcoesAgenda(temAgenda) {
  $$('[data-requer-agenda]').forEach(botao => {
    botao.disabled = !temAgenda
  })
}

/* ============================================================== dashboard ==
   Blocos derivados da agenda do dia. Não guardam estado próprio: recebem a
   agenda pronta e apenas desenham.
   ========================================================================= */

const minutosAgora = () => {
  const agora = new Date()
  return agora.getHours() * 60 + agora.getMinutes()
}

/** Eventos reais (sem as pendências), já ordenados no relógio. */
function eventosOrdenados(agenda) {
  return (agenda?.eventos || [])
    .filter(evento => evento.tipo !== 'nao-agendada')
    .slice()
    .sort((a, b) => a.inicioMinutos - b.inicioMinutos)
}

function classeDoEvento(evento) {
  if (evento.tipo === 'pausa') return 'proxima--pausa'
  if (evento.tipo === 'interrupcao') return 'proxima--interrupcao'
  return ''
}

/**
 * Lista enxuta "o que vem a seguir" do dashboard: o bloco em andamento mais
 * os próximos, para o usuário se situar sem abrir o cronograma inteiro.
 */
export function renderizarProximas(agenda, { limite = 5 } = {}) {
  const container = $('#lista-proximas')
  if (!container) return

  const eventos = eventosOrdenados(agenda)
  if (!eventos.length) {
    container.innerHTML = `
      <p class="estado-vazio estado-vazio--compacto">
        Gere a agenda do dia para ver as próximas atividades aqui.
      </p>`
    return
  }

  const relogio = minutosAgora()
  const emAndamento = eventos.findIndex(e => relogio >= e.inicioMinutos && relogio < e.fimMinutos)
  const aSeguir = eventos.findIndex(e => e.inicioMinutos > relogio)
  const inicio = emAndamento >= 0 ? emAndamento : aSeguir >= 0 ? aSeguir : 0
  const recorte = eventos.slice(inicio, inicio + limite)

  container.innerHTML = recorte
    .map((evento, indice) => {
      const agora = indice === 0 && emAndamento >= 0
      const categoria = evento.tipo === 'tarefa' ? obterCategoria(evento.categoria) : null

      // O ícone entra como markup pronto e o texto continua escapado: só o
      // que veio do usuário passa por `escaparHTML`.
      const simbolo = categoria && !agora ? icone(categoria.simbolo, { tamanho: 14 }) : ''
      const detalhe = agora
        ? 'Acontecendo agora'
        : categoria
          ? `${categoria.rotulo} · ${formatarDuracao(evento.duracao)}`
          : formatarDuracao(evento.duracao)

      return `
        <article class="proxima ${classeDoEvento(evento)} ${agora ? 'proxima--agora' : ''}" style="--i:${indice}">
          <span class="proxima__marca" aria-hidden="true"></span>
          <span class="proxima__textos">
            <span class="proxima__titulo">${escaparHTML(evento.titulo)}</span>
            <span class="proxima__detalhe">${simbolo}${escaparHTML(detalhe)}</span>
          </span>
          <span class="proxima__hora">${formatarHora(evento.inicioMinutos)}</span>
        </article>`
    })
    .join('')
}

/** Régua hora a hora do dia planejado — o "Sua Agenda" do layout. */
export function renderizarAgendaDoDia(agenda) {
  const container = $('#agenda-do-dia')
  if (!container) return

  const eventos = eventosOrdenados(agenda)
  if (!eventos.length) {
    container.innerHTML = `
      <p class="estado-vazio estado-vazio--compacto">
        Nenhum bloco agendado para esta data.
      </p>`
    return
  }

  const primeira = Math.floor(eventos[0].inicioMinutos / 60)
  const ultima = Math.ceil(eventos[eventos.length - 1].fimMinutos / 60)

  const linhas = []
  for (let hora = primeira; hora < ultima; hora += 1) {
    const inicioHora = hora * 60
    const fimHora = inicioHora + 60
    const dentro = eventos.filter(e => e.inicioMinutos < fimHora && e.fimMinutos > inicioHora)

    const blocos = dentro
      .map(evento => {
        const modificador =
          evento.tipo === 'pausa'
            ? ' agenda-dia__bloco--pausa'
            : evento.tipo === 'interrupcao'
              ? ' agenda-dia__bloco--interrupcao'
              : ''
        return `
          <div class="agenda-dia__bloco${modificador}">
            <strong>${escaparHTML(evento.titulo)}</strong>
            <span>${formatarHora(evento.inicioMinutos)} – ${formatarHora(evento.fimMinutos)}</span>
          </div>`
      })
      .join('')

    linhas.push(`
      <div class="agenda-dia__linha">
        <span class="agenda-dia__hora">${String(hora % 24).padStart(2, '0')}:00</span>
        <div class="agenda-dia__blocos">${blocos}</div>
      </div>`)
  }

  container.innerHTML = linhas.join('')
}

/** Fila de blocos focáveis da tela de Foco. */
export function renderizarFilaFoco(agenda) {
  const container = $('#fila-foco')
  if (!container) return

  const tarefas = eventosOrdenados(agenda).filter(evento => evento.tipo === 'tarefa')
  if (!tarefas.length) {
    container.innerHTML = `
      <p class="estado-vazio estado-vazio--compacto">
        Gere a agenda em <strong>Rotinas</strong> para focar direto nos blocos do dia.
      </p>`
    return
  }

  const relogio = minutosAgora()

  container.innerHTML = tarefas
    .map(evento => {
      const categoria = obterCategoria(evento.categoria)
      const agora = relogio >= evento.inicioMinutos && relogio < evento.fimMinutos
      const restante = agora ? Math.max(1, Math.ceil(evento.fimMinutos - relogio)) : evento.duracao

      return `
        <button type="button" class="fila-foco__item" data-foco-bloco
          data-titulo="${escaparHTML(evento.titulo)}" data-minutos="${restante}"
          data-tarefa="${evento.id ?? ''}">
          <span class="fila-foco__hora">${formatarHora(evento.inicioMinutos)}</span>
          <span class="fila-foco__textos">
            <span class="fila-foco__titulo">${escaparHTML(evento.titulo)}</span>
            <span class="fila-foco__detalhe">
              ${icone(categoria.simbolo, { tamanho: 14 })}
              ${categoria.rotulo} · ${formatarDuracao(restante)}${agora ? ' restantes' : ''}
            </span>
          </span>
          <span class="fila-foco__acao">${icone('play', { tamanho: 14 })}</span>
        </button>`
    })
    .join('')
}

/**
 * Números-resumo da tela de Estatísticas.
 * @param {object} dados `{ agendas, estatisticasTarefas, bio }`
 */
export function renderizarTotais({ agendas = {}, estatisticasTarefas, bio }) {
  const container = $('#totais-estatisticas')
  if (!container) return

  const salvas = Object.values(agendas).filter(a => a?.stats)
  const trabalho = salvas.reduce((soma, a) => soma + (a.stats.trabalhados || 0), 0)
  const livre = salvas.reduce((soma, a) => soma + (a.stats.minutosLivres || 0), 0)
  const mediaLivre = salvas.length ? Math.round(livre / salvas.length) : 0

  const cartoes = [
    {
      valor: formatarDuracao(trabalho),
      rotulo: 'Trabalho planejado',
      detalhe: `${salvas.length} agenda${salvas.length === 1 ? '' : 's'} registrada${salvas.length === 1 ? '' : 's'}`
    },
    {
      valor: formatarDuracao(livre),
      rotulo: 'Tempo livre preservado',
      detalhe: mediaLivre ? `${formatarDuracao(mediaLivre)} por dia, em média` : 'ainda sem histórico'
    },
    {
      valor: String(estatisticasTarefas?.concluidas ?? 0),
      rotulo: 'Tarefas concluídas',
      detalhe: `${estatisticasTarefas?.ativas ?? 0} ainda pendentes`
    },
    {
      valor: `${bio?.focoMaximo ?? 0} min`,
      rotulo: 'Foco contínuo ideal',
      detalhe: 'calculado pela sua idade'
    }
  ]

  container.innerHTML = cartoes
    .map(
      cartao => `
      <div class="total">
        <strong class="total__valor">${escaparHTML(cartao.valor)}</strong>
        <span class="total__rotulo">${escaparHTML(cartao.rotulo)}</span>
        <small class="total__detalhe">${escaparHTML(cartao.detalhe)}</small>
      </div>`
    )
    .join('')
}

/* =================================================================== foco ==
   O anel grande da tela de Foco é só um espelho do cronômetro de foco.js:
   ele não conta o tempo, apenas desenha o instantâneo recebido.
   ========================================================================= */

const RAIO_ANEL = 44
const CIRCUNFERENCIA_ANEL = 2 * Math.PI * RAIO_ANEL

function relogioDeSegundos(segundos) {
  const total = Math.max(0, Math.round(segundos))
  const minutos = Math.floor(total / 60)
  return `${String(minutos).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * @param {object|null} sessao instantâneo de `foco.sessaoAtual()`
 * @param {object} [opcoes] `minutosPadrao` mostrado quando não há sessão
 */
export function renderizarSessaoFoco(sessao, { minutosPadrao = 25, tituloPadrao = 'Sessão livre' } = {}) {
  const palco = $('#foco-palco')
  if (!palco) return

  const relogio = $('#foco-relogio')
  const estado = $('#foco-estado')
  const titulo = $('#foco-titulo')
  const descricao = $('#foco-descricao')
  const progresso = $('[data-anel-progresso]')
  const botaoIniciar = $('#btn-foco-iniciar')
  const botaoPausar = $('#btn-foco-pausar')
  const botaoEncerrar = $('#btn-foco-encerrar')

  const ativo = Boolean(sessao)
  const proporcao = ativo && sessao.total ? 1 - sessao.restante / sessao.total : 0

  if (progresso) {
    progresso.style.strokeDasharray = `${CIRCUNFERENCIA_ANEL}`
    progresso.style.strokeDashoffset = `${CIRCUNFERENCIA_ANEL * (1 - proporcao)}`
  }

  if (relogio) relogio.textContent = ativo ? relogioDeSegundos(sessao.restante) : relogioDeSegundos(minutosPadrao * 60)

  if (estado) {
    estado.textContent = !ativo
      ? 'Pronto'
      : sessao.pausada
        ? 'Pausado'
        : `${Math.round(proporcao * 100)}% concluído`
  }

  if (titulo) titulo.textContent = ativo ? sessao.titulo : tituloPadrao
  if (descricao) {
    descricao.textContent = ativo
      ? sessao.pausada
        ? 'Sessão pausada — retome quando estiver pronto.'
        : 'Mantenha o bloco até o fim; a pausa vem logo depois.'
      : 'Escolha a duração e comece — ou toque em um bloco do seu cronograma ao lado.'
  }

  palco.classList.toggle('foco-palco--ativo', ativo && !sessao.pausada)

  if (botaoIniciar) botaoIniciar.hidden = ativo
  if (botaoPausar) {
    botaoPausar.hidden = !ativo
    // só reescreve quando o rótulo muda: a função roda duas vezes por segundo
    const pausado = ativo && sessao.pausada ? 'sim' : 'nao'
    if (botaoPausar.dataset.pausado !== pausado) {
      botaoPausar.dataset.pausado = pausado
      botaoPausar.innerHTML =
        pausado === 'sim'
          ? `${icone('play', { tamanho: 17 })} Retomar`
          : `${icone('pausa', { tamanho: 17 })} Pausar`
    }
  }
  if (botaoEncerrar) botaoEncerrar.hidden = !ativo
}

/** Contador do sino no topo — quantas tarefas ainda estão pendentes. */
export function atualizarContadorAvisos(quantidade) {
  const contador = $('#contador-avisos')
  if (!contador) return
  contador.hidden = !quantidade
  contador.textContent = quantidade > 9 ? '9+' : String(quantidade)
}

export function limparPainel() {
  renderizarListaTarefas([])
  renderizarAgenda(null)
  renderizarInterrupcoes([])
  renderizarIndicadores(null)
  renderizarProximas(null)
  renderizarAgendaDoDia(null)
  renderizarFilaFoco(null)
  mostrarSugestao(null)
  atualizarContadorAvisos(0)

  const resumo = $('#resumo-inventario')
  if (resumo) resumo.innerHTML = ''

  const totais = $('#totais-estatisticas')
  if (totais) totais.innerHTML = ''

  const agora = $('#painel-agora')
  if (agora) {
    agora.hidden = true
    agora.innerHTML = ''
  }
  ;['#nome-tarefa', '#peso-tarefa', '#tempo-tarefa', '#prazo-tarefa', '#busca-tarefa', '#busca-global'].forEach(
    seletor => {
      const campo = $(seletor)
      if (campo) campo.value = ''
    }
  )
}
