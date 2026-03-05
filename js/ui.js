import { obterEnergia } from './algoritmo.js'

let graficoInstancia = null
let graficoLivreInstancia = null

export function atualizarSaudacao(nome) {
  document.getElementById('saudacao-nome').innerText = `Olá, ${nome}!`
}

export function atualizarEstatisticasBio(focoMaximo) {
  document.getElementById('caixa-estatisticas-bio').innerHTML =
    `🧬 Foco Ideal: <b>${focoMaximo} min</b>`
}

export function atualizarListaNaTela(listaTarefas, callbacks) {
  // callbacks: { excluir, editar, toggleConcluida }
  const divLista = document.getElementById('lista-de-tarefas')
  if (listaTarefas.length === 0) {
    divLista.innerHTML = ''
    atualizarResumoInventario(listaTarefas)
    return
  }
  // ao longo deste método também atualizamos o resumo

  divLista.innerHTML = listaTarefas
    .map(t => {
      const classes = ['item-tarefa']
      if (t.concluida) classes.push('tarefa-concluida')
      return `
            <div class="${classes.join(' ')}">
                <strong class="nome-tarefa">${t.nome}</strong>
                <span class="item-tarefa-detalhes">Peso: ${t.peso} | ${t.tempo} min</span>
                <div class="botoes-tarefa">
                    <button class="botao-concluir" data-id="${t.id}">${
                      t.concluida ? '↺' : '✅'
                    }</button>
                    <button class="botao-editar" data-id="${t.id}">✏️</button>
                    <button class="botao-excluir" data-id="${t.id}">🗑️</button>
                </div>
            </div>
        `
    })
    .join('')

  // anexar listeners dos botões
  divLista.querySelectorAll('.botao-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'))
      callbacks.excluir(id)
    })
  })
  divLista.querySelectorAll('.botao-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'))
      callbacks.editar(id)
    })
  })
  divLista.querySelectorAll('.botao-concluir').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'))
      callbacks.toggleConcluida(id)
    })
  })

  // atualiza resumo sempre que a lista muda
  atualizarResumoInventario(listaTarefas)
}

// mostra resumo de quantidade, minutos e concluídas
export function atualizarResumoInventario(lista) {
  const resumo = document.getElementById('resumo-inventario')
  if (!resumo) return
  const totalMinutos = lista.reduce((sum, t) => sum + t.tempo, 0)
  const concluidas = lista.filter(t => t.concluida).length
  resumo.innerText = `Total: ${lista.length} tarefa(s), ${totalMinutos} min${
    concluidas ? ` (${concluidas} concluída${concluidas > 1 ? 's' : ''})` : ''
  }`
}

export function renderizarGrafico(compensacao) {
  const horasDia = Array.from({ length: 24 }, (_, i) => i)
  const contexto = document.getElementById('grafico-energia').getContext('2d')

  if (graficoInstancia) graficoInstancia.destroy()

  graficoInstancia = new Chart(contexto, {
    type: 'line',
    data: {
      labels: horasDia.map(h => h.toString().padStart(2, '0') + 'h'),
      datasets: [
        {
          data: horasDia.map(h => obterEnergia(h, compensacao)),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, display: false },
        x: {
          grid: { display: false, color: '#334155' },
          ticks: { color: '#94a3b8', maxTicksLimit: 8 }
        }
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  })
}

export function renderizarGraficoLivre(utilizado, limite) {
  const ctx = document.getElementById('grafico-livre').getContext('2d')
  if (graficoLivreInstancia) graficoLivreInstancia.destroy()
  const livre = Math.max(0, limite - utilizado)
  graficoLivreInstancia = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ocupado', 'Livre'],
      datasets: [
        {
          data: [utilizado, livre],
          backgroundColor: ['#f87171', '#34d399'],
          hoverBackgroundColor: ['#f87171', '#34d399'],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', boxWidth: 12 }
        },
        tooltip: { enabled: true }
      }
    }
  })
}

export function mostrarResultado(html) {
  const containerLista = document.getElementById('resultado-otimizacao')
  containerLista.innerHTML = html
}

export function limparInterface() {
  document.getElementById('lista-de-tarefas').innerHTML = ''
  const resumoInv = document.getElementById('resumo-inventario')
  if (resumoInv) resumoInv.innerText = ''
  const resumoAgenda = document.getElementById('resumo-agenda')
  if (resumoAgenda) resumoAgenda.innerText = ''
  document.getElementById('resultado-otimizacao').innerHTML =
    '<p class="resultado-otimizacao-placeholder">Adicione tarefas acima e calcule sua agenda biológica.</p>'
  document.getElementById('nome-tarefa').value = ''
  document.getElementById('peso-tarefa').value = ''
  document.getElementById('tempo-tarefa').value = ''
}

export function transicionarParaTelaPrincipal() {
  document.getElementById('tela-boas-vindas').classList.remove('ativa')
  document.getElementById('tela-principal').classList.add('ativa')
}

export function transicionarParaTelaInicial() {
  document.getElementById('tela-principal').classList.remove('ativa')
  document.getElementById('tela-boas-vindas').classList.add('ativa')
}
