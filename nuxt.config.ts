import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-10-18",
  devtools: { enabled: false },
  modules: ["@nuxt/icon"],
  css: ["~/assets/css/main.css"],
  vite: { plugins: [tailwindcss()] },
  icon: { serverBundle: { collections: ["ph"] } },
  app: {
    head: {
      title: "Routelette",
      meta: [
        {
          name: "description",
          content:
            "Pick a starting point, a direction, and a distance. The app will chart a path and loop you back to where you began.",
        },
        { name: "theme-color", content: "#ffffff" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Routelette" },
        { property: "og:title", content: "Routelette" },
        {
          property: "og:description",
          content:
            "Pick a starting point, a direction, and a distance. The app will chart a path and loop you back to where you began.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Routelette" },
        {
          name: "twitter:description",
          content:
            "Pick a starting point, a direction, and a distance. The app will chart a path and loop you back to where you began.",
        },
      ],
      link: [
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/brand/routelette-mark.svg",
          media: "(prefers-color-scheme: light)",
        },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/brand/routelette-mark-dark.svg",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      htmlAttrs: { lang: "en" },
    },
  },
  runtimeConfig: {
    photonUrl: "https://photon.komoot.io",
    stravaClientId: "",
    stravaClientSecret: "",
    public: { graphManifestUrl: "/graph/manifest.json", fixtureMode: false },
  },
  typescript: { strict: true },
});
