<script>
  import { authState } from '$lib/stores/auth.svelte.js';
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">Dashboard</h1>
      <p class="text-base-content/70">Welcome back, {authState.user?.fullName}!</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each authState.userRoles as role}
        <span class="badge badge-lg">{role}</span>
      {/each}
    </div>
  </div>

  <!-- Quick Access Cards -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each authState.getAvailableDashboards() as dashboard}
      <a 
        href={dashboard.path}
        class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow border border-base-300 hover:border-primary/50"
      >
        <div class="card-body p-5">
          <h3 class="card-title text-base">{dashboard.role}</h3>
          <p class="text-sm text-base-content/50">Click to access {dashboard.role.toLowerCase()} dashboard</p>
        </div>
      </a>
    {/each}
  </div>
</div>