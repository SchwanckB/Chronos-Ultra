export function obterEnergia(hora, compensacao) {
  return Math.sin(((hora - compensacao) * Math.PI) / 12) * 40 + 60
}

export function formatarHoraTrabalho(minutosTotais) {
  let h = Math.floor(minutosTotais / 60) % 24
  if (h < 0) h += 24
  let m = Math.floor(minutosTotais % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export function gerarAgendaHTML(tarefasOrdenadas, limiteMinutos, turno) {
  let horas, minutos
  if (turno === '3') {
    horas = 8
    minutos = 0
  } else if (turno === '9') {
    horas = 13
    minutos = 0
  } else if (turno === '15') {
    horas = 19
    minutos = 0
  } else {
    const agora = new Date()
    horas = agora.getHours()
    minutos = agora.getMinutes()
  }

  let tempoTotalGasto = 0
  let htmlGerado = `<div class="agenda-container">`

  tarefasOrdenadas.forEach(t => {
    let tempoRestanteNoDia = limiteMinutos - tempoTotalGasto
    if (tempoRestanteNoDia <= 0) return

    let tempoDaTarefaOriginal = t.tempo
    let tempoExecutadoDestaTarefa = 0

    // bloco de trabalho e pausas
    while (tempoDaTarefaOriginal > 0 && tempoTotalGasto < limiteMinutos) {
      let blocoTrabalho =
        tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal

      if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
        blocoTrabalho = limiteMinutos - tempoTotalGasto
      }
      if (blocoTrabalho <= 0) break

      let horaInicioStr = formatarHoraTrabalho(horas * 60 + minutos)

      htmlGerado += `
                <div class="bloco-tarefa">
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
      minutos += blocoTrabalho
      while (minutos >= 60) {
        minutos -= 60
        horas++
      }

      if (tempoDaTarefaOriginal > 0 && tempoTotalGasto + 10 <= limiteMinutos) {
        let horaPausaMeio = formatarHoraTrabalho(horas * 60 + minutos)
        htmlGerado += `
                    <div class="pausa-meio">
                        <b class="texto-pausa-meio">💧 ${
                          horaPausaMeio
                        } Pausa de Foco (10 min)</b><br>
                        <small class="descricao-pausa-meio">Respiro estratégico para tarefas longas.</small>
                    </div>`

        tempoTotalGasto += 10
        minutos += 10
        while (minutos >= 60) {
          minutos -= 60
          horas++
        }
      }
    }

    if (tempoTotalGasto + 15 <= limiteMinutos) {
      let horaPausaFim = formatarHoraTrabalho(horas * 60 + minutos)
      htmlGerado += `
                <div class="pausa-fim">
                    <b class="texto-pausa-fim">☕ ${
                      horaPausaFim
                    } Descanso de Conclusão (15 min)</b><br>
                    <small class="descricao-pausa-fim">Tarefa concluída. Recarregue para a próxima.</small>
                </div>`

      tempoTotalGasto += 15
      minutos += 15
      while (minutos >= 60) {
        minutos -= 60
        horas++
      }
    }
  })

  htmlGerado += `</div>`
  return htmlGerado
}

export function gerarMensagemWhatsApp(
  tarefasOrdenadas,
  limiteMinutos,
  turno,
  nome
) {
  let horas, minutos
  if (turno === '3') {
    horas = 8
    minutos = 0
  } else if (turno === '9') {
    horas = 13
    minutos = 0
  } else if (turno === '15') {
    horas = 19
    minutos = 0
  } else {
    const agora = new Date()
    horas = agora.getHours()
    minutos = agora.getMinutes()
  }

  let tempoTotalGasto = 0
  let mensagem = `🕒 Minha Agenda Otimizada - ${nome}\n\n`

  tarefasOrdenadas.forEach(t => {
    let tempoRestanteNoDia = limiteMinutos - tempoTotalGasto
    if (tempoRestanteNoDia <= 0) return

    let tempoDaTarefaOriginal = t.tempo
    let tempoExecutadoDestaTarefa = 0

    while (tempoDaTarefaOriginal > 0 && tempoTotalGasto < limiteMinutos) {
      let blocoTrabalho =
        tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal
      if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
        blocoTrabalho = limiteMinutos - tempoTotalGasto
      }
      if (blocoTrabalho <= 0) break

      let horaInicioStr = formatarHoraTrabalho(horas * 60 + minutos)
      mensagem += `${horaInicioStr} - ${t.nome} ${
        tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''
      } (${blocoTrabalho}min)\n`

      tempoTotalGasto += blocoTrabalho
      tempoDaTarefaOriginal -= blocoTrabalho
      tempoExecutadoDestaTarefa += blocoTrabalho
      minutos += blocoTrabalho
      while (minutos >= 60) {
        minutos -= 60
        horas++
      }

      if (tempoDaTarefaOriginal > 0 && tempoTotalGasto + 10 <= limiteMinutos) {
        let horaPausaMeio = formatarHoraTrabalho(horas * 60 + minutos)
        mensagem += `${horaPausaMeio} - 💧 Pausa de Foco (10min)\n`
        tempoTotalGasto += 10
        minutos += 10
        while (minutos >= 60) {
          minutos -= 60
          horas++
        }
      }
    }

    if (tempoTotalGasto + 15 <= limiteMinutos) {
      let horaPausaFim = formatarHoraTrabalho(horas * 60 + minutos)
      mensagem += `${horaPausaFim} - ☕ Descanso de Conclusão (15min)\n`
      tempoTotalGasto += 15
      minutos += 15
      while (minutos >= 60) {
        minutos -= 60
        horas++
      }
    }
  })

  mensagem += `\n📅 Gerado pelo Chronos-Ultra`
  return mensagem
}
