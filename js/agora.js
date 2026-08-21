/**
 * Painel "Agora": mostra em tempo real qual bloco da agenda está acontecendo,
 * quanto falta para ele terminar e o que vem em seguida.
 *
 * É o elo entre o plano e a execução — sem ele o usuário precisa ficar
 * conferindo o relógio contra a lista.
 */

import { escaparHTML } from './componentes.js'
import { icone } from './icones.js'
import { formatarHora, formatarDuracao, MINUTOS_DIA } from './algoritmo.js'

const INTERVALO = 15000

let temporizador = null
let contexto = { obterAgenda: () => null, aoFocar: () => {} }

function minutosAgora() {
  const agora = new Date()
  return agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60
}

/** Considera turnos que cruzam a meia-noite deslocando o relógio em 24h. */
function relogioNaJanela(eventos) {
  const minutos = minutosAgora()
  const ultimo = eventos[eventos.length - 1]
  if (ultimo && ultimo.fimMinutos > MINUTOS_DIA && minutos < eventos[0].inicioMinutos) {
    return minutos + MINUTOS_DIA
  }
  return minutos
}

function montarConteudo(agenda) {
  const eventos = (agenda?.eventos || [])
    .filter(e => e.tipo !== 'nao-agendada')
    .sort((a, b) => a.inicioMinutos - b.inicioMinutos)

  if (!eventos.length) return null

  const relogio = relogioNaJanela(eventos)
  const atual = eventos.find(e => relogio >= e.inicioMinutos && relogio < e.fimMinutos)
  const proximo = eventos.find(e => e.inicioMinutos > relogio)

  if (atual) {
    const decorrido = relogio - atual.inicioMinutos
    const progresso = Math.min(100, (decorrido / atual.duracao) * 100)
    const restante = Math.max(0, Math.ceil(atual.fimMinutos - relogio))
    const ehTarefa = atual.tipo === 'tarefa'

    return {
      estado: ehTarefa ? 'tarefa' : 'pausa',
      html: `
        <div class="agora__topo">
          <span class="agora__selo">
            ${icone(ehTarefa ? 'alvo' : atual.simbolo || 'cafe', { tamanho: 14 })} Agora
          </span>
          <span class="agora__relogio">${formatarHora(atual.inicioMinutos)} → ${formatarHora(atual.fimMinutos)}</span>
        </div>
        <h3 class="agora__titulo">${escaparHTML(atual.titulo)}</h3>
        <div class="agora__barra" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          aria-valuenow="${Math.round(progresso)}" aria-label="Progresso do bloco atual">
          <span style="width:${progresso}%"></span>
        </div>
        <p class="agora__legenda">
          Faltam <strong>${formatarDuracao(restante)}</strong>
          ${proximo ? `· depois: ${escaparHTML(proximo.titulo)}` : '· último bloco do dia'}
        </p>
        ${
          ehTarefa
            ? `<button type="button" class="botao botao--secundario botao--pequeno" data-focar-agora
                 data-titulo="${escaparHTML(atual.titulo)}" data-minutos="${restante}"
                 data-tarefa="${atual.id ?? ''}">${icone('play', { tamanho: 14 })} Focar nos ${restante} min restantes</button>`
            : ''
        }`
    }
  }

  if (proximo) {
    const faltam = Math.max(0, Math.ceil(proximo.inicioMinutos - relogio))
    return {
      estado: 'aguardando',
      html: `
        <div class="agora__topo">
          <span class="agora__selo">${icone('pular', { tamanho: 14 })} A seguir</span>
          <span class="agora__relogio">${formatarHora(proximo.inicioMinutos)}</span>
        </div>
        <h3 class="agora__titulo">${escaparHTML(proximo.titulo)}</h3>
        <p class="agora__legenda">Começa em <strong>${formatarDuracao(faltam)}</strong>. Aproveite a folga até lá.</p>`
    }
  }

  const fim = eventos[eventos.length - 1].fimMinutos
  return {
    estado: 'concluido',
    html: `
      <div class="agora__topo">
        <span class="agora__selo">${icone('sol-nuvem', { tamanho: 14 })} Dia planejado concluído</span>
      </div>
      <h3 class="agora__titulo">Tempo livre desde ${formatarHora(fim)}</h3>
      <p class="agora__legenda">Tudo o que estava agendado já passou. O resto do dia é seu.</p>`
  }
}

export function atualizar() {
  const painel = document.getElementById('painel-agora')
  if (!painel) return

  const conteudo = montarConteudo(contexto.obterAgenda())
  if (!conteudo) {
    painel.hidden = true
    painel.innerHTML = ''
    return
  }

  const mudou = painel.dataset.estado !== conteudo.estado
  painel.hidden = false
  painel.dataset.estado = conteudo.estado
  painel.innerHTML = conteudo.html
  if (mudou) painel.classList.add('agora--novo')
  painel.addEventListener('animationend', () => painel.classList.remove('agora--novo'), { once: true })
}

export function iniciarMonitor(opcoes = {}) {
  contexto = { ...contexto, ...opcoes }
  pararMonitor()

  const painel = document.getElementById('painel-agora')
  painel?.addEventListener('click', evento => {
    const botao = evento.target.closest('[data-focar-agora]')
    if (!botao) return
    contexto.aoFocar?.({
      titulo: botao.dataset.titulo,
      minutos: Number(botao.dataset.minutos),
      tarefa: botao.dataset.tarefa
    })
  })

  atualizar()
  temporizador = setInterval(atualizar, INTERVALO)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizar()
  })
}

export function pararMonitor() {
  clearInterval(temporizador)
  temporizador = null
}
