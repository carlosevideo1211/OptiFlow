// Service worker minimo do OptiFlow: existe so para o navegador permitir
// "instalar" o sistema como aplicativo (icone na tela do celular).
// NAO guarda nada em cache - tudo continua vindo do servidor, sempre atualizado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* deixa o navegador buscar normalmente */ });
