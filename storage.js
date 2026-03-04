// lida com persistência em localStorage
export function gerarChave(nome) {
  return `chronos-${nome.toLowerCase().replace(/\s+/g, '-')}`
}

export function salvarDadosUsuario(
  nome,
  listaTarefas,
  dadosUsuario,
  configuracoes
) {
  if (!nome) return
  const chave = gerarChave(nome)
  const dados = { listaTarefas, dadosUsuario, configuracoes }
  localStorage.setItem(chave, JSON.stringify(dados))
}

export function carregarDadosUsuario(nome) {
  const chave = gerarChave(nome)
  const dadosSalvos = localStorage.getItem(chave)
  if (dadosSalvos) {
    return JSON.parse(dadosSalvos)
  }
  return null
}
