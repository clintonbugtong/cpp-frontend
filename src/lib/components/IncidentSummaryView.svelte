<script>
  // Aggregate incidents (intake sheets + learner reports not yet a case) for a
  // month or quarter, with the printable Incident Summary PDF. No names are
  // shown — this is the version meant for circulation between offices.
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import { schoolReportsService, MONTH_NAMES, phNow } from '$lib/api/school-reports.js';
  import PrintMenu from '$lib/components/PrintMenu.svelte';
  import Pagination from '$lib/components/Pagination.svelte';

  /** @type {{ canFilterDivision?: boolean }} */
  let { canFilterDivision = false } = $props();

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
  let downloading = $state(false);

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

  // Intake sheets table: shown a page at a time.
  const CASES_PER_PAGE = 10;
  let casePage = $state(1);
  const pagedCases = $derived((data?.cases ?? []).slice((casePage - 1) * CASES_PER_PAGE, casePage * CASES_PER_PAGE));
  // Learner reports table: same paging.
  let reportPage = $state(1);
  const pagedReports = $derived((data?.open_reports ?? []).slice((reportPage - 1) * CASES_PER_PAGE, reportPage * CASES_PER_PAGE));

  async function load() {
    loading = true; error = ''; casePage = 1; reportPage = 1;
    const res = await schoolReportsService.getIncidentSummary(params);
    loading = false;
    if (res.success) data = res.data; else error = res.error || 'Could not load the summary.';
  }

  async function downloadPdf() {
    downloading = true;
    const res = await schoolReportsService.incidentSummaryPdf(params);
    downloading = false;
    if (!res.success) error = res.error || 'Could not generate the PDF.';
  }

  const s = $derived(data?.summary);
  const maxNature = $derived(Math.max(1, ...((data?.by_nature ?? []).map((/** @type {any} */ n) => n.total))));
  const STATUS = /** @type {Record<string, string>} */ ({ draft: 'Draft', not_forwarded: 'Not yet forwarded', for_review: 'For review', under_review: 'Under review', returned: 'Returned', recommended_resolved: 'Recommended as resolved', resolved: 'Resolved', new: 'New', linked: 'Linked' });
  /** @param {string} d */
  const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '';

  const summaryPrintItems = $derived([{ title: 'Incident Summary Report', description: `${data?.period?.label ?? ''} · no names, for sharing between offices`,
    icon: /** @type {const} */ ('chart'), tone: /** @type {const} */ ('primary'), run: downloadPdf }]);
</script>

