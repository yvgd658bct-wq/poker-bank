import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';

/**
 * Genereert dist/sw.js met de exacte lijst gebouwde bestanden (met hash in de naam),
 * zodat de app na de eerste keer laden volledig offline werkt.
 */
function serviceWorker(): Plugin {
  return {
    name: 'poker-bank-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
      for (const name of Object.keys(bundle)) files.push(name);
      const hash = createHash('sha256');
      for (const item of Object.values(bundle)) hash.update(item.type === 'chunk' ? item.code : item.source);
      const version = hash.digest('hex').slice(0, 12);
      const source = `// Gegenereerd bij build — niet manueel aanpassen.
const CACHE = 'poker-bank-${version}';
const FILES = ${JSON.stringify([...new Set(files)])};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relatieve paden: werkt op GitHub Pages onder elke repo-naam.
  base: './',
  plugins: [serviceWorker()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
