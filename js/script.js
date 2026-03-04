// Este arquivo permanece apenas para compatibilidade e serve como placeholder.
// A lógica principal foi migrada para módulos ES, começando em `app.js`.

// Se o navegador carregar este script por engano, não há nada a executar.

// --- GRÁFICOS E ENERGIA ---
function obterEnergia(hora, compensacao) {
  return Math.sin(((hora - compensacao) * Math.PI) / 12) * 40 + 60
}

function renderizarGrafico() {
  const compensacao = parseInt(
    document.getElementById('cronotipo-usuario').value
  )
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

  // Atualiza configurações
  configuracoes.cronotipo = document.getElementById('cronotipo-usuario').value
  configuracoes.limiteHoras =
    parseInt(document.getElementById('limite-horas').value) || 6
  salvarDadosUsuario()
}

// --- GESTÃO DE TAREFAS ---
function adicionarTarefa() {
  const nome = document.getElementById('nome-tarefa').value.trim()
  const peso = parseFloat(document.getElementById('peso-tarefa').value)
  const tempo = parseFloat(document.getElementById('tempo-tarefa').value)

  if (!nome || isNaN(peso) || isNaN(tempo))
    return alert('Preencha todos os dados da tarefa corretamente!')

  if (tempo > dadosUsuario.focoMaximo) {
    alert(
      `Atenção ${dadosUsuario.nome}! Tarefas acima de ${dadosUsuario.focoMaximo} min sem pausa podem esgotar sua energia mental. Cuidado!`
    )
  }

  listaTarefas.push({ nome, peso, tempo, id: Date.now() })

  // Limpa inputs
  document.getElementById('nome-tarefa').value = ''
  document.getElementById('peso-tarefa').value = ''
  document.getElementById('tempo-tarefa').value = ''

  atualizarListaNaTela()

  // Salva dados
  salvarDadosUsuario()
}

function excluirTarefa(id) {
  listaTarefas = listaTarefas.filter(t => t.id !== id)
  atualizarListaNaTela()
  salvarDadosUsuario()
}

function atualizarListaNaTela() {
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
                <button class="botao-excluir" onclick="excluirTarefa(${t.id})">🗑️</button>
            </div>
        `
    )
    .join('')
}

// --- ALGORITMO DE OTIMIZAÇÃO ---
function formatarHoraTrabalho(minutosTotais) {
  let h = Math.floor(minutosTotais / 60) % 24
  if (h < 0) h += 24
  let m = Math.floor(minutosTotais % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function otimizarDia() {
  const containerLista = document.getElementById('resultado-otimizacao')
  if (listaTarefas.length === 0)
    return alert('Adicione tarefas ao inventário primeiro!')

  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
  const turno = document.getElementById('cronotipo-usuario').value

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

  const tarefasOrdenadas = [...listaTarefas].sort((a, b) => b.peso - a.peso)

  tarefasOrdenadas.forEach(t => {
    let tempoRestanteNoDia = limiteMinutos - tempoTotalGasto
    if (tempoRestanteNoDia <= 0) return

    let tempoDaTarefaOriginal = t.tempo
    let tempoExecutadoDestaTarefa = 0

    // --- INÍCIO DA TAREFA ---
    while (tempoDaTarefaOriginal > 0 && tempoTotalGasto < limiteMinutos) {
      // Se a tarefa for longa (mais de 60min), fatiamos em blocos de 50min
      let blocoTrabalho =
        tempoDaTarefaOriginal > 60 ? 50 : tempoDaTarefaOriginal

      // Verifica se o bloco cabe no tempo restante do dia
      if (tempoTotalGasto + blocoTrabalho > limiteMinutos) {
        blocoTrabalho = limiteMinutos - tempoTotalGasto
      }

      if (blocoTrabalho <= 0) break

      let horaInicioStr = formatarHoraTrabalho(horas * 60 + minutos)

      // Renderiza o bloco de trabalho
      htmlGerado += `
                <div class="bloco-tarefa">
                    <div class="horario-tarefa">${horaInicioStr}</div>
                    <div class="detalhes-tarefa">
                        <div class="nome-tarefa">${t.nome} ${tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''}</div>
                        <div class="descricao-tarefa">Bloco de foco intenso: ${blocoTrabalho}min</div>
                    </div>
                </div>`

      // Atualiza tempo
      tempoTotalGasto += blocoTrabalho
      tempoDaTarefaOriginal -= blocoTrabalho
      tempoExecutadoDestaTarefa += blocoTrabalho
      minutos += blocoTrabalho
      while (minutos >= 60) {
        minutos -= 60
        horas++
      }

      // --- PAUSA NO MEIO (Se ainda sobrar tempo da mesma tarefa) ---
      if (tempoDaTarefaOriginal > 0 && tempoTotalGasto + 10 <= limiteMinutos) {
        let horaPausaMeio = formatarHoraTrabalho(horas * 60 + minutos)
        htmlGerado += `
                    <div class="pausa-meio">
                        <b class="texto-pausa-meio">💧 ${horaPausaMeio} Pausa de Foco (10 min)</b><br>
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

    // --- PAUSA APÓS CONCLUIR CADA TAREFA (15 MINUTOS) ---
    if (tempoTotalGasto + 15 <= limiteMinutos) {
      let horaPausaFim = formatarHoraTrabalho(horas * 60 + minutos)
      htmlGerado += `
                <div class="pausa-fim">
                    <b class="texto-pausa-fim">☕ ${horaPausaFim} Descanso de Conclusão (15 min)</b><br>
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
  containerLista.innerHTML = htmlGerado

  // Adiciona botão para enviar ao WhatsApp
  const botaoWhatsApp = `<button onclick="enviarParaWhatsApp()" style="margin-top: 16px; background: #25d366; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer;">📱 Enviar para WhatsApp</button>`
  containerLista.innerHTML += botaoWhatsApp

  // Salva configurações
  configuracoes.cronotipo = turno
  configuracoes.limiteHoras = limiteMinutos / 60
  salvarDadosUsuario()
}

function enviarParaWhatsApp() {
  if (listaTarefas.length === 0) return alert('Gere a agenda primeiro!')

  const limiteMinutos =
    (parseInt(document.getElementById('limite-horas').value) || 6) * 60
  const turno = document.getElementById('cronotipo-usuario').value

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
  let mensagem = `🕒 Minha Agenda Otimizada - ${dadosUsuario.nome}\n\n`

  const tarefasOrdenadas = [...listaTarefas].sort((a, b) => b.peso - a.peso)

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
      mensagem += `${horaInicioStr} - ${t.nome} ${tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''} (${blocoTrabalho}min)\n`

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

  // Codifica a mensagem para URL
  const mensagemCodificada = encodeURIComponent(mensagem)
  const urlWhatsApp = `https://wa.me/?text=${mensagemCodificada}`

  // Abre o WhatsApp
  window.open(urlWhatsApp, '_blank')
}
