/**
 * Gráficos do painel (Chart.js carregado via CDN).
 *
 * Todas as cores vêm das variáveis CSS, então os gráficos acompanham o tema
 * claro/escuro sem duplicar a paleta em JavaScript.
 */

import { obterEnergia, formatarDuracao } from './algoritmo.js'

let graficoEnergia = null
let graficoTempo = null
let graficoSemana = null
let graficoCategorias = null

const ANIMACAO = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? false
    : { duration: 750, easing: 'easeOutQuart' }

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
  const primaria = cor('--cor-primaria', '#14b8a6')
  const texto = cor('--cor-texto-suave', '#8badb9')
  const grade = cor('--cor-grade', 'rgba(94,234,212,0.14)')

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
      animation: ANIMACAO(),
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
    { rotulo: 'Trabalho', valor: stats.trabalhados, cor: cor('--cor-primaria', '#14b8a6') },
    { rotulo: 'Pausas', valor: stats.minutosPausa, cor: cor('--cor-aviso', '#f59e0b') },
    { rotulo: 'Compromissos', valor: stats.minutosInterrupcao, cor: cor('--cor-secundaria', '#06b6d4') },
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
          backgroundColor: vazio ? [cor('--cor-borda', '#1e3a52')] : dados.map(d => d.cor),
          borderWidth: 0,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: ANIMACAO() && { ...ANIMACAO(), animateRotate: true },
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: cor('--cor-texto-suave', '#8badb9'),
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

/**
 * Barras com o tempo livre preservado nos últimos 7 dias.
 * @param {object} agendas mapa `AAAA-MM-DD → { stats }`
 */
export function renderizarSemana(agendas = {}) {
  const canvas = document.getElementById('grafico-semana')
  const vazio = document.getElementById('semana-vazia')
  if (!canvas || !temChart()) return

  const dias = Array.from({ length: 7 }, (_, i) => {
    const data = new Date()
    data.setHours(0, 0, 0, 0)
    data.setDate(data.getDate() - (6 - i))
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
    const stats = agendas[chave]?.stats
    return {
      rotulo: data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      data: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      livre: stats?.minutosLivres || 0,
      trabalho: stats?.trabalhados || 0,
      hoje: i === 6
    }
  })

  const temDados = dias.some(d => d.trabalho > 0)
  if (vazio) vazio.hidden = temDados
  canvas.parentElement.hidden = !temDados
  if (!temDados) {
    graficoSemana = destruir(graficoSemana)
    return
  }

  const primaria = cor('--cor-primaria', '#14b8a6')
  const sucesso = cor('--cor-sucesso', '#10b981')
  const texto = cor('--cor-texto-suave', '#8badb9')

  graficoSemana = destruir(graficoSemana)
  graficoSemana = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: dias.map(d => d.rotulo),
      datasets: [
        {
          label: 'Trabalho',
          data: dias.map(d => d.trabalho),
          backgroundColor: dias.map(d => transparente(primaria, d.hoje ? 0.95 : 0.55)),
          borderRadius: 6,
          borderSkipped: false,
          stack: 'dia'
        },
        {
          label: 'Tempo livre',
          data: dias.map(d => d.livre),
          backgroundColor: dias.map(d => transparente(sucesso, d.hoje ? 0.95 : 0.5)),
          borderRadius: 6,
          borderSkipped: false,
          stack: 'dia'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: ANIMACAO(),
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: texto, font: { size: 10 } }
        },
        y: { stacked: true, display: false, beginAtZero: true }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: texto,
            boxWidth: 9,
            boxHeight: 9,
            usePointStyle: true,
            padding: 12,
            font: { size: 10 }
          }
        },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: itens => dias[itens[0].dataIndex].data,
            label: item => `${item.dataset.label}: ${formatarDuracao(item.parsed.y)}`
          }
        }
      }
    }
  })
}

/**
 * Barras horizontais com os minutos pendentes por categoria de tarefa.
 * Mostra onde o tempo do inventário está concentrado antes de agendar.
 *
 * @param {Array} tarefas inventário atual
 * @param {Array} categorias lista de categorias (`tarefas.CATEGORIAS`)
 */
export function renderizarCategorias(tarefas = [], categorias = []) {
  const canvas = document.getElementById('grafico-categorias')
  const vazio = document.getElementById('categorias-vazia')
  if (!canvas || !temChart()) return

  const pendentes = tarefas.filter(t => !t.concluida)
  const dados = categorias
    .map(categoria => ({
      rotulo: categoria.rotulo,
      minutos: pendentes
        .filter(t => t.categoria === categoria.id)
        .reduce((soma, t) => soma + (t.tempo || 0), 0)
    }))
    .filter(item => item.minutos > 0)
    .sort((a, b) => b.minutos - a.minutos)

  if (vazio) vazio.hidden = dados.length > 0
  canvas.parentElement.hidden = dados.length === 0
  if (!dados.length) {
    graficoCategorias = destruir(graficoCategorias)
    return
  }

  const primaria = cor('--cor-primaria', '#14b8a6')
  const secundaria = cor('--cor-secundaria', '#06b6d4')
  const texto = cor('--cor-texto-suave', '#8badb9')
  const grade = cor('--cor-grade', 'rgba(94,234,212,0.14)')

  // degradê da marca distribuído entre as barras, da mais longa para a menor
  const mistura = (indice, total) => {
    const proporcao = total > 1 ? indice / (total - 1) : 0
    return proporcao < 0.5
      ? transparente(primaria, 0.9 - proporcao * 0.3)
      : transparente(secundaria, 0.9 - (proporcao - 0.5) * 0.3)
  }

  graficoCategorias = destruir(graficoCategorias)
  graficoCategorias = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: dados.map(d => d.rotulo),
      datasets: [
        {
          label: 'Minutos',
          data: dados.map(d => d.minutos),
          backgroundColor: dados.map((_, i) => mistura(i, dados.length)),
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 'flex',
          maxBarThickness: 22
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: ANIMACAO(),
      scales: {
        x: {
          grid: { color: grade },
          border: { display: false },
          ticks: { color: texto, font: { size: 10 }, callback: valor => `${valor}m` }
        },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: texto, font: { size: 11 } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: { label: item => formatarDuracao(item.parsed.x) }
        }
      }
    }
  })
}

export function atualizarTemaGraficos(perfil, janela, eventos, stats, agendas, tarefas, categorias) {
  renderizarEnergia(perfil, janela, eventos)
  if (stats) renderizarDistribuicao(stats)
  if (agendas) renderizarSemana(agendas)
  if (tarefas && categorias) renderizarCategorias(tarefas, categorias)
}
