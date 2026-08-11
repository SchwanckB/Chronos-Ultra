/**
 * Persistência local do Chronos Ultra.
 *
 * Guarda um documento por perfil em `chronos:perfil:<slug>` e mantém um índice
 * global de perfis para permitir troca rápida de usuário. Dados gravados por
 * versões antigas (`chronos-<slug>`) são migrados na primeira leitura.
 */

const VERSAO = 3
const PREFIXO = 'chronos:perfil:'
const CHAVE_INDICE = 'chronos:perfis'
const CHAVE_ULTIMO = 'chronos:ultimo-perfil'
const CHAVE_TEMA = 'chronos:tema'

export function gerarChave(nome) {
  return (nome || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function disponivel() {
  try {
    const teste = '__chronos__'
    localStorage.setItem(teste, '1')
    localStorage.removeItem(teste)
    return true
  } catch {
    return false
  }
}

const TEM_STORAGE = disponivel()
const memoria = new Map()

function ler(chave) {
  try {
    const bruto = TEM_STORAGE ? localStorage.getItem(chave) : memoria.get(chave)
    return bruto ? JSON.parse(bruto) : null
  } catch {
    return null
  }
}

function escrever(chave, valor) {
  const bruto = JSON.stringify(valor)
  try {
    if (TEM_STORAGE) localStorage.setItem(chave, bruto)
    else memoria.set(chave, bruto)
    return true
  } catch {
    // cota estourada ou modo privativo: mantém a sessão viva em memória
    memoria.set(chave, bruto)
    return false
  }
}

export function documentoVazio(nome = '') {
  return {
    versao: VERSAO,
    perfil: {
      nome,
      idade: 0,
      cronotipo: 'intermediario',
      focoMaximo: 50
    },
    configuracoes: {
      limiteHoras: 6,
      inicioDisponivel: '08:00',
      fimDisponivel: '18:00',
      interrupcoes: []
    },
    tarefas: [],
    agendas: {},
    historico: [],
    atualizadoEm: null
  }
}

/** Converte documentos das versões 1 e 2 para o formato atual. */
function migrar(dados, nome) {
  const base = documentoVazio(nome)
  if (!dados || typeof dados !== 'object') return base

  const perfilAntigo = dados.perfil || dados.dadosUsuario || {}
  const configAntiga = dados.configuracoes || {}

  return {
    ...base,
    perfil: {
      ...base.perfil,
      ...perfilAntigo,
      nome: perfilAntigo.nome || nome
    },
    configuracoes: {
      ...base.configuracoes,
      ...configAntiga,
      interrupcoes: Array.isArray(configAntiga.interrupcoes)
        ? configAntiga.interrupcoes
        : []
    },
    tarefas: Array.isArray(dados.tarefas)
      ? dados.tarefas
      : Array.isArray(dados.listaTarefas)
        ? dados.listaTarefas
        : [],
    agendas: dados.agendas && typeof dados.agendas === 'object' ? dados.agendas : {},
    historico: Array.isArray(dados.historico) ? dados.historico : [],
    atualizadoEm: dados.atualizadoEm || null
  }
}

export function listarPerfis() {
  const indice = ler(CHAVE_INDICE)
  return Array.isArray(indice) ? indice : []
}

function registrarNoIndice(nome) {
  const slug = gerarChave(nome)
  if (!slug) return
  const perfis = listarPerfis().filter(p => p.slug !== slug)
  perfis.unshift({ slug, nome, atualizadoEm: new Date().toISOString() })
  escrever(CHAVE_INDICE, perfis.slice(0, 12))
  escrever(CHAVE_ULTIMO, slug)
}

export function carregarDocumento(nome) {
  const slug = gerarChave(nome)
  if (!slug) return null

  const atual = ler(PREFIXO + slug)
  if (atual) return migrar(atual, nome)

  // formato legado: `chronos-<slug>`
  const legado = ler(`chronos-${slug}`)
  if (legado) {
    const migrado = migrar(legado, nome)
    escrever(PREFIXO + slug, migrado)
    return migrado
  }
  return null
}

export function salvarDocumento(nome, documento) {
  const slug = gerarChave(nome)
  if (!slug || !documento) return false
  const payload = {
    ...documento,
    versao: VERSAO,
    atualizadoEm: new Date().toISOString()
  }
  const ok = escrever(PREFIXO + slug, payload)
  registrarNoIndice(nome)
  return ok
}

export function removerPerfil(nome) {
  const slug = gerarChave(nome)
  if (!slug) return
  try {
    if (TEM_STORAGE) {
      localStorage.removeItem(PREFIXO + slug)
      localStorage.removeItem(`chronos-${slug}`)
    }
  } catch {
    /* ignora falhas de storage */
  }
  memoria.delete(PREFIXO + slug)
  escrever(
    CHAVE_INDICE,
    listarPerfis().filter(p => p.slug !== slug)
  )
  if (ler(CHAVE_ULTIMO) === slug) escrever(CHAVE_ULTIMO, null)
}

export function ultimoPerfil() {
  const slug = ler(CHAVE_ULTIMO)
  if (!slug) return null
  return listarPerfis().find(p => p.slug === slug) || null
}

export function lerTema() {
  return ler(CHAVE_TEMA)
}

export function salvarTema(tema) {
  escrever(CHAVE_TEMA, tema)
}
