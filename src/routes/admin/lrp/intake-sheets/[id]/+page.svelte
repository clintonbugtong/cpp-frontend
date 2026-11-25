<script>
  import { gradeLabel, gradeSection } from '$lib/constants/grade-levels.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import PrintMenu from '$lib/components/PrintMenu.svelte';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { natureOfCaseLabel, statusLabel, levelLabel, needsSpecify } from '$lib/constants/intake-sheets.js';
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
      loadAttachments();
    } else {
      error = result.error || 'Failed to load intake sheet';
    }
    loading = false;
  }

  // ── Intervention Plan: each upload is a new version; earlier ones are kept ──
  /** @type {any} */
  let files = $state(null);
  let fileError = $state('');
  async function loadAttachments() {
    const res = await intakeSheetsService.getAttachments(id ?? '');
    if (res.success) files = res.data; else fileError = res.error || 'Could not load the files.';
  }
  /** @type {string|null} kind being uploaded */
  let uploadKind = $state(null);
  /** @type {File|null} */
  let uploadFile = $state(null);
  let uploadNotes = $state('');
  let uploading = $state(false);
  /** @type {Record<string, string[]>} */
  let uploadErrors = $state({});
  /** @type {HTMLInputElement|null} */
  let fileInput = $state(null);
  /** @param {string} kind */
  function startUpload(kind) {
    uploadKind = kind; uploadFile = null; uploadNotes = ''; uploadErrors = {}; fileError = '';
  }
  /** @param {Event} e */
  function pickFile(e) {
    const f = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0] ?? null;
    uploadErrors = {};
    if (f && files && f.size > files.max_kb * 1024) { uploadErrors = { file: ['The file must be 10 MB or smaller.'] }; uploadFile = null; return; }
    uploadFile = f;
  }
  async function submitUpload() {
    if (!uploadFile) { uploadErrors = { file: ['Choose the file to upload.'] }; return; }
    uploading = true; uploadErrors = {};
    const res = await intakeSheetsService.uploadAttachment(id ?? '', /** @type {string} */ (uploadKind), uploadFile, uploadNotes);
    uploading = false;
    if (res.success) {
      files = res.data; uploadKind = null;
      // The upload is noted in the edit history.
      const fresh = await intakeSheetsService.getIntakeSheet(id ?? '');
      if (fresh.success) sheet = fresh.data;
    } else {
      uploadErrors = res.validationErrors || { file: [res.error || 'Could not upload the file.'] };
    }
  }
  /** @param {any} v */
  async function downloadVersion(v) {
    fileError = '';
    const res = await intakeSheetsService.downloadAttachment(id ?? '', v.attachment_id, v.name);
    if (!res.success) fileError = res.error || 'Could not download the file.';
  }
  // ── View a file in the page (PDF and images) ──
  /** @type {HTMLDialogElement|null} */
  let viewerDialog = $state(null);
  /** @type {any} */
  let viewing = $state(null);
  let viewUrl = $state('');
  let viewLoading = $state(false);
  let viewError = $state('');
  /** @param {any} v */
  async function viewVersion(v) {
    closeViewer();
    viewing = v; viewError = ''; viewLoading = true;
    viewerDialog?.showModal();
    const res = await intakeSheetsService.viewAttachment(id ?? '', v.attachment_id);
    viewLoading = false;
    if (res.success && viewing === v) {
      // Keep the file's own type so the browser shows a PDF as a PDF.
      viewUrl = URL.createObjectURL(new Blob([/** @type {Blob} */ (res.data)], { type: v.mime_type }));
    } else if (!res.success) {
      viewError = res.error || 'Could not open the file.';
    }
  }
  function closeViewer() {
    if (viewUrl) URL.revokeObjectURL(viewUrl);
    viewUrl = ''; viewing = null; viewError = '';
  }

  /** @param {number} bytes */
  const fmtSize = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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
  // Recommending as resolved is part of the Forward dialog (School and Division only), not its own button.
  const availableActions = $derived(Object.keys(ROUTE_ACTIONS).filter((a) => a !== 'recommend_resolved' && actions[a] === true));

  /** @type {HTMLDialogElement|null} */
  let routeModal = $state(null);
  /** @type {string|null} */
  let routeAction = $state(null);
  let routeRemarks = $state('');
  /** destination key chosen in the Forward dialog */
  let routeDestination = $state('');
  /** "Recommend as resolved" ticked in the Forward dialog */
  let routeRecommend = $state(false);
  /** @type {any[]} */
  const destinations = $derived(actions.destinations ?? []);
  const chosenDestination = $derived(destinations.find((d) => d.key === routeDestination) ?? null);
  // Only the School and Division recommend, and only to the next office up.
  const canRecommend = $derived(actions.recommend_resolved === true && !!actions.next_level);
  const recommendApplies = $derived(canRecommend && chosenDestination?.direction === 'up' && chosenDestination?.level === actions.next_level);
  const recommending = $derived(routeRecommend && recommendApplies);
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
    routeAction = action; routeRemarks = ''; routeRecommend = false;
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
    // Forwarding up with "Recommend as resolved" ticked is the recommend step.
    const step = action === 'forward' && recommending ? 'recommend_resolved' : action;
    const res = await intakeSheetsService.routeIntakeSheet(id, /** @type {any} */ (step), remarks.trim(), step === 'forward' ? routeDestination : null);
    routeBusy = false;
    if (res.success) { sheet = res.data; routeModal?.close(); }
    else {
      const msg = Object.values(res.validationErrors || {}).flat().join(' ') || res.error || 'Could not complete this step.';
      if (routeModal?.open) { routeErrors = res.validationErrors || {}; routeError = bannerFor(res, 'Could not complete this step.'); } else error = msg;
    }
  }

  // Undo: the user's own last route step, while nobody has acted on it since.
  let undoing = $state(false);
  async function undoStep() {
    undoing = true; routeBusy = true; error = '';
    const res = await intakeSheetsService.routeIntakeSheet(id, /** @type {any} */ ('undo'), '');
    routeBusy = false; undoing = false;
    if (res.success) sheet = res.data;
    else error = res.error || 'Could not undo the last step.';
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

  // ── Edit history: loaded only when someone asks to see it ──
  let historyOpen = $state(false);
  let historyLoading = $state(false);
  let historyError = $state('');
  /** @type {any[]|null} */
  let revisions = $state(null);
  async function toggleHistory() {
    historyOpen = !historyOpen;
    if (!historyOpen || revisions) return;
    historyLoading = true; historyError = '';
    const res = await intakeSheetsService.getHistory(id ?? "");
    historyLoading = false;
    if (res.success) revisions = res.data?.revisions ?? [];
    else historyError = res.error || 'Could not load the edit history.';
  }
  // A new save makes the loaded history stale.
  $effect(() => { void sheet?.history_count; revisions = null; historyOpen = false; });

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

  // People Involved, split by side of the case. The learner-victim's parents /
  // guardian belong with the complainant side — never next to the respondents.
  const COMPLAINANT_SIDE = ['LEARNER-VICTIM', 'MOTHER', 'FATHER', 'GUARDIAN', 'COMPLAINANT'];
  const PARENT_ROLES = ['MOTHER', 'FATHER', 'GUARDIAN'];

  // ── Header status card ──
  // Full class names (not built from parts) so Tailwind keeps them.
  const STATUS_TONE = /** @type {Record<string, {bar: string, panel: string, dot: string, text: string}>} */ ({
    draft: { bar: 'bg-base-300', panel: 'bg-base-200/60 border-base-300', dot: 'status-neutral', text: 'text-base-content' },
    not_forwarded: { bar: 'bg-neutral/40', panel: 'bg-base-200/60 border-base-300', dot: 'status-neutral', text: 'text-base-content' },
    for_review: { bar: 'bg-warning', panel: 'bg-warning/10 border-warning/30', dot: 'status-warning', text: 'text-warning-content' },
    under_review: { bar: 'bg-info', panel: 'bg-info/10 border-info/30', dot: 'status-info', text: 'text-info' },
    recommended_resolved: { bar: 'bg-accent', panel: 'bg-accent/10 border-accent/30', dot: 'status-accent', text: 'text-accent' },
    resolved: { bar: 'bg-success', panel: 'bg-success/10 border-success/30', dot: 'status-success', text: 'text-success' }
  });
  const tone = $derived(STATUS_TONE[sheet?.status] ?? STATUS_TONE.draft);
  const ROUTE_LEVELS = ['school', 'division', 'regional'];
  /** Offices the record has been with so far. */
  const visitedLevels = $derived(new Set([
    sheet?.origin_level,
    ...(sheet?.routing_events ?? []).flatMap((/** @type {any} */ e) => [e.from_level, e.to_level])
  ].filter(Boolean)));
  /** @param {string|null|undefined} d */
  const fmtLongDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  // A complainant who is the learner-victim, mother, father or guardian isn't a
  // second row — that person's own row is marked "Complainant" too.
  const complainantSide = $derived.by(() => {
    const all = (sheet?.persons ?? []).filter((/** @type {any} */ p) => COMPLAINANT_SIDE.includes(p.role));
    const linkedTo = (/** @type {any} */ p) => p.same_as || (p.same_as_learner_victim ? 'LEARNER-VICTIM' : null);
    const alsoComplainant = new Set(all.filter((/** @type {any} */ p) => p.role === 'COMPLAINANT' && linkedTo(p)).map(linkedTo));
    return all
      .filter((/** @type {any} */ p) => !(p.role === 'COMPLAINANT' && linkedTo(p) && all.some((/** @type {any} */ o) => o.role === linkedTo(p))))
      .map((/** @type {any} */ p) => ({ ...p, also_complainant: p.role !== 'COMPLAINANT' && alsoComplainant.has(p.role) }))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => COMPLAINANT_SIDE.indexOf(a.role) - COMPLAINANT_SIDE.indexOf(b.role));
  });
  const respondents = $derived((sheet?.persons ?? []).filter((/** @type {any} */ p) => p.role === 'ALLEGED-OFFENDER'));
  const OFFENDER_TYPE_LABELS = /** @type {Record<string, string>} */ ({ school_personnel: 'School Personnel', student: 'Student', other: 'Other' });
  /** @param {any} p */
  const personDetails = (p) => [
    OFFENDER_TYPE_LABELS[p.offender_type],
    p.role === 'ALLEGED-OFFENDER' && p.offender_type === 'student' && p.grade ? gradeSection(p.grade, p.section) : '',
    p.role === 'ALLEGED-OFFENDER' && !p.birthdate && p.age != null ? `Age ${p.age}` : '',
    p.relation_to_learner_victim || (p.role === 'COMPLAINANT' ? '' : p.occupation) || ''
  ].filter(Boolean).join(' · ');
  /** "Mother of the learner-victim" etc. @param {any} p */
  const sideRoleLabel = (p) => p.same_as_learner_victim ? 'Complainant (the learner-victim)'
    : ['MOTHER', 'FATHER', 'GUARDIAN'].includes(p.same_as) ? `Complainant (the ${p.same_as.toLowerCase()} of the learner-victim)` : ['MOTHER', 'FATHER', 'GUARDIAN'].includes(p.role)
    ? `${ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (p.role)]} of the learner-victim`
    : ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (p.role)] || p.role;

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
      fields: ['date_type', 'date_of_incident', 'is_estimated_date', 'description'],
      emptyForm: () => ({ date_type: 'exact', date_of_incident: '', is_estimated_date: false, description: '' }),
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
    if (type === 'detailed-incidents') form.date_type = row.date_type || (row.date_of_incident ? 'other' : 'exact');
    childForm = form;
    childError = ''; childErrors = {};
    childModal?.showModal();
  }

  async function saveChild() {
    if (!childType) return;
    // An entry with nothing in it says nothing — catch it here, on the field.
    const main = { 'detailed-incidents': 'description', 'actions-taken': 'action_taken', recommendations: 'recommendation' }[childType];
    /** @type {Record<string, string[]>} */
    const missing = {};
    if (main && !String(childForm[main] ?? '').trim()) missing[main] = ['This field is required.'];
    if (childType === 'detailed-incidents' && !String(childForm.date_of_incident ?? '').trim()) missing.date_of_incident = ['Enter the date or an estimate.'];
    if (Object.keys(missing).length) {
      childErrors = missing; childError = 'Please fix the errors shown below.';
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

  // Colour of the Nature of Case highlight: abuse and harassment red, bullying
  // orange, discrimination / neglect amber, others neutral-blue.
  // Full class names (not built from parts) so Tailwind keeps them.
  const NATURE_TONE = /** @type {Record<string, {box: string, icon: string}>} */ ({
    red: { box: 'border-error/30 bg-error/10 text-error', icon: 'bg-error/15 text-error' },
    orange: { box: 'border-warning/50 bg-warning/15 text-base-content', icon: 'bg-warning text-warning-content' },
    blue: { box: 'border-info/30 bg-info/10 text-base-content', icon: 'bg-info text-info-content' }
  });
  const natureTone = $derived(NATURE_TONE[
    ['CHILD_ABUSE', 'PHYSICAL_ABUSE', 'SEXUAL_ABUSE_HARASSMENT'].includes(sheet?.nature_of_case) ? 'red'
      : ['BULLYING', 'NON_BULLYING', 'DISCRIMINATION', 'NEGLECT'].includes(sheet?.nature_of_case) ? 'orange' : 'blue'
  ]);
  const enhanced = $derived(sheet?.enhanced_intake_sheet ?? { available: true, reason: null });
  // Print menu items (shared PrintMenu component).
  const printMenuItems = $derived([
    { title: 'Enhanced Intake Sheet', description: 'Annex E · strictly confidential, with full names', icon: /** @type {const} */ ('document'),
      tone: /** @type {const} */ ('primary'), available: enhanced.available, reason: enhanced.reason, run: () => { error = ''; return downloadPdf(); } },
    { title: 'Incident Report', description: 'LRP Concern form · names of minors withheld', icon: /** @type {const} */ ('clipboard'),
      tone: /** @type {const} */ ('secondary'), run: () => { error = ''; return downloadIncidentReportPdf(); } }
  ]);

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

{#snippet undoIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>
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
    <div class="card bg-base-100 shadow-sm border border-base-200 overflow-visible">
      <div class="h-1 rounded-t-box {tone.bar}"></div>
      <div class="p-4 sm:p-5 space-y-3">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
      <div class="min-w-0 lg:flex-1">
        <p class="text-[11px] font-medium uppercase tracking-wider text-base-content/50">Intake Sheet / Incident Report</p>
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap">LRP-{String(sheet.intake_sheet_id).padStart(5, '0')}</h1>
        <!-- Nature of case: the headline of the record -->
        <div class="mt-2 inline-flex max-w-full items-start gap-2.5 rounded-xl border px-3 py-2 {natureTone.box}">
          <span class="grid place-items-center w-8 h-8 shrink-0 rounded-lg {natureTone.icon}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-[18px] h-[18px]" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
          </span>
          <span class="min-w-0">
            <span class="block text-[10px] font-semibold uppercase tracking-wider opacity-70">Nature of Case</span>
            <span class="block text-base sm:text-lg font-bold leading-tight break-words">{natureOfCaseLabel(sheet.nature_of_case)}</span>
            {#if needsSpecify(sheet.nature_of_case) && sheet.nature_of_case_other}
              <span class="block text-sm font-medium leading-snug break-words opacity-90">{sheet.nature_of_case_other}</span>
            {/if}
          </span>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs sm:text-sm text-base-content/70">
          <span class="inline-flex items-center gap-1.5 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/40"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>
            <span class="break-words">{sheet.school?.name || 'No school'}</span>
          </span>
          <span class="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/40"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"/></svg>
            {sheet.division?.name || '—'}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.6" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/40"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
            Date of intake: {fmtLongDate(sheet.date_of_intake)}
          </span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 lg:justify-end lg:max-w-[50%]">
        <!-- One Print button: the same record generates either form -->
        <PrintMenu items={printMenuItems} />
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

      <!-- Status panel: where the record is now, and the route so far -->
      <div class="rounded-box border {tone.panel} px-3 py-2 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div class="flex items-center gap-2.5 md:min-w-56">
          <div class="inline-grid *:[grid-area:1/1]">
            {#if sheet.status === 'for_review'}<div class="status status-md {tone.dot} animate-ping"></div>{/if}
            <div class="status status-md {tone.dot}"></div>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold leading-tight">{statusLabel(sheet.status)}</p>
            <p class="text-xs text-base-content/70">
              {#if sheet.status === 'resolved'}
                Resolved by {sheet.resolved_by?.full_name ?? '—'} · {fmtDateTime(sheet.resolved_at)}
              {:else if sheet.is_draft}
                Not yet finalized
              {:else}
                With the <strong>{levelLabel(sheet.routed_to)}</strong>{#if sheet.routed_to_position_label} · {sheet.routed_to_position_label}{/if}{#if sheet.routed_at}<span class="text-base-content/50"> · since {fmtDateTime(sheet.routed_at)}</span>{/if}
              {/if}
            </p>
          </div>
        </div>
        {#if !sheet.is_draft}
          <ul class="steps steps-horizontal w-full text-[11px] md:flex-1 [&_.step]:grid-rows-[1.75rem_auto] [&_.step]:after:size-6 [&_.step]:after:text-[10px] [&_.step]:before:h-1">
            {#each ROUTE_LEVELS as lvl}
              {@const here = sheet.status !== 'resolved' && sheet.routed_to === lvl}
              {@const been = visitedLevels.has(lvl)}
              <li class="step {here || been ? (sheet.status === 'resolved' ? 'step-success' : 'step-primary') : ''} {here ? 'font-semibold' : 'text-base-content/60'}" data-content={here ? '●' : been ? '✓' : ''}>
                {levelLabel(lvl)}
              </li>
            {/each}
            <li class="step {sheet.status === 'resolved' ? 'step-success font-semibold' : 'text-base-content/60'}" data-content={sheet.status === 'resolved' ? '✓' : ''}>Resolved</li>
          </ul>
        {/if}
      </div>
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
            Created from Learner Report RPT-{String(report.learner_report_id).padStart(5, '0')} —
            {report.is_anonymous ? 'Anonymous' : report.reporter_full_name} ·
            {natureOfConcernLabel(report.nature_of_concern)}. Tap to view the original report.
          </span>
        </button>
      {:else}
        <div class="alert bg-accent/10 border border-accent/30 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0 text-accent">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"/>
          </svg>
          <span>Created from Learner Report RPT-{String(report.learner_report_id).padStart(5, '0')}.</span>
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
          <p class="text-xs text-base-content/50 mt-0.5">Review, forward, or recommend this record as resolved.</p>
        </div>
        {#if availableActions.length || actions.undo}
          <div class="flex flex-wrap justify-end gap-2 ml-auto">
            {#if actions.undo}
              <button class="btn btn-sm btn-ghost border border-base-300 gap-1.5" disabled={routeBusy} title={actions.undo.detail || ''} onclick={undoStep}>
                {#if routeBusy && undoing}<span class="loading loading-spinner loading-xs"></span>{:else}{@render undoIcon()}{/if}
                {actions.undo.label}
              </button>
            {/if}
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
      {#if actions.undo?.label === 'Undo forward' || actions.undo?.label === 'Undo recommendation'}
        <p class="text-xs text-base-content/60 mt-3">You sent it to the {levelLabel(sheet.routed_to)}{#if sheet.routed_to_position_label} · {sheet.routed_to_position_label}{/if}. If you forgot something, click <strong>{actions.undo.label}</strong> to take it back before they act on it.</p>
      {:else if sheet.status === 'resolved'}
        <p class="text-xs text-base-content/60 mt-3">This intake sheet is resolved and can no longer be changed{actions.reopen ? ' — you can reopen it if needed' : ''}.</p>
      {:else if sheet.my_level && !sheet.permissions?.holds_sheet}
        <p class="text-xs text-base-content/60 mt-3">It's with the {levelLabel(sheet.routed_to)}, so your office can't change it until it is forwarded back to you.</p>
      {:else if actions.review}
        <p class="text-xs text-warning mt-3">Click <strong>Review</strong> to start working on this intake sheet — updating is enabled once you have reviewed it.</p>
      {:else if !canEditAll && canEditSections}
        <p class="text-xs text-base-content/60 mt-3">You can add and update Initial Actions Taken and Recommendations / Next Steps (including the Referral). The case details, people involved and Incident Details can only be changed by the {levelLabel(sheet.origin_level || 'school')}, where it was created.</p>
      {/if}

      <!-- Who: preparer, last editor, and only the offices that have reviewed so far -->
      <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-base-content/60 mt-3 pt-3 border-t border-base-200">
        <span>Prepared by <span class="text-base-content">{sheet.prepared_by?.full_name || '—'}</span></span>
        {#if sheet.updated_by}<span>Last updated by <span class="text-base-content">{sheet.updated_by.full_name}</span> · {fmtDateTime(sheet.updated_at)}</span>{/if}
        {#each ['school', 'division', 'regional'] as lvl}
          {@const r = sheet.reviewers?.[lvl]}
          {#if r}<span>Reviewed ({levelLabel(lvl)}) <span class="text-base-content">{r.full_name}</span> · {fmtDateTime(r.reviewed_at)}</span>{/if}
        {/each}
      </div>

      <!-- Route history: collapsed under the route card, latest first -->
      {#if sheet.routing_events?.length}
        <details class="mt-3">
          <summary class="cursor-pointer text-sm font-medium select-none">Route history <span class="text-base-content/50 font-normal">({sheet.routing_events.length})</span></summary>
          <ul class="mt-2 space-y-2">
            {#each [...sheet.routing_events].reverse() as e}
              <li class="text-sm border-l-2 pl-3 {e.action === 'resolved' ? 'border-success' : e.action === 'returned' ? 'border-warning' : 'border-base-300'}">
                <span class="font-medium">{EVENT_LABELS[e.action] ?? e.action}</span>
                {#if e.action === 'forwarded' || e.action === 'recommended_resolved' || e.action === 'returned'}
                  <span class="text-base-content/60">{' '}· {levelLabel(e.from_level)} → {placeLabel(e.to_level, e.to_position_label)}</span>
                {:else if e.action === 'reviewed'}
                  <span class="text-base-content/60">{' '}· {levelLabel(e.to_level)}</span>
                {/if}
                <span class="block text-xs text-base-content/60">{e.user?.full_name ?? '—'}{e.user?.position ? ` (${e.user.position})` : ''} · {fmtDateTime(e.created_at)}</span>
                {#if e.remarks}<span class="block text-xs whitespace-pre-wrap break-words mt-0.5">“{e.remarks}”</span>{/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>

    {#snippet personList(/** @type {any[]} */ list, /** @type {string} */ empty)}
      {#if !list.length}
        <p class="text-sm text-base-content/40">{empty}</p>
      {:else}
        <!-- Mobile: card list -->
        <div class="sm:hidden space-y-2">
          {#each list as p}
            {@const lv = p.role === 'LEARNER-VICTIM'}
            {@const par = PARENT_ROLES.includes(p.role)}
            {@const off = p.role === 'ALLEGED-OFFENDER'}
            <div class="rounded-lg p-3 border {lv ? 'border-primary/40 bg-primary/5 border-l-4 border-l-primary' : par ? 'border-info/30 bg-info/5 border-l-4 border-l-info' : off ? 'border-error/30 bg-error/5 border-l-4 border-l-error' : 'border-base-200'}">
              <div class="flex items-start justify-between gap-2">
                <span class="text-sm min-w-0 break-words {lv || par || off ? 'font-semibold' : 'font-medium'}">{fullName(p)}</span>
                <span class="flex flex-col items-end gap-1 max-w-[55%]">
                  <span class="badge badge-sm {lv ? 'badge-primary' : par ? 'badge-info badge-soft' : off ? 'badge-error badge-soft' : 'badge-ghost'} h-auto py-0.5 whitespace-normal text-right leading-snug">{sideRoleLabel(p)}</span>
                  {#if p.also_complainant}<span class="badge badge-sm badge-accent badge-outline">Complainant</span>{/if}
                </span>
              </div>
              <p class="text-xs text-base-content/60 mt-1">
                {#if p.role === 'LEARNER-VICTIM'}
                  {gradeSection(p.grade, p.section)}
                {:else}
                  {personDetails(p)}
                {/if}
                {#if p.contact_number} · {p.contact_number}{/if}
              </p>
            </div>
          {/each}
        </div>
        <!-- Tablet/desktop: table -->
        <div class="hidden sm:block overflow-x-auto">
          <table class="table table-sm table-fixed">
            <thead><tr><th class="w-52">Role</th><th>Name</th><th>Details</th><th class="w-40">Contact</th></tr></thead>
            <tbody>
              {#each list as p}
                {@const lv = p.role === 'LEARNER-VICTIM'}
                {@const par = PARENT_ROLES.includes(p.role)}
                {@const off = p.role === 'ALLEGED-OFFENDER'}
                <tr class="align-top {lv ? 'bg-primary/5' : par ? 'bg-info/5' : off ? 'bg-error/5' : ''}">
                  <td class={lv ? 'shadow-[inset_4px_0_0_var(--color-primary)]' : par ? 'shadow-[inset_4px_0_0_var(--color-info)]' : off ? 'shadow-[inset_4px_0_0_var(--color-error)]' : ''}><span class="badge badge-sm {lv ? 'badge-primary' : par ? 'badge-info badge-soft' : off ? 'badge-error badge-soft' : 'badge-ghost'} h-auto py-0.5 whitespace-normal text-left leading-snug">{sideRoleLabel(p)}</span>{#if p.also_complainant}<span class="badge badge-sm badge-accent badge-outline mt-1">Complainant</span>{/if}</td>
                  <td class="break-words {lv || par || off ? 'font-semibold' : ''}">{fullName(p)}</td>
                  <td class="text-base-content/70 break-words">
                    {#if p.role === 'LEARNER-VICTIM'}
                      {gradeSection(p.grade, p.section)}
                    {:else}
                      {personDetails(p)}
                    {/if}
                  </td>
                  <td class="text-base-content/70">{p.contact_number || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/snippet}

    <!-- Learner-Victim / Complainant side -->
    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg">Learner-Victim / Complainant</h2>
      <p class="text-xs text-base-content/50 mb-3">The learner-victim, their parents or guardian, and anyone who filed the complaint.</p>
      {@render personList(complainantSide, 'None recorded.')}
      <div class="mt-4 rounded-lg border border-secondary/30 border-l-4 border-l-secondary bg-secondary/5 p-3 sm:p-4">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="badge badge-sm badge-secondary">Adviser of the learner-victim</span>
          <span class="font-semibold">{sheet.adviser_name || 'Not recorded'}</span>
        </div>
        {#if sheet.adviser_observation_before || sheet.adviser_observation_after}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {#each [['Observations before the incident', sheet.adviser_observation_before], ['Observations after the incident', sheet.adviser_observation_after]] as [label, text]}
              <div class="rounded-md bg-base-100 border border-base-200 p-3">
                <p class="text-xs font-medium text-base-content/60">{label}</p>
                <p class="text-sm mt-1 whitespace-pre-wrap break-words">{text || '—'}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Respondent side -->
    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg">Respondent / Alleged Offender{respondents.length > 1 ? 's' : ''}</h2>
      <p class="text-xs text-base-content/50 mb-3">The person or persons the complaint is against.</p>
      {#if sheet.offender_unidentified}
        <div class="rounded-lg border border-error/30 border-l-4 border-l-error bg-error/5 p-3 text-sm">
          <span class="badge badge-sm badge-error badge-soft mr-2">Not yet identified</span>
          <span class="whitespace-pre-wrap break-words">{sheet.offender_description || ''}</span>
        </div>
      {:else}
        {@render personList(respondents, 'No alleged offender recorded.')}
      {/if}
    </div>

    <!-- Incident Details -->
    {#if sheet.detailed_incidents?.length || canEditAll}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-lg">Incident Details</h2>
            {#if sheet.detailed_incidents?.length > 1}
              <span class="badge badge-sm badge-primary badge-outline font-semibold">{sheet.detailed_incidents.length}</span>
            {/if}
          </div>
          {#if canEditAll}
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
                    <p class="text-sm font-medium">{inc.date_label || inc.date_of_incident || 'Date not entered'}{#if inc.is_estimated_date} <span class="badge badge-xs badge-ghost">estimated</span>{/if}</p>
                    <p class="text-sm text-base-content/70 whitespace-pre-wrap">{inc.description}</p>
                    <p class="text-xs text-base-content/35 mt-1">{editedBy(inc)}</p>
                  </div>
                </div>
                {#if canEditAll}
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

    <!-- Intervention Plan: uploaded any time; every version is kept -->
    {#if files}
      {#each files.attachments as att}
        <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-lg">{att.label}</h2>
              <p class="text-xs text-base-content/50 mt-0.5">The separate sheet for the interventions planned for the learner. Upload a new version any time — earlier versions are kept.</p>
            </div>
            {#if files.can_upload && uploadKind !== att.kind}
              <button class="btn btn-sm btn-primary ml-auto" onclick={() => startUpload(att.kind)}>{att.current ? 'Upload new version' : 'Upload'}</button>
            {/if}
          </div>

          {#if uploadKind === att.kind}
            <div class="mt-4 rounded-lg border border-base-300 bg-base-200/40 p-3 space-y-2">
              <div class="form-control" data-field-wrap>
                <label class="label py-1" for="att-file-{att.kind}"><span class="label-text text-xs">File * <span class="text-base-content/50">(PDF, DOC/DOCX, JPG or PNG · up to 10 MB)</span></span></label>
                <input id="att-file-{att.kind}" bind:this={fileInput} type="file" class="file-input file-input-bordered file-input-sm w-full {uploadErrors.file ? 'file-input-error' : ''}"
                  accept={files.accept.map((/** @type {string} */ x) => `.${x}`).join(',')} onchange={pickFile} />
                {#if uploadErrors.file}<p class="text-xs text-error mt-1">{uploadErrors.file[0]}</p>{/if}
              </div>
              <div class="form-control">
                <label class="label py-1" for="att-notes-{att.kind}"><span class="label-text text-xs">What changed in this version? (optional)</span></label>
                <input id="att-notes-{att.kind}" type="text" maxlength="1000" class="input input-bordered input-sm w-full" placeholder="e.g. Revised after the case conference" bind:value={uploadNotes} />
                {#if uploadErrors.notes}<p class="text-xs text-error mt-1">{uploadErrors.notes[0]}</p>{/if}
              </div>
              <div class="flex justify-end gap-2">
                <button class="btn btn-ghost btn-sm" onclick={() => (uploadKind = null)}>Cancel</button>
                <button class="btn btn-primary btn-sm" disabled={uploading || !uploadFile} onclick={submitUpload}>{#if uploading}<span class="loading loading-spinner loading-xs"></span>{/if}Upload</button>
              </div>
            </div>
          {/if}

          {#if att.current}
            {@const v = att.current}
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
              <div class="min-w-0">
                <p class="text-sm font-medium break-words"><span class="badge badge-sm badge-primary mr-1.5">v{v.version} · current</span>{v.name}</p>
                <p class="text-xs text-base-content/60 mt-0.5">{fmtSize(v.size)} · {v.uploaded_by?.full_name ?? '—'}{v.uploaded_by?.position ? ` (${v.uploaded_by.position})` : ''} · {fmtDateTime(v.created_at)}</p>
                {#if v.notes}<p class="text-xs mt-0.5 break-words">“{v.notes}”</p>{/if}
              </div>
              <div class="flex gap-2 ml-auto">
                <button class="btn btn-sm btn-primary" disabled={!v.viewable} title={v.viewable ? 'View in the page' : 'Word files can\'t be shown in the browser — download it instead'} onclick={() => viewVersion(v)}>View</button>
                <button class="btn btn-sm btn-outline" onclick={() => downloadVersion(v)}>Download</button>
              </div>
            </div>
          {:else if uploadKind !== att.kind}
            <p class="text-sm text-base-content/40 mt-3">No intervention plan uploaded yet.</p>
          {/if}

          {#if att.previous.length}
            <details class="mt-3">
              <summary class="cursor-pointer text-sm font-medium select-none">Previous versions <span class="text-base-content/50 font-normal">({att.previous.length})</span></summary>
              <ul class="mt-2 space-y-2">
                {#each att.previous as v}
                  <li class="flex flex-wrap items-center justify-between gap-2 border-l-2 border-base-300 pl-3 text-sm">
                    <div class="min-w-0">
                      <p class="break-words"><span class="badge badge-sm badge-ghost mr-1.5">v{v.version}</span>{v.name}</p>
                      <p class="text-xs text-base-content/60">{fmtSize(v.size)} · {v.uploaded_by?.full_name ?? '—'} · {fmtDateTime(v.created_at)}</p>
                      {#if v.notes}<p class="text-xs break-words">“{v.notes}”</p>{/if}
                    </div>
                    <div class="flex gap-1 ml-auto">
                      {#if v.viewable}<button class="btn btn-xs btn-ghost border border-base-300" onclick={() => viewVersion(v)}>View</button>{/if}
                      <button class="btn btn-xs btn-ghost border border-base-300" onclick={() => downloadVersion(v)}>Download</button>
                    </div>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
          {#if fileError}<div class="alert alert-error text-sm mt-3"><span>{fileError}</span></div>{/if}
        </div>
      {/each}
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


    <!-- Edit history: hidden until asked for -->
    {#if sheet.history_count > 0}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold text-lg">Edit history</h2>
            <p class="text-xs text-base-content/50 mt-0.5">Every change made after the record was finalized: who, when, and what changed.</p>
          </div>
          <button class="btn btn-sm btn-outline ml-auto" onclick={toggleHistory}>
            {historyOpen ? 'Hide edit history' : `Show edit history (${sheet.history_count})`}
          </button>
        </div>
        {#if historyOpen}
          {#if historyLoading}
            <div class="py-6 text-center"><span class="loading loading-spinner"></span></div>
          {:else if historyError}
            <div class="alert alert-error text-sm mt-3"><span>{historyError}</span></div>
          {:else if revisions}
            <ol class="mt-4 space-y-4">
              {#each revisions as r}
                <li class="border-l-2 border-primary/40 pl-3">
                  <p class="text-sm"><span class="font-medium">{r.user?.full_name ?? '—'}</span>{r.user?.position ? ` (${r.user.position})` : ''}<span class="text-base-content/50">{' '}· {fmtDateTime(r.created_at)}</span></p>
                  <ul class="mt-1.5 space-y-1.5">
                    {#each r.changes as c}
                      <li class="text-xs rounded-md bg-base-200/50 px-2.5 py-1.5">
                        <p class="text-base-content/60">{c.section}{c.item ? ` › ${c.item}` : ''}{' '}· <span class="font-medium text-base-content">{c.field}</span></p>
                        {#if c.field === 'Added'}
                          <p class="mt-0.5 whitespace-pre-wrap break-words"><span class="text-success font-medium">+</span>{' '}{c.new}</p>
                        {:else if c.field === 'Removed'}
                          <p class="mt-0.5 whitespace-pre-wrap break-words text-base-content/60 line-through">{c.old}</p>
                        {:else}
                          <p class="mt-0.5 whitespace-pre-wrap break-words"><span class="text-base-content/50 line-through">{c.old || '(blank)'}</span>{' '}<span class="text-base-content/40">→</span>{' '}<span>{c.new || '(blank)'}</span></p>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </li>
              {/each}
            </ol>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<dialog bind:this={deleteModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Delete Intake Sheet / Incident Report</h3>
    <p class="py-4 text-base-content/70">Are you sure you want to delete record #{sheet?.intake_sheet_id}? This can be restored later by an administrator.</p>
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
            <label class="label py-1" for="child-dtype"><span class="label-text text-xs">When it happened *</span></label>
            <select id="child-dtype" class="select select-bordered select-sm" bind:value={childForm.date_type} onchange={() => { childForm.date_of_incident = ''; childForm.is_estimated_date = false; }}>
              <option value="exact">Exact date</option>
              <option value="month_year">Month and year</option>
              <option value="year">Year only</option>
              <option value="other">Other estimate</option>
            </select>
          </div>
          <div class="form-control">
            <label class="label py-1" for="child-date"><span class="label-text text-xs">{{ exact: 'Exact date', month_year: 'Month and year', year: 'Year only', other: 'Other estimate' }[/** @type {'exact'} */ (childForm.date_type)]} *</span></label>
            {#if childForm.date_type === 'exact'}
              <input id="child-date" data-field="date_of_incident" type="date" class="input input-bordered input-sm" bind:value={childForm.date_of_incident} />
            {:else if childForm.date_type === 'month_year'}
              <input id="child-date" data-field="date_of_incident" type="month" class="input input-bordered input-sm" bind:value={childForm.date_of_incident} />
            {:else if childForm.date_type === 'year'}
              <input id="child-date" data-field="date_of_incident" type="text" inputmode="numeric" maxlength="4" placeholder="e.g. 2025" class="input input-bordered input-sm" bind:value={childForm.date_of_incident} />
            {:else}
              <input id="child-date" data-field="date_of_incident" type="text" maxlength="255" placeholder="e.g. around the start of the school year" class="input input-bordered input-sm" bind:value={childForm.date_of_incident} />
            {/if}
          </div>
        </div>
        <div class="form-control">
          <label class="label py-1" for="child-desc"><span class="label-text text-xs">Details of the incident *</span></label>
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
        {#if canRecommend}
          <label class="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm {recommendApplies ? 'cursor-pointer border-base-300' : 'border-base-200 opacity-60'} {recommending ? 'border-accent bg-accent/5' : ''}">
            <input type="checkbox" class="checkbox checkbox-sm checkbox-accent mt-0.5" bind:checked={routeRecommend} disabled={!recommendApplies} />
            <span>
              <span class="font-medium">Recommend as resolved</span>
              <span class="block text-xs text-base-content/60">{recommendApplies
                ? 'Sent with your recommendation. Only the Regional Office can mark it resolved.'
                : `Choose the ${levelLabel(actions.next_level)} above to recommend it as resolved.`}</span>
            </span>
          </label>
        {/if}
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
          {#if routeBusy}<span class="loading loading-spinner loading-xs"></span>{/if}{routeAction === 'forward' ? (recommending ? 'Forward & Recommend as Resolved' : 'Forward') : cfg.label}
        </button>
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- View an Intervention Plan version in the page (PDF and images) -->
<dialog bind:this={viewerDialog} class="modal" onclose={closeViewer}>
  <div class="modal-box w-11/12 max-w-5xl h-[90vh] p-0 flex flex-col">
    <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-200">
      <div class="min-w-0">
        <p class="font-semibold text-sm break-words">{viewing?.name ?? ''}</p>
        {#if viewing}<p class="text-xs text-base-content/60">Version {viewing.version} · {viewing.uploaded_by?.full_name ?? '—'} · {fmtDateTime(viewing.created_at)}</p>{/if}
      </div>
      <div class="flex gap-2 shrink-0">
        {#if viewing}<button class="btn btn-sm btn-outline" onclick={() => downloadVersion(viewing)}>Download</button>{/if}
        <button class="btn btn-sm btn-ghost" onclick={() => viewerDialog?.close()}>Close</button>
      </div>
    </div>
    <div class="flex-1 min-h-0 bg-base-200/50">
      {#if viewLoading}
        <div class="h-full flex items-center justify-center"><span class="loading loading-spinner loading-lg"></span></div>
      {:else if viewError}
        <div class="p-4"><div class="alert alert-error text-sm"><span>{viewError}</span></div></div>
      {:else if viewUrl && viewing?.mime_type === 'application/pdf'}
        <iframe src={viewUrl} title={viewing.name} class="w-full h-full border-0"></iframe>
      {:else if viewUrl}
        <div class="h-full overflow-auto flex items-start justify-center p-4">
          <img src={viewUrl} alt={viewing?.name ?? 'Intervention plan'} class="max-w-full h-auto shadow" />
        </div>
      {/if}
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
