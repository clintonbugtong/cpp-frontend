<script>
  import { goto } from '$app/navigation';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { api } from '$lib/api/client.js';
  import { NATURE_OF_CASE_OPTIONS } from '$lib/constants/intake-sheets.js';
  import { relationshipLabel } from '$lib/constants/learner-reports.js';

  /** @type {{ intakeSheetId?: number|string|null, fromReportId?: number|string|null }} */
  let { intakeSheetId = null, fromReportId = null } = $props();
  let isEdit = $derived(!!intakeSheetId);
  let isFromReport = $derived(!isEdit && !!fromReportId);

  // The backend record ID once one exists — null until Step 1 is first saved
  // for a brand-new sheet, already known immediately when editing.
  let sheetId = $state(intakeSheetId ? Number(intakeSheetId) : null);
  // Whether this record is still a draft (data saved progressively, not yet
  // finalized). Always true for a fresh sheet; for an existing one it's
  // whatever loadExisting() finds. While it's true, each "Next" click persists
  // that step's section to the backend instead of just holding it in memory —
  // that's what makes the wizard "gradual": walking away mid-way leaves a
  // resumable draft instead of losing everything.
  let loadedIsDraft = $state(true);
  let isDraftFlow = $derived(!isEdit || loadedIsDraft);

  const STEPS = [
    { n: 1, label: 'Intake Info' },
    { n: 2, label: 'People Involved' },
    { n: 3, label: 'Incident Details' },
    { n: 4, label: 'Actions & Referrals' },
    { n: 5, label: 'Review & Submit' }
  ];
  let currentStep = $state(1);

  let loading = $state(isEdit || isFromReport);
  let submitting = $state(false);
  let submitError = $state('');
  /** @type {Record<string,string[]>} */
  let submitValidationErrors = $state({});
  /** Set once loadFromReport() succeeds — used for the "prefilled from" banner. */
  /** @type {any} */
  let sourceReport = $state(null);

  // ── Step 1: Intake info ──────────────────────────────────────────────────
  const isRegional = authState.user?.organizationLevel === 'regional';
  let header = $state({
    division_id: authState.user?.division?.id ? String(authState.user.division.id) : '',
    school_id: '',
    date_of_intake: new Date().toISOString().slice(0, 10),
    nature_of_case: '',
    nature_of_case_other: ''
  });
  /** @type {any[]} */
  let divisions = $state([]);
  let schoolQuery = $state('');
  /** @type {any[]} */
  let schoolResults = $state([]);
  let schoolSearching = $state(false);
  /** @type {any} */
  let selectedSchool = $state(null);

  // ── Step 2: People involved ──────────────────────────────────────────────
  function emptyPerson() {
    return {
      person_id: null, first_name: '', middle_name: '', last_name: '',
      birthdate: '', sex: '', grade: '', section: '', occupation: '',
      contact_number: '', address: '', relation_to_learner_victim: ''
    };
  }
  let learner = $state(emptyPerson());
  // Mother/Father have a fixed sex — no picker shown for them (see personFields'
  // hideSex option below); Guardian's sex varies, so it keeps the normal picker.
  /** @type {Record<string, any>} */
  let optional = $state({
    MOTHER: { included: false, ...emptyPerson(), sex: 'FEMALE' },
    FATHER: { included: false, ...emptyPerson(), sex: 'MALE' },
    GUARDIAN: { included: false, ...emptyPerson() }
  });
  /** @type {any[]} */
  let complainants = $state([]);
  /** @type {any[]} */
  let allegedOffenders = $state([]);

  // ── Step 3: Incident details ─────────────────────────────────────────────
  function emptyIncident() {
    return { date_of_incident: '', is_estimated_date: false, description: '' };
  }
  let incidents = $state([emptyIncident()]);

  // ── Step 4: Actions / recommendations / referrals ───────────────────────
  let actions = $state([{ action_taken: '' }]);
  let recommendations = $state([{ recommendation: '' }]);
  let referrals = $state([{ referred_to: '', reason: '' }]);

  $effect(() => {
    if (isRegional) {
      api.get('/divisions/all').then((res) => { divisions = res.data || []; }).catch(() => { divisions = []; });
    }
    if (isEdit) loadExisting();
    else if (isFromReport) loadFromReport();
  });

  /**
   * Prefills the form from an already-submitted learner report instead of
   * starting blank — the whole point of the report form is to hand the Focal
   * Person a head start, not busywork re-typing what's already known.
   */
  async function loadFromReport() {
    loading = true;
    const result = await learnerReportsService.getReport(fromReportId);
    if (!result.success) {
      submitError = result.error || 'Failed to load the source report';
      loading = false;
      return;
    }
    const r = result.data;
    sourceReport = r;

    header.division_id = String(r.division_id);
    header.school_id = String(r.school_id);
    header.nature_of_case = r.nature_of_concern || '';
    header.nature_of_case_other = r.nature_of_concern_other || '';
    selectedSchool = r.school ? { school_id: r.school_id, name: r.school.name } : null;
    schoolQuery = r.school?.name || '';

    // Grade/section always describe the learner, regardless of who reported.
    learner.grade = r.reporter_grade || '';
    learner.section = r.reporter_section || '';

    if (r.reporter_relationship === 'STUDENT') {
      // The reporter *is* the learner-victim — carry their name/contact over directly.
      learner.first_name = r.reporter_first_name || '';
      learner.last_name = r.reporter_last_name || '';
      learner.contact_number = r.reporter_contact_number || '';
    } else if (r.reporter_first_name || r.reporter_last_name) {
      // A parent/guardian/other reported on the learner's behalf — we don't know
      // the learner's own name, so leave that blank for the Focal Person to fill
      // in, and add the reporter as a Complainant instead (not Mother/Father —
      // "Parent" doesn't tell us which, and guessing risks misgendering them).
      complainants = [{
        ...emptyPerson(),
        first_name: r.reporter_first_name || '',
        last_name: r.reporter_last_name || '',
        contact_number: r.reporter_contact_number || '',
        relation_to_learner_victim: relationshipLabel(r.reporter_relationship)
      }];
    }

    // The report form doesn't ask when the incident happened, only what was
    // reported — carry the description over, leave the date for the Focal
    // Person to fill in after following up.
    incidents = [{ date_of_incident: '', is_estimated_date: false, description: r.description || '' }];

    loading = false;
  }

  async function loadExisting() {
    loading = true;
    const result = await intakeSheetsService.getIntakeSheet(intakeSheetId);
    if (!result.success) {
      submitError = result.error || 'Failed to load intake sheet';
      loading = false;
      return;
    }
    const data = result.data;
    sheetId = data.intake_sheet_id;
    loadedIsDraft = !!data.is_draft;

    header = {
      division_id: String(data.division_id),
      school_id: String(data.school_id),
      date_of_intake: data.date_of_intake?.slice(0, 10) || '',
      nature_of_case: data.nature_of_case || '',
      nature_of_case_other: data.nature_of_case_other || ''
    };
    selectedSchool = data.school ? { school_id: data.school_id, name: data.school.name } : null;
    schoolQuery = data.school?.name || '';

    /** @param {any} p */
    const toForm = (p) => ({
      person_id: p.person_id,
      first_name: p.first_name || '', middle_name: p.middle_name || '', last_name: p.last_name || '',
      birthdate: p.birthdate?.slice(0, 10) || '', sex: p.sex || '',
      grade: p.grade || '', section: p.section || '', occupation: p.occupation || '',
      contact_number: p.contact_number || '', address: p.address || '',
      relation_to_learner_victim: p.relation_to_learner_victim || ''
    });

    const persons = data.persons || [];
    const learnerEntry = persons.find((/** @type {any} */ p) => p.role === 'LEARNER-VICTIM');
    if (learnerEntry) learner = toForm(learnerEntry);

    const fixedSex = { MOTHER: 'FEMALE', FATHER: 'MALE' };
    for (const role of /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN'])) {
      const entry = persons.find((/** @type {any} */ p) => p.role === role);
      const forcedSex = fixedSex[/** @type {'MOTHER'|'FATHER'} */ (role)];
      optional[role] = entry
        ? { included: true, ...toForm(entry), ...(forcedSex ? { sex: forcedSex } : {}) }
        : { included: false, ...emptyPerson(), ...(forcedSex ? { sex: forcedSex } : {}) };
    }
    complainants = persons.filter((/** @type {any} */ p) => p.role === 'COMPLAINANT').map(toForm);
    allegedOffenders = persons.filter((/** @type {any} */ p) => p.role === 'ALLEGED-OFFENDER').map(toForm);

    incidents = (data.detailed_incidents || []).map((/** @type {any} */ i) => ({
      date_of_incident: i.date_of_incident, is_estimated_date: !!i.is_estimated_date, description: i.description
    }));
    if (incidents.length === 0) incidents = [emptyIncident()];

    actions = (data.actions_taken || []).map((/** @type {any} */ a) => ({ action_taken: a.action_taken }));
    if (actions.length === 0) actions = [{ action_taken: '' }];

    recommendations = (data.recommendations || []).map((/** @type {any} */ r) => ({ recommendation: r.recommendation }));
    if (recommendations.length === 0) recommendations = [{ recommendation: '' }];

    referrals = (data.referrals || []).map((/** @type {any} */ r) => ({ referred_to: r.referred_to, reason: r.reason }));
    if (referrals.length === 0) referrals = [{ referred_to: '', reason: '' }];

    loading = false;
  }

  // ── School search-as-you-type (scoped server-side to the user's division) ──
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let schoolSearchTimeout;
  function onSchoolQueryInput() {
    selectedSchool = null;
    header.school_id = '';
    clearTimeout(schoolSearchTimeout);
    const q = schoolQuery.trim();
    if (q.length < 2) { schoolResults = []; return; }
    schoolSearchTimeout = setTimeout(async () => {
      schoolSearching = true;
      try {
        const res = await api.get('/search/schools/quick', { q, per_page: 10 });
        // quickSchoolSearch wraps results as { success, data: { data: [...], ... } }
        schoolResults = res.data?.data || [];
      } catch (e) {
        schoolResults = [];
      }
      schoolSearching = false;
    }, 300);
  }

  /** @param {any} school */
  function pickSchool(school) {
    selectedSchool = school;
    header.school_id = String(school.school_id);
    schoolQuery = school.name;
    schoolResults = [];
    if (school.division?.id && !header.division_id) header.division_id = String(school.division.id);
  }

  // ── Repeatable row helpers ───────────────────────────────────────────────
  function addComplainant() { complainants = [...complainants, emptyPerson()]; }
  /** @param {number} i */
  function removeComplainant(i) { complainants = complainants.filter((_, idx) => idx !== i); }
  function addOffender() { allegedOffenders = [...allegedOffenders, emptyPerson()]; }
  /** @param {number} i */
  function removeOffender(i) { allegedOffenders = allegedOffenders.filter((_, idx) => idx !== i); }

  function addIncident() { incidents = [...incidents, emptyIncident()]; }
  /** @param {number} i */
  function removeIncident(i) { incidents = incidents.filter((_, idx) => idx !== i); }

  function addAction() { actions = [...actions, { action_taken: '' }]; }
  /** @param {number} i */
  function removeAction(i) { actions = actions.filter((_, idx) => idx !== i); }
  function addRecommendation() { recommendations = [...recommendations, { recommendation: '' }]; }
  /** @param {number} i */
  function removeRecommendation(i) { recommendations = recommendations.filter((_, idx) => idx !== i); }
  function addReferral() { referrals = [...referrals, { referred_to: '', reason: '' }]; }
  /** @param {number} i */
  function removeReferral(i) { referrals = referrals.filter((_, idx) => idx !== i); }

  // ── Step navigation ──────────────────────────────────────────────────────
  /** @param {number} step */
  function stepError(step) {
    if (step === 1) {
      if (!header.division_id) return 'Select a division.';
      if (!header.school_id) return 'Search for and select a school.';
      if (!header.date_of_intake) return 'Set the date of intake.';
      if (!header.nature_of_case) return 'Select the nature of the case.';
      if (header.nature_of_case === 'OTHERS' && !header.nature_of_case_other.trim()) return 'Specify the nature of the case.';
    }
    if (step === 2) {
      if (!learner.first_name || !learner.last_name) return "Enter the learner-victim's first and last name.";
    }
    return '';
  }

  /**
   * Persists the step being left before advancing — the section reaches the
   * backend as soon as it's confirmed complete, not just once at the very end.
   * Only called while isDraftFlow (a brand-new sheet, or resuming an existing
   * draft); editing an already-finalized sheet skips this and saves everything
   * together on final submit, same as before.
   */
  async function saveCurrentStep() {
    if (currentStep === 1) {
      const payload = {
        division_id: Number(header.division_id),
        school_id: Number(header.school_id),
        date_of_intake: header.date_of_intake,
        nature_of_case: header.nature_of_case,
        nature_of_case_other: header.nature_of_case === 'OTHERS' ? header.nature_of_case_other : null
      };
      const result = sheetId
        ? await intakeSheetsService.updateIntakeSheet(sheetId, payload)
        : await intakeSheetsService.createIntakeSheet(payload);
      if (result.success && !sheetId) sheetId = result.data.intake_sheet_id;
      return result;
    }
    if (currentStep === 2) {
      return intakeSheetsService.updateIntakeSheet(sheetId, { persons: buildPersons() });
    }
    if (currentStep === 3) {
      return intakeSheetsService.updateIntakeSheet(sheetId, {
        detailed_incidents: incidents.filter((i) => i.date_of_incident || i.description)
      });
    }
    if (currentStep === 4) {
      return intakeSheetsService.updateIntakeSheet(sheetId, {
        actions_taken: actions.filter((a) => a.action_taken.trim()),
        recommendations: recommendations.filter((r) => r.recommendation.trim()),
        referrals: referrals.filter((r) => r.referred_to.trim() || r.reason.trim())
      });
    }
    return { success: true };
  }

  async function next() {
    const err = stepError(currentStep);
    if (err) { submitError = err; return; }
    submitError = '';
    submitValidationErrors = {};

    if (isDraftFlow) {
      submitting = true;
      const result = await saveCurrentStep();
      submitting = false;
      if (!result.success) {
        submitError = result.error || 'Failed to save this step';
        submitValidationErrors = result.validationErrors || {};
        return;
      }
    }

    currentStep = Math.min(currentStep + 1, STEPS.length);
  }
  function back() {
    submitError = '';
    submitValidationErrors = {};
    currentStep = Math.max(currentStep - 1, 1);
  }
  /** @param {number} n */
  function goToStep(n) {
    if (n < currentStep) currentStep = n;
  }

  function buildPersons() {
    /** @type {any[]} */
    const persons = [{ role: 'LEARNER-VICTIM', ...learner }];
    for (const role of /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN'])) {
      if (optional[role].included) persons.push({ role, ...stripIncluded(optional[role]) });
    }
    for (const c of complainants) if (c.first_name || c.last_name) persons.push({ role: 'COMPLAINANT', ...c });
    for (const o of allegedOffenders) if (o.first_name || o.last_name) persons.push({ role: 'ALLEGED-OFFENDER', ...o });
    return persons;
  }
  /** @param {any} p */
  function stripIncluded(p) {
    const { included, ...rest } = p;
    return rest;
  }

  function buildPayload() {
    return {
      division_id: Number(header.division_id),
      school_id: Number(header.school_id),
      date_of_intake: header.date_of_intake,
      nature_of_case: header.nature_of_case,
      nature_of_case_other: header.nature_of_case === 'OTHERS' ? header.nature_of_case_other : null,
      persons: buildPersons(),
      detailed_incidents: incidents.filter((i) => i.date_of_incident || i.description),
      actions_taken: actions.filter((a) => a.action_taken.trim()),
      recommendations: recommendations.filter((r) => r.recommendation.trim()),
      referrals: referrals.filter((r) => r.referred_to.trim() || r.reason.trim())
    };
  }

  async function handleSubmit() {
    submitting = true;
    submitError = '';
    submitValidationErrors = {};

    // In the draft flow, every section was already persisted step-by-step on
    // the way here (see saveCurrentStep()) — all that's left is flipping the
    // record from draft to complete. Editing an already-finalized sheet still
    // saves everything together in one PUT, same as before.
    const result = isDraftFlow
      ? await intakeSheetsService.finalizeIntakeSheet(sheetId)
      : await intakeSheetsService.updateIntakeSheet(intakeSheetId, buildPayload());

    if (result.success) {
      const newId = isDraftFlow ? sheetId : intakeSheetId;

      if (isFromReport) {
        const linkResult = await learnerReportsService.linkReport(fromReportId, newId);
        if (!linkResult.success) {
          // The sheet itself was finalized fine — don't lose that. Just surface
          // the link failure and let them finish it manually from the report's page.
          submitError = `Intake sheet #${newId} was finalized, but linking report #${fromReportId} to it failed: ${linkResult.error}. You can link it manually from the report's page.`;
          submitting = false;
          return;
        }
      }

      goto(`/admin/lrp/intake-sheets/${newId}`);
    } else {
      submitError = result.error || 'Failed to save intake sheet';
      submitValidationErrors = result.validationErrors || {};
      const firstErrorField = Object.keys(submitValidationErrors)[0];
      currentStep = firstErrorField ? stepForField(firstErrorField) : currentStep;
    }
    submitting = false;
  }

  /** @param {string} field */
  function fe(field) {
    const errors = submitValidationErrors[field];
    return Array.isArray(errors) && errors.length ? errors.join(' ') : '';
  }

  // ── Turning raw Laravel validation keys into something a person can act on ──
  // The backend reports errors as e.g. "persons.0.first_name" — technically
  // correct, useless on its own in a 5-step wizard with repeatable rows.
  const FIELD_LABELS = {
    division_id: 'Division', school_id: 'School', date_of_intake: 'Date of Intake',
    nature_of_case: 'Nature of Case', nature_of_case_other: 'Nature of Case (specify)',
    persons: 'Person', role: 'Role', first_name: 'First Name', middle_name: 'Middle Name',
    last_name: 'Last Name', birthdate: 'Birthdate', sex: 'Sex', grade: 'Grade', section: 'Section',
    occupation: 'Occupation', contact_number: 'Contact Number', address: 'Address',
    relation_to_learner_victim: 'Relation to Learner-Victim',
    detailed_incidents: 'Incident', date_of_incident: 'Date of Incident', description: 'Description',
    is_estimated_date: 'Estimated Date',
    actions_taken: 'Action Taken', action_taken: 'Action Taken',
    recommendations: 'Recommendation', recommendation: 'Recommendation',
    referrals: 'Referral', referred_to: 'Referred To', reason: 'Reason'
  };
  const STEP_FOR_PREFIX = [
    { prefix: 'persons', step: 2 },
    { prefix: 'detailed_incidents', step: 3 },
    { prefix: 'actions_taken', step: 4 },
    { prefix: 'recommendations', step: 4 },
    { prefix: 'referrals', step: 4 }
  ];

  /** "persons.0.first_name" → "Person #1 — First Name" */
  /** @param {string} key */
  function humanizeFieldPath(key) {
    const parts = key.split('.');
    if (parts.length === 3 && /^\d+$/.test(parts[1])) {
      const [group, idx, field] = parts;
      const groupLabel = FIELD_LABELS[group] || group;
      const fieldLabel = FIELD_LABELS[field] || field.replace(/_/g, ' ');
      return `${groupLabel} #${Number(idx) + 1} — ${fieldLabel}`;
    }
    return FIELD_LABELS[key] || key.replace(/_/g, ' ');
  }

  /** @param {string} key */
  function stepForField(key) {
    const hit = STEP_FOR_PREFIX.find((s) => key === s.prefix || key.startsWith(`${s.prefix}.`));
    return hit ? hit.step : 1;
  }

  // The backend returns Laravel's default English messages (e.g. "The
  // persons.1.first_name field is required when persons is present.") —
  // technically correct, but the raw field path and the "when ... is
  // present" clause mean nothing to a non-technical reader, especially
  // since the field is already named right next to this via
  // humanizeFieldPath(). Translate the common patterns; anything that
  // doesn't match (e.g. the hand-written "Exactly one person must be
  // recorded..." messages) passes through unchanged since it's already fine.
  const MESSAGE_PATTERNS = /** @type {[RegExp, string][]} */ ([
    [/^The .+ must not be greater than (\d+) characters\.?$/i, 'Must be $1 characters or fewer.'],
    [/^The .+ may not be greater than (\d+) characters\.?$/i, 'Must be $1 characters or fewer.'],
    [/^The .+ must be at least (\d+) characters\.?$/i, 'Must be at least $1 characters.'],
    [/^The .+ field is required(\s+when\s+.+)?\.?$/i, 'This field is required.'],
    [/^The .+ must be a valid date\.?$/i, 'Enter a valid date.'],
    [/^The .+ field must be a string\.?$/i, 'Enter valid text.'],
    [/^The selected .+ is invalid\.?$/i, 'Please choose a valid option.'],
    [/^The .+ must be an integer\.?$/i, 'Enter a whole number.'],
    [/^The .+ field must be an? (boolean|number)\.?$/i, 'Enter a valid value.']
  ]);
  /** @param {string} msg */
  function humanizeMessage(msg) {
    if (!msg) return msg;
    for (const [pattern, replacement] of MESSAGE_PATTERNS) {
      if (pattern.test(msg)) return msg.replace(pattern, replacement);
    }
    return msg;
  }

  let validationEntries = $derived(Object.entries(submitValidationErrors));
  // Once there's a field-by-field breakdown below, the generic top banner
  // ("Validation failed" / "Failed to save this step") is redundant — swap
  // it for an actionable intro instead. Non-validation errors (a real save
  // failure, the report-link failure, etc.) still show their own message.
  let errorIntro = $derived(validationEntries.length ? 'Please fix the following before continuing:' : submitError);
