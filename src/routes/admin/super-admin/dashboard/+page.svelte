<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { dashboardService } from '$lib/api/dashboard.js';
  import { divisionsService } from '$lib/api/divisions.js';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { learnerReportsService } from '$lib/api/learner-reports.js';

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let data = $state(null);
  /** @type {any} */
  let divisionStats = $state(null);
  /** @type {any} */
  let lrp = $state(null);
  /** @type {any} */
  let reportStats = $state(null);

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    const [dashRes, divRes, lrpRes, reportsRes] = await Promise.all([
      dashboardService.getDashboard(),
      divisionsService.getStatistics(),
      intakeSheetsService.getStatistics(),
      learnerReportsService.getStatistics()
    ]);

    if (dashRes.success) {
      data = dashRes.data;
    } else {
      error = dashRes.error || 'Failed to load dashboard.';
    }
    if (divRes.success) divisionStats = divRes.data;
    if (lrpRes.success) lrp = lrpRes.data;
    if (reportsRes.success) reportStats = reportsRes.data;
    loading = false;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  /** @param {string} action */
  function fmtAction(action) {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <p class="text-xs text-base-content/40 uppercase tracking-wider mb-0.5">Dashboard</p>
      <h1 class="text-2xl font-bold">{authState.user?.firstName || 'Administrator'}</h1>
      <p class="text-sm text-base-content/50 mt-0.5">Super Admin · Regional Overview</p>
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each [1, 2, 3, 4] as _}
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
      <button class="btn btn-sm btn-ghost" onclick={load}>Retry</button>
    </div>

  {:else if data}

    <!-- Section 1 — Key Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Divisions</span>
          <span class="w-8 h-8 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-info">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{divisionStats?.total_divisions ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{divisionStats?.active_divisions ?? 0} active</p>
      </div>

      <div class="bg-base-100 rounded-2xl p-5 border border-base-200 hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Schools</span>
          <span class="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-secondary">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{divisionStats?.total_schools ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Across the region</p>
      </div>

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
    </div>

    <!-- Section 2 — Intake Sheets + Learner Reports snapshots. Same identity
         colors as the LRP dashboard (primary = Intake Sheets, accent = Learner
         Reports) so the two data sources read as distinct at a glance here too. -->
    {#if lrp}
      <div class="bg-base-100 rounded-2xl border border-base-200 border-t-2 border-t-primary/50 p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-primary">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h6"/>
              </svg>
            </span>
            <h2 class="text-sm font-semibold">Intake Sheet / Incident Report</h2>
          </div>
          <button class="btn btn-ghost btn-xs" onclick={() => goto('/admin/lrp/dashboard')}>
            Full LRP Dashboard →
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-base-200 rounded-xl overflow-hidden">
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets')}>
            <p class="text-2xl font-bold tabular-nums">{lrp.summary?.total ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Total Cases</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=pending_review')}>
            <p class="text-2xl font-bold tabular-nums text-warning">{lrp.summary?.pending_review ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Pending Review</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=reviewed')}>
            <p class="text-2xl font-bold tabular-nums text-success">{lrp.summary?.reviewed ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Reviewed</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=draft')}>
            <p class="text-2xl font-bold tabular-nums text-base-content/50">{lrp.summary?.drafts ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Drafts</p>
          </button>
        </div>
        <p class="text-xs text-base-content/40 mt-3">Tap a number above to view that list</p>
      </div>
    {/if}

    {#if reportStats}
      <div class="bg-base-100 rounded-2xl border border-base-200 border-t-2 border-t-accent/50 p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-accent">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
              </svg>
            </span>
            <h2 class="text-sm font-semibold">Learner Reports</h2>
          </div>
          <button class="btn btn-ghost btn-xs" onclick={() => goto('/admin/lrp/reports')}>
            View All →
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-base-200 rounded-xl overflow-hidden">
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports')}>
            <p class="text-2xl font-bold tabular-nums">{reportStats.summary?.total ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Total</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports?status=new')}>
            <p class="text-2xl font-bold tabular-nums text-warning">{reportStats.summary?.new ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">New</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports?status=under_review')}>
            <p class="text-2xl font-bold tabular-nums text-info">{reportStats.summary?.under_review ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Under Review</p>
          </button>
          <button type="button" class="bg-base-100 hover:bg-base-200 transition-colors px-4 py-4 text-center cursor-pointer" onclick={() => goto('/admin/lrp/reports?status=linked')}>
            <p class="text-2xl font-bold tabular-nums text-success">{reportStats.summary?.linked ?? 0}</p>
            <p class="text-xs text-base-content/40 mt-0.5">Linked</p>
          </button>
        </div>
        <p class="text-xs text-base-content/40 mt-3">Tap a number above to view that list</p>
      </div>
    {/if}

    <!-- Section 3 — Users Breakdown + Daily Activity -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                  <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={row.role}>{row.role}</span>
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
                  <div class="bg-info h-full rounded-full transition-all duration-500" style="width:{pct(row.count, data.users.total)}%"></div>
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
                title="{day.date}: {day.count}"
              ></div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-6">No activity data</p>
        {/if}
      </div>
    </div>

    <!-- Section 4 — Top Actions + Failed Logins -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <h2 class="text-sm font-semibold mb-4">Top Actions</h2>
        {#if data.audit_logs?.by_action?.length}
          {@const topActions = data.audit_logs.by_action.slice(0, 6)}
          {@const maxCount = maxOf(topActions, 'count')}
          <div class="space-y-3">
            {#each topActions as item}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2" title={fmtAction(item.action)}>{fmtAction(item.action)}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{item.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-warning h-full rounded-full transition-all duration-500" style="width:{pct(item.count, maxCount)}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>

      <div class="rounded-2xl p-5 border transition-shadow hover:shadow-sm
        {failedLogins > 0 ? 'bg-error/5 border-error/20' : 'bg-base-100 border-base-200'}">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold {failedLogins > 0 ? 'text-error' : ''}">Failed Logins</h2>
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
        {#if data.audit_logs?.top_active_users?.length}
          <div class="mt-4 pt-3 border-t border-base-200 space-y-2">
            <p class="text-xs text-base-content/40 mb-2">Most active users</p>
            {#each data.audit_logs.top_active_users.slice(0, 3) as u, i}
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-base-content/20 w-4 text-center tabular-nums">{i + 1}</span>
                <span class="text-sm flex-1 line-clamp-2 break-words min-w-0" title={u.name}>{u.name}</span>
                <span class="text-xs font-bold tabular-nums bg-base-200 px-2 py-0.5 rounded-full">{u.activity_count}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Quick links -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <button class="btn btn-outline btn-sm justify-start" onclick={() => goto('/admin/super-admin/users')}>User Management</button>
      <button class="btn btn-outline btn-sm justify-start" onclick={() => goto('/admin/super-admin/logs')}>Audit Logs</button>
      <button class="btn btn-outline btn-sm justify-start" onclick={() => goto('/admin/lrp/intake-sheets')}>Intake Sheet / Incident Report</button>
      <button class="btn btn-outline btn-sm justify-start" onclick={() => goto('/admin/lrp/reports')}>Learner Reports</button>
    </div>

    <!-- Deleted users callout -->
    {#if (data.users?.deleted ?? 0) > 0}
      <div class="alert bg-warning/10 border border-warning/30">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>
          <span class="font-semibold">{data.users.deleted}</span> deleted user account{data.users.deleted !== 1 ? 's' : ''} on record.
          Visit <a href="/admin/super-admin/users" class="link text-warning font-medium">User Management</a> to review or restore them.
        </span>
      </div>
    {/if}

  {/if}
</div>
