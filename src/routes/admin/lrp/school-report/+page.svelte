<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { schoolReportsService, reportStatus } from '$lib/api/school-reports.js';
  import PersonnelHistory from '$lib/components/PersonnelHistory.svelte';

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

  onMount(() => {
    if (!authState.isSchoolAccount()) { goto('/admin/lrp/dashboard'); return; }
    load();
  });

  async function load() {
    loading = true;
    const res = await schoolReportsService.getMine();
    loading = false;
    if (res.success) { data = res.data; loadError = ''; }
    else loadError = res.error || 'Could not load your reports.';
  }

  const months = $derived(/** @type {any[]} */ (data?.months ?? []));
  const currentMonth = $derived(months.find((m) => m.is_current) ?? null);
  // Months with recorded incidents count as reported automatically, so only
  // past months with nothing recorded and no zero report are outstanding.
  const overdue = $derived(months.filter((m) => !m.is_current && m.status === 'no_report'));
  const hasPersonnel = $derived(!!data?.current_personnel);

  // Days left in the current month, Philippine time.
  const daysLeft = $derived.by(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return end.getDate() - now.getDate();
  });

  /** @param {any} m */
  function openFile(m) {
    filing = m;
    remarks = m.report?.remarks ?? '';
    fileError = '';
    fileDialog?.showModal();
  }

  async function submit() {
    saving = true; fileError = '';
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
      const v = res.validationErrors || {};
      fileError = Object.values(v).flat().join(' ') || res.error || 'Could not submit.';
    }
  }

  /** @param {string} iso */
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  /** @param {number} n */
  const incLabel = (n) => `${n} incident${n === 1 ? '' : 's'}`;
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-bold">Monthly Incident Report</h1>
    <p class="text-base-content/60 mt-1 text-sm">
      {data?.school?.name ?? authState.getOrgLabel()} — every month needs a report. Months with recorded incidents are counted automatically; if nothing happened, file a zero incident report.
    </p>
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
    {#if !hasPersonnel}
      <div class="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <p class="font-semibold">Before you can file a zero incident report: record who is handling this account.</p>
        <p class="text-base-content/70 mt-1">This is a shared school account. Use the "Who handles this account" panel to record your name — it's kept on file so the division knows who submitted each report.</p>
      </div>
    {/if}

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
                  <span class="text-base-content/60 ml-1">filed {fmtDateTime(currentMonth.report.submitted_at)} by {currentMonth.report.submitted_by_personnel?.full_name ?? '—'}</span></p>
              {:else}
                <p class="text-sm mt-1"><span class="badge badge-error badge-outline">Not yet reported</span>
                  <span class="text-base-content/60 ml-1">{daysLeft === 0 ? 'Last day today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</span></p>
              {/if}
            </div>
            {#if currentMonth.status !== 'with_incidents'}
              <button class="btn btn-primary btn-sm" disabled={!hasPersonnel} onclick={() => openFile(currentMonth)}>
                {currentMonth.report ? 'Update zero report' : 'File zero incident report'}
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
        <p class="text-xs text-base-content/70">No incidents were recorded and no zero incident report was filed, so the division and regional offices see "No report". File them now:</p>
        <div class="flex flex-wrap gap-2 mt-2">
          {#each overdue as m}
            <button class="btn btn-xs btn-outline btn-error" disabled={!hasPersonnel} onclick={() => openFile(m)}>{m.period_label}</button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="grid gap-6 lg:grid-cols-5">
      <!-- History -->
      <div class="lg:col-span-3 card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-4 sm:p-5">
          <h3 class="font-semibold">Report history</h3>
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
                      Filed {fmtDateTime(m.report.submitted_at)} · {m.report.submitted_by_personnel?.full_name ?? '—'}
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
                    <button class="btn btn-ghost btn-xs" disabled={!hasPersonnel} onclick={() => openFile(m)}>{m.report ? 'Update' : 'File'}</button>
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
          <PersonnelHistory personnel={data.personnel} onchange={load} />
        </div>
      </div>
    </div>
  {/if}
</div>

<dialog bind:this={fileDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-lg">
    {#if filing}
      <h3 class="font-bold text-lg">Zero incident report — {filing.period_label}</h3>
      <div class="mt-3 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
        I confirm that <strong>no learner rights or protection incident</strong> happened at our school in {filing.period_label}.
      </div>
      <p class="text-xs text-base-content/60 mt-2">If something did happen, cancel and record it as an intake sheet instead — the month will then be counted as reported automatically.</p>

      <div class="form-control mt-3">
        <label class="label py-1" for="sr-remarks"><span class="label-text text-xs">Remarks (optional)</span></label>
        <textarea id="sr-remarks" class="textarea textarea-bordered text-sm" rows="2" maxlength="2000" bind:value={remarks}></textarea>
      </div>

      <p class="text-xs text-base-content/60 mt-2">Submitting as <strong>{data?.current_personnel?.full_name}</strong>. Not you? Record the handover first.</p>
      {#if fileError}<div class="alert alert-error text-sm mt-3"><span>{fileError}</span></div>{/if}

      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick={() => fileDialog?.close()}>Cancel</button>
        <button class="btn btn-success btn-sm" disabled={saving} onclick={submit}>{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}Submit zero incident report</button>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