</script>

{#snippet personFields(person, prefix, opts = {})}
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div class="form-control">
      <label class="label py-1" for="{prefix}-first"><span class="label-text text-xs">First Name *</span></label>
      <input id="{prefix}-first" type="text" class="input input-bordered input-sm" bind:value={person.first_name} required />
    </div>
    <div class="form-control">
      <label class="label py-1" for="{prefix}-mid"><span class="label-text text-xs">Middle Name</span></label>
      <input id="{prefix}-mid" type="text" class="input input-bordered input-sm" bind:value={person.middle_name} />
    </div>
    <div class="form-control">
      <label class="label py-1" for="{prefix}-last"><span class="label-text text-xs">Last Name *</span></label>
      <input id="{prefix}-last" type="text" class="input input-bordered input-sm" bind:value={person.last_name} required />
    </div>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
    <div class="form-control">
      <label class="label py-1" for="{prefix}-bd"><span class="label-text text-xs">Birthdate</span></label>
      <input id="{prefix}-bd" type="date" class="input input-bordered input-sm" bind:value={person.birthdate} />
    </div>
    {#if !opts.hideSex}
      <div class="form-control">
        <label class="label py-1" for="{prefix}-sex"><span class="label-text text-xs">Sex</span></label>
        <select id="{prefix}-sex" class="select select-bordered select-sm" bind:value={person.sex}>
          <option value="">—</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </div>
    {/if}
    <div class="form-control">
      <label class="label py-1" for="{prefix}-contact"><span class="label-text text-xs">Contact Number</span></label>
      <input id="{prefix}-contact" type="tel" inputmode="tel" class="input input-bordered input-sm" bind:value={person.contact_number} />
    </div>
  </div>
  {#if opts.showGradeSection}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <div class="form-control">
        <label class="label py-1" for="{prefix}-grade"><span class="label-text text-xs">Grade</span></label>
        <input id="{prefix}-grade" type="text" class="input input-bordered input-sm" bind:value={person.grade} />
      </div>
      <div class="form-control">
        <label class="label py-1" for="{prefix}-section"><span class="label-text text-xs">Section</span></label>
        <input id="{prefix}-section" type="text" class="input input-bordered input-sm" bind:value={person.section} />
      </div>
    </div>
  {/if}
  {#if opts.showOccupation}
    <div class="form-control mt-3">
      <label class="label py-1" for="{prefix}-occ"><span class="label-text text-xs">Occupation</span></label>
      <input id="{prefix}-occ" type="text" class="input input-bordered input-sm" bind:value={person.occupation} />
    </div>
  {/if}
  <div class="form-control mt-3">
    <label class="label py-1" for="{prefix}-addr"><span class="label-text text-xs">Address</span></label>
    <input id="{prefix}-addr" type="text" class="input input-bordered input-sm" bind:value={person.address} />
  </div>
  {#if opts.showRelation}
    <div class="form-control mt-3">
      <label class="label py-1" for="{prefix}-rel"><span class="label-text text-xs">Relation to Learner-Victim</span></label>
      <input id="{prefix}-rel" type="text" class="input input-bordered input-sm" placeholder="e.g. Neighbor, Classmate, Homeroom Adviser" bind:value={person.relation_to_learner_victim} />
    </div>
  {/if}
{/snippet}

<div class="max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-24 sm:pb-6">
  <div class="flex items-center gap-2">
    <h1 class="text-xl sm:text-2xl font-bold">{isEdit ? 'Edit Intake Sheet' : 'New Intake Sheet'}</h1>
    {#if isDraftFlow}
      <span class="badge badge-warning badge-sm" title="Each step is saved as you go — safe to leave and resume later">Draft</span>
    {/if}
  </div>

  {#if isFromReport && sourceReport}
    <div class="alert alert-info text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
      </svg>
      <span>Pre-filled from Learner Report #{fromReportId}. Review each step and fill in anything missing — it'll be linked back to the report once you submit.</span>
    </div>
  {/if}

  <!-- Compact step indicator (mobile): the full labeled steps bar below doesn't
       fit 5 labels on a narrow screen without wrapping, so under md we show a
       "Step X of 5" line with a slim progress bar instead. -->
  <div class="md:hidden">
    <div class="flex items-center justify-between text-xs text-base-content/60 mb-1.5">
      <span class="font-medium">Step {currentStep} of {STEPS.length}</span>
      <span>{STEPS[currentStep - 1].label}</span>
    </div>
    <div class="w-full bg-base-200 rounded-full h-1.5 overflow-hidden">
      <div class="bg-primary h-full rounded-full transition-all duration-300" style="width:{(currentStep / STEPS.length) * 100}%"></div>
    </div>
  </div>

  <div class="hidden md:block">
    <ul class="steps w-full text-sm">
      {#each STEPS as s}
        <li class="step {currentStep >= s.n ? 'step-primary' : ''}">
          <button type="button" class="cursor-pointer" onclick={() => goToStep(s.n)}>{s.label}</button>
        </li>
      {/each}
    </ul>
  </div>

  {#if loading}
    <div class="text-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
  {:else}
    {#if submitError}
      <div class="alert alert-error text-sm flex-col items-stretch gap-2">
        <div class="flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 shrink-0 mt-0.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          <span>{errorIntro}</span>
        </div>
        {#if validationEntries.length}
          <ul class="list-disc list-inside pl-1 space-y-0.5">
            {#each validationEntries as [field, messages]}
              <li>
                <button type="button" class="underline underline-offset-2 font-medium" onclick={() => currentStep = stepForField(field)}>
                  {humanizeFieldPath(field)}
                </button>: {Array.isArray(messages) ? messages.map(humanizeMessage).join(' ') : humanizeMessage(messages)}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <div class="card bg-base-100 shadow-sm border border-base-200 p-4 sm:p-5">
      <!-- Step 1: Intake Info -->
      {#if currentStep === 1}
        <h2 class="font-semibold text-lg mb-4">Intake Information</h2>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label py-1" for="division"><span class="label-text text-xs">Division *</span></label>
            {#if isRegional}
              <select id="division" class="select select-bordered select-sm" bind:value={header.division_id}>
                <option value="">Select division…</option>
                {#each divisions as d}
                  <option value={String(d.division_id)}>{d.name}</option>
                {/each}
              </select>
            {:else}
              <input type="text" class="input input-bordered input-sm" value={authState.user?.division?.name || ''} disabled />
            {/if}
          </div>

          <div class="form-control relative">
            <label class="label py-1" for="school"><span class="label-text text-xs">School *</span></label>
            <input
              id="school" type="text" class="input input-bordered input-sm"
              placeholder="Type at least 2 characters to search…"
              bind:value={schoolQuery} oninput={onSchoolQueryInput} autocomplete="off"
            />
            {#if schoolSearching}
              <span class="text-xs text-base-content/50 mt-1">Searching…</span>
            {/if}
            {#if schoolResults.length}
              <ul class="absolute z-10 top-full mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {#each schoolResults as s}
                  <li>
                    <button type="button" class="w-full text-left px-3 py-2 hover:bg-base-200 text-sm" onclick={() => pickSchool(s)}>
                      {s.name} <span class="text-base-content/50">· {s.division?.name || '—'}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if selectedSchool}
              <span class="text-xs text-success mt-1">Selected: {selectedSchool.name}</span>
            {/if}
          </div>

          <div class="form-control">
            <label class="label py-1" for="doi"><span class="label-text text-xs">Date of Intake *</span></label>
            <input id="doi" type="date" class="input input-bordered input-sm" bind:value={header.date_of_intake} />
          </div>

          <div class="form-control">
            <label class="label py-1" for="noc"><span class="label-text text-xs">Nature of Case *</span></label>
            <select id="noc" class="select select-bordered select-sm" bind:value={header.nature_of_case}>
              <option value="">Select nature of case…</option>
              {#each NATURE_OF_CASE_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          {#if header.nature_of_case === 'OTHERS'}
            <div class="form-control">
              <label class="label py-1" for="noc-other"><span class="label-text text-xs">Please Specify *</span></label>
              <input id="noc-other" type="text" class="input input-bordered input-sm" bind:value={header.nature_of_case_other} />
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 2: People Involved -->
      {#if currentStep === 2}
        <h2 class="font-semibold text-lg mb-1">People Involved</h2>
        {#if fe('persons')}<p class="text-xs text-error mb-3">{fe('persons')}</p>{/if}

        <div class="divider text-sm">Learner-Victim *</div>
        {@render personFields(learner, 'lv', { showGradeSection: true })}

        {#each /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN']) as role}
          <div class="flex items-center justify-between gap-3 mt-5 mb-2 pb-2 border-b border-base-200">
            <span class="text-sm font-medium">{role.charAt(0) + role.slice(1).toLowerCase()}</span>
            <label class="flex items-center gap-2 text-xs text-base-content/60 cursor-pointer shrink-0">
              <input type="checkbox" class="checkbox checkbox-sm" bind:checked={optional[role].included} />
              Include
            </label>
          </div>
          {#if optional[role].included}
            {@render personFields(optional[role], role.toLowerCase(), { hideSex: role === 'MOTHER' || role === 'FATHER' })}
          {/if}
        {/each}

        <div class="divider text-sm">Complainant(s)</div>
        {#each complainants as c, i}
          <div class="border border-base-200 rounded-lg p-3 mb-3 relative">
            <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeComplainant(i)}>Remove</button>
            {@render personFields(c, `comp-${i}`, { showOccupation: true, showRelation: true })}
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm" onclick={addComplainant}>+ Add Complainant</button>

        <div class="divider text-sm">Alleged Offender(s)</div>
        {#each allegedOffenders as o, i}
          <div class="border border-base-200 rounded-lg p-3 mb-3 relative">
            <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeOffender(i)}>Remove</button>
            {@render personFields(o, `off-${i}`, { showOccupation: true, showRelation: true })}
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm" onclick={addOffender}>+ Add Alleged Offender</button>
      {/if}

      <!-- Step 3: Incident Details -->
      {#if currentStep === 3}
        <h2 class="font-semibold text-lg mb-4">Incident Details</h2>
        {#each incidents as inc, i}
          <div class="border border-base-200 rounded-lg p-3 mb-3 relative space-y-3">
            {#if incidents.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeIncident(i)}>Remove</button>
            {/if}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="form-control">
                <label class="label py-1" for="inc-date-{i}"><span class="label-text text-xs">Date of Incident</span></label>
                <input id="inc-date-{i}" type="text" class="input input-bordered input-sm" placeholder="e.g. 2026-06-14 or &quot;About 2 years ago&quot;" bind:value={inc.date_of_incident} />
              </div>
              <label class="flex items-center gap-2 text-sm sm:mt-6 cursor-pointer">
                <input type="checkbox" class="checkbox checkbox-sm" bind:checked={inc.is_estimated_date} />
                This is an estimated date
              </label>
            </div>
            <div class="form-control">
              <label class="label py-1" for="inc-desc-{i}"><span class="label-text text-xs">Description</span></label>
              <textarea id="inc-desc-{i}" class="textarea textarea-bordered textarea-sm" rows="4" bind:value={inc.description}></textarea>
            </div>
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm" onclick={addIncident}>+ Add Another Incident</button>
      {/if}

      <!-- Step 4: Actions / Recommendations / Referrals -->
      {#if currentStep === 4}
        <h2 class="font-semibold text-lg mb-1">Actions Taken</h2>
        {#each actions as a, i}
          <div class="flex gap-2 mb-2">
            <textarea class="textarea textarea-bordered textarea-sm flex-1" rows="2" placeholder="Action taken…" bind:value={a.action_taken}></textarea>
            {#if actions.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error" onclick={() => removeAction(i)}>✕</button>
            {/if}
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm mb-6" onclick={addAction}>+ Add Action</button>

        <h2 class="font-semibold text-lg mb-1">Recommendations</h2>
        {#each recommendations as r, i}
          <div class="flex gap-2 mb-2">
            <textarea class="textarea textarea-bordered textarea-sm flex-1" rows="2" placeholder="Recommendation…" bind:value={r.recommendation}></textarea>
            {#if recommendations.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error" onclick={() => removeRecommendation(i)}>✕</button>
            {/if}
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm mb-6" onclick={addRecommendation}>+ Add Recommendation</button>

        <h2 class="font-semibold text-lg mb-1">Referrals</h2>
        {#each referrals as r, i}
          <div class="border border-base-200 rounded-lg p-3 mb-2 relative">
            {#if referrals.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeReferral(i)}>✕</button>
            {/if}
            <div class="form-control">
              <label class="label py-1" for="ref-to-{i}"><span class="label-text text-xs">Referred To</span></label>
              <input id="ref-to-{i}" type="text" class="input input-bordered input-sm" placeholder="e.g. DSWD, Barangay VAWC Desk" bind:value={r.referred_to} />
            </div>
            <div class="form-control mt-2">
              <label class="label py-1" for="ref-reason-{i}"><span class="label-text text-xs">Reason</span></label>
              <textarea id="ref-reason-{i}" class="textarea textarea-bordered textarea-sm" rows="2" bind:value={r.reason}></textarea>
            </div>
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm" onclick={addReferral}>+ Add Referral</button>
      {/if}

      <!-- Step 5: Review -->
      {#if currentStep === 5}
        <h2 class="font-semibold text-lg mb-4">Review &amp; Submit</h2>
        <div class="space-y-4 text-sm">
          <div>
            <p class="font-medium text-base-content/70">Intake Info</p>
            <p>{selectedSchool?.name || '—'} · {header.date_of_intake}</p>
            <p>
              {NATURE_OF_CASE_OPTIONS.find((o) => o.value === header.nature_of_case)?.label || '—'}
              {#if header.nature_of_case === 'OTHERS' && header.nature_of_case_other}: {header.nature_of_case_other}{/if}
            </p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Learner-Victim</p>
            <p>{learner.first_name} {learner.middle_name} {learner.last_name} {#if learner.grade}· Grade {learner.grade}{learner.section ? ` - ${learner.section}` : ''}{/if}</p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Other People</p>
            <p>
              {#each ['MOTHER', 'FATHER', 'GUARDIAN'] as role}
                {#if optional[role].included}{role.charAt(0) + role.slice(1).toLowerCase()}: {optional[role].first_name} {optional[role].last_name}<br/>{/if}
              {/each}
              {complainants.length} complainant(s) · {allegedOffenders.length} alleged offender(s)
            </p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Incident(s)</p>
            <p>{incidents.filter((i) => i.description).length} recorded</p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Follow-up</p>
            <p>
              {actions.filter((a) => a.action_taken.trim()).length} action(s) ·
              {recommendations.filter((r) => r.recommendation.trim()).length} recommendation(s) ·
              {referrals.filter((r) => r.referred_to.trim()).length} referral(s)
            </p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Fixed on mobile so Back/Next stay reachable without scrolling through a
         long section; reverts to a plain inline row from sm: up. -->
    <div class="fixed sm:static bottom-0 inset-x-0 sm:inset-auto z-20 bg-base-100/95 sm:bg-transparent backdrop-blur-lg sm:backdrop-blur-none border-t sm:border-t-0 border-base-200 px-4 sm:px-0 py-3 sm:py-0 safe-area-bottom">
      <div class="flex items-center justify-between gap-3 max-w-4xl mx-auto">
        <button type="button" class="btn btn-ghost" disabled={currentStep === 1 || submitting} onclick={back}>« Back</button>
        {#if currentStep < STEPS.length}
          <button type="button" class="btn btn-primary flex-1 sm:flex-none" disabled={submitting} onclick={next}>
            {#if submitting}<span class="loading loading-spinner loading-xs"></span> Saving…{:else}Next »{/if}
          </button>
        {:else}
          <button type="button" class="btn btn-primary flex-1 sm:flex-none" disabled={submitting} onclick={handleSubmit}>
            {#if submitting}<span class="loading loading-spinner loading-xs"></span>{/if}
            {isEdit && !isDraftFlow ? 'Save Changes' : isFromReport ? 'Finalize & Link to Report' : 'Finalize Intake Sheet'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
