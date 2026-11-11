<script>
  // Which schools have filed their monthly incident report (zero or with
  // incidents) and which haven't — by month or by quarter. Shared by the
  // Super Admin, Division Admin and division/regional Focal Person pages;
  // the backend scopes the school list to what the account may see.
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import { schoolReportsService, reportStatus, MONTH_NAMES, phNow } from '$lib/api/school-reports.js';
  import SchoolAccountDialog from '$lib/components/SchoolAccountDialog.svelte';

  /** @type {{ canFilterDivision?: boolean, canEditPersonnel?: boolean }} */
  let { canFilterDivision = false, canEditPersonnel = false } = $props();

  const now = phNow();
  let periodType = $state('monthly');
  let year = $state(now.year);
  let month = $state(now.month);
  let quarter = $state(now.quarter);
  let divisionId = $state('');
  /** @type {any[]} */
  let divisions = $state([]);

  /** @type {any} */
  let data = $state(null);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let statusFilter = $state('all');
  let search = $state('');
  let downloading = $state(false);
  let reminding = $state(false);

  /** @type {HTMLDialogElement|null} */
  let remindDialog = $state(null);
  /** @type {any} */
  let accountDialog = $state(null);

  const years = Array.from({ length: now.year - 2023 }, (_, i) => now.year - i);

  const params = $derived({
    period_type: periodType, year,
    ...(periodType === 'quarterly' ? { quarter } : { month }),
    ...(divisionId ? { division_id: divisionId } : {})
  });

  onMount(async () => {
    if (canFilterDivision) {
      try { divisions = (await api.get('/divisions/all')).data ?? []; } catch { divisions = []; }
    }
    load();
  });

  async function load() {
    loading = true; error = '';
    const res = await schoolReportsService.getCompliance(params);
    loading = false;
    if (res.success) data = res.data;
    else error = res.error || 'Could not load compliance.';
  }

  /** @type {Record<string, (s: any) => boolean>} */
  const FILTERS = {
    all: () => true,
    no_report: (s) => s.status === 'no_report',
    partial: (s) => s.status === 'partial',
    zero_incident: (s) => s.status === 'zero_incident',
    with_incidents: (s) => s.status === 'with_incidents',
    discrepancy: (s) => s.discrepancy,
    no_account: (s) => !s.has_account
  };

  const rows = $derived.by(() => {
    const list = /** @type {any[]} */ (data?.schools ?? []);
    const q = search.trim().toLowerCase();
    return list.filter((s) => (FILTERS[statusFilter] ?? FILTERS.all)(s)
      && (!q || s.school_name.toLowerCase().includes(q) || String(s.school_id_number).toLowerCase().includes(q)));
  });

  const s = $derived(data?.summary);
  const multiDivision = $derived(new Set((data?.schools ?? []).map((/** @type {any} */ x) => x.division?.id)).size > 1);

  const chips = $derived(s ? [
    { key: 'all', label: 'All', n: s.schools },
    { key: 'no_report', label: 'No report', n: s.no_report, tone: 'error' },
    ...(periodType === 'quarterly' ? [{ key: 'partial', label: 'Incomplete', n: s.partial, tone: 'warning' }] : []),
    { key: 'zero_incident', label: 'Zero incident', n: s.zero_incident, tone: 'success' },
    { key: 'with_incidents', label: 'With incidents', n: s.with_incidents, tone: 'warning' },
    { key: 'discrepancy', label: 'Discrepancy', n: s.discrepancies, tone: 'error' },
    { key: 'no_account', label: 'No account', n: s.without_account }
  ] : []);

  async function downloadPdf() {
    downloading = true;
    const res = await schoolReportsService.compliancePdf(params);
    downloading = false;
    if (!res.success) error = res.error || 'Could not generate the PDF.';
  }

  async function sendReminders() {
    reminding = true;
    const res = await schoolReportsService.sendReminders({ year, month, division_id: divisionId || undefined });
    reminding = false;
    remindDialog?.close();
    if (res.success) notice = `${res.data.reminded} school(s) emailed a reminder for ${res.data.period}${res.data.skipped_no_email ? ` · ${res.data.skipped_no_email} have no email on file` : ''}.`;
    else error = res.error || 'Could not send reminders.';
  }

  /** @param {any} school */
  const openPersonnel = (school) => accountDialog?.open(school.school_id, school.school_name);

  /** @param {string} iso */
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '';
  /** @param {number} n */
  const pct = (n) => (s?.schools ? (n / s.schools) * 100 : 0);
</script>

