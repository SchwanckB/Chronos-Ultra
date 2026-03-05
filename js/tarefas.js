export let listaTarefas = []

// adiciona uma nova tarefa ao inventário
export function adicionar(nome, peso, tempo) {
  listaTarefas.push({ nome, peso, tempo, id: Date.now(), concluida: false })
}

// remove completamente a tarefa (usada pelos botões de excluir)
export function excluir(id) {
  listaTarefas = listaTarefas.filter(t => t.id !== id)
}

// marca/desmarca a tarefa como concluída; não a remove para manter histórico
export function toggleConcluida(id) {
  listaTarefas = listaTarefas.map(t =>
    t.id === id ? { ...t, concluida: !t.concluida } : t
  )
}

// altera os dados de uma tarefa existente
export function editar(id, novosDados) {
  listaTarefas = listaTarefas.map(t =>
    t.id === id ? { ...t, ...novosDados } : t
  )
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
  listaTarefas = listaTarefas.filter(t => !t.concluida)
}

// esvazia o inventário completamente
export function limparTodas() {
  listaTarefas = []
}
