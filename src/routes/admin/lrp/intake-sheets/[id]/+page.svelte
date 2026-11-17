<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { natureOfCaseLabel, statusLabel, statusBadgeClass, levelLabel } from '$lib/constants/intake-sheets.js';
  import { natureOfConcernLabel } from '$lib/constants/learner-reports.js';
  import { fieldErrors } from '$lib/actions/field-errors.js';

  // A 422's field errors go on the fields; the banner only says where to look.
  /** @param {any} res @param {string} fallback */
  const bannerFor = (res, fallback) => (res.validationErrors && Object.keys(res.validationErrors).length ? 'Please fix the errors shown below.' : res.error || fallback);

  const id = page.params.id;

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let sheet = $state(null);

  /** @type {HTMLDialogElement|null} */
  let deleteModal = $state(null);
  let deleting = $state(false);

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

  // ── Review route: "Forward to" with a destination choice ──
  //   School → Division (or the School Head / Guidance Counselor in the school)
  //   Division → Regional or the School · Regional → Division or the School
  const ROUTE_ACTIONS = /** @type {Record<string, {label: string, title: string, help: string, btn: string, remarks: 'none'|'optional'|'required'}>} */ ({
    review: { label: 'Review', title: 'Review this intake sheet', help: '', btn: 'btn-primary', remarks: 'none' },
    forward: { label: 'Forward to…', title: 'Forward to', help: 'Whoever receives it clicks Review before updating it. Your office can no longer change it until it is forwarded back.', btn: 'btn-primary', remarks: 'optional' },
    recommend_resolved: { label: 'Recommend as Resolved', title: 'Recommend as resolved', help: 'The sheet goes up to the next office with your recommendation. Only the Regional Office can mark it resolved.', btn: 'btn-accent', remarks: 'optional' },
    resolve: { label: 'Mark as Resolved', title: 'Mark as resolved', help: 'The intake sheet becomes read-only. Only the Regional Office can reopen it.', btn: 'btn-success', remarks: 'optional' },
    reopen: { label: 'Reopen', title: 'Reopen this intake sheet', help: 'The sheet can be updated again by the Regional Office.', btn: 'btn-outline', remarks: 'optional' }
  });
  const EVENT_LABELS = /** @type {Record<string, string>} */ ({
    forwarded: 'Forwarded', reviewed: 'Reviewed', returned: 'Returned',
    recommended_resolved: 'Recommended as resolved', resolved: 'Marked as resolved', reopened: 'Reopened'
  });

  const actions = $derived(sheet?.permissions?.actions ?? {});
  const availableActions = $derived(Object.keys(ROUTE_ACTIONS).filter((a) => actions[a] === true));

  /** @type {HTMLDialogElement|null} */
  let routeModal = $state(null);
  /** @type {string|null} */
  let routeAction = $state(null);
  let routeRemarks = $state('');
  /** destination key chosen in the Forward dialog */
  let routeDestination = $state('');
  /** @type {any[]} */
  const destinations = $derived(actions.destinations ?? []);
  const chosenDestination = $derived(destinations.find((d) => d.key === routeDestination) ?? null);
  // Going down a level needs instructions.
  const remarksRequired = $derived(routeAction === 'forward' ? chosenDestination?.direction === 'down' : ROUTE_ACTIONS[routeAction ?? '']?.remarks === 'required');
  let routeBusy = $state(false);
  let routeError = $state('');
  /** @type {Record<string, string[]>} */
  let routeErrors = $state({});

  /** @param {string} action */
  async function startRoute(action) {
    routeError = ''; routeErrors = {};
    if (action === 'review') { await sendRoute(action, ''); return; }
    routeAction = action; routeRemarks = '';
    routeDestination = action === 'forward' ? (destinations.find((d) => d.available && d.direction === 'up')?.key ?? destinations.find((d) => d.available)?.key ?? '') : '';
    routeModal?.showModal();
  }

  /** @param {string} action @param {string} remarks */
  async function sendRoute(action, remarks) {
    /** @type {Record<string, string[]>} */
    const missing = {};
    if (action === 'forward' && !routeDestination) missing.destination = ['Choose where to forward it.'];
    if (action === 'forward' && chosenDestination && !chosenDestination.available) missing.destination = [chosenDestination.reason];
    if (action !== 'review' && remarksRequired && !remarks.trim()) missing.remarks = ['Say what they should do with it.'];
    if (Object.keys(missing).length) { routeError = 'Please fix the errors shown below.'; routeErrors = missing; return; }
    routeBusy = true; routeError = ''; routeErrors = {}; error = '';
    const res = await intakeSheetsService.routeIntakeSheet(id, /** @type {any} */ (action), remarks.trim(), action === 'forward' ? routeDestination : null);
    routeBusy = false;
    if (res.success) { sheet = res.data; routeModal?.close(); }
    else {
      const msg = Object.values(res.validationErrors || {}).flat().join(' ') || res.error || 'Could not complete this step.';
      if (routeModal?.open) { routeErrors = res.validationErrors || {}; routeError = bannerFor(res, 'Could not complete this step.'); } else error = msg;
    }
  }

  /** Destination wording in the dialog title. @param {string|null} action */
  function routeTarget(action) {
    if (action === 'recommend_resolved') return levelLabel(actions.next_level);
    return '';
  }
  /** "Division Office", "School — School Head" … for history and status. @param {string} level @param {string|null} positionLabel */
  const placeLabel = (level, positionLabel) => levelLabel(level) + (positionLabel ? ` — ${positionLabel}` : '');
  const DIRECTION_LABEL = /** @type {Record<string, string>} */ ({ up: 'Up', down: 'Down', within: 'Within the school' });

  /** @param {any} p */
  function fullName(p) {
    return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
  }

  // Full edit: creator or same-school account. Sections only: division/regional.
  const canEditAll = $derived(!!sheet?.permissions?.can_edit_all);
  const canEditSections = $derived(!!sheet?.permissions?.can_edit_sections);

  /** "Added Nov 14, 2026 by X · updated by Y" for a section entry. @param {any} row */
  function editedBy(row) {
    let text = `Added ${fmtDateTime(row.created_at)}${row.created_by ? ` by ${row.created_by.full_name}` : ''}`;
    if (row.updated_at && row.updated_at !== row.created_at) {
      text += ` · Updated ${fmtDateTime(row.updated_at)}${row.updated_by ? ` by ${row.updated_by.full_name}` : ''}`;
    }
    return text;
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
  // Sub-resource editing — Incident Details, Initial Actions Taken, Other
  // Recommendations / Next Steps. Each entry is added, edited, or deleted individually (never
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
      title: 'Initial Action Taken',
      idKey: 'action_taken_id',
      fields: ['action_taken'],
      emptyForm: () => ({ action_taken: '' }),
      summary: (/** @type {any} */ row) => row.action_taken
    },
    recommendations: {
      title: 'Recommendation / Next Step',
      idKey: 'recommendation_id',
      fields: ['recommendation'],
      emptyForm: () => ({ recommendation: '' }),
      summary: (/** @type {any} */ row) => row.recommendation
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
  /** @type {Record<string, string[]>} */
  let childErrors = $state({});

  /** @param {keyof typeof CHILD_CONFIG} type */
  function openAddChild(type) {
    childType = type;
    childId = null;
    childForm = CHILD_CONFIG[type].emptyForm();
    childError = ''; childErrors = {};
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
    childError = ''; childErrors = {};
    childModal?.showModal();
  }

  async function saveChild() {
    if (!childType) return;
    // An entry with nothing in it says nothing — catch it here, on the field.
    const main = { 'detailed-incidents': 'description', 'actions-taken': 'action_taken', recommendations: 'recommendation' }[childType];
    if (main && !String(childForm[main] ?? '').trim()) {
      childErrors = { [main]: ['This field is required.'] }; childError = 'Please fix the errors shown below.';
      return;
    }
    childSaving = true;
    childError = ''; childErrors = {};
    const result = childId
      ? await intakeSheetsService.updateChild(id, childType, childId, childForm)
      : await intakeSheetsService.addChild(id, childType, childForm);
    if (result.success) {
      sheet = result.data;
      childModal?.close();
    } else {
      childErrors = result.validationErrors || {};
      childError = bannerFor(result, 'Failed to save');
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

  // ── V. Referral: YES / NO — one answer per intake sheet ──
  /** @type {HTMLDialogElement|null} */
  let referralModal = $state(null);
  let referralForm = $state({ answer: '', referred_to: '', referral_reason: '' });
  let referralSaving = $state(false);
  let referralError = $state('');
  /** @type {Record<string, string[]>} */
  let referralErrors = $state({});

  function openReferral() {
    referralForm = {
      answer: sheet.is_referred === true ? 'yes' : sheet.is_referred === false ? 'no' : '',
      referred_to: sheet.referred_to || '',
      referral_reason: sheet.referral_reason || ''
    };
    referralError = ''; referralErrors = {};
    referralModal?.showModal();
  }

  async function saveReferral() {
    const yes = referralForm.answer === 'yes';
    /** @type {Record<string, string[]>} */
    const missing = {};
    if (yes && !referralForm.referred_to.trim()) missing.referred_to = ['Say who the case was referred to.'];
    if (yes && !referralForm.referral_reason.trim()) missing.referral_reason = ['Give the reason for the referral.'];
    referralErrors = missing;
    if (Object.keys(missing).length) { referralError = 'Please fix the errors shown below.'; return; }
    referralSaving = true; referralError = '';
    const res = await intakeSheetsService.updateReferral(id, {
      is_referred: referralForm.answer === '' ? null : yes,
      referred_to: yes ? referralForm.referred_to.trim() : null,
      referral_reason: yes ? referralForm.referral_reason.trim() : null
    });
    referralSaving = false;
    if (res.success) { sheet = res.data; referralModal?.close(); }
    else { referralErrors = res.validationErrors || {}; referralError = bannerFor(res, 'Could not save the referral.'); }
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
        {#if canEditAll}
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

    {#if sheet.is_draft && canEditAll}
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

    <!-- Review route: School → Division Office → Regional Office -->
    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-lg">Review route</h2>
          <p class="text-sm mt-1">
            <span class="badge badge-sm {statusBadgeClass(sheet.status)}">{statusLabel(sheet.status)}</span>
            {#if sheet.status === 'resolved'}
              <span class="text-base-content/60 ml-1">by {sheet.resolved_by?.full_name ?? '—'} · {fmtDateTime(sheet.resolved_at)} — read-only</span>
            {:else if !sheet.is_draft}
              <span class="text-base-content/60 ml-1">Now with the <strong>{levelLabel(sheet.routed_to)}</strong>{#if sheet.routed_to_position_label} · for the attention of the {sheet.routed_to_position_label}{/if}</span>
            {/if}
          </p>
        </div>
        {#if availableActions.length}
          <div class="flex flex-wrap gap-2">
            {#each availableActions as a}
              <button class="btn btn-sm {ROUTE_ACTIONS[a].btn}" disabled={routeBusy} onclick={() => startRoute(a)}>
                {#if routeBusy && a === 'review'}<span class="loading loading-spinner loading-xs"></span>{/if}
                {ROUTE_ACTIONS[a].label}{#if a === 'recommend_resolved'} to {routeTarget(a)}{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- What the current user can do, in words -->
      {#if sheet.status === 'resolved'}
        <p class="text-xs text-base-content/60 mt-3">This intake sheet is resolved and can no longer be changed{actions.reopen ? ' — you can reopen it if needed' : ''}.</p>
      {:else if sheet.my_level && !sheet.permissions?.holds_sheet}
        <p class="text-xs text-base-content/60 mt-3">It's with the {levelLabel(sheet.routed_to)}, so your office can't change it until it is forwarded back to you.</p>
      {:else if actions.review}
        <p class="text-xs text-warning mt-3">Click <strong>Review</strong> to start working on this intake sheet — updating is enabled once you have reviewed it.</p>
      {:else if !canEditAll && canEditSections}
        <p class="text-xs text-base-content/60 mt-3">You can add and update Incident Details, Initial Actions Taken and Recommendations / Next Steps (including the Referral). The case details and people involved can only be changed by the school.</p>
      {/if}

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-4">
        <p><span class="text-base-content/50">Prepared by:</span> {sheet.prepared_by?.full_name || '—'}{#if sheet.prepared_by?.position} <span class="text-base-content/40">· {sheet.prepared_by.position}</span>{/if}</p>
        <p><span class="text-base-content/50">Last updated by:</span> {sheet.updated_by?.full_name || '—'}{#if sheet.updated_by} <span class="text-base-content/40">· {fmtDateTime(sheet.updated_at)}</span>{/if}</p>
        {#each ['school', 'division', 'regional'] as lvl}
          {@const r = sheet.reviewers?.[lvl]}
          <p><span class="text-base-content/50">Reviewed by ({levelLabel(lvl)}):</span> {#if r}{r.full_name} <span class="text-base-content/40">· {fmtDateTime(r.reviewed_at)}</span>{:else}—{/if}</p>
        {/each}
      </div>

      {#if sheet.routing_events?.length}
        <div class="mt-4">
          <p class="text-xs font-semibold text-base-content/60 mb-1">History</p>
          <ol class="border-l border-base-300 ml-1.5 space-y-2">
            {#each [...sheet.routing_events].reverse() as e}
              <li class="pl-3 relative text-sm">
                <span class="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full {e.action === 'resolved' ? 'bg-success' : e.action === 'returned' ? 'bg-warning' : 'bg-primary/60'}"></span>
                <p><span class="font-medium">{EVENT_LABELS[e.action] ?? e.action}</span>
                  {#if e.action === 'forwarded' || e.action === 'recommended_resolved' || e.action === 'returned'}<span class="text-base-content/60"> — {levelLabel(e.from_level)} → {placeLabel(e.to_level, e.to_position_label)}</span>{/if}
                  {#if e.action === 'reviewed'}<span class="text-base-content/60"> — {levelLabel(e.to_level)}</span>{/if}
                </p>
                <p class="text-xs text-base-content/50">{e.user?.full_name ?? '—'}{e.user?.position ? `, ${e.user.position}` : ''} · {fmtDateTime(e.created_at)}</p>
                {#if e.remarks}<p class="text-xs text-base-content/70 whitespace-pre-wrap mt-0.5">“{e.remarks}”</p>{/if}
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    </div>

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">People Involved</h2>
      <p class="text-sm mb-3"><span class="text-base-content/50">Adviser of the learner-victim:</span> {sheet.adviser_name || '—'}</p>

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
    {#if sheet.detailed_incidents?.length || canEditSections}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Incident Details</h2>
            {#if sheet.detailed_incidents?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.detailed_incidents.length}</span>
            {/if}
          </div>
          {#if canEditSections}
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
                    <p class="text-xs text-base-content/35 mt-1">{editedBy(inc)}</p>
                  </div>
                </div>
                {#if canEditSections}
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

    <!-- IV. Initial Actions Taken -->
    {#if sheet.actions_taken?.length || canEditSections}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Initial Actions Taken</h2>
            {#if sheet.actions_taken?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.actions_taken.length}</span>
            {/if}
          </div>
          {#if canEditSections}
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
                    <span class="block text-xs text-base-content/35 mt-0.5">{editedBy(a)}</span>
                  </span>
                </span>
                {#if canEditSections}
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

    <!-- V. Recommendations / Next Steps: the Referral answer + other recommendations -->
    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">Recommendations / Next Steps</h2>

      <div class="rounded-lg border border-base-200 p-3 mb-4">
        <div class="flex items-start justify-between gap-3">
          <div class="text-sm min-w-0">
            <p class="font-medium">Referral:
              {#if sheet.is_referred === true}<span class="badge badge-sm badge-info ml-1">Yes</span>
              {:else if sheet.is_referred === false}<span class="badge badge-sm badge-ghost ml-1">No</span>
              {:else}<span class="text-base-content/40 font-normal ml-1">not answered yet</span>{/if}
            </p>
            {#if sheet.is_referred === true}
              <p class="mt-1"><span class="text-base-content/50">Referral to:</span> {sheet.referred_to}</p>
              <p class="mt-0.5 whitespace-pre-wrap"><span class="text-base-content/50">Reason for referral:</span> {sheet.referral_reason}</p>
            {/if}
            {#if sheet.referral_updated_by}
              <p class="text-xs text-base-content/35 mt-1">Updated {fmtDateTime(sheet.referral_updated_at)} by {sheet.referral_updated_by.full_name}</p>
            {/if}
          </div>
          {#if canEditSections}
            <button class="btn btn-circle btn-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-content hover:border-primary hover:scale-110 active:scale-95 transition-all shrink-0" aria-label="Edit referral" title="Edit referral" onclick={openReferral}>
              {@render pencilIcon()}
            </button>
          {/if}
        </div>
      </div>

      {#if sheet.recommendations?.length || canEditSections}
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <h3 class="font-medium text-sm">Other recommendations / next steps</h3>
            {#if sheet.recommendations?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.recommendations.length}</span>
            {/if}
          </div>
          {#if canEditSections}
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
                    <span class="block text-xs text-base-content/35 mt-0.5">{editedBy(r)}</span>
                  </span>
                </span>
                {#if canEditSections}
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
      {/if}
    </div>
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
  <div class="modal-box w-full max-w-lg" use:fieldErrors={{ errors: childErrors, key: childType }}>
    <h3 class="font-bold text-lg mb-3">
      {childId ? 'Edit' : 'Add'} {childType ? CHILD_CONFIG[childType].title : ''}
    </h3>
    {#if childError}<div class="alert alert-error mb-3 text-sm"><span>{childError}</span></div>{/if}

    {#if childType === 'detailed-incidents'}
      <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="form-control">
            <label class="label py-1" for="child-date"><span class="label-text text-xs">Date of Incident</span></label>
            <input id="child-date" data-field="date_of_incident" type="date" class="input input-bordered input-sm" bind:value={childForm.date_of_incident} />
          </div>
          <label class="flex items-center gap-2 mt-6 cursor-pointer select-none">
            <input type="checkbox" data-field="is_estimated_date" class="checkbox checkbox-sm" bind:checked={childForm.is_estimated_date} />
            <span class="text-xs">Estimated date</span>
          </label>
        </div>
        <div class="form-control">
          <label class="label py-1" for="child-desc"><span class="label-text text-xs">Description</span></label>
          <textarea id="child-desc" data-field="description" class="textarea textarea-bordered textarea-sm w-full" rows="4" bind:value={childForm.description}></textarea>
        </div>
      </div>
    {:else if childType === 'actions-taken'}
      <div class="form-control">
        <label class="label py-1" for="child-action"><span class="label-text text-xs">Initial Action Taken</span></label>
        <textarea id="child-action" data-field="action_taken" class="textarea textarea-bordered textarea-sm w-full" rows="4" placeholder="Initial action taken…" bind:value={childForm.action_taken}></textarea>
      </div>
    {:else if childType === 'recommendations'}
      <div class="form-control">
        <label class="label py-1" for="child-rec"><span class="label-text text-xs">Recommendation / Next Step</span></label>
        <textarea id="child-rec" data-field="recommendation" class="textarea textarea-bordered textarea-sm w-full" rows="4" placeholder="Recommendation / next step…" bind:value={childForm.recommendation}></textarea>
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

<!-- V. Referral: YES / NO -->
<dialog bind:this={referralModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md" use:fieldErrors={{ errors: referralErrors }}>
    <h3 class="font-bold text-lg">Referral</h3>
    <p class="text-xs text-base-content/50 mt-1">Was the case referred to a partner agency, NGA or NGO?</p>
    <div class="flex flex-wrap gap-4 mt-3" data-field-wrap>
      {#each [['yes', 'Yes'], ['no', 'No']] as [val, label]}
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" class="radio radio-sm radio-primary" name="referral-answer" data-field="is_referred" value={val} bind:group={referralForm.answer} />
          {label}
        </label>
      {/each}
      {#if referralForm.answer}
        <button type="button" class="btn btn-ghost btn-xs" onclick={() => (referralForm.answer = '')}>Clear answer</button>
      {/if}
    </div>
    {#if referralForm.answer === 'yes'}
      <div class="form-control mt-3">
        <label class="label py-1" for="dlg-ref-to"><span class="label-text text-xs">Referral to *</span></label>
        <input id="dlg-ref-to" data-field="referred_to" type="text" class="input input-bordered input-sm" maxlength="255" placeholder="e.g. DSWD, Barangay VAWC Desk, RHU" bind:value={referralForm.referred_to} />
      </div>
      <div class="form-control mt-2">
        <label class="label py-1" for="dlg-ref-reason"><span class="label-text text-xs">Reason for referral *</span></label>
        <textarea id="dlg-ref-reason" data-field="referral_reason" class="textarea textarea-bordered textarea-sm w-full" rows="3" bind:value={referralForm.referral_reason}></textarea>
      </div>
    {/if}
    {#if referralError}<div class="alert alert-error text-sm mt-3"><span>{referralError}</span></div>{/if}
    <div class="modal-action">
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => referralModal?.close()}>Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" disabled={referralSaving} onclick={saveReferral}>
        {#if referralSaving}<span class="loading loading-spinner loading-xs"></span>{/if}
        Save
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- Review route step with remarks -->
<dialog bind:this={routeModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md" use:fieldErrors={{ errors: routeErrors }}>
    {#if routeAction}
      {@const cfg = ROUTE_ACTIONS[routeAction]}
      <h3 class="font-bold text-lg">{cfg.title}{#if routeTarget(routeAction)} — {routeTarget(routeAction)}{/if}</h3>
      <p class="text-sm text-base-content/70 mt-2">{cfg.help}</p>
      {#if routeAction === 'forward'}
        <fieldset class="mt-3" data-field-wrap>
          <legend class="label-text text-xs mb-1">Forward to *</legend>
          <div class="space-y-1">
            {#each destinations as d}
              <label class="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm {d.available ? 'cursor-pointer border-base-300' : 'border-base-200 opacity-60'} {routeDestination === d.key ? 'border-primary bg-primary/5' : ''}">
                <input type="radio" class="radio radio-sm radio-primary mt-0.5" name="route-destination" data-field="destination" value={d.key} disabled={!d.available} bind:group={routeDestination} />
                <span>
                  <span class="font-medium">{d.label}</span>
                  <span class="text-xs text-base-content/50"> · {DIRECTION_LABEL[d.direction]}</span>
                  {#if !d.available}<span class="block text-xs text-base-content/60">{d.reason}</span>{/if}
                </span>
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}
      {#if cfg.remarks !== 'none'}
        <div class="form-control mt-3">
          <label class="label py-1" for="route-remarks"><span class="label-text text-xs">{remarksRequired ? 'Remarks — what should they do with it? *' : 'Remarks (optional)'}</span></label>
          <textarea id="route-remarks" data-field="remarks" class="textarea textarea-bordered textarea-sm w-full" rows="3" maxlength="2000" bind:value={routeRemarks}></textarea>
        </div>
      {/if}
      {#if routeError}<div class="alert alert-error text-sm mt-3"><span>{routeError}</span></div>{/if}
      <div class="modal-action">
        <button class="btn btn-ghost btn-sm" onclick={() => routeModal?.close()}>Cancel</button>
        <button class="btn btn-sm {cfg.btn}" disabled={routeBusy} onclick={() => sendRoute(/** @type {string} */ (routeAction), routeRemarks)}>
          {#if routeBusy}<span class="loading loading-spinner loading-xs"></span>{/if}{routeAction === 'forward' ? 'Forward' : cfg.label}
        </button>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
