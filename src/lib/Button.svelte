<script lang="ts">
  let count: number = 0;
  const increment = () => {
    count += 1;
  };
</script>

<button
  on:click={increment}
  class="px-5 py-3 rounded text-white bg-slate-400 border-solid hover:bg-slate-500 focus:ring-1 focus:outline-none focus:ring-opacity-30"
>
  Spin! {count}
</button>
