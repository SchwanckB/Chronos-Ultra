/**
 * Biblioteca de ícones do Chronos Ultra.
 *
 * Conjunto baseado no Lucide (https://lucide.dev — licença ISC/MIT), embutido
 * como SVG inline em vez de carregado por CDN. A escolha é deliberada:
 *
 *  · o app é uma PWA offline — uma CDN quebraria os ícones sem rede;
 *  · SVG inline herda `currentColor`, então o ícone acompanha tema e estado
 *    (hover, item ativo do menu) sem nenhuma regra extra;
 *  · nada de requisição adicional nem de "flash" de ícone faltando.
 *
 * Todos os traçados vivem numa grade 24×24 com contorno arredondado, o que
 * mantém peso óptico igual entre eles em qualquer tamanho.
 */

/* Traçados por nome. Chaves em português, para casar com o resto do código. */
const TRACOS = {
  /* ------------------------------------------------------- navegação --- */
  painel:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  rotinas:
    '<path d="m3 8 2 2 4-4"/><path d="m3 16 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  foco: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  calendario:
    '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/>',
  estatisticas:
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="4" width="3" height="13" rx="1"/>',
  configuracoes:
    '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',

  /* ----------------------------------------------------------- topo ---- */
  sino: '<path d="M10.3 21a2 2 0 0 0 3.4 0"/><path d="M4 17h16a1 1 0 0 0 .74-1.67C19.4 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 5.96-2.74 7.33A1 1 0 0 0 4 17Z"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>',
  sistema: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  usuario: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',

  /* ---------------------------------------------------------- ações ---- */
  raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  mais: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  play: '<path d="m6 3 14 9-14 9V3Z"/>',
  pausa: '<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>',
  parar: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  editar:
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  lixeira:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alca:
    '<circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  copiar:
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  prancheta:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5"/><path d="M12 4v12"/>',
  arquivo:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
  conversa: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  duplicar:
    '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/>',

  /* ------------------------------------------------------- setas ------- */
  'seta-esquerda': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'seta-direita': '<path d="m12 5 7 7-7 7"/><path d="M5 12h14"/>',
  'chevron-esquerda': '<path d="m15 18-6-6 6-6"/>',
  'chevron-direita': '<path d="m9 18 6-6-6-6"/>',
  pular: '<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>',

  /* ------------------------------------------------------ estados ------ */
  alerta:
    '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  sucesso: '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  cadeado: '<rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  escudo:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/>',

  /* -------------------------------------------------- tempo e energia -- */
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ampulheta:
    '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  medidor: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  cafe: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2"/><path d="M10 2v2"/><path d="M14 2v2"/>',
  descanso: '<path d="M2 8v12"/><path d="M2 12h18a2 2 0 0 1 2 2v6"/><path d="M2 16h20"/><circle cx="7" cy="9" r="2"/>',
  folha: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
  gota: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5 12 2c-.5 3-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z"/>',
  pausado: '<circle cx="12" cy="12" r="9"/><path d="M10 15V9"/><path d="M14 15V9"/>',
  amanhecer:
    '<path d="M12 2v6"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m4.9 10.9 1.4 1.4"/><path d="m17.7 12.3 1.4-1.4"/><path d="M2 22h20"/>',
  entardecer:
    '<path d="M12 8V2"/><path d="m8 4 4 4 4-4"/><path d="M16 18a4 4 0 0 0-8 0"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m4.9 10.9 1.4 1.4"/><path d="m17.7 12.3 1.4-1.4"/><path d="M2 22h20"/>',
  'sol-nuvem':
    '<path d="M12 2v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="M20 12h2"/><path d="m19.1 4.9-1.4 1.4"/><path d="M15.9 12.6a4 4 0 0 0-5.9-4.1"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',

  /* ------------------------------------------------- categorias -------- */
  cerebro:
    '<path d="M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8 4 4 0 0 0 .5 6.6A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8 4 4 0 0 1-.5 6.6A4 4 0 1 1 12 18Z"/>',
  brilho:
    '<path d="m12 3-1.9 5.8L4 10.7l6.1 1.9L12 18.4l1.9-5.8L20 10.7l-6.1-1.9Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
  livro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  'livro-aberto': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/>',
  pasta:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  broto:
    '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8Z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2Z"/>',

  /* ----------------------------------------------------- diversos ------ */
  lista: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  celular: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M12 18h.01"/>',
  teclado:
    '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01"/><path d="M10 10h.01"/><path d="M14 10h.01"/><path d="M18 10h.01"/><path d="M7 14h10"/>',
  pino: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>'
}

/* Ícones que são silhuetas, não contornos. */
const PREENCHIDOS = new Set(['play', 'alca', 'pular'])

/** Nomes disponíveis — útil para depurar um `data-icone` digitado errado. */
export const NOMES = Object.keys(TRACOS)

/**
 * Devolve o markup SVG de um ícone.
 *
 * @param {string} nome chave em `TRACOS`
 * @param {object} [opcoes]
 * @param {number} [opcoes.tamanho] lado do quadrado, em pixels
 * @param {string} [opcoes.classe] classes extras no `<svg>`
 * @param {string} [opcoes.rotulo] quando presente, o ícone vira `img` acessível
 * @returns {string} SVG pronto para interpolar — string vazia se o nome não existir
 */
export function icone(nome, { tamanho = 20, classe = '', rotulo = '' } = {}) {
  const tracos = TRACOS[nome]
  if (!tracos) return ''

  const preenchido = PREENCHIDOS.has(nome)
  const acessibilidade = rotulo
    ? `role="img" aria-label="${rotulo.replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"'

  const classes = `icone${classe ? ` ${classe}` : ''}`

  return (
    `<svg class="${classes}" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" ` +
    `fill="${preenchido ? 'currentColor' : 'none'}" stroke="${preenchido ? 'none' : 'currentColor'}" ` +
    `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${acessibilidade}>${tracos}</svg>`
  )
}

/**
 * Preenche os marcadores `data-icone` do HTML estático.
 *
 * Uso: `<span data-icone="raio" data-tamanho="18"></span>`. Rodar de novo é
 * seguro — quem já foi preenchido é ignorado.
 *
 * @param {ParentNode} [raiz] onde procurar
 */
export function aplicarIcones(raiz = document) {
  raiz.querySelectorAll('[data-icone]').forEach(alvo => {
    if (alvo.firstElementChild?.tagName === 'svg') return
    const tamanho = Number(alvo.dataset.tamanho) || 20
    const svg = icone(alvo.dataset.icone, { tamanho })
    if (svg) alvo.innerHTML = svg
  })
}
