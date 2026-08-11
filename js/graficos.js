/**
 * Gráficos do painel (Chart.js carregado via CDN).
 *
 * Todas as cores vêm das variáveis CSS, então os gráficos acompanham o tema
 * claro/escuro sem duplicar a paleta em JavaScript.
 */

import { obterEnergia, formatarDuracao } from './algoritmo.js'

let graficoEnergia = null
let graficoTempo = null

const temChart = () => typeof window !== 'undefined' && typeof window.Chart !== 'undefined'

function cor(nome, alternativa) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim()
  return valor || alternativa
}

function transparente(hex, alpha) {
  const limpo = hex.replace('#', '')
  if (limpo.length !== 6) return hex
  const n = parseInt(limpo, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function destruir(instancia) {
  if (instancia) instancia.destroy()
  return null
}

/**
 * Curva de energia do dia. Destaca a janela de trabalho e marca os horários
 * em que existem tarefas agendadas.
 */
export function renderizarEnergia(perfil, janela = null, eventos = []) {
  const canvas = document.getElementById('grafico-energia')
  if (!canvas || !temChart()) return

  const passos = Array.from({ length: 49 }, (_, i) => i / 2) // 30 em 30 minutos
  const primaria = cor('--cor-primaria', '#6366f1')
  const texto = cor('--cor-texto-suave', '#94a3b8')
  const grade = cor('--cor-grade', 'rgba(148,163,184,0.16)')

  const dentroDaJanela = hora => {
    if (!janela) return true
    const minutos = hora * 60
    return (
      (minutos >= janela.inicioMinutos && minutos <= janela.fimMinutos) ||
      (minutos + 1440 >= janela.inicioMinutos && minutos + 1440 <= janela.fimMinutos)
    )
  }

  const ocupado = new Set(
    eventos
      .filter(e => e.tipo === 'tarefa')
      .flatMap(e => {
        const marcas = []
        for (let m = e.inicioMinutos; m < e.fimMinutos; m += 30) marcas.push(Math.round((m / 60) * 2) / 2 % 24)
        return marcas
      })
  )

  graficoEnergia = destruir(graficoEnergia)
  graficoEnergia = new window.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: passos.map(h => (Number.isInteger(h) ? `${String(h).padStart(2, '0')}h` : '')),
      datasets: [
        {
          label: 'Energia',
          data: passos.map(h => obterEnergia(h, perfil)),
          borderColor: primaria,
          backgroundColor: transparente(primaria, 0.18),
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: passos.map(h => (ocupado.has(h % 24) ? 4 : 0)),
          pointBackgroundColor: cor('--cor-sucesso', '#10b981'),
          pointBorderColor: 'transparent',
          segment: {
            borderColor: ctx => (dentroDaJanela(passos[ctx.p0DataIndex]) ? primaria : transparente(primaria, 0.28))
          }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        y: { min: 0, max: 100, display: false },
        x: {
          grid: { display: false, color: grade },
          ticks: { color: texto, maxRotation: 0, autoSkip: false, font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: itens => `${String(passos[itens[0].dataIndex]).replace('.5', ':30').padStart(2, '0')}h`,
            label: item => `Energia estimada: ${item.parsed.y}%`
          }
        }
      }
    }
  })
}

/** Rosca com a divisão do dia entre trabalho, pausas, compromissos e tempo livre. */
export function renderizarDistribuicao(stats) {
  const canvas = document.getElementById('grafico-tempo')
  if (!canvas || !temChart()) return

  const dados = [
    { rotulo: 'Trabalho', valor: stats.trabalhados, cor: cor('--cor-primaria', '#6366f1') },
    { rotulo: 'Pausas', valor: stats.minutosPausa, cor: cor('--cor-aviso', '#f59e0b') },
    { rotulo: 'Compromissos', valor: stats.minutosInterrupcao, cor: cor('--cor-secundaria', '#ec4899') },
    { rotulo: 'Tempo livre', valor: stats.minutosLivres, cor: cor('--cor-sucesso', '#10b981') }
  ].filter(item => item.valor > 0)

  const vazio = dados.length === 0
  graficoTempo = destruir(graficoTempo)
  graficoTempo = new window.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: vazio ? ['Sem dados'] : dados.map(d => d.rotulo),
      datasets: [
        {
          data: vazio ? [1] : dados.map(d => d.valor),
          backgroundColor: vazio ? [cor('--cor-borda', '#334155')] : dados.map(d => d.cor),
          borderWidth: 0,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: cor('--cor-texto-suave', '#94a3b8'),
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            padding: 14,
            font: { size: 11 }
          }
        },
        tooltip: {
          enabled: !vazio,
          displayColors: false,
          callbacks: { label: item => `${item.label}: ${formatarDuracao(item.parsed)}` }
        }
      }
    }
  })
}

export function atualizarTemaGraficos(perfil, janela, eventos, stats) {
  renderizarEnergia(perfil, janela, eventos)
  if (stats) renderizarDistribuicao(stats)
}
