<script>
  import { authState } from '$lib/stores/auth.svelte.js';

  let stats = $state([
    { title: 'Total Users', value: '15,847', change: '+12.5%', icon: 'users' },
    { title: 'Active Systems', value: '5', change: 'All Online', icon: 'systems' },
    { title: 'Total Divisions', value: '218', change: 'Active', icon: 'divisions' },
    { title: 'System Logs', value: '45.2K', change: 'Today', icon: 'logs' },
  ]);
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-bold">Super Admin Dashboard</h1>
    <p class="text-base-content/70 mt-1">Welcome, {authState.user?.fullName}! You have full system access.</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each stats as stat}
      <div class="stat bg-base-100 rounded-box shadow-sm">
        <div class="stat-figure text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div class="stat-title">{stat.title}</div>
        <div class="stat-value text-2xl">{stat.value}</div>
        <div class="stat-desc">{stat.change}</div>
      </div>
    {/each}
  </div>

  <div class="card bg-base-100 shadow-sm">
    <div class="card-body">
      <h2 class="card-title">System Overview</h2>
      <p class="text-base-content/70">You have access to all system modules and administrative functions.</p>
      <div class="divider"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 border rounded-lg">
          <h3 class="font-semibold mb-2">Available Roles</h3>
          <ul class="space-y-1">
            {#each authState.userRoles as role}
              <li class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-success"></span>
                {role}
              </li>
            {/each}
          </ul>
        </div>
        <div class="p-4 border rounded-lg">
          <h3 class="font-semibold mb-2">Quick Actions</h3>
          <div class="space-y-2">
            <button class="btn btn-sm btn-outline w-full">Manage Users</button>
            <button class="btn btn-sm btn-outline w-full">View System Logs</button>
            <button class="btn btn-sm btn-outline w-full">System Settings</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>