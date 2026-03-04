export let listaTarefas = []

export function adicionar(nome, peso, tempo) {
  listaTarefas.push({ nome, peso, tempo, id: Date.now() })
}

export function excluir(id) {
  listaTarefas = listaTarefas.filter(t => t.id !== id)
}

export function ordenarPorPeso() {
  return [...listaTarefas].sort((a, b) => b.peso - a.peso)
}
