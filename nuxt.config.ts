import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-18',
  devtools: { enabled: false },
  modules: ['@nuxt/icon'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  icon: { serverBundle: { collections: ['ph'] } },
  app: {
    head: {
      title: 'Routelette · Find your next loop',
      meta: [
        { name: 'description', content: 'Choose a start, a way to move and a distance. Find a loop back to where you began.' },
        { name: 'theme-color', content: '#ffffff' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/brand/routelette-mark.svg' }],
      htmlAttrs: { lang: 'en' },
    },
  },
  runtimeConfig: {
    photonUrl: 'https://photon.komoot.io',
    stravaClientId: '',
    stravaClientSecret: '',
    public: { graphManifestUrl: '/graph/manifest.json', fixtureMode: false },
  },
  typescript: { strict: true },
})
