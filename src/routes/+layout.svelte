<script>
  import { authState } from '$lib/stores/auth.svelte.js';
  import '../app.css';

  let { children } = $props();
</script>

<div class="min-h-screen">
  {#if authState.loading}
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="mt-2 text-base-content/70">Loading...</p>
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</div>
