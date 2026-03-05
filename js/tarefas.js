export let listaTarefas = []

// utilitário para substituir o conteúdo da lista (sem reatribuir nome do export)
export function definirLista(nova) {
  listaTarefas.splice(0, listaTarefas.length, ...nova)
}

// adiciona uma nova tarefa ao inventário
export function adicionar(nome, peso, tempo) {
  listaTarefas.push({ nome, peso, tempo, id: Date.now(), concluida: false })
}

// remove completamente a tarefa (usada pelos botões de excluir)
export function excluir(id) {
  const idx = listaTarefas.findIndex(t => t.id === id)
  if (idx !== -1) listaTarefas.splice(idx, 1)
}

// marca/desmarca a tarefa como concluída; não a remove para manter histórico
export function toggleConcluida(id) {
  const idx = listaTarefas.findIndex(t => t.id === id)
  if (idx !== -1) {
    listaTarefas[idx] = {
      ...listaTarefas[idx],
      concluida: !listaTarefas[idx].concluida
    }
  }
}

// altera os dados de uma tarefa existente
export function editar(id, novosDados) {
  const idx = listaTarefas.findIndex(t => t.id === id)
  if (idx !== -1) {
    listaTarefas[idx] = { ...listaTarefas[idx], ...novosDados }
  }
}

// retorna apenas as tarefas que não foram concluídas
export function filtrarAtivas() {
  return listaTarefas.filter(t => !t.concluida)
}

// cópia das tarefas ordenadas por peso (maior primeiro)
export function ordenarPorPeso() {
  return [...listaTarefas].sort((a, b) => b.peso - a.peso)
}

// remove todas as tarefas concluídas
export function limparConcluidas() {
  const restantes = listaTarefas.filter(t => !t.concluida)
  definirLista(restantes)
}

// esvazia o inventário completamente
export function limparTodas() {
  listaTarefas.length = 0
}
