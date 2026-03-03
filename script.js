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
    if (listaTarefas.length === 0)
        return alert('Adicione pelo menos uma tarefa para otimizar!');

    const limiteMinutos = parseInt(document.getElementById('limite-horas').value) * 60;
    
    const agora = new Date();
    let horas = agora.getHours();
    let minutos = agora.getMinutes();
    
    let tempoTotalGasto = 0;
    let htmlGerado = `<div class="lista-tarefas">`;

    // 1. Ordena as tarefas: Peso maior primeiro
    const tarefasOrdenadas = [...listaTarefas].sort((a, b) => b.peso - a.peso);

    tarefasOrdenadas.forEach(t => {
        let statusMensagem = "";
        let classeExtra = "";
        let tempoExecucao = t.tempo;
        let tempoRestante = limiteMinutos - tempoTotalGasto;

        if (tempoRestante <= 0) {
            // Se não sobrar nada mesmo
            classeExtra = "tarefa-nao-priorizada";
            statusMensagem = "⚠️ Não priorizada (Tempo esgotado)";
            tempoExecucao = 0;
        } 
        else if (t.tempo > tempoRestante) {
            // A TAREFA FOI CORTADA (O SEU EXEMPLO)
            tempoExecucao = tempoRestante;
            statusMensagem = `✂️ Tempo reduzido para ${tempoExecucao} min (Limite atingido)`;
            classeExtra = "tarefa-cortada";
        } 
        else {
            // TAREFA COUBE INTEIRA
            statusMensagem = `Até ${formatarHoraTrabalho((horas * 60 + minutos) + t.tempo)}`;
        }

        let horaInicioStr = tempoExecucao > 0 ? formatarHoraTrabalho(horas * 60 + minutos) : "--:--";

        htmlGerado += `
            <div class="item-tarefa ${classeExtra}" style="border: 1px solid var(--cor-borda);">
                <div style="display: flex; align-items: center; width: 100%;">
                    <span class="etiqueta-tempo">${horaInicioStr}</span>
                    <div style="flex: 1;">
                        <b style="color: var(--cor-texto);">${t.nome}</b><br>
                        <span style="color: #94a3b8; font-size: 0.85rem;">${statusMensagem}</span>
                    </div>
                </div>
            </div>`;

        if (tempoExecucao > 0) {
            tempoTotalGasto += tempoExecucao;
            minutos += tempoExecucao;
            while (minutos >= 60) { minutos -= 60; horas++; }
        }
    });

    htmlGerado += `</div><div class="etiqueta-lazer">🏝️ Cronograma Finalizado</div>`;
    document.getElementById('resultado-otimizacao').innerHTML = htmlGerado;
}