/**
 * Componentes de interface reutilizáveis: escape de HTML, avisos (toasts),
 * confirmações e diálogos de formulário.
 *
 * Substituem `alert`/`confirm`/`prompt`, que travam a página e não têm estilo.
 */

import { icone } from './icones.js'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Sempre use ao interpolar texto do usuário dentro de `innerHTML`. */
export function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ESCAPES[c])
}

export function criarElemento(tag, { classe, texto, html, atributos } = {}) {
  const el = document.createElement(tag)
  if (classe) el.className = classe
  if (texto != null) el.textContent = texto
  if (html != null) el.innerHTML = html
  if (atributos) {
    Object.entries(atributos).forEach(([chave, valor]) => {
      if (valor != null && valor !== false) el.setAttribute(chave, valor === true ? '' : valor)
    })
  }
  return el
}

/* -------------------------------------------------------------------------
   Avisos
   ------------------------------------------------------------------------- */

const ICONES = { sucesso: 'sucesso', erro: 'alerta', info: 'info', foco: 'alvo' }
let pilhaAvisos = null

function obterPilha() {
  if (pilhaAvisos && document.body.contains(pilhaAvisos)) return pilhaAvisos
  pilhaAvisos = criarElemento('div', {
    classe: 'pilha-avisos',
    atributos: { role: 'status', 'aria-live': 'polite' }
  })
  document.body.appendChild(pilhaAvisos)
  return pilhaAvisos
}

/**
 * @param {string} mensagem texto exibido
 * @param {object} [opcoes] `tipo`, `duracao` em ms e `acao` `{ rotulo, aoClicar }`
 */
export function notificar(mensagem, opcoes = {}) {
  const { tipo = 'info', duracao = 4200, acao = null } = opcoes
  const pilha = obterPilha()

  const aviso = criarElemento('div', { classe: `aviso aviso--${tipo}` })
  aviso.appendChild(
    criarElemento('span', { classe: 'aviso__icone', html: icone(ICONES[tipo] || ICONES.info, { tamanho: 17 }) })
  )
  aviso.appendChild(criarElemento('p', { classe: 'aviso__texto', texto: mensagem }))

  const fechar = () => {
    aviso.classList.add('aviso--saindo')
    aviso.addEventListener('animationend', () => aviso.remove(), { once: true })
    setTimeout(() => aviso.remove(), 400)
  }

  if (acao) {
    const botao = criarElemento('button', {
      classe: 'aviso__acao',
      texto: acao.rotulo,
      atributos: { type: 'button' }
    })
    botao.addEventListener('click', () => {
      acao.aoClicar?.()
      fechar()
    })
    aviso.appendChild(botao)
  }

  const botaoFechar = criarElemento('button', {
    classe: 'aviso__fechar',
    html: icone('x', { tamanho: 15 }),
    atributos: { type: 'button', 'aria-label': 'Fechar aviso' }
  })
  botaoFechar.addEventListener('click', fechar)
  aviso.appendChild(botaoFechar)

  pilha.appendChild(aviso)
  while (pilha.children.length > 4) pilha.firstElementChild.remove()

  const timer = setTimeout(fechar, duracao)
  aviso.addEventListener('mouseenter', () => clearTimeout(timer))
  return fechar
}

/* -------------------------------------------------------------------------
   Diálogos
   ------------------------------------------------------------------------- */

function montarDialogo({ titulo, descricao, largura }) {
  const dialogo = criarElemento('dialog', { classe: 'dialogo' })
  if (largura) dialogo.style.setProperty('--largura-dialogo', largura)

  const cabecalho = criarElemento('header', { classe: 'dialogo__cabecalho' })
  cabecalho.appendChild(criarElemento('h2', { classe: 'dialogo__titulo', texto: titulo }))
  if (descricao) {
    cabecalho.appendChild(criarElemento('p', { classe: 'dialogo__descricao', texto: descricao }))
  }

  const fechar = criarElemento('button', {
    classe: 'dialogo__fechar',
    html: icone('x', { tamanho: 18 }),
    atributos: { type: 'button', 'aria-label': 'Fechar' }
  })
  cabecalho.appendChild(fechar)
  dialogo.appendChild(cabecalho)

  return { dialogo, cabecalho, botaoFechar: fechar }
}

