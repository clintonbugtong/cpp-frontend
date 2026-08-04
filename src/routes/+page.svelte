<script>
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';

  // Use $effect to react to auth state changes
  $effect(() => {
    // Only redirect when loading is complete
    if (!authState.loading) {
      if (authState.isAuthenticated) {
        goto(authState.getPrimaryDashboard(), { replaceState: true });
      } else {
        goto('/login', { replaceState: true });
      }
    }
  });
</script>

<div class="flex items-center justify-center min-h-screen">
  <div class="text-center">
    <span class="loading loading-spinner loading-lg text-primary"></span>
    <p class="mt-2 text-base-content/70">Loading...</p>
  </div>
</div>