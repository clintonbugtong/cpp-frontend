<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { natureOfCaseLabel, statusLabel, statusBadgeClass } from '$lib/constants/intake-sheets.js';
  import { natureOfConcernLabel } from '$lib/constants/learner-reports.js';

  const id = page.params.id;

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let sheet = $state(null);

  /** @type {HTMLDialogElement|null} */
  let deleteModal = $state(null);
  let deleting = $state(false);
  let reviewing = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    const result = await intakeSheetsService.getIntakeSheet(id);
    if (result.success) {
      sheet = result.data;
    } else {
      error = result.error || 'Failed to load intake sheet';
    }
    loading = false;
  }

  async function handleDelete() {
    deleting = true;
    const result = await intakeSheetsService.deleteIntakeSheet(id);
    deleting = false;
    if (result.success) {
      goto('/admin/lrp/intake-sheets');
    } else {
      error = result.error || 'Failed to delete intake sheet';
      deleteModal?.close();
    }
  }

  async function toggleReview() {
    reviewing = true;
    const result = sheet.status === 'reviewed'
      ? await intakeSheetsService.unreviewIntakeSheet(id)
      : await intakeSheetsService.reviewIntakeSheet(id);
    if (result.success) sheet = result.data;
    else error = result.error || 'Failed to update review status';
    reviewing = false;
  }

  /** @param {any} p */
  function fullName(p) {
    return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
  }

  /** @param {string} d */
  function fmtDateTime(d) {
    return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  const ROLE_LABELS = {
    'LEARNER-VICTIM': 'Learner-Victim',
    MOTHER: 'Mother',
    FATHER: 'Father',
    GUARDIAN: 'Guardian',
    COMPLAINANT: 'Complainant',
    'ALLEGED-OFFENDER': 'Alleged Offender'
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Sub-resource editing — Incident Details, Actions Taken, Recommendations,
  // Referrals. Each entry is added, edited, or deleted individually (never
  // as a whole-list replace) via /intake-sheets/{id}/{type}[/​{childId}] —
  // and a delete there is always a soft delete, per this system's data
  // policy: nothing is ever permanently removed, only hidden and
  // recoverable by an administrator later.
  // One generic pair of dialogs (add/edit + delete-confirm) covers all four
  // types — they share the same shape, just different fields.
  // ═══════════════════════════════════════════════════════════════════════

  const CHILD_CONFIG = {
    'detailed-incidents': {
      title: 'Incident Detail',
      idKey: 'detailed_incident_id',
      fields: ['date_of_incident', 'is_estimated_date', 'description'],
      emptyForm: () => ({ date_of_incident: '', is_estimated_date: false, description: '' }),
      summary: (/** @type {any} */ row) => row.description
    },
    'actions-taken': {
      title: 'Action Taken',
      idKey: 'action_taken_id',
      fields: ['action_taken'],
      emptyForm: () => ({ action_taken: '' }),
      summary: (/** @type {any} */ row) => row.action_taken
    },
    recommendations: {
      title: 'Recommendation',
      idKey: 'recommendation_id',
      fields: ['recommendation'],
      emptyForm: () => ({ recommendation: '' }),
      summary: (/** @type {any} */ row) => row.recommendation
    },
    referrals: {
      title: 'Referral',
      idKey: 'referral_id',
      fields: ['referred_to', 'reason'],
      emptyForm: () => ({ referred_to: '', reason: '' }),
      summary: (/** @type {any} */ row) => row.referred_to
    }
  };

  /** @type {HTMLDialogElement|null} */
  let childModal = $state(null);
  /** @type {keyof typeof CHILD_CONFIG | null} */
  let childType = $state(null);
  /** @type {number|string|null} */
  let childId = $state(null); // null = adding a new entry; set = editing this one
  /** @type {Record<string, any>} */
  let childForm = $state({});
  let childSaving = $state(false);
  let childError = $state('');

  /** @param {keyof typeof CHILD_CONFIG} type */
  function openAddChild(type) {
    childType = type;
    childId = null;
    childForm = CHILD_CONFIG[type].emptyForm();
    childError = '';
    childModal?.showModal();
  }

  /** @param {keyof typeof CHILD_CONFIG} type @param {any} row */
  function openEditChild(type, row) {
    const cfg = CHILD_CONFIG[type];
    childType = type;
    childId = row[cfg.idKey];
    /** @type {Record<string, any>} */
    const form = {};
    for (const f of cfg.fields) form[f] = row[f];
    childForm = form;
    childError = '';
    childModal?.showModal();
  }

  async function saveChild() {
    if (!childType) return;
    childSaving = true;
    childError = '';
    const result = childId
      ? await intakeSheetsService.updateChild(id, childType, childId, childForm)
      : await intakeSheetsService.addChild(id, childType, childForm);
    if (result.success) {
      sheet = result.data;
      childModal?.close();
    } else {
      childError = result.error || 'Failed to save';
    }
    childSaving = false;
  }

  /** @type {HTMLDialogElement|null} */
  let deleteChildModal = $state(null);
  /** @type {keyof typeof CHILD_CONFIG | null} */
  let deleteChildType = $state(null);
  /** @type {any} */
  let deleteChildTarget = $state(null);
  let deletingChild = $state(false);

  /** @param {keyof typeof CHILD_CONFIG} type @param {any} row */
  function confirmDeleteChild(type, row) {
    deleteChildType = type;
    deleteChildTarget = row;
    deleteChildModal?.showModal();
  }

  async function handleDeleteChild() {
    if (!deleteChildType || !deleteChildTarget) return;
    deletingChild = true;
    const cfg = CHILD_CONFIG[deleteChildType];
    const result = await intakeSheetsService.deleteChild(id, deleteChildType, deleteChildTarget[cfg.idKey]);
    deletingChild = false;
    if (result.success) {
      sheet = result.data;
      deleteChildModal?.close();
    } else {
      error = result.error || 'Failed to delete';
      deleteChildModal?.close();
    }
  }

  let pdfBusy = $state(false);
  async function downloadPdf() {
    pdfBusy = true;
    const res = await schoolReportsService.intakeSheetPdf(sheet.intake_sheet_id);
    pdfBusy = false;
    if (!res.success) error = res.error || 'Could not generate the PDF.';
  }

  let incidentPdfBusy = $state(false);
  async function downloadIncidentReportPdf() {
    incidentPdfBusy = true;
    const res = await schoolReportsService.incidentReportPdf(sheet.intake_sheet_id);
    incidentPdfBusy = false;
    if (!res.success) error = res.error || 'Could not generate the incident report.';
  }

  // Small icon set reused by every Add/Edit/Delete button below.
</script>

{#snippet plusIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3 h-3">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
{/snippet}

{#snippet pencilIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="w-3 h-3">
    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
  </svg>
{/snippet}

{#snippet trashIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="w-3 h-3">
    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9M19.228 5.79l-.598 13.472A2.25 2.25 0 0116.383 21.5H7.617a2.25 2.25 0 01-2.247-2.238L4.772 5.79m4.921 0V4.478a2.25 2.25 0 012.25-2.228h.113a2.25 2.25 0 012.25 2.228V5.79m-9.114 0h13.788"/>
  </svg>
{/snippet}

<div class="max-w-4xl mx-auto space-y-6">
  {#if loading}
    <div class="text-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
  {:else if error && !sheet}
    <div class="alert alert-error"><span>{error}</span></div>
  {:else if sheet}
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Intake Sheet #{sheet.intake_sheet_id}</h1>
        <p class="text-base-content/50 mt-1">{sheet.school?.name} · {sheet.division?.name} · {new Date(sheet.date_of_intake).toLocaleDateString()}</p>
        <span class="badge badge-sm badge-ghost mt-2">
          {natureOfCaseLabel(sheet.nature_of_case)}{#if sheet.nature_of_case === 'OTHERS' && sheet.nature_of_case_other}: {sheet.nature_of_case_other}{/if}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge {statusBadgeClass(sheet.status)}">{statusLabel(sheet.status)}</span>
        <button class="btn btn-outline btn-sm gap-1.5" disabled={pdfBusy} onclick={downloadPdf} title="Download the Enhanced Intake Sheet (Annex E)">
          {#if pdfBusy}<span class="loading loading-spinner loading-xs"></span>{:else}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>{/if}
          Intake Sheet PDF
        </button>
        <button class="btn btn-outline btn-sm gap-1.5" disabled={incidentPdfBusy} onclick={downloadIncidentReportPdf} title="Download the LRP Concern Incident Report Form">
          {#if incidentPdfBusy}<span class="loading loading-spinner loading-xs"></span>{:else}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>{/if}
          Incident Report PDF
        </button>
        {#if authState.canManageIntakeSheets()}
          {#if !sheet.is_draft}
            <button class="btn btn-outline btn-sm" disabled={reviewing} onclick={toggleReview}>
              {sheet.status === 'reviewed' ? 'Mark Unreviewed' : 'Mark Reviewed'}
            </button>
          {/if}
          <button class="btn btn-outline btn-sm gap-1.5" onclick={() => goto(`/admin/lrp/intake-sheets/${id}/edit`)}>
            {@render pencilIcon()}
            {sheet.is_draft ? 'Continue Editing' : 'Edit'}
          </button>
          <button class="btn btn-outline btn-error btn-sm gap-1.5" onclick={() => deleteModal?.showModal()}>
            {@render trashIcon()}
            Delete
          </button>
        {/if}
      </div>
    </div>

    {#if sheet.originating_learner_report}
      {@const report = sheet.originating_learner_report}
      {#if authState.canViewLearnerReports()}
        <button
          type="button"
          class="alert bg-accent/10 border border-accent/30 text-sm w-full text-left hover:bg-accent/20 transition-colors"
          onclick={() => goto(`/admin/lrp/reports/${report.learner_report_id}`)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0 text-accent">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
          </svg>
          <span>
            Created from Learner Report #{report.learner_report_id} —
            {report.is_anonymous ? 'Anonymous' : report.reporter_full_name} ·
            {natureOfConcernLabel(report.nature_of_concern)}. Tap to view the original report.
          </span>
        </button>
      {:else}
        <div class="alert bg-accent/10 border border-accent/30 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0 text-accent">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
          </svg>
          <span>Created from Learner Report #{report.learner_report_id}.</span>
        </div>
      {/if}
    {/if}

    {#if sheet.is_draft && authState.canManageIntakeSheets()}
      <div class="alert bg-base-200/60 border border-base-300 text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
        </svg>
        <span>This intake sheet is still a draft — some sections may be incomplete. It won't show up as a reviewable case until it's finalized.</span>
      </div>
    {/if}

    {#if error}
      <div class="alert alert-error text-sm"><span>{error}</span></div>
    {/if}

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">Prepared / Reviewed</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <p><span class="text-base-content/50">Prepared by:</span> {sheet.prepared_by?.full_name || '—'}</p>
        <p><span class="text-base-content/50">Reviewed by:</span> {sheet.reviewed_by?.full_name || '—'}</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">People Involved</h2>

      <!-- Mobile: card list -->
      <div class="sm:hidden space-y-3">
        {#each sheet.persons || [] as p}
          <div class="border border-base-200 rounded-lg p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-sm">{fullName(p)}</span>
              <span class="badge badge-sm badge-ghost shrink-0">{ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (p.role)] || p.role}</span>
            </div>
            <p class="text-xs text-base-content/60 mt-1">
              {#if p.role === 'LEARNER-VICTIM'}
                {p.grade ? `Grade ${p.grade}` : ''}{p.section ? ` - ${p.section}` : ''}
              {:else}
                {p.relation_to_learner_victim || p.occupation || ''}
              {/if}
              {#if p.contact_number} · {p.contact_number}{/if}
            </p>
          </div>
        {/each}
      </div>

      <!-- Tablet/desktop: table -->
      <div class="hidden sm:block overflow-x-auto">
        <table class="table table-sm">
          <thead><tr><th>Role</th><th>Name</th><th>Details</th><th>Contact</th></tr></thead>
          <tbody>
            {#each sheet.persons || [] as p}
              <tr>
                <td><span class="badge badge-sm badge-ghost">{ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (p.role)] || p.role}</span></td>
                <td>{fullName(p)}</td>
                <td class="text-base-content/70">
                  {#if p.role === 'LEARNER-VICTIM'}
                    {p.grade ? `Grade ${p.grade}` : ''}{p.section ? ` - ${p.section}` : ''}
                  {:else}
                    {p.relation_to_learner_victim || p.occupation || ''}
                  {/if}
                </td>
                <td class="text-base-content/70">{p.contact_number || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Incident Details -->
    {#if sheet.detailed_incidents?.length || authState.canManageIntakeSheets()}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Incident Details</h2>
            {#if sheet.detailed_incidents?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.detailed_incidents.length}</span>
            {/if}
          </div>
          {#if authState.canManageIntakeSheets()}
            <button class="btn btn-primary btn-xs gap-1 px-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all" onclick={() => openAddChild('detailed-incidents')}>
              {@render plusIcon()}
              Add
            </button>
          {/if}
        </div>
        {#if sheet.detailed_incidents?.length}
          <div class="divide-y divide-base-200">
            {#each sheet.detailed_incidents as inc, i}
              <div class="border-l-2 border-base-300 pl-3 py-2.5 first:pt-0 flex items-start justify-between gap-3 rounded-r-md hover:bg-base-200/40 transition-colors">
                <div class="min-w-0 flex items-start gap-2">
                  {#if sheet.detailed_incidents.length > 1}
                    <span class="badge badge-xs badge-neutral shrink-0 mt-1">{i + 1}</span>
                  {/if}
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{inc.date_of_incident}{#if inc.is_estimated_date} <span class="badge badge-xs badge-ghost">estimated</span>{/if}</p>
                    <p class="text-sm text-base-content/70 whitespace-pre-wrap">{inc.description}</p>
                    <p class="text-xs text-base-content/35 mt-1">Added {fmtDateTime(inc.created_at)}</p>
                  </div>
                </div>
                {#if authState.canManageIntakeSheets()}
                  <div class="flex gap-1 shrink-0">
                    <button class="btn btn-circle btn-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-content hover:border-primary hover:scale-110 active:scale-95 transition-all" aria-label="Edit" title="Edit" onclick={() => openEditChild('detailed-incidents', inc)}>
                      {@render pencilIcon()}
                    </button>
                    <button class="btn btn-circle btn-xs bg-error/10 text-error border border-error/20 hover:bg-error hover:text-error-content hover:border-error hover:scale-110 active:scale-95 transition-all" aria-label="Delete" title="Delete" onclick={() => confirmDeleteChild('detailed-incidents', inc)}>
                      {@render trashIcon()}
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30">None added yet.</p>
        {/if}
      </div>
    {/if}

    <!-- Actions Taken -->
    {#if sheet.actions_taken?.length || authState.canManageIntakeSheets()}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Actions Taken</h2>
            {#if sheet.actions_taken?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.actions_taken.length}</span>
            {/if}
          </div>
          {#if authState.canManageIntakeSheets()}
            <button class="btn btn-primary btn-xs gap-1 px-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all" onclick={() => openAddChild('actions-taken')}>
              {@render plusIcon()}
              Add
            </button>
          {/if}
        </div>
        {#if sheet.actions_taken?.length}
          <ul class="divide-y divide-base-200">
            {#each sheet.actions_taken as a, i}
              <li class="flex items-start justify-between gap-3 text-sm rounded-lg px-2 -mx-2 py-2 hover:bg-base-200/40 transition-colors">
                <span class="flex gap-1.5 min-w-0">
                  {#if sheet.actions_taken.length > 1}
                    <span class="badge badge-xs badge-neutral shrink-0 mt-0.5">{i + 1}</span>
                  {:else}
                    <span class="text-base-content/30 shrink-0">•</span>
                  {/if}
                  <span class="min-w-0">
                    <span class="block">{a.action_taken}</span>
                    <span class="block text-xs text-base-content/35 mt-0.5">Added {fmtDateTime(a.created_at)}</span>
                  </span>
                </span>
                {#if authState.canManageIntakeSheets()}
                  <div class="flex gap-1 shrink-0">
                    <button class="btn btn-circle btn-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-content hover:border-primary hover:scale-110 active:scale-95 transition-all" aria-label="Edit" title="Edit" onclick={() => openEditChild('actions-taken', a)}>
                      {@render pencilIcon()}
                    </button>
                    <button class="btn btn-circle btn-xs bg-error/10 text-error border border-error/20 hover:bg-error hover:text-error-content hover:border-error hover:scale-110 active:scale-95 transition-all" aria-label="Delete" title="Delete" onclick={() => confirmDeleteChild('actions-taken', a)}>
                      {@render trashIcon()}
                    </button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-base-content/30">None added yet.</p>
        {/if}
      </div>
    {/if}

    <!-- Recommendations -->
    {#if sheet.recommendations?.length || authState.canManageIntakeSheets()}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Recommendations</h2>
            {#if sheet.recommendations?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.recommendations.length}</span>
            {/if}
          </div>
          {#if authState.canManageIntakeSheets()}
            <button class="btn btn-primary btn-xs gap-1 px-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all" onclick={() => openAddChild('recommendations')}>
              {@render plusIcon()}
              Add
            </button>
          {/if}
        </div>
        {#if sheet.recommendations?.length}
          <ul class="divide-y divide-base-200">
            {#each sheet.recommendations as r, i}
              <li class="flex items-start justify-between gap-3 text-sm rounded-lg px-2 -mx-2 py-2 hover:bg-base-200/40 transition-colors">
                <span class="flex gap-1.5 min-w-0">
                  {#if sheet.recommendations.length > 1}
                    <span class="badge badge-xs badge-neutral shrink-0 mt-0.5">{i + 1}</span>
                  {:else}
                    <span class="text-base-content/30 shrink-0">•</span>
                  {/if}
                  <span class="min-w-0">
                    <span class="block">{r.recommendation}</span>
                    <span class="block text-xs text-base-content/35 mt-0.5">Added {fmtDateTime(r.created_at)}</span>
                  </span>
                </span>
                {#if authState.canManageIntakeSheets()}
                  <div class="flex gap-1 shrink-0">
                    <button class="btn btn-circle btn-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-content hover:border-primary hover:scale-110 active:scale-95 transition-all" aria-label="Edit" title="Edit" onclick={() => openEditChild('recommendations', r)}>
                      {@render pencilIcon()}
                    </button>
                    <button class="btn btn-circle btn-xs bg-error/10 text-error border border-error/20 hover:bg-error hover:text-error-content hover:border-error hover:scale-110 active:scale-95 transition-all" aria-label="Delete" title="Delete" onclick={() => confirmDeleteChild('recommendations', r)}>
                      {@render trashIcon()}
                    </button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-base-content/30">None added yet.</p>
        {/if}
      </div>
    {/if}

    <!-- Referrals -->
    {#if sheet.referrals?.length || authState.canManageIntakeSheets()}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Referrals</h2>
            {#if sheet.referrals?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.referrals.length}</span>
            {/if}
          </div>
          {#if authState.canManageIntakeSheets()}
            <button class="btn btn-primary btn-xs gap-1 px-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all" onclick={() => openAddChild('referrals')}>
              {@render plusIcon()}
              Add
            </button>
          {/if}
        </div>
        {#if sheet.referrals?.length}
          <div class="divide-y divide-base-200">
            {#each sheet.referrals as r, i}
              <div class="flex items-start justify-between gap-3 text-sm rounded-lg px-2 -mx-2 py-2.5 hover:bg-base-200/40 transition-colors">
                <p class="min-w-0 flex items-start gap-2">
                  {#if sheet.referrals.length > 1}
                    <span class="badge badge-xs badge-neutral shrink-0 mt-0.5">{i + 1}</span>
                  {/if}
                  <span class="min-w-0">
                    <span class="block"><span class="font-medium">{r.referred_to}</span> — <span class="text-base-content/70">{r.reason}</span></span>
                    <span class="block text-xs text-base-content/35 mt-0.5">Added {fmtDateTime(r.created_at)}</span>
                  </span>
                </p>
                {#if authState.canManageIntakeSheets()}
                  <div class="flex gap-1 shrink-0">
                    <button class="btn btn-circle btn-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-content hover:border-primary hover:scale-110 active:scale-95 transition-all" aria-label="Edit" title="Edit" onclick={() => openEditChild('referrals', r)}>
                      {@render pencilIcon()}
                    </button>
                    <button class="btn btn-circle btn-xs bg-error/10 text-error border border-error/20 hover:bg-error hover:text-error-content hover:border-error hover:scale-110 active:scale-95 transition-all" aria-label="Delete" title="Delete" onclick={() => confirmDeleteChild('referrals', r)}>
                      {@render trashIcon()}
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-base-content/30">None added yet.</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<dialog bind:this={deleteModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Delete Intake Sheet</h3>
    <p class="py-4 text-base-content/70">Are you sure you want to delete intake sheet #{sheet?.intake_sheet_id}? This can be restored later by an administrator.</p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => deleteModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" disabled={deleting} onclick={handleDelete}>Delete</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Add / Edit one entry — one shared dialog for all four sub-resources ── -->
<dialog bind:this={childModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-lg">
    <h3 class="font-bold text-lg mb-3">
      {childId ? 'Edit' : 'Add'} {childType ? CHILD_CONFIG[childType].title : ''}
    </h3>
    {#if childError}<div class="alert alert-error mb-3 text-sm"><span>{childError}</span></div>{/if}

    {#if childType === 'detailed-incidents'}
      <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="form-control">
            <label class="label py-1" for="child-date"><span class="label-text text-xs">Date of Incident</span></label>
            <input id="child-date" type="date" class="input input-bordered input-sm" bind:value={childForm.date_of_incident} />
          </div>
          <label class="flex items-center gap-2 mt-6 cursor-pointer select-none">
            <input type="checkbox" class="checkbox checkbox-sm" bind:checked={childForm.is_estimated_date} />
            <span class="text-xs">Estimated date</span>
          </label>
        </div>
        <div class="form-control">
          <label class="label py-1" for="child-desc"><span class="label-text text-xs">Description</span></label>
          <textarea id="child-desc" class="textarea textarea-bordered textarea-sm w-full" rows="4" bind:value={childForm.description}></textarea>
        </div>
      </div>
    {:else if childType === 'actions-taken'}
      <div class="form-control">
        <label class="label py-1" for="child-action"><span class="label-text text-xs">Action Taken</span></label>
        <textarea id="child-action" class="textarea textarea-bordered textarea-sm w-full" rows="4" placeholder="Action taken…" bind:value={childForm.action_taken}></textarea>
      </div>
    {:else if childType === 'recommendations'}
      <div class="form-control">
        <label class="label py-1" for="child-rec"><span class="label-text text-xs">Recommendation</span></label>
        <textarea id="child-rec" class="textarea textarea-bordered textarea-sm w-full" rows="4" placeholder="Recommendation…" bind:value={childForm.recommendation}></textarea>
      </div>
    {:else if childType === 'referrals'}
      <div class="space-y-3">
        <div class="form-control">
          <label class="label py-1" for="child-ref-to"><span class="label-text text-xs">Referred To</span></label>
          <input id="child-ref-to" type="text" class="input input-bordered input-sm" bind:value={childForm.referred_to} />
        </div>
        <div class="form-control">
          <label class="label py-1" for="child-ref-reason"><span class="label-text text-xs">Reason</span></label>
          <textarea id="child-ref-reason" class="textarea textarea-bordered textarea-sm w-full" rows="3" bind:value={childForm.reason}></textarea>
        </div>
      </div>
    {/if}

    <div class="modal-action">
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => childModal?.close()}>Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" disabled={childSaving} onclick={saveChild}>
        {#if childSaving}<span class="loading loading-spinner loading-xs"></span>{/if}
        Save
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Delete one entry — soft delete, recoverable by an administrator ── -->
<dialog bind:this={deleteChildModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Delete {deleteChildType ? CHILD_CONFIG[deleteChildType].title : 'Entry'}?</h3>
    <p class="py-4 text-base-content/70 text-sm">
      "{deleteChildType && deleteChildTarget ? CHILD_CONFIG[deleteChildType].summary(deleteChildTarget) : ''}"
      will be removed from this section. This can be restored later by an administrator.
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => deleteChildModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" disabled={deletingChild} onclick={handleDeleteChild}>
        {#if deletingChild}<span class="loading loading-spinner loading-xs"></span>{/if}
        Delete
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
