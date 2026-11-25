<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { api } from '$lib/api/client.js';
  import { natureOfCaseLabel } from '$lib/constants/intake-sheets.js';
  import { natureOfConcernLabel, relationshipLabel } from '$lib/constants/learner-reports.js';
  import TrendLineChart from '$lib/components/TrendLineChart.svelte';
  import PeriodPicker from '$lib/components/PeriodPicker.svelte';
  import { phNow, schoolReportsService } from '$lib/api/school-reports.js';

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let data = $state(null);
  /** @type {any} */
  let reportStats = $state(null);

  const isRegional = authState.user?.organizationLevel === 'regional';
  const isSchool = authState.user?.organizationLevel === 'school';
  /** @type {any[]} */
  let divisions = $state([]);
  let divisionFilter = $state('');

  // Period (like the Incident Summary): all time by default.
  const nowPH = phNow();
  let periodType = $state('all');
  let periodYear = $state(nowPH.year);
  let periodMonth = $state(nowPH.month);
  let periodQuarter = $state(nowPH.quarter);

  onMount(async () => {
    if (isRegional) {
      try {
        const res = await api.get('/divisions/all');
        divisions = res.data || [];
      } catch (e) {
        divisions = [];
      }
    }
    await load();
  });

  // School accounts: this month's zero incident report status.
  /** @type {any} */
  let thisMonth = $state(null);
  /** Past months with nothing recorded and no zero report yet. @type {any[]} */
  let overdueMonths = $state([]);
  async function loadThisMonth() {
    if (!isSchool) return;
    const res = await schoolReportsService.getMine();
    thisMonth = res.success ? (res.data?.current ?? null) : null;
    overdueMonths = res.success ? (res.data?.overdue ?? []) : [];
  }

  async function load() {
    loadThisMonth();
    loading = true;
    error = '';
    /** @type {Record<string,any>} */
    const params = {};
    if (divisionFilter) params.division_id = divisionFilter;
    if (periodType !== 'all') {
      params.period_type = periodType;
      params.year = periodYear;
      if (periodType === 'monthly') params.month = periodMonth;
      if (periodType === 'quarterly') params.quarter = periodQuarter;
    }

    const [sheetsRes, reportsRes] = await Promise.all([
      intakeSheetsService.getStatistics(params),
      learnerReportsService.getStatistics(params)
    ]);

    if (sheetsRes.success) {
      data = sheetsRes.data;
    } else {
      error = sheetsRes.error || 'Failed to load dashboard.';
    }
    if (reportsRes.success) reportStats = reportsRes.data;

    loading = false;
  }

  function handleFilterChange() {
    load();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  /** @param {number} n @param {number} total */
  function pct(n, total) {
    if (!total) return 0;
    return Math.round((n / total) * 100);
  }
  /** @param {string} sex */
  function sexLabel(sex) {
    return sex === 'MALE' ? 'Male' : sex === 'FEMALE' ? 'Female' : 'Unspecified';
  }
  /** @param {number|null|undefined} hours */
  function fmtHours(hours) {
    if (hours === null || hours === undefined) return '—';
    if (hours < 24) return `${hours}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  // Every card/chart below carries a colored top edge + its section's icon so
  // it's recognizable which data source it belongs to even out of context of
  // the section header (Intake Sheets = primary, Learner Reports = accent —
  // kept consistent with the Super Admin dashboard's matching panels).
  const SHEET_CARD = 'bg-base-100 rounded-2xl p-5 border border-base-200 border-t-2 border-t-primary/50';
  const REPORT_CARD = 'bg-base-100 rounded-2xl p-5 border border-base-200 border-t-2 border-t-accent/50';

  // Combined trend chart — merges both series' independently-fetched 6-month
  // windows into one aligned month list (they cover the same calendar window,
  // but are joined by month key rather than assumed to already match 1:1).
  let trendMonths = $derived.by(() => {
    /** @type {Map<string, {month: string, label: string, sheets: number, reports: number}>} */
    const byMonth = new Map();
    for (const m of data?.monthly_trend || []) {
      byMonth.set(m.month, { month: m.month, label: m.label, sheets: m.count, reports: 0 });
    }
    for (const m of reportStats?.monthly_trend || []) {
      const existing = byMonth.get(m.month);
      if (existing) existing.reports = m.count;
      else byMonth.set(m.month, { month: m.month, label: m.label, sheets: 0, reports: m.count });
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  });
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div>
      <p class="text-xs text-base-content/40 uppercase tracking-wider mb-0.5">Dashboard</p>
      <h1 class="text-2xl font-bold">{authState.user?.fullName || 'Focal Person'}</h1>
      <p class="text-sm text-base-content/50 mt-0.5">Learner Rights &amp; Protection{#if data?.period && data.period.type !== 'all'} · <span class="font-medium text-base-content/70">{data.period.label}</span>{/if}</p>
    </div>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <PeriodPicker bind:type={periodType} bind:year={periodYear} bind:month={periodMonth} bind:quarter={periodQuarter} onchange={load} />
      {#if isRegional && divisions.length}
        <select class="select select-bordered select-sm w-full sm:w-48" bind:value={divisionFilter} onchange={handleFilterChange}>
          <option value="">All Divisions</option>
          {#each divisions as d}
            <option value={String(d.division_id)}>{d.name}</option>
          {/each}
        </select>
      {:else if authState.getOrgLabel()}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-base-100 border border-base-200 rounded-xl text-xs">
          <span class="w-2 h-2 rounded-full bg-primary"></span>
          <span class="text-base-content/60">{authState.getOrgLabel()}</span>
        </div>
      {/if}
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
    {#if isSchool && thisMonth}
      <!-- This month's report (school accounts) -->
      {@const needs = thisMonth.status === 'no_report'}
      <div class="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 {needs ? 'border-error/30 bg-error/5' : thisMonth.status === 'zero_incident' ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/10'}">
        <div class="flex items-start gap-3 min-w-0">
          <span class="grid place-items-center w-10 h-10 rounded-xl shrink-0 {needs ? 'bg-error/15 text-error' : thisMonth.status === 'zero_incident' ? 'bg-success/15 text-success' : 'bg-warning/25 text-warning-content'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
          </span>
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-wide text-base-content/50">This month's report · {thisMonth.period_label}</p>
            {#if needs}
              <p class="font-semibold">Not yet reported</p>
              <p class="text-xs text-base-content/70">If no learner rights or protection incident happened this month, report zero incident.</p>
            {:else if thisMonth.status === 'zero_incident'}
              <p class="font-semibold">Zero incident report filed</p>
              <p class="text-xs text-base-content/70">You can update it until the month ends.</p>
            {:else}
              <p class="font-semibold">{thisMonth.incident_count} incident{thisMonth.incident_count === 1 ? '' : 's'} recorded — reported automatically</p>
              <p class="text-xs text-base-content/70">Months with recorded incidents don't need a zero incident report.</p>
            {/if}
          </div>
        </div>
        <div class="flex gap-2 ml-auto">
          {#if needs || thisMonth.status === 'zero_incident'}
            <button class="btn btn-sm {needs ? 'btn-success' : 'btn-outline'}" onclick={() => goto('/admin/lrp/school-report?file=current')}>
              {needs ? 'Report zero incident' : 'Update zero incident report'}
            </button>
          {/if}
          <button class="btn btn-sm btn-ghost border border-base-300" onclick={() => goto('/admin/lrp/school-report?file=pick')}>Report zero incident for another month</button>
        </div>
        {#if overdueMonths.length}
          <div class="w-full flex flex-wrap items-center justify-between gap-2 border-t border-base-content/10 pt-3">
            <p class="text-sm"><span class="font-semibold text-error">{overdueMonths.length} past month{overdueMonths.length === 1 ? '' : 's'}</span> with no report: {overdueMonths.map((/** @type {any} */ m) => m.period_label).join(', ')}</p>
            <button class="btn btn-sm btn-outline btn-error" onclick={() => goto('/admin/lrp/school-report')}>Report past months</button>
          </div>
        {/if}
      </div>
    {/if}
    {#if (data.summary?.drafts ?? 0) > 0}
      <button
        type="button"
        class="alert bg-base-200/60 border border-base-300 text-sm w-full text-left hover:bg-base-200 transition-colors"
        onclick={() => goto('/admin/lrp/intake-sheets?status=draft')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
        </svg>
        <span><strong>{data.summary.drafts}</strong> intake sheet{data.summary.drafts !== 1 ? 's' : ''} still in draft — not counted below until finalized. Tap to view.</span>
      </button>
    {/if}
    {#if (reportStats?.summary?.new ?? 0) > 0}
      <button
        type="button"
        class="alert bg-accent/10 border border-accent/30 text-sm w-full text-left hover:bg-accent/20 transition-colors"
        onclick={() => goto('/admin/lrp/reports?status=new')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0 text-accent">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
        </svg>
        <span><strong>{reportStats.summary.new}</strong> new learner report{reportStats.summary.new !== 1 ? 's' : ''} awaiting triage. Tap to review.</span>
      </button>
    {/if}

    <!-- ═══════════════════════════════════════════════════════════════════
         Intake Sheets — the actual case record. Identity color: primary.
    ═══════════════════════════════════════════════════════════════════ -->
    <div class="flex items-center gap-2">
      <span class="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-primary">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h6"/>
        </svg>
      </span>
      <p class="text-xs font-semibold text-primary uppercase tracking-wider">Intake Sheet / Incident Report</p>
    </div>

    <!-- Section 1 — Key Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <button type="button" class="{SHEET_CARD} hover:shadow-sm transition-shadow text-left w-full cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets')}>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Total Cases</span>
          <span class="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-primary">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.total ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{data.summary?.recently_added ?? 0} new in last 30 days · tap to view</p>
      </button>

      <button type="button" class="{SHEET_CARD} hover:shadow-sm transition-shadow text-left w-full cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=awaiting_me')}>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Awaiting My Office</span>
          <span class="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-warning">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.pending_review ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Forwarded or returned to your office for review · tap to view</p>
      </button>

      <button type="button" class="{SHEET_CARD} hover:shadow-sm transition-shadow text-left w-full cursor-pointer" onclick={() => goto('/admin/lrp/intake-sheets?status=resolved')}>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">Resolved</span>
          <span class="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-success">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.resolved ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">{pct(data.summary?.resolved ?? 0, data.summary?.total ?? 0)}% of total · tap to view</p>
      </button>

      <div class="{SHEET_CARD} hover:shadow-sm transition-shadow">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-base-content/40 uppercase tracking-wider">New This Month</span>
          <span class="w-8 h-8 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-info">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>
            </svg>
          </span>
        </div>
        <p class="text-3xl font-bold tracking-tight">{data.summary?.recently_added ?? '—'}</p>
        <p class="text-xs text-base-content/40 mt-1.5">Last 30 days</p>
      </div>
    </div>

    <!-- Section 2 — Nature of Case + Learner Sex (monthly trend moved to the
         combined chart below, alongside Learner Reports) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class={SHEET_CARD}>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold">Nature of Case</h2>
          <span class="text-xs text-base-content/30 font-mono">{data.summary?.total ?? 0} total</span>
        </div>
        {#if data.by_nature_of_case?.length}
          <div class="space-y-3">
            {#each data.by_nature_of_case as row}
              {@const w = pct(row.count, data.summary?.total)}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={natureOfCaseLabel(row.nature_of_case)}>{natureOfCaseLabel(row.nature_of_case)}</span>
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

      <!-- Learner-victims and respondents, counted separately -->
      <div class={SHEET_CARD}>
        <h2 class="text-sm font-semibold mb-4">Learner-Victims and Respondents</h2>
        {#if data.people && (data.people.victims.total || data.people.respondents.total || data.people.respondents.unidentified_cases)}
          {@const v = data.people.victims}
          {@const r = data.people.respondents}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <p class="text-xs font-semibold text-primary mb-2">Learner-victims <span class="text-base-content/50 font-normal">({v.total})</span></p>
              <div class="space-y-2">
                {#each [['Female', v.female, 'bg-secondary'], ['Male', v.male, 'bg-info'], ['Not recorded', v.not_recorded, 'bg-base-300']] as [label, n, bar]}
                  {#if n || label !== 'Not recorded'}
                    <div class="flex items-center gap-2 text-xs">
                      <span class="w-20 shrink-0 text-base-content/70">{label}</span>
                      <div class="flex-1 bg-base-200 rounded-full h-2 overflow-hidden"><div class="{bar} h-full rounded-full" style="width:{pct(Number(n), v.total)}%"></div></div>
                      <span class="w-6 text-right font-bold tabular-nums">{n}</span>
                    </div>
                  {/if}
                {/each}
              </div>
              {#if v.cases_without}<p class="text-[11px] text-base-content/50 mt-2">{v.cases_without} case{v.cases_without === 1 ? '' : 's'} with no learner-victim (Non-bullying)</p>{/if}
            </div>
            <div>
              <p class="text-xs font-semibold text-error mb-2">Respondents <span class="text-base-content/50 font-normal">({r.total})</span></p>
              <div class="space-y-2">
                {#each [['Female', r.female, 'bg-secondary'], ['Male', r.male, 'bg-info'], ['Not recorded', r.not_recorded, 'bg-base-300']] as [label, n, bar]}
                  {#if n || label !== 'Not recorded'}
                    <div class="flex items-center gap-2 text-xs">
                      <span class="w-20 shrink-0 text-base-content/70">{label}</span>
                      <div class="flex-1 bg-base-200 rounded-full h-2 overflow-hidden"><div class="{bar} h-full rounded-full" style="width:{pct(Number(n), r.total)}%"></div></div>
                      <span class="w-6 text-right font-bold tabular-nums">{n}</span>
                    </div>
                  {/if}
                {/each}
              </div>
              <div class="flex flex-wrap gap-1.5 mt-3">
                <span class="badge badge-sm badge-ghost">School personnel: {r.school_personnel}</span>
                <span class="badge badge-sm badge-ghost">Student: {r.student}</span>
                <span class="badge badge-sm badge-ghost">Other: {r.other}</span>
                {#if r.unidentified_cases}<span class="badge badge-sm badge-warning badge-soft">Not yet identified: {r.unidentified_cases}</span>{/if}
              </div>
            </div>
          </div>
        {:else}
          <p class="text-sm text-base-content/30 text-center py-4">No data</p>
        {/if}
      </div>
    </div>

    <!-- Section 3 — By Division (regional only) + Top Schools -->
    <div class="grid grid-cols-1 {data.by_division?.length ? 'lg:grid-cols-2' : ''} gap-4">
      {#if data.by_division?.length}
        <div class={SHEET_CARD}>
          <h2 class="text-sm font-semibold mb-4">By Division</h2>
          <div class="space-y-3">
            {#each data.by_division as row}
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2" title={row.name}>{row.name}</span>
                  <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                </div>
                <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                  <div class="bg-primary h-full rounded-full transition-all duration-500" style="width:{pct(row.count, data.summary?.total)}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if isSchool}
        <!-- School accounts: their own school only, so cases by grade level instead -->
        <div class={SHEET_CARD}>
          <h2 class="text-sm font-semibold mb-1">Cases by Grade Level</h2>
          <p class="text-xs text-base-content/50 mb-4">Learner-victims, student respondents and learner reports, with the sections that have the most.</p>
          {#if data.by_grade?.length}
            {@const maxGrade = Math.max(1, ...data.by_grade.map((/** @type {any} */ g) => g.count))}
            <div class="space-y-3">
              {#each data.by_grade as g}
                <div>
                  <div class="flex justify-between items-baseline mb-1 gap-2">
                    <span class="text-xs font-medium {g.grade ? '' : 'text-base-content/50 italic'}">{g.label}</span>
                    <span class="text-xs font-bold shrink-0 tabular-nums">{g.count}</span>
                  </div>
                  <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-primary h-full rounded-full transition-all duration-500" style="width:{(g.count / maxGrade) * 100}%"></div>
                  </div>
                  <p class="text-[11px] text-base-content/60 mt-1">
                    {[g.victims ? `${g.victims} learner-victim${g.victims === 1 ? '' : 's'}` : '', g.respondents ? `${g.respondents} student respondent${g.respondents === 1 ? '' : 's'}` : '', g.reports ? `${g.reports} learner report${g.reports === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
                  </p>
                  {#if g.sections?.length}
                    <p class="text-[11px] text-base-content/50 break-words">Sections: {g.sections.map((/** @type {any} */ sec) => `${sec.name} (${sec.count})`).join(' · ')}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/30 text-center py-4">No data</p>
          {/if}
        </div>
      {:else}
        <div class={SHEET_CARD}>
          <h2 class="text-sm font-semibold mb-4">Schools with the Most Cases</h2>
          {#if data.by_school?.length}
            <div class="space-y-3">
              {#each data.by_school as row, i}
                <div class="flex items-center gap-3">
                  <span class="text-xs font-bold text-base-content/20 w-4 text-center tabular-nums">{i + 1}</span>
                  <span class="text-sm flex-1 line-clamp-2 break-words min-w-0 leading-tight" title={row.name}>{row.name}</span>
                  <span class="text-xs font-bold tabular-nums bg-base-200 px-2 py-0.5 rounded-full">{row.count}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/30 text-center py-4">No data</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         Learner Reports — submissions from the public report form, ahead of
         (and separate from) full intake sheets. Identity color: accent.
    ═══════════════════════════════════════════════════════════════════ -->
    {#if reportStats}
      <div class="flex items-center justify-between pt-2">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3 text-accent">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
            </svg>
          </span>
          <p class="text-xs font-semibold text-accent uppercase tracking-wider">Learner Reports</p>
        </div>
        <button class="btn btn-ghost btn-xs" onclick={() => goto('/admin/lrp/reports')}>View All →</button>
      </div>

      <div class="bg-base-100 rounded-2xl border border-base-200 border-t-2 border-t-accent/50 p-5">
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
        <div class="flex items-center justify-between mt-3 text-xs text-base-content/40">
          <span>Tap a number above to view that list — {reportStats.summary?.dismissed ?? 0} dismissed · {reportStats.summary?.recently_added ?? 0} new in last 30 days</span>
          <span class="hidden sm:inline">Avg. time to first review: <span class="font-semibold text-base-content/60">{fmtHours(reportStats.summary?.avg_review_hours)}</span></span>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class={REPORT_CARD}>
          <h2 class="text-sm font-semibold mb-4">Nature of Concern</h2>
          {#if reportStats.by_nature_of_concern?.length}
            <div class="space-y-3">
              {#each reportStats.by_nature_of_concern as row}
                {@const w = pct(row.count, reportStats.summary?.total)}
                <div>
                  <div class="flex justify-between items-baseline mb-1">
                    <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={natureOfConcernLabel(row.nature_of_concern)}>{natureOfConcernLabel(row.nature_of_concern)}</span>
                    <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                  </div>
                  <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-accent h-full rounded-full transition-all duration-500" style="width:{w}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/30 text-center py-4">No data</p>
          {/if}
        </div>

        <div class={REPORT_CARD}>
          <h2 class="text-sm font-semibold mb-4">Who's Reporting</h2>
          {#if reportStats.by_relationship?.length}
            <div class="space-y-3">
              {#each reportStats.by_relationship as row}
                {@const w = pct(row.count, reportStats.summary?.total)}
                <div>
                  <div class="flex justify-between items-baseline mb-1">
                    <span class="text-xs text-base-content/60 line-clamp-2 break-words min-w-0 pr-2 leading-tight" title={relationshipLabel(row.relationship)}>{relationshipLabel(row.relationship)}</span>
                    <span class="text-xs font-bold shrink-0 tabular-nums">{row.count}</span>
                  </div>
                  <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-accent h-full rounded-full transition-all duration-500" style="width:{w}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-base-content/30 text-center py-4">No data</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Combined trend — both series on one shared count axis, so volume can
         actually be compared month to month instead of read from two
         separate mini-charts. -->
    {#if trendMonths.length}
      <div class="bg-base-100 rounded-2xl p-5 border border-base-200">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-sm font-semibold">Monthly Volume</h2>
        </div>
        <p class="text-xs text-base-content/30 mb-4">{data?.period && data.period.type !== 'all' ? `6 months up to ${data.monthly_trend?.[data.monthly_trend.length - 1]?.label ?? ''}` : 'Past 6 months'}</p>
        <TrendLineChart
          months={trendMonths.map((m) => ({ label: m.label }))}
          series={[
            { name: 'Intake Sheet / Incident Report', color: 'var(--color-primary)', values: trendMonths.map((m) => m.sheets) },
            { name: 'Learner Reports', color: 'var(--color-accent)', values: trendMonths.map((m) => m.reports) }
          ]}
        />
      </div>
    {/if}

    <!-- Quick links -->
    <div class="bg-base-100 rounded-2xl border border-base-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p class="text-sm text-base-content/60">View, review, or file a new intake sheet — or triage an incoming learner report.</p>
      <div class="flex gap-2 w-full sm:w-auto">
        <button class="btn btn-outline btn-sm flex-1 sm:flex-none" onclick={() => goto('/admin/lrp/reports')}>
          <span class="w-2 h-2 rounded-full bg-accent shrink-0"></span>
          Learner Reports
        </button>
        <button class="btn btn-primary btn-sm flex-1 sm:flex-none" onclick={() => goto('/admin/lrp/intake-sheets')}>
          Intake Sheet / Incident Report
        </button>
      </div>
    </div>
  {/if}
</div>
