export function obterEnergia(hora, compensacao) {
  return Math.sin(((hora - compensacao) * Math.PI) / 12) * 40 + 60
}

export function formatarHoraTrabalho(minutosTotais) {
  let h = Math.floor(minutosTotais / 60) % 24
  if (h < 0) h += 24
  let m = Math.floor(minutosTotais % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function montarTimeline(inicioMinutos, fimMinutos, interrupcoesNormalizadas) {
  const timeline = []
  let cursor = inicioMinutos

  ;(interrupcoesNormalizadas || []).forEach(item => {
    if (item.inicioMinutos > cursor) {
      timeline.push({
        tipo: 'trabalho',
        inicioMinutos: cursor,
        fimMinutos: item.inicioMinutos
      })
    }
    timeline.push({
      tipo: 'interrupcao',
      inicioMinutos: item.inicioMinutos,
      fimMinutos: item.fimMinutos,
      descricao: item.descricao || 'Interrupção'
    })
    cursor = Math.max(cursor, item.fimMinutos)
  })

  if (cursor < fimMinutos) {
    timeline.push({
      tipo: 'trabalho',
      inicioMinutos: cursor,
      fimMinutos: fimMinutos
    })
  }
  return timeline
}

function gerarBlocoInterrupcaoHTML(interrupcao) {
  const texto = interrupcao.descricao || 'Interrupção'
  const horaInicio = formatarHoraTrabalho(interrupcao.inicioMinutos)
  const horaFim = formatarHoraTrabalho(interrupcao.fimMinutos)
  return `
      <div class="pausa-fim">
          <b class="texto-pausa-fim">⏸️ ${horaInicio} - ${horaFim} ${texto}</b><br>
          <small class="descricao-pausa-fim">Tempo bloqueado para interrupção.</small>
      </div>`
}

export function gerarAgendaHTML(
  tarefasOrdenadas,
  limiteMinutos,
  disponibilidade,
  compensacao
) {
  let tempoTotalGasto = 0
  let htmlGerado = `<div class="agenda-container">`

  const timeline = montarTimeline(
    disponibilidade.inicioMinutos,
    disponibilidade.fimMinutos,
    disponibilidade.interrupcoesNormalizadas
  )

  let fila = tarefasOrdenadas.map(t => ({ ...t }))
  let horaAtual = disponibilidade.inicioMinutos

  for (const bloco of timeline) {
    if (tempoTotalGasto >= limiteMinutos) break

    if (bloco.tipo === 'interrupcao') {
      htmlGerado += gerarBlocoInterrupcaoHTML(bloco)
      horaAtual = bloco.fimMinutos
      continue
    }

    horaAtual = Math.max(horaAtual, bloco.inicioMinutos)

    while (
      horaAtual < bloco.fimMinutos &&
      tempoTotalGasto < limiteMinutos &&
      fila.length > 0
    ) {
      fila.sort((a, b) => b.peso / b.tempo - a.peso / a.tempo)
      const t = fila[0]
      if (!t) break

      let tempoDaTarefaOriginal = t.tempo
      let tempoExecutadoDestaTarefa = 0
      const tempoNoBloco = bloco.fimMinutos - horaAtual

      while (
        tempoDaTarefaOriginal > 0 &&
        tempoTotalGasto < limiteMinutos &&
        horaAtual < bloco.fimMinutos
      ) {
        let blocoTrabalho =
          tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal
        const restanteBloco = bloco.fimMinutos - horaAtual
        if (blocoTrabalho > restanteBloco) blocoTrabalho = restanteBloco
        if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
          blocoTrabalho = limiteMinutos - tempoTotalGasto
        }
        if (blocoTrabalho <= 0) break

        const horaInicioStr = formatarHoraTrabalho(horaAtual)
        const energyBlock = obterEnergia(horaAtual / 60, compensacao)
        let energyClass = ''
        if (energyBlock < 40) energyClass = ' baixo-energia'
        else if (energyBlock > 70) energyClass = ' alto-energia'

        htmlGerado += `
                <div class="bloco-tarefa${energyClass}">
                    <div class="horario-tarefa">${horaInicioStr}</div>
                    <div class="detalhes-tarefa">
                        <div class="nome-tarefa">${t.nome} ${
                          tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''
                        }</div>
                        <div class="descricao-tarefa">Bloco de foco intenso: ${
                          blocoTrabalho
                        }min</div>
                    </div>
                </div>`

        tempoTotalGasto += blocoTrabalho
        tempoDaTarefaOriginal -= blocoTrabalho
        tempoExecutadoDestaTarefa += blocoTrabalho
        horaAtual += blocoTrabalho

        if (
          tempoDaTarefaOriginal > 0 &&
          tempoTotalGasto + 10 <= limiteMinutos &&
          horaAtual < bloco.fimMinutos
        ) {
          const horaPausaMeio = formatarHoraTrabalho(horaAtual)
          htmlGerado += `
                    <div class="pausa-meio">
                        <b class="texto-pausa-meio">💧 ${
                          horaPausaMeio
                        } Pausa de Foco (10 min)</b><br>
                        <small class="descricao-pausa-meio">Respiro estratégico para tarefas longas.</small>
                    </div>`

          tempoTotalGasto += 10
          horaAtual += 10
        }
      }

      t.tempo = tempoDaTarefaOriginal
      if (t.tempo <= 0) {
        fila.shift()
      }

      if (
        tempoTotalGasto + 15 <= limiteMinutos &&
        horaAtual < bloco.fimMinutos &&
        (t.tempo <= 0 || fila.length > 0)
      ) {
        const horaPausaFim = formatarHoraTrabalho(horaAtual)
        htmlGerado += `
                <div class="pausa-fim">
                    <b class="texto-pausa-fim">☕ ${
                      horaPausaFim
                    } Descanso de Conclusão (15 min)</b><br>
                    <small class="descricao-pausa-fim">Tarefa concluída. Recarregue para a próxima.</small>
                </div>`

        tempoTotalGasto += 15
        horaAtual += 15
      }
    }
  }

  if (fila.length > 0) {
    htmlGerado += `
          <div class="etiqueta-lazer">
              ⚠️ Tempo esgotado, ${fila.length} tarefa(s) não foram incluídas.
          </div>`
    fila.forEach(t => {
      htmlGerado += `
              <div class="bloco-tarefa tarefa-nao-priorizada">
                  <div class="horario-tarefa">--:--</div>
                  <div class="detalhes-tarefa">
                      <div class="nome-tarefa">${t.nome}</div>
                      <div class="descricao-tarefa">${t.tempo}min restantes</div>
                  </div>
              </div>`
    })
  }

  htmlGerado += `</div>`
  return {
    html: htmlGerado,
    stats: {
      utilizado: tempoTotalGasto,
      limite: limiteMinutos,
      naoAgendadas: fila.length
    }
  }
}

export function gerarAgendaDados(
  tarefasOrdenadas,
  limiteMinutos,
  disponibilidade,
  compensacao
) {
  const eventos = []
  let tempoTotalGasto = 0
  const timeline = montarTimeline(
    disponibilidade.inicioMinutos,
    disponibilidade.fimMinutos,
    disponibilidade.interrupcoesNormalizadas
  )
  const fila = tarefasOrdenadas.map(t => ({ ...t }))
  let horaAtual = disponibilidade.inicioMinutos

  for (const bloco of timeline) {
    if (tempoTotalGasto >= limiteMinutos) break

    if (bloco.tipo === 'interrupcao') {
      eventos.push({
        tipo: 'interrupcao',
        descricao: bloco.descricao || 'Interrupção',
        inicioMinutos: bloco.inicioMinutos,
        fimMinutos: bloco.fimMinutos
      })
      horaAtual = bloco.fimMinutos
      continue
    }

    horaAtual = Math.max(horaAtual, bloco.inicioMinutos)

    while (
      horaAtual < bloco.fimMinutos &&
      tempoTotalGasto < limiteMinutos &&
      fila.length > 0
    ) {
      fila.sort((a, b) => b.peso / b.tempo - a.peso / a.tempo)
      const tarefa = fila[0]
      if (!tarefa) break

      let tempoRestante = tarefa.tempo
      while (
        tempoRestante > 0 &&
        tempoTotalGasto < limiteMinutos &&
        horaAtual < bloco.fimMinutos
      ) {
        let blocoTrabalho = tempoRestante > 60 ? 50 : tempoRestante
        const restanteBloco = bloco.fimMinutos - horaAtual
        if (blocoTrabalho > restanteBloco) blocoTrabalho = restanteBloco
        if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
          blocoTrabalho = limiteMinutos - tempoTotalGasto
        }
        if (blocoTrabalho <= 0) break

        eventos.push({
          tipo: 'tarefa',
          nome: tarefa.nome,
          duracao: blocoTrabalho,
          inicioMinutos: horaAtual,
          fimMinutos: horaAtual + blocoTrabalho,
          peso: tarefa.peso
        })

        tempoTotalGasto += blocoTrabalho
        tempoRestante -= blocoTrabalho
        horaAtual += blocoTrabalho

        if (
          tempoRestante > 0 &&
          tempoTotalGasto + 10 <= limiteMinutos &&
          horaAtual < bloco.fimMinutos
        ) {
          eventos.push({
            tipo: 'interrupcao',
            descricao: 'Pausa de foco',
            inicioMinutos: horaAtual,
            fimMinutos: horaAtual + 10
          })
          tempoTotalGasto += 10
          horaAtual += 10
        }
      }

      tarefa.tempo = tempoRestante
      if (tarefa.tempo <= 0) fila.shift()

      if (
        tempoTotalGasto + 15 <= limiteMinutos &&
        horaAtual < bloco.fimMinutos &&
        (tarefa.tempo <= 0 || fila.length > 0)
      ) {
        eventos.push({
          tipo: 'interrupcao',
          descricao: 'Descanso de conclusão',
          inicioMinutos: horaAtual,
          fimMinutos: horaAtual + 15
        })
        tempoTotalGasto += 15
        horaAtual += 15
      }
    }
  }

  return {
    eventos,
    stats: {
      utilizado: tempoTotalGasto,
      limite: limiteMinutos,
      naoAgendadas: fila.filter(t => t.tempo > 0).length
    }
  }
}

