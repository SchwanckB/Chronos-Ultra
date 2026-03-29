export function obterEnergia(hora, compensacao) {
  return Math.sin(((hora - compensacao) * Math.PI) / 12) * 40 + 60
}

export function formatarHoraTrabalho(minutosTotais) {
  let h = Math.floor(minutosTotais / 60) % 24
  if (h < 0) h += 24
  let m = Math.floor(minutosTotais % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export function gerarAgendaHTML(
  tarefasOrdenadas,
  limiteMinutos,
  inicioMinutos,
  compensacao
) {
  let tempoTotalGasto = 0
  let htmlGerado = `<div class="agenda-container">`

  // cópia para manipular tempos restantes
  let fila = tarefasOrdenadas.map(t => ({ ...t }))
  let horaAtual = inicioMinutos

  while (tempoTotalGasto < limiteMinutos && fila.length > 0) {
    // escolhe a tarefa com maior "score" = peso/tempo
    fila.sort((a, b) => b.peso / b.tempo - a.peso / a.tempo)
    const t = fila[0]
    if (!t) break

    let tempoRestanteNoDia = limiteMinutos - tempoTotalGasto
    if (tempoRestanteNoDia <= 0) break

    let tempoDaTarefaOriginal = t.tempo
    let tempoExecutadoDestaTarefa = 0

    while (tempoDaTarefaOriginal > 0 && tempoTotalGasto < limiteMinutos) {
      let blocoTrabalho =
        tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal
      if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
        blocoTrabalho = limiteMinutos - tempoTotalGasto
      }
      if (blocoTrabalho <= 0) break

      let horaInicioStr = formatarHoraTrabalho(horaAtual)
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

      if (tempoDaTarefaOriginal > 0 && tempoTotalGasto + 10 <= limiteMinutos) {
        let horaPausaMeio = formatarHoraTrabalho(horaAtual)
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

    // após processar a tarefa, atualiza seu tempo restante
    t.tempo = tempoDaTarefaOriginal
    if (t.tempo <= 0) {
      fila.shift()
    }

    // pausa de conclusão quando houver margem
    if (tempoTotalGasto + 15 <= limiteMinutos) {
      let horaPausaFim = formatarHoraTrabalho(horaAtual)
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

  // se sobrou tarefa não agendada, as exibimos como não priorizadas
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

export function gerarMensagemWhatsApp(
  tarefasOrdenadas,
  limiteMinutos,
  inicioMinutos,
  compensacao,
  nome
) {
  let tempoTotalGasto = 0
  let mensagem = `🕒 Minha Agenda Otimizada - ${nome}\n\n`

  let fila = tarefasOrdenadas.map(t => ({ ...t }))
  let horaAtual = inicioMinutos

  while (tempoTotalGasto < limiteMinutos && fila.length > 0) {
    fila.sort((a, b) => b.peso / b.tempo - a.peso / a.tempo)
    const t = fila[0]
    if (!t) break

    let tempoRestanteNoDia = limiteMinutos - tempoTotalGasto
    if (tempoRestanteNoDia <= 0) break

    let tempoDaTarefaOriginal = t.tempo
    let tempoExecutadoDestaTarefa = 0

    while (tempoDaTarefaOriginal > 0 && tempoTotalGasto < limiteMinutos) {
      let blocoTrabalho =
        tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal
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

      if (tempoDaTarefaOriginal > 0 && tempoTotalGasto + 10 <= limiteMinutos) {
        let horaPausaMeio = formatarHoraTrabalho(horaAtual)
        mensagem += `${horaPausaMeio} - 💧 Pausa de Foco (10min)\n`
        tempoTotalGasto += 10
        horaAtual += 10
      }
    }

    t.tempo = tempoDaTarefaOriginal
    if (t.tempo <= 0) fila.shift()

    if (tempoTotalGasto + 15 <= limiteMinutos) {
      let horaPausaFim = formatarHoraTrabalho(horaAtual)
      mensagem += `${horaPausaFim} - ☕ Descanso de Conclusão (15min)\n`
      tempoTotalGasto += 15
      horaAtual += 15
    }
  }

  if (fila.length > 0) {
    mensagem += `\n⚠️ ${fila.length} tarefa(s) não caberam na agenda. Revise prioridades.`
  }

  mensagem += `\n\n📅 Gerado pelo Chronos-Ultra`
  return mensagem
}
