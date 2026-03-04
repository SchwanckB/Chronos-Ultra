import { obterEnergia } from './algoritmo.js'

let graficoInstancia = null

export function atualizarSaudacao(nome) {
  document.getElementById('saudacao-nome').innerText = `Olá, ${nome}!`
}

export function atualizarEstatisticasBio(focoMaximo) {
  document.getElementById('caixa-estatisticas-bio').innerHTML =
    `🧬 Foco Ideal: <b>${focoMaximo} min</b>`
}

export function atualizarListaNaTela(listaTarefas, excluirCallback) {
  const divLista = document.getElementById('lista-de-tarefas')
  if (listaTarefas.length === 0) {
    divLista.innerHTML = ''
    return
  }

  divLista.innerHTML = listaTarefas
    .map(
      t => `
            <div class="item-tarefa">
                <strong class="nome-tarefa">${t.nome}</strong>
                <span class="item-tarefa-detalhes">Peso: ${t.peso} | ${t.tempo} min</span>
                <button class="botao-excluir" data-id="${t.id}">🗑️</button>
            </div>
        `
    )
    .join('')

  // anexar listeners do botão de excluir
  divLista.querySelectorAll('.botao-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'))
      excluirCallback(id)
    })
  })
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

export function mostrarResultado(html) {
  const containerLista = document.getElementById('resultado-otimizacao')
  containerLista.innerHTML = html
}

export function limparInterface() {
  document.getElementById('lista-de-tarefas').innerHTML = ''
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