function exibir(dialogo) {
  document.body.appendChild(dialogo)
  if (typeof dialogo.showModal === 'function') dialogo.showModal()
  else dialogo.setAttribute('open', '')

  // Forçar o layout fixa o estado inicial da transição e só então trocamos a
  // classe. Um `requestAnimationFrame` faria o mesmo, mas não é entregue em
  // aba de segundo plano — e o diálogo ficaria invisível, ainda que aberto.
  void dialogo.offsetWidth
  dialogo.classList.add('dialogo--visivel')
}

function encerrar(dialogo, resolver, valor) {
  dialogo.classList.remove('dialogo--visivel')
  const remover = () => {
    if (typeof dialogo.close === 'function' && dialogo.open) dialogo.close()
    dialogo.remove()
    resolver(valor)
  }
  setTimeout(remover, 140)
}

/** Confirmação estilizada. Resolve para `true` quando o usuário confirma. */
export function confirmar({
  titulo = 'Tem certeza?',
  mensagem = '',
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  perigo = false
} = {}) {
  return new Promise(resolver => {
    const { dialogo, botaoFechar } = montarDialogo({ titulo, descricao: mensagem, largura: '26rem' })

    const acoes = criarElemento('footer', { classe: 'dialogo__acoes' })
    const cancelar = criarElemento('button', {
      classe: 'botao botao--fantasma',
      texto: rotuloCancelar,
      atributos: { type: 'button' }
    })
    const confirmarBotao = criarElemento('button', {
      classe: `botao ${perigo ? 'botao--perigo' : 'botao--primario'}`,
      texto: rotuloConfirmar,
      atributos: { type: 'button' }
    })

    cancelar.addEventListener('click', () => encerrar(dialogo, resolver, false))
    botaoFechar.addEventListener('click', () => encerrar(dialogo, resolver, false))
    confirmarBotao.addEventListener('click', () => encerrar(dialogo, resolver, true))
    dialogo.addEventListener('cancel', evento => {
      evento.preventDefault()
      encerrar(dialogo, resolver, false)
    })

    acoes.append(cancelar, confirmarBotao)
    dialogo.appendChild(acoes)
    exibir(dialogo)
    confirmarBotao.focus()
  })
}

/**
 * Diálogo somente de leitura, para conteúdo informativo.
 * @param {object} opcoes `titulo`, `descricao` e `html` já sanitizado
 */
export function abrirPainel({ titulo, descricao = '', html = '', largura = '32rem' } = {}) {
  return new Promise(resolver => {
    const { dialogo, botaoFechar } = montarDialogo({ titulo, descricao, largura })

    const corpo = criarElemento('div', { classe: 'dialogo__corpo', html })
    const acoes = criarElemento('footer', { classe: 'dialogo__acoes' })
    const fechar = criarElemento('button', {
      classe: 'botao botao--primario',
      texto: 'Entendi',
      atributos: { type: 'button' }
    })

    fechar.addEventListener('click', () => encerrar(dialogo, resolver, true))
    botaoFechar.addEventListener('click', () => encerrar(dialogo, resolver, true))
    dialogo.addEventListener('cancel', evento => {
      evento.preventDefault()
      encerrar(dialogo, resolver, true)
    })

    acoes.appendChild(fechar)
    dialogo.append(corpo, acoes)
    exibir(dialogo)
    fechar.focus()
  })
}

/**
 * Diálogo com formulário arbitrário.
 * `campos` é um array de descritores; resolve com um objeto `{ id: valor }`
 * ou `null` se o usuário cancelar.
 */
