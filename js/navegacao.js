/**
 * Navegação do shell do aplicativo.
 *
 * Concentra tudo que muda quando o usuário troca de tela: qual `<section>`
 * fica visível, o item ativo no menu lateral e na barra inferior, o título
 * exibido no topo e o gancho `aoEntrar`, que deixa o app.js redesenhar o que
 * só pode ser medido com a tela já visível (gráficos, por exemplo).
 *
 * Só existe um ponto de verdade — `irPara()`. Qualquer caminho de navegação
 * (menu, atalho de teclado, botão de voltar) passa por aqui, então os estados
 * nunca saem de sincronia.
 */

import { mostrarTela } from './ui.js'
import { transicionar } from './animacoes.js'

const $$ = seletor => Array.from(document.querySelectorAll(seletor))

/** Títulos exibidos no topo — a legenda some no mobile, por espaço. */
export const TELAS = {
  'tela-painel': { titulo: 'Dashboard', descricao: 'Sua visão geral do dia' },
  'tela-rotinas': { titulo: 'Rotinas', descricao: 'Janela, tarefas e cronograma' },
  'tela-foco': { titulo: 'Modo Foco', descricao: 'Um bloco por vez' },
  'tela-calendario': { titulo: 'Calendário', descricao: 'Feriados e agendas salvas' },
  'tela-estatisticas': { titulo: 'Estatísticas', descricao: 'Energia, tempo e tarefas' },
  'tela-configuracoes': { titulo: 'Configurações', descricao: 'Perfil, aparência e dados' },
  'tela-boas-vindas': { titulo: 'Bem-vindo', descricao: 'Configure o seu perfil' }
}

const estado = {
  atual: 'tela-boas-vindas',
  aoEntrar: () => {}
}

/**
 * Mantém menu lateral, barra inferior e cabeçalho falando a mesma língua.
 *
 * O seletor é `[data-ir]`, e não `[data-tela]`, de propósito: `mostrarTela()`
 * grava `data-tela` no próprio `<body>` (o CSS depende disso), e um seletor
 * `[data-tela]` transformaria o body em alvo de navegação — todo clique da
 * página subiria até ele.
 */
function sincronizar(id) {
  $$('[data-ir]').forEach(botao => {
    const ativo = botao.dataset.ir === id
    botao.classList.toggle('ativo', ativo)
    botao.setAttribute('aria-current', ativo ? 'page' : 'false')
  })

  const info = TELAS[id]
  if (!info) return

  const titulo = document.getElementById('titulo-pagina')
  const descricao = document.getElementById('descricao-pagina')
  if (titulo) titulo.textContent = info.titulo
  if (descricao) descricao.textContent = info.descricao
}

/**
 * Leva o usuário para uma tela.
 * @param {string} id id da `<section class="tela">`
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.imediato] pula a transição (usado na carga inicial)
 */
export function irPara(id, { imediato = false } = {}) {
  if (!TELAS[id]) return

  // O gancho roda DENTRO da mudança, logo após o `display` trocar: quem lê
  // dimensões (Chart.js, calendário) força o cálculo de layout na hora. Agendar
  // num `requestAnimationFrame` seria frágil — a aba em segundo plano não
  // recebe quadros, e a tela entraria sem nunca ser redesenhada.
  const aplicar = () => {
    mostrarTela(id)
    sincronizar(id)
    estado.aoEntrar(id)
  }

  estado.atual = id

  if (imediato) aplicar()
  else transicionar(aplicar)
}

export function telaAtual() {
  return estado.atual
}

/**
 * Liga os botões de navegação.
 * @param {object} opcoes
 * @param {Function} [opcoes.aoEntrar] chamado com o id da tela após cada troca
 */
export function inicializar({ aoEntrar } = {}) {
  if (typeof aoEntrar === 'function') estado.aoEntrar = aoEntrar

  document.addEventListener('click', evento => {
    const botao = evento.target.closest('button[data-ir], a[data-ir]')
    if (!botao) return
    evento.preventDefault()
    irPara(botao.dataset.ir)
  })
}
