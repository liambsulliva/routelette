<script lang="ts">
  import logo from "./assets/svelte.png";
  import SpinBtn from "./lib/Button.svelte";
  import Map from "./lib/Map.svelte";
</script>

<main class="text-center">
  <Map />

  <h1 class="p-6 pb-4 text-5xl font-bold">Routelette!</h1>
  <div>
    <input class="px-4 py-2 m-4 border rounded w-[300px]" type="text" />
  </div>
  <input class="px-4 py-2 m-4 border rounded w-[125px]" type="number">
  <SpinBtn />

  <p class="absolute bottom-4 w-full">
    Made with ❤️ by <a href="https://liambsullivan.com" target="_blank" rel="noreferrer">Liam Sullivan</a>
  </p>
</main>

<style>
    main {
      margin: 1rem auto;
      max-width: calc(100vw - 2rem);
    }
    a {
        @apply text-blue-500;
    }
    a:hover {
        @apply underline;
    }
</style>
