<script>
  import { authState } from '$lib/stores/auth.svelte.js';
  import { lisDashboardService } from '$lib/api/lis-dashboard.js';
  import { onMount } from 'svelte';

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let data = $state(null);

  onMount(async () => {
    const result = await lisDashboardService.getDashboard();
    if (result.success) {
      data = result.data;
    } else {
      error = result.error || 'Failed to load dashboard.';
    }
    loading = false;
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** @param {string} action */
  function fmtAction(action) {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /** @param {string} d */
  function fmtShortDate(d) {
    return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  /** @param {number} n @param {number} total */
  function pct(n, total) {
    if (!total) return 0;
    return Math.round((n / total) * 100);
  }

  /** @param {any[]} arr @param {string} key */
  function maxOf(arr, key) {
    return arr.reduce((m, r) => Math.max(m, r[key] ?? 0), 1);
  }

  /** @param {string} level */
  function levelBadge(level) {
    return level === 'Regional' ? 'badge-primary'
         : level === 'Division' ? 'badge-info'
         : level === 'School'   ? 'badge-success'
         : 'badge-ghost';
  }

  let failedLogins = $derived(data?.audit_logs?.failed_logins_7days ?? 0);
</script>

<!-- ── Page ────────────────────────────────────────────────────────────────── -->
<div class="space-y-6">

  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <p class="text-xs text-base-content/40 uppercase tracking-wider mb-0.5">Dashboard</p>
      <h1 class="text-2xl font-bold">{authState.user?.firstName || 'Administrator'}</h1>
      <p class="text-sm text-base-content/50 mt-0.5">Legal Information System Administrator</p>
    </div>
    {#if authState.user?.division}
      <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-base-100 border border-base-200 rounded-xl text-xs">
        <span class="w-2 h-2 rounded-full bg-primary"></span>
        <span class="text-base-content/60">{authState.user.division.name}</span>
      </div>
    {/if}
  </div>

  {#if loading}
    <!-- Skeleton -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each [1,2,3,4] as _}
        <div class="bg-base-100 rounded-2xl p-5 border border-base-200 space-y-3 animate-pulse">
          <div class="h-3 w-20 bg-base-200 rounded"></div>
          <div class="h-7 w-12 bg-base-200 rounded"></div>
          <div class="h-2.5 w-16 bg-base-200 rounded"></div>
        </div>
      {/each}
    </div>
    <div class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

  {:else if error}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>{error}</span>
      <button class="btn btn-sm btn-ghost" onclick={() => location.reload()}>Retry</button>
    </div>

  {:else if data}

    <!-- ════════════════════════════════════════════════════════════════════════
         SECTION 1 — Key Metrics
    ═══════════════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

      <!-- Total Users -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Total Users</span>
          <span class="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-primary">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.users?.total ?? '—'}</p>
        <div class="flex items-center gap-2 mt-1.5">
          <span class="inline-flex items-center gap-1 text-xs text-success font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
            {data.users?.active ?? 0} active
          </span>
          {#if (data.users?.inactive ?? 0) > 0}
            <span class="text-xs text-base-content/30">·</span>
            <span class="text-xs text-base-content/40">{data.users.inactive} inactive</span>
          {/if}
        </div>
      </div>

      <!-- Recently Added -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">New This Month</span>
          <span class="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-success">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.users?.recently_added ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Added in last 30 days</p>
      </div>

      <!-- Today's Logs -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Today's Activity</span>
          <span class="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.audit_logs?.today ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{data.audit_logs?.last_7_days ?? 0} events in 7 days</p>
      </div>

      <!-- Failed Logins -->
      <div class="rounded-2xl p-5 border transition-shadow hover:shadow-sm
        {failedLogins > 0 ? 'bg-error/5 border-error/20' : 'bg-base-100 border-base-200'}">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium uppercase tracking-wider
            {failedLogins > 0 ? 'text-error/60' : 'text-base-content/40'}">Failed Logins</span>
          <span class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0
            {failedLogins > 0 ? 'bg-error/10' : 'bg-base-200'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
              class="w-4 h-4 {failedLogins > 0 ? 'text-error' : 'text-base-content/30'}">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight {failedLogins > 0 ? 'text-error' : ''}">{failedLogins}</p>
        <p class="text-xs mt-1.5 {failedLogins > 0 ? 'text-error/60' : 'text-base-content/40'}">Past 7 days</p>
      </div>

    </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         SECTION 2 — Users Breakdown + Daily Activity
    ═══════════════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

      <!-- Users by Role -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold">Users by Role</h2>
          <span class="text-xs text-base-content/30 font-mono">{data.users?.total ?? 0} total</span>
        </div>
        {#if data.users?.by_role?.length}
          <div class="space-y-3">
            {#each data.users.by_role as row}
              {@const w = pct(row.count, data.users.total)}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 truncate pr-2 leading-tight">{row.role}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-primary h-full rounded-full transition-all duration-500" style="width:{w}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

      <!-- Users by Org Level -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold">By Organization Level</h2>
        </div>
        {#if data.users?.by_org_level?.length}
          <div class="space-y-3">
            {#each data.users.by_org_level as row}
              <div class="flex items-center gap-3">
                <span class="badge badge-sm {levelBadge(row.level)} shrink-0 w-20 justify-center">{row.level}</span>
                <div class="flex-1 bg-base-200 rounded-full h-2 overflow-hidden">
                  <div class="bg-info h-full rounded-full transition-all duration-500"
                    style="width:{pct(row.count, data.users.total)}%"></div>
                </div>
                <span class="text-sm font-bold tabular-nums w-6 text-right">{row.count}</span>
              </div>
            {/each}
          </div>
          <div class="mt-4 pt-3 border-t border-base-200 flex justify-between text-xs">
            <span class="text-base-content/40">Total users</span>
            <span class="font-bold">{data.users.total}</span>
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

      <!-- 30-Day Activity Chart -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-sm font-semibold">Daily Activity</h2>
          <span class="text-xs font-bold tabular-nums text-base-content/50">{data.audit_logs?.last_30_days ?? 0} events</span>
        </div>
        <p class="text-xs text-base-content/30 mb-4">Past 30 days</p>
        {#if data.audit_logs?.daily_activity?.length}
          {@const daily = data.audit_logs.daily_activity}
          {@const maxVal = maxOf(daily, 'count')}
          <div class="flex items-end gap-px h-20">
            {#each daily as day}
              {@const h = Math.max(3, Math.round((day.count / maxVal) * 80))}
              <div
                class="flex-1 rounded-sm bg-primary/60 hover:bg-primary transition-colors cursor-default min-w-0"
                style="height:{h}px"
                title="{fmtShortDate(day.date)}: {day.count}"
              ></div>
            {/each}
          </div>
          <div class="flex justify-between text-xs text-base-content/25 mt-1.5">
            <span>{fmtShortDate(daily[0]?.date)}</span>
            <span>{fmtShortDate(daily[daily.length - 1]?.date)}</span>
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-6">No activity data</p>
        {/if}
      </div>

    </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         SECTION 3 — Top Users + Top Actions
    ═══════════════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <!-- Top Active Users -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <h2 class="text-sm font-semibold mb-4">Most Active Users</h2>
        {#if data.audit_logs?.top_active_users?.length}
          <div class="space-y-3">
            {#each data.audit_logs.top_active_users.slice(0, 5) as user, i}
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-base-content/20 w-4 text-center tabular-nums">{i + 1}</span>
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <span class="text-sm flex-1 truncate leading-tight">{user.name}</span>
                <span class="text-xs font-bold tabular-nums bg-base-200 px-2 py-0.5 rounded-full">{user.activity_count}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

      <!-- Top Audit Actions -->
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <h2 class="text-sm font-semibold mb-4">Top Actions</h2>
        {#if data.audit_logs?.by_action?.length}
          {@const topActions = data.audit_logs.by_action.slice(0, 6)}
          {@const maxCount = maxOf(topActions, 'count')}
          <div class="space-y-3">
            {#each topActions as item}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 truncate pr-2">{fmtAction(item.action)}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{item.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-warning h-full rounded-full transition-all duration-500"
                    style="width:{pct(item.count, maxCount)}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

    </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         SECTION 4 — Audit Log Summary
    ═══════════════════════════════════════════════════════════════════════════ -->
    <div class="bg-base-100 rounded-2xl border border-base-200 p-5">
      <h2 class="text-sm font-semibold mb-4">Audit Log Summary</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-base-200 rounded-xl overflow-hidden">
        {#each [
          { label: 'Today',       value: data.audit_logs?.today ?? 0 },
          { label: 'Last 7 Days', value: data.audit_logs?.last_7_days ?? 0 },
          { label: 'Last 30 Days',value: data.audit_logs?.last_30_days ?? 0 },
          { label: 'All Time',    value: data.audit_logs?.total ?? 0 }
        ] as stat}
          <div class="bg-base-100 px-4 py-4 text-center">
            <p class="text-2xl font-bold tabular-nums">{stat.value.toLocaleString()}</p>
            <p class="text-xs text-base-content/40 mt-0.5">{stat.label}</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════════════════
         SECTION 5 — Deleted Users callout (if any)
    ═══════════════════════════════════════════════════════════════════════════ -->
    {#if (data.users?.deleted ?? 0) > 0}
      <div class="alert alert-warning">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>
          <span class="font-semibold">{data.users.deleted}</span> deleted user account{data.users.deleted !== 1 ? 's' : ''} on record.
          Visit <a href="/admin/lis/users" class="link link-warning font-medium">User Management</a> to review or restore them.
        </span>
      </div>
    {/if}

  {/if}

</div>