export function gerarMensagemWhatsApp(
  tarefasOrdenadas,
  limiteMinutos,
  disponibilidade,
  compensacao,
  nome
) {
  let tempoTotalGasto = 0
  let mensagem = `🕒 Minha Agenda Otimizada - ${nome}\n\n`

  const timeline = montarTimeline(
    disponibilidade.inicioMinutos,
    disponibilidade.fimMinutos,
    disponibilidade.interrupcoesNormalizadas
  )

  let fila = tarefasOrdenadas.map(t => ({ ...t }))
  let horaAtual = disponibilidade.inicioMinutos

  for (const bloco of timeline) {
    if (tempoTotalGasto >= limiteMinutos) break

    if (bloco.tipo === 'interrupcao') {
      const inicioStr = formatarHoraTrabalho(bloco.inicioMinutos)
      const fimStr = formatarHoraTrabalho(bloco.fimMinutos)
      mensagem += `${inicioStr} a ${fimStr} - ⏸️ ${
        bloco.descricao || 'Interrupção'
      }\n`
      horaAtual = bloco.fimMinutos
      continue
    }

    horaAtual = Math.max(horaAtual, bloco.inicioMinutos)

    while (
      horaAtual < bloco.fimMinutos &&
      tempoTotalGasto < limiteMinutos &&
      fila.length > 0
    ) {
      fila.sort((a, b) => b.peso / b.tempo - a.peso / a.tempo)
      const t = fila[0]
      if (!t) break

      let tempoDaTarefaOriginal = t.tempo
      let tempoExecutadoDestaTarefa = 0

      while (
        tempoDaTarefaOriginal > 0 &&
        tempoTotalGasto < limiteMinutos &&
        horaAtual < bloco.fimMinutos
      ) {
        let blocoTrabalho =
          tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal
        const restanteBloco = bloco.fimMinutos - horaAtual
        if (blocoTrabalho > restanteBloco) blocoTrabalho = restanteBloco
        if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
          blocoTrabalho = limiteMinutos - tempoTotalGasto
        }
        if (blocoTrabalho <= 0) break

        let horaInicioStr = formatarHoraTrabalho(horaAtual)
        mensagem += `${horaInicioStr} - ${t.nome} ${
          tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''
        } (${blocoTrabalho}min)\n`

        tempoTotalGasto += blocoTrabalho
        tempoDaTarefaOriginal -= blocoTrabalho
        tempoExecutadoDestaTarefa += blocoTrabalho
        horaAtual += blocoTrabalho

        if (
          tempoDaTarefaOriginal > 0 &&
          tempoTotalGasto + 10 <= limiteMinutos &&
          horaAtual < bloco.fimMinutos
        ) {
          let horaPausaMeio = formatarHoraTrabalho(horaAtual)
          mensagem += `${horaPausaMeio} - 💧 Pausa de Foco (10min)\n`
          tempoTotalGasto += 10
          horaAtual += 10
        }
      }

      t.tempo = tempoDaTarefaOriginal
      if (t.tempo <= 0) fila.shift()

      if (
        tempoTotalGasto + 15 <= limiteMinutos &&
        horaAtual < bloco.fimMinutos &&
        (t.tempo <= 0 || fila.length > 0)
      ) {
        let horaPausaFim = formatarHoraTrabalho(horaAtual)
        mensagem += `${horaPausaFim} - ☕ Descanso de Conclusão (15min)\n`
        tempoTotalGasto += 15
        horaAtual += 15
      }
    }
  }

  if (fila.length > 0) {
    mensagem += `\n⚠️ ${fila.length} tarefa(s) não caberam na agenda. Revise prioridades.`
  }

  mensagem += `\n\n📅 Gerado pelo Chronos-Ultra`
  return mensagem
}
