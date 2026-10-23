import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  ...(process.env.DRIVE_PAGES_BUILD === '1' ? { buildDir: '.nuxt-pages' } : {}),
  compatibilityDate: '2026-10-16',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  nitro: {
    ...(process.env.DRIVE_PAGES_BUILD === '1' ? { output: { dir: fileURLToPath(new URL('./.pages-output/', import.meta.url)) } } : {}),
    publicAssets: ['cmaps', 'standard_fonts', 'wasm'].map(directory => ({
      dir: fileURLToPath(new URL(`./node_modules/pdfjs-dist/${directory}/`, import.meta.url)),
      baseURL: `/pdf-assets/${directory}`,
      maxAge: 86400,
    })),
  },
  runtimeConfig: {
    public: {
      dataMode: 'http',
      apiBase: '/api/v1',
    },
  },
  app: {
    head: {
      title: 'Ortak Drive',
      htmlAttrs: { lang: 'tr' },
      meta: [
        { name: 'description', content: 'Çalışma alanların, dosyaların ve ekibin bir arada.' },
        { name: 'theme-color', content: '#f8fafd' },
        { name: 'referrer', content: 'strict-origin-when-cross-origin' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  typescript: { strict: true },
})
