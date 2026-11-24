<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import { natureOfConcernLabel, relationshipLabel, statusLabel } from '$lib/constants/learner-reports.js';

  const id = page.params.id ?? '';

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

  // ── Review route inside the school (same idea as the intake sheet's) ──
  const actions = $derived(report?.actions ?? {});
  /** @type {string|null} which button is busy */
  let busyAction = $state(null);
  /** @param {'review'|'forward'|'dismiss'|'undo'} action @param {string} [remarks] */
  async function act(action, remarks = '') {
    busyAction = action; triaging = true; error = '';
    const result = await learnerReportsService.routeReport(id, action, remarks);
    triaging = false; busyAction = null;
    if (result.success) { report = result.data; forwardModal?.close(); dismissModal?.close(); return true; }
    const msg = Object.values(result.validationErrors || {}).flat().join(' ') || result.error || 'Could not complete this step.';
    if (forwardModal?.open) forwardError = msg; else if (dismissModal?.open) dismissError = msg; else error = msg;
    return false;
  }

  /** @type {HTMLDialogElement|null} */
  let forwardModal = $state(null);
  let forwardRemarks = $state('');
  let forwardError = $state('');
  function openForward() { forwardRemarks = ''; forwardError = ''; forwardModal?.showModal(); }

  /** @type {HTMLDialogElement|null} */
  let dismissModal = $state(null);
  let dismissRemarks = $state('');
  let dismissError = $state('');
  function openDismiss() { dismissRemarks = ''; dismissError = ''; dismissModal?.showModal(); }

  const EVENT_LABEL = /** @type {Record<string, string>} */ ({ reviewed: 'Reviewed', forwarded: 'Forwarded', linked: 'Linked to an intake sheet', dismissed: 'Dismissed' });
  const POSITION_SHORT = /** @type {Record<string, string>} */ ({ school_head: 'School Head', guidance_counselor: 'Guidance Counselor / Designate' });

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

  // ── Header status card (same design as the intake sheet page) ──
  // Full class names (not built from parts) so Tailwind keeps them.
  const STATUS_TONE = /** @type {Record<string, {bar: string, panel: string, dot: string}>} */ ({
    new: { bar: 'bg-warning', panel: 'bg-warning/10 border-warning/30', dot: 'status-warning' },
    for_review: { bar: 'bg-warning', panel: 'bg-warning/10 border-warning/30', dot: 'status-warning' },
    under_review: { bar: 'bg-info', panel: 'bg-info/10 border-info/30', dot: 'status-info' },
    linked: { bar: 'bg-success', panel: 'bg-success/10 border-success/30', dot: 'status-success' },
    dismissed: { bar: 'bg-neutral/40', panel: 'bg-base-200/60 border-base-300', dot: 'status-neutral' }
  });
  const tone = $derived(STATUS_TONE[report?.status] ?? STATUS_TONE.new);
  /** @param {string|null|undefined} d */
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  /** @param {number} n */
  const lrpNo = (n) => `LRP-${String(n).padStart(5, '0')}`;

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
    <div class="card bg-base-100 shadow-sm border border-base-200 overflow-visible">
      <div class="h-1 rounded-t-box {tone.bar}"></div>
      <div class="p-4 sm:p-5 space-y-3">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
      <div class="min-w-0 lg:flex-1">
        <p class="text-[11px] font-medium uppercase tracking-wider text-base-content/50">Learner Report</p>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap">Report #{report.learner_report_id}</h1>
          <span class="badge badge-sm badge-primary badge-soft h-auto py-0.5 whitespace-normal text-left">
            {natureOfConcernLabel(report.nature_of_concern)}{#if report.nature_of_concern === 'OTHERS' && report.nature_of_concern_other}: {report.nature_of_concern_other}{/if}
          </span>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs sm:text-sm text-base-content/70">
          <span class="inline-flex items-center gap-1.5 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/40"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>
            <span class="break-words">{report.school?.name || 'No school'}</span>
          </span>
          <span class="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/40"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"/></svg>
            {report.division?.name || '—'}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/40"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
            Submitted: {fmtDateTime(report.created_at)}
          </span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 lg:justify-end lg:max-w-[50%]">
        <button class="btn btn-outline btn-sm gap-1.5" disabled={pdfBusy} onclick={downloadPdf} title="Download a printable PDF">
          {#if pdfBusy}<span class="loading loading-spinner loading-xs"></span>{:else}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>{/if}
          PDF
        </button>
      </div>
      </div>

      <!-- Status panel: where the report stands, and its steps so far -->
      <div class="rounded-box border {tone.panel} px-3 py-2 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div class="flex items-center gap-2.5 md:min-w-56">
          <div class="inline-grid *:[grid-area:1/1]">
            {#if report.status === 'new' || report.status === 'for_review'}<div class="status status-md {tone.dot} animate-ping"></div>{/if}
            <div class="status status-md {tone.dot}"></div>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold leading-tight">{statusLabel(report.status)}</p>
            <p class="text-xs text-base-content/70">
              {#if report.status === 'new'}
                Waiting for the School Head or the Guidance Counselor / Designate to review it.
              {:else if report.status === 'for_review'}
                Forwarded to the <strong>{report.routed_to_position_label}</strong> · waiting for their review
              {:else if report.status === 'under_review' && report.routed_to_position_label}
                With the <strong>{report.routed_to_position_label}</strong>{#if report.reviewed_by} · reviewed by {report.reviewed_by.full_name}{/if}
              {:else if report.status === 'linked' && report.linked_intake_sheet}
                <a class="link link-success font-medium" href={`/admin/lrp/intake-sheets/${report.linked_intake_sheet.intake_sheet_id}`}>Open {lrpNo(report.linked_intake_sheet.intake_sheet_id)}</a>
              {:else if report.reviewed_by}
                {report.status === 'dismissed' ? 'Dismissed' : 'Reviewed'} by {report.reviewed_by.full_name}{#if report.reviewed_at}<span class="text-base-content/50"> · {fmtDateTime(report.reviewed_at)}</span>{/if}
              {/if}
            </p>
          </div>
        </div>
        <ul class="steps steps-horizontal w-full text-[11px] md:flex-1 [&_.step]:grid-rows-[1.75rem_auto] [&_.step]:after:size-6 [&_.step]:after:text-[10px] [&_.step]:before:h-1">
          <li class="step {report.status === 'dismissed' ? 'step-neutral' : 'step-primary'} text-base-content/60" data-content="✓">Submitted</li>
          <li class="step {report.status !== 'new' ? (report.status === 'dismissed' ? 'step-neutral' : 'step-primary') : ''} {report.status === 'under_review' || report.status === 'for_review' ? 'font-semibold' : 'text-base-content/60'}" data-content={report.status === 'under_review' || report.status === 'for_review' ? '●' : report.status !== 'new' ? '✓' : ''}>Under review</li>
          {#if report.status === 'dismissed'}
            <li class="step step-error font-semibold" data-content="✕">Dismissed</li>
          {:else}
            <li class="step {report.status === 'linked' ? 'step-success font-semibold' : 'text-base-content/60'}" data-content={report.status === 'linked' ? '✓' : ''}>Intake sheet created</li>
          {/if}
        </ul>
      </div>
      </div>
    </div>

    {#if error}
      <div class="alert alert-error text-sm"><span>{error}</span></div>
    {/if}

    <!-- Review route inside the school: School Head ⇄ Guidance Counselor / Designate → intake sheet -->
    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-lg">Review route</h2>
          <p class="text-xs text-base-content/50 mt-0.5">Reviewed by the School Head or the Guidance Counselor / Designate, then made into an intake sheet / incident report.</p>
        </div>
        {#if actions.undo || actions.review || actions.forward || actions.create_intake_sheet || actions.dismiss}
          <div class="flex flex-wrap justify-end gap-2 ml-auto">
            {#if actions.undo}
              <button class="btn btn-sm btn-ghost border border-base-300 gap-1.5" disabled={triaging} onclick={() => act('undo')}>
                {#if busyAction === 'undo'}<span class="loading loading-spinner loading-xs"></span>{:else}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>{/if}
                {actions.undo.label}
              </button>
            {/if}
            {#if actions.review}
              <button class="btn btn-sm btn-primary" disabled={triaging} onclick={() => act('review')}>
                {#if busyAction === 'review'}<span class="loading loading-spinner loading-xs"></span>{/if}Review
              </button>
            {/if}
            {#if actions.forward}
              <button class="btn btn-sm btn-outline" disabled={triaging || !actions.forward.available} title={actions.forward.reason || ''} onclick={openForward}>Forward to {actions.forward.label}</button>
            {/if}
            {#if actions.create_intake_sheet}
              <button class="btn btn-sm btn-primary" disabled={triaging} onclick={() => goto(`/admin/lrp/intake-sheets/new?from_report=${report.learner_report_id}`)}>Create Intake Sheet / Incident Report</button>
            {/if}
            {#if actions.link}
              <button class="btn btn-sm btn-outline" disabled={triaging} onclick={openLinkModal}>Link Existing</button>
            {/if}
            {#if actions.dismiss}
              <button class="btn btn-sm btn-outline btn-error" disabled={triaging} onclick={openDismiss}>Dismiss</button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- What the current user can do, in words -->
      {#if actions.review}
        <p class="text-xs text-warning mt-3">Click <strong>Review</strong> to start working on this report. Forwarding and making it an intake sheet are available once you have reviewed it.</p>
      {:else if actions.forward && actions.forward.available === false}
        <p class="text-xs text-base-content/60 mt-3">{actions.forward.reason} You can still make it an intake sheet / incident report or dismiss it.</p>
      {:else if report.status === 'for_review' && actions.undo}
        <p class="text-xs text-base-content/60 mt-3">You sent it to the {report.routed_to_position_label}. If you forgot something, click <strong>{actions.undo.label}</strong> to take it back before they review it.</p>
      {:else if report.status === 'for_review' && !actions.undo}
        <p class="text-xs text-base-content/60 mt-3">It's with the {report.routed_to_position_label} for review.</p>
      {:else if (report.status === 'new' || report.status === 'under_review') && !actions.create_intake_sheet && !actions.review}
        <p class="text-xs text-base-content/60 mt-3">{report.status === 'new' ? 'The school has not reviewed it yet.' : `It's being handled by the ${report.routed_to_position_label || 'school'}.`} Only the School Head or the Guidance Counselor / Designate of this school can act on it.</p>
      {/if}

      <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-base-content/60 mt-3 pt-3 border-t border-base-200">
        <span>Reviewed by <span class="text-base-content">{report.reviewed_by?.full_name || '—'}</span>{#if report.reviewed_at} · {fmtDateTime(report.reviewed_at)}{/if}</span>
        {#if report.linked_intake_sheet}<span>Intake sheet <a class="link link-primary" href={`/admin/lrp/intake-sheets/${report.linked_intake_sheet.intake_sheet_id}`}>{lrpNo(report.linked_intake_sheet.intake_sheet_id)}</a></span>{/if}
      </div>

      {#if report.route_events?.length}
        <details class="mt-3">
          <summary class="cursor-pointer text-sm font-medium select-none">Route history <span class="text-base-content/50 font-normal">({report.route_events.length})</span></summary>
          <ul class="mt-2 space-y-2">
            {#each [...report.route_events].reverse() as e}
              <li class="text-sm border-l-2 border-base-300 pl-3">
                <span class="font-medium">{EVENT_LABEL[e.action] || e.action}</span>
                {#if e.to_position_label && e.action === 'forwarded'}<span class="text-base-content/60">{' '}· to the {e.to_position_label}</span>{/if}
                {#if e.intake_sheet_id}<span class="text-base-content/60">{' '}· {lrpNo(e.intake_sheet_id)}</span>{/if}
                <span class="block text-xs text-base-content/60">{e.user?.full_name || '—'}{e.user?.school_position ? ` (${POSITION_SHORT[e.user.school_position]})` : ''} · {fmtDateTime(e.created_at)}</span>
                {#if e.remarks}<span class="block text-xs whitespace-pre-wrap break-words mt-0.5">“{e.remarks}”</span>{/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>


    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">Reporter</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm [&>p]:break-words [&>p]:min-w-0">
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
      <p class="text-sm text-base-content/70 whitespace-pre-wrap break-words">{report.description}</p>
    </div>

  {/if}
</div>

<dialog bind:this={linkModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Link to an Existing Intake Sheet / Incident Report</h3>
    <p class="py-2 text-sm text-base-content/60">
      Already created the intake sheet separately? Enter its number here to record that this report led to it.
    </p>
    {#if linkError}
      <div class="alert alert-error py-2 text-xs mb-2"><span>{linkError}</span></div>
    {/if}
    <div class="form-control">
      <label class="label py-1" for="link-id"><span class="label-text text-xs">Record #</span></label>
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

<!-- Forward to the other school position -->
<dialog bind:this={forwardModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Forward to {actions.forward?.label}</h3>
    <p class="text-sm text-base-content/70 mt-2">They review it before acting on it. You can no longer act on it until it is forwarded back to you.</p>
    <div class="form-control mt-3">
      <label class="label py-1" for="fw-remarks"><span class="label-text text-xs">Remarks (optional)</span></label>
      <textarea id="fw-remarks" class="textarea textarea-bordered textarea-sm w-full" rows="3" maxlength="2000" bind:value={forwardRemarks}></textarea>
    </div>
    {#if forwardError}<div class="alert alert-error text-sm mt-3"><span>{forwardError}</span></div>{/if}
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => forwardModal?.close()}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={triaging} onclick={() => act('forward', forwardRemarks.trim())}>
        {#if busyAction === 'forward'}<span class="loading loading-spinner loading-xs"></span>{/if}Forward
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- Dismiss -->
<dialog bind:this={dismissModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Dismiss this report?</h3>
    <p class="text-sm text-base-content/70 mt-2">Use this when the report needs no case. You can undo it afterwards.</p>
    <div class="form-control mt-3">
      <label class="label py-1" for="dm-remarks"><span class="label-text text-xs">Reason (optional)</span></label>
      <textarea id="dm-remarks" class="textarea textarea-bordered textarea-sm w-full" rows="3" maxlength="2000" bind:value={dismissRemarks}></textarea>
    </div>
    {#if dismissError}<div class="alert alert-error text-sm mt-3"><span>{dismissError}</span></div>{/if}
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => dismissModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" disabled={triaging} onclick={() => act('dismiss', dismissRemarks.trim())}>
        {#if busyAction === 'dismiss'}<span class="loading loading-spinner loading-xs"></span>{/if}Dismiss
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
