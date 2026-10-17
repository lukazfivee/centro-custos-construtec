// Guarda o site do celular para abrir sem internet. A API nunca e guardada aqui:
// os dados offline ficam no IndexedDB (queue.js), com a fila de lancamentos.
const CACHE = 'cc-celular-v29';
const SHELL = ['./', 'manifest.webmanifest', 'simbolo.png', 'icon-180.png', 'm.css', 'anim.css', 'barra.css', 'tema.js', 'servico.css', 'fin.css', 'adm.css',
  'obra-tec.css', 'tecnico.css', 'tecnicos.css', 'tecnicos.js', 'menu-cartao.css', 'screen-home-tecnico.js', 'screen-servico-registros.js', 'icons.js', 'core.js', 'queue.js', 'abas-arrastar.js', 'app.js', 'screen-entrar.js', 'screen-home.js', 'screen-obra.js', 'screen-lancar.js',
  'screen-misc.js', 'screen-lancamentos.js', 'screen-lanc.js', 'screen-lanc-docs.js', 'screen-obra-acoes.js', 'screen-obra-abas.js',
  'screen-obra-form.js', 'screen-servico.js', 'screen-servico-fila.js', 'screen-servico-exec.js', 'screen-servico-gasto.js', 'screen-servico-fim.js',
  'screen-servico-form.js', 'screen-descartadas.js', 'suite.js', 'screen-avisos.js', 'screen-pedidos.js', 'screen-adm.js', 'screen-fechamento.js',
  'screen-historico.js', 'screen-reports.js', 'screen-report-novo.js', 'screen-usuarios.js', 'screen-usuario-form.js', 'screen-papeis.js',
  'screen-sistema.js', 'screen-perfil.js', 'screen-atualizacao.js', 'fin-base.js', 'cobr-regras.js', 'screen-cobrancas.js', 'screen-cobranca.js',
  'screen-cobranca-dados.js', 'screen-cobranca-email.js', 'screen-recorrentes.js', 'screen-recorrente-form.js', 'screen-fornecedores.js',
  'screen-fornecedor-form.js', 'screen-categorias.js', 'screen-obra-tec.js', 'screen-obra-curva.js', 'screen-obra-folha.js',
  'screen-obra-importar.js', 'screen-home-mais.js', 'screen-busca.js', 'ia-config.js', 'ia-tools.js', 'ia-chat.js', 'index.html', 'icon-192.png',
  'programacao.css', 'programacao-escritorio.css', 'programacao-nuvem.js', 'programacao-fila.js', 'screen-meu-dia.js', 'screen-programacao-atividade.js',
  'programacao-escritorio-form.js', 'programacao-escritorio.js', 'screen-programacao.js',
  'icon-512.png', 'fonts/plex-400.woff2', 'fonts/plex-500.woff2', 'fonts/plex-600.woff2', 'fonts/plex-700.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cc-celular-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (para receber atualizacoes); sem internet, usa a copia guardada.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/m/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
