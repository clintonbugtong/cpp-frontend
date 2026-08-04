<script>
  import { authState } from '$lib/stores/auth.svelte.js';
</script>

<div class="space-y-8">
  <!-- Welcome -->
  <div>
    <p class="text-sm text-base-content/50">Good morning,</p>
    <h1 class="text-2xl font-bold mt-0.5">{authState.user?.firstName || 'User'}</h1>
  </div>

  <!-- Stats Grid -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="bg-white rounded-2xl p-5 border border-base-200 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-base-content/50 uppercase">Total Users</span>
        <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-primary">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
          </svg>
        </span>
      </div>
      <p class="text-2xl font-bold">15,847</p>
      <p class="text-xs text-success mt-1">↑ 12.5% this month</p>
    </div>

    <div class="bg-white rounded-2xl p-5 border border-base-200 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-base-content/50 uppercase">Active Systems</span>
        <span class="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-success">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
          </svg>
        </span>
      </div>
      <p class="text-2xl font-bold">5</p>
      <p class="text-xs text-base-content/50 mt-1">All operational</p>
    </div>

    <div class="bg-white rounded-2xl p-5 border border-base-200 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-base-content/50 uppercase">Divisions</span>
        <span class="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-info">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
          </svg>
        </span>
      </div>
      <p class="text-2xl font-bold">218</p>
      <p class="text-xs text-base-content/50 mt-1">Active divisions</p>
    </div>

    <div class="bg-white rounded-2xl p-5 border border-base-200 hover:shadow-md transition-shadow">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-base-content/50 uppercase">Today's Logs</span>
        <span class="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </span>
      </div>
      <p class="text-2xl font-bold">3,421</p>
      <p class="text-xs text-base-content/50 mt-1">System events</p>
    </div>
  </div>
</div>