<div class="space-y-5">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold">Report Compliance</h1>
      <p class="text-sm text-base-content/60 mt-1">Every school must file a report each month — "zero incident" counts. {data?.scope_label ?? ''}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if periodType === 'monthly' && data && s?.no_report > 0}
        <button class="btn btn-outline btn-sm" onclick={() => remindDialog?.showModal()}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
          Email reminders
        </button>
      {/if}
      <button class="btn btn-primary btn-sm" disabled={downloading || !data} onclick={downloadPdf}>
        {#if downloading}<span class="loading loading-spinner loading-xs"></span>{:else}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
        {/if}
        Download PDF
      </button>
    </div>
  </div>

  <!-- Period controls -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="join">
      <button class="join-item btn btn-sm {periodType === 'monthly' ? 'btn-active' : ''}" onclick={() => { periodType = 'monthly'; load(); }}>Monthly</button>
      <button class="join-item btn btn-sm {periodType === 'quarterly' ? 'btn-active' : ''}" onclick={() => { periodType = 'quarterly'; load(); }}>Quarterly</button>
    </div>
    <select class="select select-bordered select-sm w-24" bind:value={year} onchange={load} aria-label="Year">
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
    {#if periodType === 'monthly'}
      <select class="select select-bordered select-sm w-36" bind:value={month} onchange={load} aria-label="Month">
        {#each MONTH_NAMES as name, i}<option value={i + 1}>{name}</option>{/each}
      </select>
    {:else}
      <select class="select select-bordered select-sm w-44" bind:value={quarter} onchange={load} aria-label="Quarter">
        <option value={1}>Q1 (Jan–Mar)</option><option value={2}>Q2 (Apr–Jun)</option>
        <option value={3}>Q3 (Jul–Sep)</option><option value={4}>Q4 (Oct–Dec)</option>
      </select>
    {/if}
    {#if canFilterDivision && divisions.length}
      <select class="select select-bordered select-sm w-44 {divisionId ? 'border-primary' : ''}" bind:value={divisionId} onchange={load} aria-label="Division">
        <option value="">All divisions</option>
        {#each divisions as d}<option value={String(d.division_id)}>{d.name}</option>{/each}
      </select>
    {/if}
  </div>

  {#if notice}
    <div class="rounded-lg border border-success/30 bg-success/10 p-3 text-sm flex items-start justify-between gap-2">
      <span>{notice}</span><button class="btn btn-ghost btn-xs" onclick={() => (notice = '')} aria-label="Dismiss">✕</button>
    </div>
  {/if}
  {#if error}<div class="alert alert-error text-sm"><span>{error}</span></div>{/if}

  {#if loading && !data}
    <div class="py-16 text-center"><span class="loading loading-spinner loading-lg"></span></div>
  {:else if data && s}
    <!-- Headline -->
    <div class="card bg-base-100 border border-base-200 shadow-sm {loading ? 'opacity-60' : ''}">
      <div class="card-body p-4 sm:p-5 gap-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="font-semibold">{data.period.label}{#if !data.period.is_past}<span class="badge badge-ghost badge-sm ml-2">in progress</span>{/if}</p>
          <p class="text-sm"><span class="text-2xl font-bold tabular-nums">{s.compliance_rate}%</span> <span class="text-base-content/60">compliant · {s.complete} of {s.schools} schools</span></p>
        </div>
        <!-- Status distribution: one bar, four segments, same colours as the badges -->
        <div class="flex h-3 w-full overflow-hidden rounded-full bg-base-200" role="img" aria-label="{s.zero_incident} zero incident, {s.with_incidents} with incidents, {s.partial} incomplete, {s.no_report} no report">
          <div class="bg-success" style="width: {pct(s.zero_incident)}%"></div>
          <div class="bg-warning" style="width: {pct(s.with_incidents)}%"></div>
          <div class="bg-warning/40" style="width: {pct(s.partial)}%"></div>
          <div class="bg-error" style="width: {pct(s.no_report)}%"></div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full bg-success"></span>Zero incident <strong class="ml-auto sm:ml-1 tabular-nums">{s.zero_incident}</strong></div>
          <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full bg-warning"></span>With incidents <strong class="ml-auto sm:ml-1 tabular-nums">{s.with_incidents}</strong></div>
          {#if periodType === 'quarterly'}<div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full bg-warning/40"></span>Incomplete <strong class="ml-auto sm:ml-1 tabular-nums">{s.partial}</strong></div>{/if}
          <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full bg-error"></span>No report <strong class="ml-auto sm:ml-1 tabular-nums">{s.no_report}</strong></div>
        </div>
        <p class="text-xs text-base-content/60">
          {s.incidents} incident{s.incidents === 1 ? '' : 's'} recorded in this period.
          {#if s.discrepancies}<span class="text-error font-medium">{s.discrepancies} school{s.discrepancies === 1 ? '' : 's'} filed before later incidents were recorded.</span>{/if}
          {#if s.without_account}{s.without_account} school{s.without_account === 1 ? ' has' : 's have'} no account yet — create them in School Management.{/if}
        </p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div class="flex flex-wrap gap-1.5">
        {#each chips as c}
          <button class="btn btn-xs {statusFilter === c.key ? 'btn-neutral' : 'btn-ghost border border-base-300'}" onclick={() => (statusFilter = c.key)}>
            {c.label}<span class="badge badge-xs {c.tone && c.n ? `badge-${c.tone}` : 'badge-ghost'}">{c.n}</span>
          </button>
        {/each}
      </div>
      <input class="input input-bordered input-sm sm:ml-auto sm:w-60" placeholder="Search school…" bind:value={search} />
    </div>

    <!-- Mobile cards -->
    <div class="space-y-2 md:hidden">
      {#each rows as r (r.school_id)}
        {@const st = reportStatus(r.status)}
        <div class="rounded-lg border border-base-200 bg-base-100 p-3">
          <div class="flex items-start justify-between gap-2">
            <button class="text-left min-w-0" onclick={() => openPersonnel(r)}>
              <p class="font-medium text-sm leading-snug">{r.school_name}</p>
              <p class="text-xs text-base-content/50">{r.school_id_number}{multiDivision ? ` · ${r.division?.name ?? ''}` : ''}{r.has_account ? '' : ' · no account'}</p>
            </button>
            <span class="badge badge-sm shrink-0 {st.badge}">{st.label}</span>
          </div>
          <div class="flex flex-wrap gap-1 mt-2">
            {#each r.months as m}
              {@const ms = reportStatus(m.status)}
              <span class="badge badge-xs {ms.badge}" title={ms.label}>{m.label.split(' ')[0]}{m.status === 'with_incidents' ? ` · ${m.submitted_count}` : ''}{m.discrepancy ? ' ⚠' : ''}</span>
            {/each}
            <span class="text-xs text-base-content/60 ml-auto">{r.live_incidents} recorded</span>
          </div>
        </div>
      {:else}
        <p class="text-center text-sm text-base-content/50 py-8">No schools match.</p>
      {/each}
    </div>

    <!-- Desktop table -->
    <div class="hidden md:block card bg-base-100 border border-base-200 shadow-sm">
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>School</th>
              {#if multiDivision}<th>Division</th>{/if}
              {#each data.schools[0]?.months ?? [] as m}<th class="text-center">{m.label}</th>{/each}
              <th class="text-right">Recorded</th>
              <th>Status</th>
              <th>Handled by</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.school_id)}
              {@const st = reportStatus(r.status)}
              <tr class="hover">
                <td>
                  <p class="font-medium">{r.school_name}</p>
                  <p class="text-xs text-base-content/50">{r.school_id_number}{#if !r.has_account}<span class="text-warning"> · no account</span>{/if}</p>
                </td>
                {#if multiDivision}<td class="text-sm text-base-content/70">{r.division?.name ?? '—'}</td>{/if}
                {#each r.months as m}
                  {@const ms = reportStatus(m.status)}
                  <td class="text-center">
                    <span class="badge badge-sm {ms.badge}">{m.status === 'with_incidents' ? m.submitted_count : ms.label}</span>
                    {#if m.submitted_at}<p class="text-[10px] text-base-content/50 mt-0.5">{fmtDate(m.submitted_at)}</p>{/if}
                    {#if m.discrepancy}<p class="text-[10px] text-error" title="Filed {m.submitted_count}, now {m.live_count} on record">⚠ now {m.live_count}</p>{/if}
                  </td>
                {/each}
                <td class="text-right tabular-nums">{r.live_incidents}</td>
                <td><span class="badge badge-sm {st.badge}">{st.label}</span></td>
                <td>
                  <button class="link link-hover text-sm text-left" onclick={() => openPersonnel(r)}>{r.current_personnel ?? 'None recorded'}</button>
                </td>
              </tr>
            {:else}
              <tr><td colspan="8" class="text-center text-base-content/50 py-8">No schools match.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<dialog bind:this={remindDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Email reminders for {MONTH_NAMES[month - 1]} {year}?</h3>
    <p class="text-sm text-base-content/70 mt-2">
      {s?.no_report ?? 0} school{s?.no_report === 1 ? '' : 's'} in view haven't filed. Each will be emailed at the school's address, the school account's address, and the current focal person's address on record.
    </p>
    <p class="text-xs text-base-content/50 mt-2">Reminders are also sent automatically from the 25th of each month, and as overdue notices in the first week of the next month.</p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => remindDialog?.close()}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={reminding} onclick={sendReminders}>{#if reminding}<span class="loading loading-spinner loading-xs"></span>{/if}Send reminders</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<SchoolAccountDialog bind:this={accountDialog} canEdit={canEditPersonnel} />
