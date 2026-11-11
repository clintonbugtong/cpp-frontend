<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { natureOfConcernLabel, relationshipLabel, statusLabel, statusBadgeClass } from '$lib/constants/learner-reports.js';

  const id = page.params.id;

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let report = $state(null);
  let triaging = $state(false);

  /** @type {HTMLDialogElement|null} */
  let linkModal = $state(null);
  let linkIntakeSheetId = $state('');
  let linking = $state(false);
  let linkError = $state('');

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    const result = await learnerReportsService.getReport(id);
    if (result.success) {
      report = result.data;
    } else {
      error = result.error || 'Failed to load report';
    }
    loading = false;
  }

  /** @param {'under_review'|'dismissed'} status */
  async function triage(status) {
    triaging = true;
    const result = await learnerReportsService.reviewReport(id, status);
    if (result.success) report = result.data;
    else error = result.error || 'Failed to update report';
    triaging = false;
  }

  function openLinkModal() {
    linkIntakeSheetId = '';
    linkError = '';
    linkModal?.showModal();
  }

  async function handleLink() {
    if (!linkIntakeSheetId) { linkError = 'Enter an intake sheet number.'; return; }
    linking = true;
    linkError = '';
    const result = await learnerReportsService.linkReport(id, linkIntakeSheetId);
    if (result.success) {
      report = result.data;
      linkModal?.close();
    } else {
      linkError = result.error || 'Failed to link report';
    }
    linking = false;
  }

  let pdfBusy = $state(false);
  async function downloadPdf() {
    pdfBusy = true;
    const res = await schoolReportsService.learnerReportPdf(report.learner_report_id);
    pdfBusy = false;
    if (!res.success) error = res.error || 'Could not generate the PDF.';
  }
</script>

<div class="max-w-3xl mx-auto space-y-6">
  {#if loading}
    <div class="text-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
  {:else if error && !report}
    <div class="alert alert-error"><span>{error}</span></div>
  {:else if report}
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Learner Report #{report.learner_report_id}</h1>
        <p class="text-base-content/50 mt-1">{report.school?.name} · {report.division?.name} · {new Date(report.created_at).toLocaleString()}</p>
        <span class="badge badge-sm badge-ghost mt-2">
          {natureOfConcernLabel(report.nature_of_concern)}{#if report.nature_of_concern === 'OTHERS' && report.nature_of_concern_other}: {report.nature_of_concern_other}{/if}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge {statusBadgeClass(report.status)}">{statusLabel(report.status)}</span>
        <button class="btn btn-outline btn-sm gap-1.5" disabled={pdfBusy} onclick={downloadPdf} title="Download a printable PDF">
          {#if pdfBusy}<span class="loading loading-spinner loading-xs"></span>{:else}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>{/if}
          PDF
        </button>
        {#if authState.canTriageLearnerReports() && report.status !== 'linked'}
          <button class="btn btn-outline btn-sm" disabled={triaging || report.status === 'under_review'} onclick={() => triage('under_review')}>Mark Under Review</button>
          <button class="btn btn-outline btn-error btn-sm" disabled={triaging || report.status === 'dismissed'} onclick={() => triage('dismissed')}>Dismiss</button>
        {/if}
        {#if authState.canLinkLearnerReports() && report.status !== 'linked'}
          <button class="btn btn-primary btn-sm" onclick={() => goto(`/admin/lrp/intake-sheets/new?from_report=${report.learner_report_id}`)}>
            Create Intake Sheet from This
          </button>
          <button class="btn btn-ghost btn-xs" onclick={openLinkModal}>Already made one? Link it</button>
        {/if}
      </div>
    </div>

    {#if error}
      <div class="alert alert-error text-sm"><span>{error}</span></div>
    {/if}

    {#if report.status === 'linked' && report.linked_intake_sheet}
      <button
        type="button"
        class="alert bg-success/10 border border-success/30 text-sm w-full text-left hover:bg-success/20 transition-colors"
        onclick={() => goto(`/admin/lrp/intake-sheets/${report.linked_intake_sheet.intake_sheet_id}`)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0 text-success">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/>
        </svg>
        <span>
          Linked to <span class="font-medium text-success">Intake Sheet #{report.linked_intake_sheet.intake_sheet_id}</span>. Tap to view.
        </span>
      </button>
    {/if}

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">Reporter</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <p><span class="text-base-content/50">Name:</span> {report.is_anonymous ? 'Anonymous' : report.reporter_full_name}</p>
        <p><span class="text-base-content/50">Relationship:</span> {relationshipLabel(report.reporter_relationship)}</p>
        {#if report.reporter_grade || report.reporter_section}
          <p><span class="text-base-content/50">Learner's Grade/Section:</span> {report.reporter_grade || '—'} {report.reporter_section ? `- ${report.reporter_section}` : ''}</p>
        {/if}
        <p><span class="text-base-content/50">Contact Number:</span> {report.reporter_contact_number || '—'}</p>
        <p><span class="text-base-content/50">Email:</span> {report.reporter_email || '—'}</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">What Was Reported</h2>
      <p class="text-sm text-base-content/70 whitespace-pre-wrap">{report.description}</p>
    </div>

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">Review</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <p><span class="text-base-content/50">Reviewed by:</span> {report.reviewed_by?.full_name || '—'}</p>
        <p><span class="text-base-content/50">Reviewed at:</span> {report.reviewed_at ? new Date(report.reviewed_at).toLocaleString() : '—'}</p>
      </div>
    </div>
  {/if}
</div>

<dialog bind:this={linkModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Link to an Existing Intake Sheet</h3>
    <p class="py-2 text-sm text-base-content/60">
      Already created the intake sheet separately? Enter its number here to record that this report led to it.
    </p>
    {#if linkError}
      <div class="alert alert-error py-2 text-xs mb-2"><span>{linkError}</span></div>
    {/if}
    <div class="form-control">
      <label class="label py-1" for="link-id"><span class="label-text text-xs">Intake Sheet #</span></label>
      <input id="link-id" type="number" min="1" class="input input-bordered w-full" bind:value={linkIntakeSheetId} />
    </div>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => linkModal?.close()}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={linking} onclick={handleLink}>
        {#if linking}<span class="loading loading-spinner loading-xs"></span>{/if}
        Link
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
