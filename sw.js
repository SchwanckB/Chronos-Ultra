/**
 * Service worker do Chronos Ultra.
 *
 * EstratÃ©gia:
 *  Â· navegaÃ§Ã£o  â†’ rede primeiro, cai para o cache quando offline;
 *  Â· app shell  â†’ cache primeiro, revalidando em segundo plano;
 *  Â· CDN/fontes â†’ cache primeiro com atualizaÃ§Ã£o silenciosa.
 *
 * Dados pessoais ficam no Supabase; o cache guarda somente recursos estaticos.
 */

const VERSAO = 'chronos-v7'
const CACHE_SHELL = `${VERSAO}-shell`
const CACHE_EXTERNO = `${VERSAO}-externo`
const HOSTS_ESTATICOS_EXTERNOS = new Set([
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'esm.sh'
])
const DESTINOS_ESTATICOS = new Set(['script', 'style', 'font'])

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './texto/texto.html',
  './js/app.js',
  './js/algoritmo.js',
  './js/tarefas.js',
  './js/ui.js',
  './js/calendario.js',
  './js/graficos.js',
  './js/componentes.js',
  './js/animacoes.js',
  './js/foco.js',
  './js/agora.js',
  './js/icones.js',
  './js/calibragem.js',
  './js/navegacao.js',
  './img/logo.png',
  './img/favicon.ico',
  './img/favicon-16x16.png',
  './img/favicon-32x32.png',
  './img/android-chrome-192x192.png',
  './img/android-chrome-512x512.png',
  './img/apple-touch-icon.png'
]

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      // `allSettled` evita que um Ãºnico arquivo ausente aborte toda a instalaÃ§Ã£o
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

  // pÃ¡ginas: rede primeiro para sempre pegar a versÃ£o mais nova
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
    if (!HOSTS_ESTATICOS_EXTERNOS.has(url.hostname) || !DESTINOS_ESTATICOS.has(request.destination)) return

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
