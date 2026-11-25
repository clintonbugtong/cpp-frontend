<script>
  import { fieldErrors } from '$lib/actions/field-errors.js';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { schoolReportsService, reportStatus } from '$lib/api/school-reports.js';
  import SchoolAccountsPanel from '$lib/components/SchoolAccountsPanel.svelte';
  import PeriodPicker from '$lib/components/PeriodPicker.svelte';
  import { phNow } from '$lib/api/school-reports.js';

  /** @type {any} */
  let data = $state(null);
  let loading = $state(true);
  let loadError = $state('');
  let notice = $state('');

  /** @type {HTMLDialogElement|null} */
  let fileDialog = $state(null);
  /** @type {any} */
  let filing = $state(null);
  let remarks = $state('');
  let saving = $state(false);
  let fileError = $state('');
  /** @type {Record<string, string[]>} */
  let fileErrors = $state({});

  onMount(async () => {
    if (!authState.isSchoolAccount()) { goto('/admin/lrp/dashboard'); return; }
    await load();
    // From the dashboard: open the form for this month, or the month picker.
    const want = new URLSearchParams(location.search).get('file');
    if (want === 'current' && currentMonth && currentMonth.status !== 'with_incidents') openFile(currentMonth);
    else if (want === 'pick') openPicker();
  });

  // Report history period (like the Incident Summary): last 12 months by default.
  const nowPH = phNow();
  let periodType = $state('all');
  let periodYear = $state(nowPH.year);
  let periodMonth = $state(nowPH.month);
  let periodQuarter = $state(nowPH.quarter);
  const periodParams = $derived(periodType === 'all' ? {} : {
    period_type: periodType, year: periodYear,
    ...(periodType === 'monthly' ? { month: periodMonth } : {}),
    ...(periodType === 'quarterly' ? { quarter: periodQuarter } : {})
  });

  async function load() {
    loading = true;
    const res = await schoolReportsService.getMine(periodParams);
    loading = false;
    if (res.success) { data = res.data; loadError = ''; }
    else loadError = res.error || 'Could not load your reports.';
  }

  const months = $derived(/** @type {any[]} */ (data?.months ?? []));
  // The current month and the overdue list always cover the last 12 months,
  // whatever period the history shows.
  const currentMonth = $derived(data?.current ?? months.find((m) => m.is_current) ?? null);
  // Months with recorded incidents count as reported automatically, so only
  // past months with nothing recorded and no zero report are outstanding.
  const overdue = $derived(/** @type {any[]} */ (data?.overdue ?? months.filter((m) => !m.is_current && m.status === 'no_report')));

  // Days left in the current month, Philippine time.
  const daysLeft = $derived.by(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return end.getDate() - now.getDate();
  });

  // ── "File zero incident report" for any month: pick the month first ──
  /** @type {HTMLDialogElement|null} */
  let pickDialog = $state(null);
  let pickYear = $state(nowPH.year);
  let pickMonth = $state(nowPH.month);
  /** @type {any} the picked month's status */
  let picked = $state(null);
  let pickLoading = $state(false);
  const pickYears = Array.from({ length: nowPH.year - 2019 }, (_, i) => nowPH.year - i);
  function openPicker() {
    pickYear = nowPH.year; pickMonth = nowPH.month;
    pickDialog?.showModal();
    loadPicked();
  }
  async function loadPicked() {
    picked = null;
    if (pickYear === nowPH.year && pickMonth > nowPH.month) return;
    pickLoading = true;
    const res = await schoolReportsService.getMine({ period_type: 'monthly', year: pickYear, month: pickMonth });
    pickLoading = false;
    picked = res.success ? (res.data?.months?.[0] ?? null) : null;
  }
  function continueToForm() {
    if (!picked || picked.status === 'with_incidents') return;
    pickDialog?.close();
    openFile(picked);
  }

  /** @param {any} m */
  function openFile(m) {
    filing = m;
    remarks = m.report?.remarks ?? '';
    fileError = ''; fileErrors = {};
    fileDialog?.showModal();
  }

  async function submit() {
    saving = true; fileError = ''; fileErrors = {};
    const res = await schoolReportsService.submit({
      period_year: filing.period_year, period_month: filing.period_month,
      declaration: 'zero_incident', remarks: remarks || undefined
    });
    saving = false;
    if (res.success) {
      fileDialog?.close();
      notice = `${filing.period_label} zero incident report ${filing.report ? 'updated' : 'submitted'}.`;
      await load();
    } else {
      fileErrors = res.validationErrors || {};
      // Errors on a field shown in the dialog go under it; anything else (the period, the declaration) stays in the banner.
      const elsewhere = Object.entries(fileErrors).filter(([k]) => k !== 'remarks').flatMap(([, m]) => m);
      fileError = elsewhere.join(' ') || (fileErrors.remarks ? 'Please fix the errors shown below.' : res.error || 'Could not submit.');
    }
  }

  /** @param {string} iso */
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  /** Who filed a zero report: the filer's service record, else their account name. @param {any} r */
  const filer = (r) => r?.submitted_by_personnel?.full_name
    || (r?.submitted_by ? `${r.submitted_by.first_name ?? ''} ${r.submitted_by.last_name ?? ''}`.trim() : '')
    || '—';

  /** @param {number} n */
  const incLabel = (n) => `${n} incident${n === 1 ? '' : 's'}`;
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-bold">Zero Incident Report</h1>
    <p class="text-base-content/60 mt-1 text-sm">
      {data?.school?.name ?? authState.getOrgLabel()} — every month needs a report. Months with recorded incidents are counted automatically; if nothing happened, report zero incident.
    </p>
  </div>

  <!-- The main action: report a month with no incident -->
  <div class="rounded-2xl border border-success/30 bg-gradient-to-r from-success/10 to-success/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
    <span class="grid place-items-center w-12 h-12 rounded-2xl bg-success text-success-content shrink-0 shadow-sm">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-7 h-7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
    </span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">No incident happened in a month?</p>
      <p class="text-sm text-base-content/70">Report zero incident for this month or any past month that has nothing recorded.</p>
    </div>
    <button class="btn btn-success btn-md gap-2 shadow-sm sm:ml-auto" onclick={openPicker}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
      Report Zero Incident
    </button>
  </div>

  {#if notice}
    <div class="rounded-lg border border-success/30 bg-success/10 p-3 text-sm flex items-start justify-between gap-2">
      <span>{notice}</span>
      <button class="btn btn-ghost btn-xs" onclick={() => (notice = '')} aria-label="Dismiss">✕</button>
    </div>
  {/if}

  {#if loading && !data}
    <div class="py-16 text-center"><span class="loading loading-spinner loading-lg"></span></div>
  {:else if loadError}
    <div class="alert alert-error"><span>{loadError}</span></div>
  {:else if data}
    <!-- Current month -->
    {#if currentMonth}
      <div class="card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-4 sm:p-6 gap-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-base-content/50">This month</p>
              <h2 class="text-xl font-bold">{currentMonth.period_label}</h2>
              {#if currentMonth.status === 'with_incidents'}
                <p class="text-sm mt-1"><span class="badge badge-warning">{incLabel(currentMonth.incident_count)}</span>
                  <span class="text-base-content/60 ml-1">counted as reported automatically — nothing to file</span></p>
              {:else if currentMonth.status === 'zero_incident'}
                <p class="text-sm mt-1"><span class="badge badge-success">Zero incident</span>
                  <span class="text-base-content/60 ml-1">filed {fmtDateTime(currentMonth.report.submitted_at)} by {filer(currentMonth.report)}</span></p>
              {:else}
                <p class="text-sm mt-1"><span class="badge badge-error badge-outline">Not yet reported</span>
                  <span class="text-base-content/60 ml-1">{daysLeft === 0 ? 'Last day today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</span></p>
              {/if}
            </div>
            {#if currentMonth.status !== 'with_incidents'}
              <button class="btn btn-success btn-sm" onclick={() => openFile(currentMonth)}>
                {currentMonth.report ? 'Update zero incident report' : 'Report zero incident'}
              </button>
            {/if}
          </div>

          <div class="grid grid-cols-3 gap-2 sm:gap-3">
            <div class="rounded-lg bg-base-200/50 p-3 text-center">
              <p class="text-2xl font-bold tabular-nums">{currentMonth.live_counts.total}</p>
              <p class="text-[11px] text-base-content/60 leading-tight">Incidents recorded</p>
            </div>
            <a href="/admin/lrp/intake-sheets" class="rounded-lg bg-primary/10 p-3 text-center hover:bg-primary/15">
              <p class="text-2xl font-bold tabular-nums text-primary">{currentMonth.live_counts.intake_sheets}</p>
              <p class="text-[11px] text-base-content/60 leading-tight">Intake sheets</p>
            </a>
            <a href="/admin/lrp/reports" class="rounded-lg bg-accent/10 p-3 text-center hover:bg-accent/15">
              <p class="text-2xl font-bold tabular-nums text-accent">{currentMonth.live_counts.learner_reports}</p>
              <p class="text-[11px] text-base-content/60 leading-tight">Learner reports</p>
            </a>
          </div>
          <p class="text-xs text-base-content/50">
            Counted automatically: intake sheets dated this month, plus learner reports received this month that weren't dismissed and aren't already an intake sheet.
            If an incident happens, record it as an intake sheet — the month is then reported automatically.
          </p>
        </div>
      </div>
    {/if}

    {#if overdue.length}
      <div class="rounded-lg border border-error/30 bg-error/10 p-4">
        <p class="font-semibold text-sm">{overdue.length} past month{overdue.length === 1 ? '' : 's'} with no report</p>
        <p class="text-xs text-base-content/70">No incidents were recorded and no zero incident report was filed, so the division and regional offices see "No report". Report zero incident for:</p>
        <div class="flex flex-wrap gap-2 mt-2">
          {#each overdue as m}
            <button class="btn btn-xs btn-outline btn-error" onclick={() => openFile(m)}>{m.period_label}</button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="grid gap-6 lg:grid-cols-5">
      <!-- History -->
      <div class="lg:col-span-3 card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-4 sm:p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-semibold">Report history <span class="text-xs font-normal text-base-content/50">· {data.period?.label ?? 'Last 12 months'}</span></h3>
            <PeriodPicker bind:type={periodType} bind:year={periodYear} bind:month={periodMonth} bind:quarter={periodQuarter}
              labels={{ all: 'Last 12 months' }} onchange={load} />
          </div>
          {#if !months.length}<p class="text-sm text-base-content/50 py-4">No months to show for this period.</p>{/if}
          <ul class="divide-y divide-base-200 -mx-1">
            {#each months as m}
              {@const st = reportStatus(m.status)}
              <li class="py-3 px-1 flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-medium text-sm">{m.period_label}{#if m.is_current}<span class="text-xs text-base-content/50"> · current</span>{/if}</p>
                  <p class="text-xs text-base-content/60">
                    {#if m.status === 'with_incidents'}
                      {m.live_counts.intake_sheets} intake sheet{m.live_counts.intake_sheets === 1 ? '' : 's'} · {m.live_counts.learner_reports} learner report{m.live_counts.learner_reports === 1 ? '' : 's'} · counted automatically
                    {:else if m.status === 'zero_incident'}
                      Filed {fmtDateTime(m.report.submitted_at)} · {filer(m.report)}
                    {:else}
                      Nothing recorded, no zero incident report filed
                    {/if}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  {#if m.status === 'no_report' && m.is_current}
                    <span class="badge badge-sm badge-ghost">Open</span>
                  {:else}
                    <span class="badge badge-sm {st.badge}">{m.status === 'with_incidents' ? incLabel(m.incident_count) : st.label}</span>
                  {/if}
                  {#if m.status !== 'with_incidents'}
                    <button class="btn btn-xs {m.report ? 'btn-ghost border border-base-300' : 'btn-success btn-outline'}" onclick={() => openFile(m)}>{m.report ? 'Update report' : 'Report zero incident'}</button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <!-- Personnel -->
      <div class="lg:col-span-2 card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-4 sm:p-5">
          <SchoolAccountsPanel data={{ school: data.school, positions: data.positions, history: data.history, can_manage: false }} />
          <p class="text-xs text-base-content/50 mt-3">Moving out or a new School Head / Guidance Counselor? Your division office closes and creates accounts.</p>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Pick the month to file a zero incident report for -->
<dialog bind:this={pickDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Report zero incident</h3>
    <p class="text-sm text-base-content/70 mt-1">Choose the month. Past months can still be reported.</p>
    <div class="grid grid-cols-2 gap-3 mt-4">
      <label class="form-control">
        <span class="label-text text-xs mb-1">Year</span>
        <select class="select select-bordered select-sm" bind:value={pickYear} onchange={loadPicked}>
          {#each pickYears as y}<option value={y}>{y}</option>{/each}
        </select>
      </label>
      <label class="form-control">
        <span class="label-text text-xs mb-1">Month</span>
        <select class="select select-bordered select-sm" bind:value={pickMonth} onchange={loadPicked}>
          {#each ['January','February','March','April','May','June','July','August','September','October','November','December'] as name, i}
            <option value={i + 1} disabled={pickYear === nowPH.year && i + 1 > nowPH.month}>{name}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="mt-4 min-h-14">
      {#if pickLoading}
        <span class="loading loading-spinner loading-sm"></span>
      {:else if pickYear === nowPH.year && pickMonth > nowPH.month}
        <p class="text-sm text-base-content/70">That month hasn't started yet.</p>
      {:else if picked}
        {#if picked.status === 'with_incidents'}
          <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p class="font-semibold">{picked.period_label}: {incLabel(picked.incident_count)} recorded</p>
            <p class="text-xs text-base-content/70 mt-0.5">This month is already counted as reported, so no zero incident report is needed.</p>
          </div>
        {:else if picked.status === 'zero_incident'}
          <div class="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
            <p class="font-semibold">{picked.period_label}: zero incident report already filed</p>
            <p class="text-xs text-base-content/70 mt-0.5">Filed {fmtDateTime(picked.report.submitted_at)} · {filer(picked.report)}. You can update it.</p>
          </div>
        {:else}
          <div class="rounded-lg border border-base-300 bg-base-200/50 p-3 text-sm">
            <p class="font-semibold">{picked.period_label}: not yet reported</p>
            <p class="text-xs text-base-content/70 mt-0.5">Nothing is recorded for this month. Continue to confirm that no incident happened.</p>
          </div>
        {/if}
      {/if}
    </div>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => pickDialog?.close()}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={!picked || pickLoading || picked.status === 'with_incidents'} onclick={continueToForm}>
        {picked?.status === 'zero_incident' ? 'Update report' : 'Continue'}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={fileDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-lg" use:fieldErrors={{ errors: fileErrors }}>
    {#if filing}
      <h3 class="font-bold text-lg">Zero incident report — {filing.period_label}</h3>
      <div class="mt-3 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
        I confirm that <strong>no learner rights or protection incident</strong> happened at our school in {filing.period_label}.
      </div>
      <p class="text-xs text-base-content/60 mt-2">If something did happen, cancel and record it as an intake sheet instead — the month will then be counted as reported automatically.</p>

      <div class="form-control mt-3">
        <label class="label py-1" for="sr-remarks"><span class="label-text text-xs">Remarks (optional)</span></label>
        <textarea id="sr-remarks" data-field="remarks" class="textarea textarea-bordered text-sm" rows="2" maxlength="2000" bind:value={remarks}></textarea>
      </div>

      <p class="text-xs text-base-content/60 mt-2">Submitting as <strong>{data?.me?.full_name}</strong>{data?.me?.position ? ` (${data.me.position})` : ''}.</p>
      {#if fileError}<div class="alert alert-error text-sm mt-3"><span>{fileError}</span></div>{/if}

      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick={() => fileDialog?.close()}>Cancel</button>
        <button class="btn btn-success btn-sm" disabled={saving} onclick={submit}>{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}Submit zero incident report</button>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
