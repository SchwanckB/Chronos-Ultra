/**
 * Service worker do Chronos Ultra.
 *
 * Estratégia:
 *  · navegação  → rede primeiro, cai para o cache quando offline;
 *  · app shell  → cache primeiro, revalidando em segundo plano;
 *  · CDN/fontes → cache primeiro com atualização silenciosa.
 *
 * Todos os dados do usuário vivem no localStorage, então o cache aqui só
 * guarda arquivos estáticos — nada pessoal é armazenado.
 */

const VERSAO = 'chronos-v2'
const CACHE_SHELL = `${VERSAO}-shell`
const CACHE_EXTERNO = `${VERSAO}-externo`

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './texto/texto.html',
  './js/app.js',
  './js/algoritmo.js',
  './js/tarefas.js',
  './js/storage.js',
  './js/ui.js',
  './js/calendario.js',
  './js/graficos.js',
  './js/componentes.js',
  './js/animacoes.js',
  './js/foco.js',
  './js/agora.js',
  './js/icones.js',
  './js/navegacao.js',
  './img/logo.png',
  './img/logocentral.png',
  './img/favicon.ico',
  './img/icone-192.png',
  './img/icone-512.png'
]

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      // `allSettled` evita que um único arquivo ausente aborte toda a instalação
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches
      .keys()
      .then(chaves =>
        Promise.all(chaves.filter(chave => !chave.startsWith(VERSAO)).map(chave => caches.delete(chave)))
      )
      .then(() => self.clients.claim())
  )
})

function guardar(cache, requisicao, resposta) {
  if (resposta && (resposta.ok || resposta.type === 'opaque')) {
    caches.open(cache).then(c => c.put(requisicao, resposta.clone()))
  }
  return resposta
}

self.addEventListener('fetch', evento => {
  const { request } = evento
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const mesmaOrigem = url.origin === self.location.origin

  // páginas: rede primeiro para sempre pegar a versão mais nova
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then(resposta => guardar(CACHE_SHELL, request, resposta))
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    )
    return
  }

  // recursos externos (Chart.js, fontes): cache primeiro
  if (!mesmaOrigem) {
    evento.respondWith(
      caches.match(request).then(
        emCache =>
          emCache ||
          fetch(request)
            .then(resposta => guardar(CACHE_EXTERNO, request, resposta))
            .catch(() => emCache)
      )
    )
    return
  }

  // arquivos do app: responde do cache e revalida em segundo plano
  evento.respondWith(
    caches.match(request).then(emCache => {
      const naRede = fetch(request)
        .then(resposta => guardar(CACHE_SHELL, request, resposta))
        .catch(() => emCache)
      return emCache || naRede
    })
  )
})

self.addEventListener('message', evento => {
  if (evento.data === 'atualizar') self.skipWaiting()
})
