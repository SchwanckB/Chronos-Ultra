// --- ESTADO DA APLICAÇÃO (Vive apenas na memória RAM agora) ---
let listaTarefas = []
let graficoInstancia
let dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }

// --- CONTROLE DE FLUXO SPA ---
function entrarNoSistema() {
  const inputNome = document.getElementById('seu-nome')
  const inputIdade = document.getElementById('sua-idade')

  const nome = inputNome.value.trim()
  const idade = parseInt(inputIdade.value)

  if (!nome || !idade || isNaN(idade)) {
    return alert('Por favor, preencha corretamente seu nome e idade!')
  }

  // Lógica de cálculo de foco máximo
  let calcFoco = Math.floor(90 - Math.abs(idade - 25) * 1.2)
  dadosUsuario = { nome, idade, focoMaximo: Math.max(25, calcFoco) }

  // Atualiza UI
  document.getElementById('saudacao-nome').innerText =
    `Olá, ${dadosUsuario.nome}!`
  document.getElementById('caixa-estatisticas-bio').innerHTML =
    `🧬 Foco Ideal: <b>${dadosUsuario.focoMaximo} min</b>`

  // Transição de Telas
  document.getElementById('tela-boas-vindas').classList.remove('ativa')
  document.getElementById('tela-principal').classList.add('ativa')

  // Timeout pequeno para garantir que a tela renderizou antes de desenhar o canvas
  setTimeout(renderizarGrafico, 50)
}

function trocarUsuario() {
  // Zera o estado da aplicação
  listaTarefas = []
  dadosUsuario = { nome: '', idade: 0, focoMaximo: 0 }

  // Limpa os campos da tela inicial
  document.getElementById('seu-nome').value = ''
  document.getElementById('sua-idade').value = ''

  // Limpa as listas da tela principal
  document.getElementById('lista-de-tarefas').innerHTML = ''
  document.getElementById('resultado-otimizacao').innerHTML =
    '<p style="color: #94a3b8; text-align: center;">Adicione tarefas acima e calcule sua agenda biológica.</p>'
  document.getElementById('nome-tarefa').value = ''
  document.getElementById('peso-tarefa').value = ''
  document.getElementById('tempo-tarefa').value = ''

  // Faz a transição de volta
  document.getElementById('tela-principal').classList.remove('ativa')
  document.getElementById('tela-boas-vindas').classList.add('ativa')
}

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
                <strong>${t.nome}</strong>
                <span style="color: #94a3b8;">Peso: ${t.peso} | ${t.tempo} min</span>
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
  let htmlGerado = `<div style="display: flex; flex-direction: column; gap: 12px;">`

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
                <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; display: flex; align-items: center; gap: 15px;">
                    <div style="font-weight: bold; color: #a855f7; min-width: 55px;">${horaInicioStr}</div>
                    <div style="flex: 1;">
                        <div style="color: #f8fafc; font-weight: 600;">${t.nome} ${tempoExecutadoDestaTarefa > 0 ? '(Continuação)' : ''}</div>
                        <div style="color: #94a3b8; font-size: 0.85rem;">Bloco de foco intenso: ${blocoTrabalho}min</div>
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
                    <div style="margin-left: 70px; border-left: 3px solid #3b82f6; padding: 8px 15px; background: rgba(59, 130, 246, 0.1); border-radius: 8px;">
                        <b style="color: #60a5fa; font-size: 0.85rem;">💧 ${horaPausaMeio} Pausa de Foco (10 min)</b><br>
                        <small style="color: #93c5fd; font-size: 0.75rem;">Respiro estratégico para tarefas longas.</small>
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
                <div style="margin: 5px 0 15px 70px; padding: 10px 15px; border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.15); border-radius: 8px;">
                    <b style="color: #10b981;">☕ ${horaPausaFim} Descanso de Conclusão (15 min)</b><br>
                    <small style="color: #34d399; font-size: 0.75rem;">Tarefa concluída. Recarregue para a próxima.</small>
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
}