<div class="space-y-5">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold">Incident Summary</h1>
      <p class="text-sm text-base-content/60 mt-1">{data?.scope_label ?? ''} — intake sheets and learner reports for the period.</p>
    </div>
    <PrintMenu disabled={!data} items={summaryPrintItems} />
  </div>

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

  {#if error}<div class="alert alert-error text-sm"><span>{error}</span></div>{/if}

  {#if loading && !data}
    <div class="py-16 text-center"><span class="loading loading-spinner loading-lg"></span></div>
  {:else if data && s}
    <div class="space-y-5 {loading ? 'opacity-60' : ''}">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div class="rounded-xl border border-base-200 bg-base-100 p-3">
          <p class="text-xs text-base-content/60">Total incidents</p>
          <p class="text-2xl font-bold tabular-nums">{s.total}</p>
          <p class="text-[11px] text-base-content/50">{s.schools_affected} school{s.schools_affected === 1 ? '' : 's'} affected</p>
        </div>
        <div class="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p class="text-xs text-base-content/60">Intake sheets</p>
          <p class="text-2xl font-bold tabular-nums text-primary">{s.intake_sheets}</p>
          <p class="text-[11px] text-base-content/50">{s.resolved} resolved · {s.recommended_resolved} recommended · {s.in_progress} in progress · {s.drafts} draft</p>
        </div>
        <div class="rounded-xl border border-accent/20 bg-accent/5 p-3">
          <p class="text-xs text-base-content/60">Learner reports</p>
          <p class="text-2xl font-bold tabular-nums text-accent">{s.learner_reports}</p>
          <p class="text-[11px] text-base-content/50">not yet a case · {s.dismissed_reports} dismissed excluded</p>
        </div>
        <div class="rounded-xl border p-3 {s.without_action ? 'border-error/30 bg-error/5' : 'border-base-200 bg-base-100'}">
          <p class="text-xs text-base-content/60">Cases with no initial action yet</p>
          <p class="text-2xl font-bold tabular-nums {s.without_action ? 'text-error' : ''}">{s.without_action}</p>
          <p class="text-[11px] text-base-content/50">{s.with_referral} referred</p>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-2">
        <div class="card bg-base-100 border border-base-200 shadow-sm">
          <div class="card-body p-4">
            <h3 class="font-semibold text-sm">By nature of case</h3>
            <ul class="space-y-2 mt-1">
              {#each data.by_nature as n}
                <li class="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm">
                  <span class="line-clamp-2 break-words leading-tight" title={n.label}>{n.label}</span>
                  <span class="h-2.5 rounded-full bg-base-200 overflow-hidden flex">
                    <span class="bg-primary h-full" style="width: {(n.intake_sheets / maxNature) * 100}%"></span>
                    <span class="bg-accent h-full" style="width: {(n.learner_reports / maxNature) * 100}%"></span>
                  </span>
                  <span class="text-right tabular-nums font-medium">{n.total}</span>
                </li>
              {/each}
            </ul>
            <div class="flex gap-4 text-xs text-base-content/60 mt-2">
              <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-primary"></span>Intake sheets</span>
              <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-accent"></span>Learner reports</span>
            </div>
          </div>
        </div>

        <div class="card bg-base-100 border border-base-200 shadow-sm">
          <div class="card-body p-4">
            <h3 class="font-semibold text-sm">By school</h3>
            {#if data.by_school.length}
              <ul class="divide-y divide-base-200 text-sm">
                {#each data.by_school.slice(0, 8) as row}
                  <li class="py-2 flex items-center justify-between gap-2">
                    <span class="min-w-0">
                      <span class="block break-words">{row.name}</span>
                      <span class="block text-xs text-base-content/50">{data.is_regional && row.division ? `${row.division} · ` : ''}mostly {row.top_nature}</span>
                    </span>
                    <span class="tabular-nums font-semibold">{row.total}</span>
                  </li>
                {/each}
              </ul>
              {#if data.by_school.length > 8}<p class="text-xs text-base-content/50">+{data.by_school.length - 8} more in the PDF</p>{/if}
            {:else}
              <p class="text-sm text-base-content/50 py-4">No incidents recorded for this period.</p>
            {/if}
            <div class="flex flex-col gap-1 text-xs text-base-content/60 border-t border-base-200 pt-2 mt-1">
              <span>Learner-victims: <strong>{s.victims_female}</strong> female · <strong>{s.victims_male}</strong> male{#if s.victims_unknown} · {s.victims_unknown} not recorded{/if}{#if s.victims_none} · {s.victims_none} case{s.victims_none === 1 ? '' : 's'} with none{/if}</span>
              {#if data.people}
                {@const r = data.people.respondents}
                <span>Respondents: <strong>{r.female}</strong> female · <strong>{r.male}</strong> male{#if r.not_recorded} · {r.not_recorded} not recorded{/if} — {r.school_personnel} school personnel · {r.student} student · {r.other} other{#if r.unidentified_cases} · {r.unidentified_cases} not yet identified{/if}</span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-4">
          <h3 class="font-semibold text-sm">Intake sheets <span class="badge badge-sm badge-primary badge-outline">{data.cases.length}</span></h3>
          {#if data.cases.length}
            <div class="overflow-x-auto -mx-2">
              <table class="table table-sm">
                <thead><tr><th>Case no.</th><th>Date</th><th>School</th><th>Nature</th><th>Status</th><th class="text-center" title="Initial actions taken">Act.</th><th class="text-center" title="Referral: Yes / No">Referred</th></tr></thead>
                <tbody>
                  {#each pagedCases as c}
                    <tr class="hover">
                      <td><a class="badge badge-sm badge-primary font-mono whitespace-nowrap hover:opacity-80" href="/admin/lrp/intake-sheets/{c.intake_sheet_id}">{c.case_no}</a></td>
                      <td class="whitespace-nowrap">{fmtDate(c.date_of_intake)}</td>
                      <td class="min-w-40">{c.school ?? '—'}</td>
                      <td>{c.nature}</td>
                      <td>{STATUS[c.status] ?? c.status}</td>
                      <td class="text-center tabular-nums {c.actions === 0 ? 'text-error font-semibold' : ''}">{c.actions}</td>
                      <td class="text-center">{c.referred === 'yes' ? 'Yes' : c.referred === 'no' ? 'No' : '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <Pagination bind:page={casePage} total={data.cases.length} perPage={CASES_PER_PAGE} noun="intake sheets" bare />
          {:else}
            <p class="text-sm text-base-content/50">No intake sheets for this period.</p>
          {/if}
        </div>
      </div>

      {#if data.open_reports.length}
        <div class="card bg-base-100 border border-base-200 shadow-sm">
          <div class="card-body p-4">
            <h3 class="font-semibold text-sm">Learner reports not yet an intake sheet <span class="badge badge-sm badge-accent badge-outline">{data.open_reports.length}</span></h3>
            <div class="overflow-x-auto -mx-2">
              <table class="table table-sm">
                <thead><tr><th>Ref. no.</th><th>Submitted</th><th>School</th><th>Concern</th><th>Status</th></tr></thead>
                <tbody>
                  {#each pagedReports as r}
                    <tr class="hover">
                      <td><a class="badge badge-sm badge-accent badge-outline font-mono whitespace-nowrap hover:opacity-80" href="/admin/lrp/reports/{r.learner_report_id}">{r.ref_no}</a></td>
                      <td class="whitespace-nowrap">{fmtDate(r.submitted_at)}</td>
                      <td class="min-w-40">{r.school ?? '—'}</td>
                      <td>{r.nature}</td>
                      <td>{STATUS[r.status] ?? r.status}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <Pagination bind:page={reportPage} total={data.open_reports.length} perPage={CASES_PER_PAGE} noun="learner reports" bare />
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