export function abrirFormulario({
  titulo,
  descricao = '',
  campos = [],
  rotuloConfirmar = 'Salvar',
  validar = null
} = {}) {
  return new Promise(resolver => {
    const { dialogo, botaoFechar } = montarDialogo({ titulo, descricao, largura: '30rem' })
    const form = criarElemento('form', { classe: 'dialogo__form' })
    const erroGeral = criarElemento('p', { classe: 'dialogo__erro', atributos: { role: 'alert' } })

    campos.forEach(campo => {
      const grupo = criarElemento('div', { classe: `campo campo--${campo.largura || 'total'}` })
      const idCampo = `dlg-${campo.id}`
      grupo.appendChild(criarElemento('label', { texto: campo.rotulo, atributos: { for: idCampo } }))

      let controle
      if (campo.tipo === 'select') {
        controle = criarElemento('select', { atributos: { id: idCampo, name: campo.id } })
        ;(campo.opcoes || []).forEach(opcao => {
          const item = criarElemento('option', { texto: opcao.rotulo, atributos: { value: opcao.valor } })
          if (String(opcao.valor) === String(campo.valor)) item.selected = true
          controle.appendChild(item)
        })
      } else if (campo.tipo === 'textarea') {
        controle = criarElemento('textarea', {
          texto: campo.valor ?? '',
          atributos: { id: idCampo, name: campo.id, rows: campo.linhas || 3 }
        })
      } else {
        controle = criarElemento('input', {
          atributos: {
            id: idCampo,
            name: campo.id,
            type: campo.tipo || 'text',
            min: campo.min,
            max: campo.max,
            step: campo.step,
            placeholder: campo.placeholder,
            inputmode: campo.inputmode
          }
        })
        controle.value = campo.valor ?? ''
      }

      grupo.appendChild(controle)
      if (campo.ajuda) grupo.appendChild(criarElemento('small', { classe: 'campo__ajuda', texto: campo.ajuda }))
      form.appendChild(grupo)
    })

    const acoes = criarElemento('footer', { classe: 'dialogo__acoes' })
    const cancelar = criarElemento('button', {
      classe: 'botao botao--fantasma',
      texto: 'Cancelar',
      atributos: { type: 'button' }
    })
    const salvar = criarElemento('button', {
      classe: 'botao botao--primario',
      texto: rotuloConfirmar,
      atributos: { type: 'submit' }
    })
    acoes.append(cancelar, salvar)

    form.appendChild(erroGeral)
    form.appendChild(acoes)
    dialogo.appendChild(form)

    const coletar = () => {
      const dados = {}
      campos.forEach(campo => {
        const controle = form.elements[campo.id]
        if (!controle) return
        dados[campo.id] = campo.tipo === 'number' ? Number(controle.value) : controle.value
      })
      return dados
    }

    form.addEventListener('submit', evento => {
      evento.preventDefault()
      const dados = coletar()
      const erro = validar ? validar(dados) : null
      if (erro) {
        erroGeral.textContent = erro
        return
      }
      encerrar(dialogo, resolver, dados)
    })

    cancelar.addEventListener('click', () => encerrar(dialogo, resolver, null))
    botaoFechar.addEventListener('click', () => encerrar(dialogo, resolver, null))
    dialogo.addEventListener('cancel', evento => {
      evento.preventDefault()
      encerrar(dialogo, resolver, null)
    })

    exibir(dialogo)
    const primeiro = form.querySelector('input, select, textarea')
    primeiro?.focus()
    if (primeiro?.select) primeiro.select()
  })
}

/** Copia texto para a área de transferência com fallback para navegadores antigos. */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const area = criarElemento('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

/** Dispara o download de um arquivo gerado em memória. */
export function baixarArquivo(nomeArquivo, conteudo, tipo = 'text/plain;charset=utf-8') {
  const blob = new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const link = criarElemento('a', { atributos: { href: url, download: nomeArquivo } })
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
