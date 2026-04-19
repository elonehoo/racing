// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@tresjs/nuxt'],
  css: ['~/assets/styles/main.css'],
  app: {
    head: {
      title: 'Racing'
    }
  }
})
