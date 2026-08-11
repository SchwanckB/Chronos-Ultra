/**
 * Modelo de tarefas do inventário.
 *
 * A lista é mantida por referência (`listaTarefas`) para que os módulos que a
 * importam sempre enxerguem o estado atual, sem precisar de eventos.
 */

export const CATEGORIAS = [
  { id: 'foco', rotulo: 'Foco profundo', icone: '🧠', exigencia: 1 },
  { id: 'criativa', rotulo: 'Criativa', icone: '🎨', exigencia: 0.85 },
  { id: 'estudo', rotulo: 'Estudo', icone: '📚', exigencia: 0.9 },
  { id: 'admin', rotulo: 'Administrativa', icone: '🗂️', exigencia: 0.5 },
  { id: 'rotina', rotulo: 'Rotina', icone: '🔁', exigencia: 0.35 },
  { id: 'pessoal', rotulo: 'Pessoal', icone: '🌱', exigencia: 0.45 }
]

const CATEGORIA_PADRAO = 'foco'

export function obterCategoria(id) {
  return CATEGORIAS.find(c => c.id === id) || CATEGORIAS[0]
}

export let listaTarefas = []

let contador = 0

function novoId() {
  contador += 1
  return `t${Date.now().toString(36)}${contador.toString(36)}`
}

function limitar(valor, minimo, maximo, padrao) {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return padrao
  return Math.min(Math.max(numero, minimo), maximo)
}

/** Garante que qualquer objeto vindo do storage tenha todos os campos. */
export function normalizar(tarefa = {}) {
  return {
    id: tarefa.id != null ? String(tarefa.id) : novoId(),
    nome: String(tarefa.nome || 'Tarefa sem nome').trim().slice(0, 120),
    peso: limitar(tarefa.peso, 1, 10, 5),
    tempo: Math.round(limitar(tarefa.tempo, 1, 1440, 30)),
    categoria: obterCategoria(tarefa.categoria).id,
    prazo: tarefa.prazo || null,
    concluida: Boolean(tarefa.concluida),
    criadaEm: tarefa.criadaEm || new Date().toISOString(),
    concluidaEm: tarefa.concluidaEm || null
  }
}

export function definirLista(nova = []) {
  const normalizadas = (Array.isArray(nova) ? nova : []).map(normalizar)
  listaTarefas.splice(0, listaTarefas.length, ...normalizadas)
  return listaTarefas
}

export function adicionar(dados) {
  const tarefa = normalizar({ ...dados, id: undefined, categoria: dados.categoria || CATEGORIA_PADRAO })
  listaTarefas.push(tarefa)
  return tarefa
}

export function obter(id) {
  return listaTarefas.find(t => t.id === id) || null
}

/** Remove e devolve `{ tarefa, indice }` para permitir desfazer a ação. */
export function excluir(id) {
  const indice = listaTarefas.findIndex(t => t.id === id)
  if (indice === -1) return null
  const [tarefa] = listaTarefas.splice(indice, 1)
  return { tarefa, indice }
}

export function reinserir(tarefa, indice = listaTarefas.length) {
  if (!tarefa) return
  listaTarefas.splice(Math.max(0, Math.min(indice, listaTarefas.length)), 0, normalizar(tarefa))
}

export function toggleConcluida(id) {
  const indice = listaTarefas.findIndex(t => t.id === id)
  if (indice === -1) return null
  const atual = listaTarefas[indice]
  const concluida = !atual.concluida
  listaTarefas[indice] = {
    ...atual,
    concluida,
    concluidaEm: concluida ? new Date().toISOString() : null
  }
  return listaTarefas[indice]
}

export function editar(id, novosDados = {}) {
  const indice = listaTarefas.findIndex(t => t.id === id)
  if (indice === -1) return null
  listaTarefas[indice] = normalizar({ ...listaTarefas[indice], ...novosDados, id })
  return listaTarefas[indice]
}

export function filtrarAtivas() {
  return listaTarefas.filter(t => !t.concluida)
}

export function ordenarPorPeso() {
  return [...listaTarefas].sort((a, b) => b.peso - a.peso)
}

/**
 * Move uma tarefa para a posição de outra (reordenação por arraste).
 * A ordem manual vira o critério de desempate natural do agendador, já que a
 * fila é percorrida nesta sequência.
 */
export function mover(idOrigem, idDestino) {
  const origem = listaTarefas.findIndex(t => t.id === idOrigem)
  const destino = listaTarefas.findIndex(t => t.id === idDestino)
  if (origem === -1 || destino === -1 || origem === destino) return false
  const [movida] = listaTarefas.splice(origem, 1)
  listaTarefas.splice(destino, 0, movida)
  return true
}

export function limparConcluidas() {
  const removidas = listaTarefas.filter(t => t.concluida)
  definirLista(listaTarefas.filter(t => !t.concluida))
  return removidas
}

export function limparTodas() {
  const removidas = [...listaTarefas]
  listaTarefas.length = 0
  return removidas
}

export function estatisticas() {
  const ativas = filtrarAtivas()
  return {
    total: listaTarefas.length,
    ativas: ativas.length,
    concluidas: listaTarefas.length - ativas.length,
    minutosAtivos: ativas.reduce((soma, t) => soma + t.tempo, 0),
    minutosTotais: listaTarefas.reduce((soma, t) => soma + t.tempo, 0)
  }
}

/**
 * Sugere peso/tempo/categoria a partir de tarefas parecidas já registradas.
 * Considera o inventário atual e o histórico persistido do perfil, dando mais
 * relevância a correspondências exatas de nome.
 *
 * @param {string} nome texto digitado pelo usuário
 * @param {Array} historico entradas anteriores salvas no perfil
 */
export function obterSugestaoPorNome(nome, historico = []) {
  const chave = (nome || '').trim().toLowerCase()
  if (chave.length < 3) return null

  const universo = [...listaTarefas, ...historico].filter(t => t && t.nome)
  const exatas = universo.filter(t => t.nome.trim().toLowerCase() === chave)
  const parciais = universo.filter(t => {
    const alvo = t.nome.toLowerCase()
    return alvo !== chave && (alvo.includes(chave) || chave.includes(alvo))
  })

  const base = exatas.length ? exatas : parciais
  if (!base.length) return null

  const media = campo =>
    base.reduce((soma, t) => soma + (Number(t[campo]) || 0), 0) / base.length

  const categorias = base.reduce((mapa, t) => {
    const id = obterCategoria(t.categoria).id
    mapa[id] = (mapa[id] || 0) + 1
    return mapa
  }, {})
  const categoria = Object.keys(categorias).sort(
    (a, b) => categorias[b] - categorias[a]
  )[0]

  return {
    peso: Math.round(media('peso') * 10) / 10,
    tempo: Math.max(1, Math.round(media('tempo') / 5) * 5),
    categoria,
    amostras: base.length,
    exata: exatas.length > 0
  }
}

/** Constrói o histórico a ser persistido (últimas 60 tarefas distintas). */
export function montarHistorico(historicoAtual = []) {
  const mapa = new Map()
  ;[...listaTarefas, ...historicoAtual].forEach(t => {
    if (!t || !t.nome) return
    const chave = t.nome.trim().toLowerCase()
    if (!chave || mapa.has(chave)) return
    mapa.set(chave, {
      nome: t.nome,
      peso: t.peso,
      tempo: t.tempo,
      categoria: obterCategoria(t.categoria).id
    })
  })
  return Array.from(mapa.values()).slice(0, 60)
}
