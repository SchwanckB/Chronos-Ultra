export function obterEnergia(hora, compensacao) {
  return Math.sin(((hora - compensacao) * Math.PI) / 12) * 40 + 60
}

export function formatarHoraTrabalho(minutosTotais) {
  let h = Math.floor(minutosTotais / 60) % 24
  if (h < 0) h += 24
  let m = Math.floor(minutosTotais % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// 🔹 SOLUÇÃO 1: Priorização inteligente com energia biológica
function calcularScoreTarefa(tarefa, horaAtual, compensacao) {
  // Score base: peso / tempo (quanto mais peso, maior prioridade; quanto menos tempo, maior urgência)
  const scoreBase = tarefa.peso / tarefa.tempo
  
  // Fator de energia: tarefas pesadas devem ir em horários de alta energia
  const energia = obterEnergia(horaAtual / 60, compensacao)
  const energiaMax = 100
  const fatorEnergia = (energia / energiaMax)
  
  // Score final: combina importância com otimização de energia
  // Tarefas peso-altos em energia-alta são super-priorizadas
  const scoreComEnergia = scoreBase * (0.7 + 0.3 * fatorEnergia)
  
  return scoreComEnergia
}

// 🔹 SOLUÇÃO 2 & 3: Calcular pausa adaptativa baseada em fadiga acumulada
function calcularPausaAdaptativa(tempoTrabalhoContinuo) {
  // Pausas proporcionais ao tempo contínuo de trabalho (estratégicas)
  if (tempoTrabalhoContinuo >= 240) {
    return { duracao: 30, tipo: 'Descanso Profundo' } // 4h+ → pausa longa
  }
  if (tempoTrabalhoContinuo >= 120) {
    return { duracao: 20, tipo: 'Descanso Recuperador' } // 2h+ → pausa média
  }
  if (tempoTrabalhoContinuo >= 60) {
    return { duracao: 15, tipo: 'Descanso Estratégico' } // 1h+ → pausa moderada
  }
  if (tempoTrabalhoContinuo >= 50) {
    return { duracao: 10, tipo: 'Pausa de Foco' } // 50min+ → pausa curta
  }
  return null // Sem pausa necessária
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

  let fila = tarefasOrdenadas.map(t => ({ ...t, tarefaAtual: null }))
  let horaAtual = disponibilidade.inicioMinutos
  let tempoTrabalhoContinuo = 0 // 🔹 SOLUÇÃO 3: Rastrear fadiga acumulada
  let tarefaAtualId = null // 🔹 SOLUÇÃO 4: Evitar fragmentação

  for (const bloco of timeline) {
    if (tempoTotalGasto >= limiteMinutos) break

    if (bloco.tipo === 'interrupcao') {
      htmlGerado += gerarBlocoInterrupcaoHTML(bloco)
      horaAtual = bloco.fimMinutos
      tempoTrabalhoContinuo = 0 // Reset contador de fadiga em interrupções
      tarefaAtualId = null // Reset tarefa atual
      continue
    }

    horaAtual = Math.max(horaAtual, bloco.inicioMinutos)

    while (
      horaAtual < bloco.fimMinutos &&
      tempoTotalGasto < limiteMinutos &&
      fila.length > 0
    ) {
      // 🔹 SOLUÇÃO 1: Usar score inteligente com energia para priorizar
      fila.sort((a, b) => {
        const scoreA = calcularScoreTarefa(a, horaAtual, compensacao)
        const scoreB = calcularScoreTarefa(b, horaAtual, compensacao)
        return scoreB - scoreA
      })

      const t = fila[0]
      if (!t) break

      // 🔹 SOLUÇÃO 4: Não fragmentar tarefas - se há tarefa em andamento, continua
      if (tarefaAtualId && tarefaAtualId !== t.id) {
        // Encontrar a tarefa em andamento e continuar com ela
        const tarefaEmAndamento = fila.find(tar => tar.id === tarefaAtualId)
        if (tarefaEmAndamento && tarefaEmAndamento.tempo > 0) {
          fila.sort((a, b) => (a.id === tarefaAtualId ? -1 : b.id === tarefaAtualId ? 1 : 0))
        }
      }

      const tarefaProcessada = fila[0]
      if (!tarefaProcessada) break

      // Atualizar ID de tarefa atual
      tarefaAtualId = tarefaProcessada.id

      let tempoDaTarefaOriginal = tarefaProcessada.tempo
      let tempoExecutadoDestaTarefa = 0

      while (
        tempoDaTarefaOriginal > 0 &&
        tempoTotalGasto < limiteMinutos &&
        horaAtual < bloco.fimMinutos
      ) {
        // 🔹 SOLUÇÃO 3: Verificar se precisa de pausa adaptativa
        const pausaNecessaria = calcularPausaAdaptativa(tempoTrabalhoContinuo)
        if (pausaNecessaria && tempoTotalGasto + pausaNecessaria.duracao <= limiteMinutos) {
          const horaPausa = formatarHoraTrabalho(horaAtual)
          htmlGerado += `
                    <div class="pausa-fim">
                        <b class="texto-pausa-fim">💪 ${horaPausa} ${pausaNecessaria.tipo} (${pausaNecessaria.duracao} min)</b><br>
                        <small class="descricao-pausa-fim">Recuperação proporcionada ao esforço realizado.</small>
                    </div>`
          tempoTotalGasto += pausaNecessaria.duracao
          horaAtual += pausaNecessaria.duracao
          tempoTrabalhoContinuo = 0 // Reset contador após pausa
          if (horaAtual >= bloco.fimMinutos) break
        }

        let blocoTrabalho = tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal
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
                        <div class="nome-tarefa">${tarefaProcessada.nome} ${
                          tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''
                        }</div>
                        <div class="descricao-tarefa">Bloco de foco intenso: ${blocoTrabalho}min</div>
                    </div>
                </div>`

        tempoTotalGasto += blocoTrabalho
        tempoDaTarefaOriginal -= blocoTrabalho
        tempoExecutadoDestaTarefa += blocoTrabalho
        horaAtual += blocoTrabalho
        tempoTrabalhoContinuo += blocoTrabalho // Acumular fadiga
      }

      tarefaProcessada.tempo = tempoDaTarefaOriginal
      if (tarefaProcessada.tempo <= 0) {
        fila.shift()
        tarefaAtualId = null // Tarefa terminada, liberar ID
      }

      if (
        tempoTotalGasto + 15 <= limiteMinutos &&
        horaAtual < bloco.fimMinutos &&
        (tarefaProcessada.tempo <= 0 || fila.length > 0)
      ) {
        const horaPausaFim = formatarHoraTrabalho(horaAtual)
        htmlGerado += `
                <div class="pausa-fim">
                    <b class="texto-pausa-fim">☕ ${horaPausaFim} Descanso de Conclusão (15 min)</b><br>
                    <small class="descricao-pausa-fim">Tarefa concluída. Recarregue para a próxima.</small>
                </div>`

        tempoTotalGasto += 15
        horaAtual += 15
        tempoTrabalhoContinuo = 0 // Reset em pausa de conclusão
        tarefaAtualId = null
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
  let tempoTrabalhoContinuo = 0 // 🔹 SOLUÇÃO 3: Rastrear fadiga
  let tarefaAtualId = null // 🔹 SOLUÇÃO 4: Evitar fragmentação

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
      tempoTrabalhoContinuo = 0 // Reset em interrupções
      tarefaAtualId = null
      continue
    }

    horaAtual = Math.max(horaAtual, bloco.inicioMinutos)

    while (
      horaAtual < bloco.fimMinutos &&
      tempoTotalGasto < limiteMinutos &&
      fila.length > 0
    ) {
      // 🔹 SOLUÇÃO 1: Usar score inteligente com energia
      fila.sort((a, b) => {
        const scoreA = calcularScoreTarefa(a, horaAtual, compensacao)
        const scoreB = calcularScoreTarefa(b, horaAtual, compensacao)
        return scoreB - scoreA
      })

      let tarefa = fila[0]
      if (!tarefa) break

      // 🔹 SOLUÇÃO 4: Não fragmentar - continuar com tarefa em andamento
      if (tarefaAtualId && tarefaAtualId !== tarefa.id) {
        const tarefaEmAndamento = fila.find(t => t.id === tarefaAtualId)
        if (tarefaEmAndamento && tarefaEmAndamento.tempo > 0) {
          fila.sort((a, b) => (a.id === tarefaAtualId ? -1 : b.id === tarefaAtualId ? 1 : 0))
          tarefa = fila[0]
        }
      }

      tarefaAtualId = tarefa.id

      let tempoRestante = tarefa.tempo
      while (
        tempoRestante > 0 &&
        tempoTotalGasto < limiteMinutos &&
        horaAtual < bloco.fimMinutos
      ) {
        // 🔹 SOLUÇÃO 3: Verificar pausa adaptativa
        const pausaNecessaria = calcularPausaAdaptativa(tempoTrabalhoContinuo)
        if (pausaNecessaria && tempoTotalGasto + pausaNecessaria.duracao <= limiteMinutos) {
          eventos.push({
            tipo: 'interrupcao',
            descricao: pausaNecessaria.tipo,
            inicioMinutos: horaAtual,
            fimMinutos: horaAtual + pausaNecessaria.duracao
          })
          tempoTotalGasto += pausaNecessaria.duracao
          horaAtual += pausaNecessaria.duracao
          tempoTrabalhoContinuo = 0
          if (horaAtual >= bloco.fimMinutos) break
        }

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
        tempoTrabalhoContinuo += blocoTrabalho
      }

      tarefa.tempo = tempoRestante
      if (tarefa.tempo <= 0) {
        fila.shift()
        tarefaAtualId = null
      }

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
        tempoTrabalhoContinuo = 0
        tarefaAtualId = null
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
  let tempoTrabalhoContinuo = 0 // 🔹 SOLUÇÃO 3
  let tarefaAtualId = null // 🔹 SOLUÇÃO 4

  for (const bloco of timeline) {
    if (tempoTotalGasto >= limiteMinutos) break

    if (bloco.tipo === 'interrupcao') {
      const inicioStr = formatarHoraTrabalho(bloco.inicioMinutos)
      const fimStr = formatarHoraTrabalho(bloco.fimMinutos)
      mensagem += `${inicioStr} a ${fimStr} - ⏸️ ${
        bloco.descricao || 'Interrupção'
      }\n`
      horaAtual = bloco.fimMinutos
      tempoTrabalhoContinuo = 0
      tarefaAtualId = null
      continue
    }

    horaAtual = Math.max(horaAtual, bloco.inicioMinutos)

    while (
      horaAtual < bloco.fimMinutos &&
      tempoTotalGasto < limiteMinutos &&
      fila.length > 0
    ) {
      // 🔹 SOLUÇÃO 1: Score inteligente com energia
      fila.sort((a, b) => {
        const scoreA = calcularScoreTarefa(a, horaAtual, compensacao)
        const scoreB = calcularScoreTarefa(b, horaAtual, compensacao)
        return scoreB - scoreA
      })

      let t = fila[0]
      if (!t) break

      // 🔹 SOLUÇÃO 4: Não fragmentar
      if (tarefaAtualId && tarefaAtualId !== t.id) {
        const tarefaEmAndamento = fila.find(tar => tar.id === tarefaAtualId)
        if (tarefaEmAndamento && tarefaEmAndamento.tempo > 0) {
          fila.sort((a, b) => (a.id === tarefaAtualId ? -1 : b.id === tarefaAtualId ? 1 : 0))
          t = fila[0]
        }
      }

      tarefaAtualId = t.id

      let tempoDaTarefaOriginal = t.tempo
      let tempoExecutadoDestaTarefa = 0

      while (
        tempoDaTarefaOriginal > 0 &&
        tempoTotalGasto < limiteMinutos &&
        horaAtual < bloco.fimMinutos
      ) {
        // 🔹 SOLUÇÃO 3: Pausa adaptativa
        const pausaNecessaria = calcularPausaAdaptativa(tempoTrabalhoContinuo)
        if (pausaNecessaria && tempoTotalGasto + pausaNecessaria.duracao <= limiteMinutos) {
          const horaPausa = formatarHoraTrabalho(horaAtual)
          mensagem += `${horaPausa} - 💪 ${pausaNecessaria.tipo} (${pausaNecessaria.duracao}min)\n`
          tempoTotalGasto += pausaNecessaria.duracao
          horaAtual += pausaNecessaria.duracao
          tempoTrabalhoContinuo = 0
          if (horaAtual >= bloco.fimMinutos) break
        }

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
        tempoTrabalhoContinuo += blocoTrabalho
      }

      t.tempo = tempoDaTarefaOriginal
      if (t.tempo <= 0) {
        fila.shift()
        tarefaAtualId = null
      }

      if (
        tempoTotalGasto + 15 <= limiteMinutos &&
        horaAtual < bloco.fimMinutos &&
        (t.tempo <= 0 || fila.length > 0)
      ) {
        let horaPausaFim = formatarHoraTrabalho(horaAtual)
        mensagem += `${horaPausaFim} - ☕ Descanso de Conclusão (15min)\n`
        tempoTotalGasto += 15
        horaAtual += 15
        tempoTrabalhoContinuo = 0
        tarefaAtualId = null
      }
    }
  }

  if (fila.length > 0) {
    mensagem += `\n⚠️ ${fila.length} tarefa(s) não caberam na agenda. Revise prioridades.`
  }

  mensagem += `\n\n📅 Gerado pelo Chronos-Ultra`
  return mensagem
}
