<script>
  import { fieldErrors, focusField, humanizeMessage } from '$lib/actions/field-errors.js';
  import { goto } from '$app/navigation';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { learnerReportsService } from '$lib/api/learner-reports.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { api } from '$lib/api/client.js';
  import { NATURE_OF_CASE_OPTIONS, needsSpecify } from '$lib/constants/intake-sheets.js';
  import { GRADE_GROUPS, normalizeGrade, gradeSection } from '$lib/constants/grade-levels.js';
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
    { n: 2, label: 'Learner-Victim / Complainant' },
    { n: 3, label: 'Respondent' },
    { n: 4, label: 'Incident Details' },
    { n: 5, label: 'Actions & Recommendations' },
    { n: 6, label: 'Review & Submit' }
  ];
  let currentStep = $state(1);

  let loading = $state(isEdit || isFromReport);
  let submitting = $state(false);
  let submitError = $state('');
  let noFullEdit = $state(false);
  let noFullEditReason = $state('');
  /** @type {Record<string,string[]>} */
  let submitValidationErrors = $state({});
  /** Set once loadFromReport() succeeds — used for the "prefilled from" banner. */
  /** @type {any} */
  let sourceReport = $state(null);

  // ── Step 1: Intake info ──────────────────────────────────────────────────
  const isRegional = authState.user?.organizationLevel === 'regional';
  // A school account can only file for its own school, so the school and its
  // division come from the account. (Its own division is empty — the division
  // belongs to the school.)
  const ownSchool = authState.user?.organizationLevel === 'school' ? authState.user?.school : null;
  const ownDivisionId = authState.user?.division?.id ?? ownSchool?.division_id ?? authState.user?.effectiveDivisionId ?? null;
  const ownDivisionName = authState.user?.division?.name || ownSchool?.division_name || '';
  let header = $state({
    division_id: ownDivisionId ? String(ownDivisionId) : '',
    school_id: ownSchool?.id ? String(ownSchool.id) : '',
    date_of_intake: new Date().toISOString().slice(0, 10),
    nature_of_case: '',
    nature_of_case_other: ''
  });
  /** @type {any[]} */
  let divisions = $state([]);
  let schoolQuery = $state(ownSchool?.name ?? '');
  /** @type {any[]} */
  let schoolResults = $state([]);
  let schoolSearching = $state(false);
  /** @type {any} */
  let selectedSchool = $state(ownSchool ? { school_id: ownSchool.id, name: ownSchool.name } : null);

  // ── Step 2: People involved ──────────────────────────────────────────────
  function emptyPerson() {
    return {
      person_id: null, first_name: '', middle_name: '', last_name: '',
      birthdate: '', age: '', offender_type: '', sex: '', grade: '', section: '', occupation: '',
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
  // "The learner-victim is also the complainant": that complainant is the
  // learner-victim's own record — name, birthdate, sex, contact and address
  // come from the learner-victim and are locked; only the complainant-only
  // details are entered here. Relation is always "Self".
  let learnerIsComplainant = $state(false);
  let selfComplainant = $state({ occupation: '' });
  // Non-bullying: the learner-victim (with their adviser), parents / guardian and
  // complainant are optional; the respondent is still required.
  const nonBullying = $derived(header.nature_of_case === 'NON_BULLYING');
  /** The learner-victim is sent unless it's an optional one left blank. */
  const learnerIncluded = $derived(!nonBullying || ['first_name', 'middle_name', 'last_name', 'birthdate', 'sex', 'grade', 'section', 'contact_number', 'address']
    .some((f) => String(/** @type {any} */ (learner)[f] ?? '').trim() !== ''));

  // ── "Is this the same learner?" — while the learner-victim's first and last
  // name are typed, earlier records with the same name are looked up. A match
  // opens a dialog; confirming copies that learner's details (and parents) in.
  // Details are copied, not linked, so each record keeps its own snapshot.
  /** @param {string} v */
  const normName = (v) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  /** @param {any} p */
  const nameKeyOf = (p) => `${normName(p.first_name)}|${normName(p.last_name)}`;
  /** @type {HTMLDialogElement|null} */
  let matchDialog = $state(null);
  /** @type {any[]} */
  let learnerMatches = $state([]);
  let matchCheckedKey = '';
  let matchDismissedKey = $state('');
  let matchNotice = $state('');
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let matchTimer;
  // Matches come only from the school this record is for.
  const learnerNameKey = $derived(`${header.school_id || ''}|${nameKeyOf(learner)}`);
  $effect(() => {
    const key = learnerNameKey;
    clearTimeout(matchTimer);
    if (loading || key === matchCheckedKey) return;
    const [school, f, l] = key.split('|');
    if (!school || f.length < 2 || l.length < 2) { learnerMatches = []; return; }
    matchTimer = setTimeout(() => lookupLearner(key), 700);
  });
  /** @param {string} key */
  async function lookupLearner(key) {
    matchCheckedKey = key;
    const res = await intakeSheetsService.findLearnerMatches({
      school_id: header.school_id, first_name: learner.first_name, last_name: learner.last_name, ...(sheetId ? { exclude_sheet_id: sheetId } : {})
    });
    if (key !== learnerNameKey) return; // typing moved on
    learnerMatches = res.success ? (res.data?.matches ?? []) : [];
    if (learnerMatches.length && matchDismissedKey !== key) matchDialog?.showModal();
  }
  /** @param {any} m */
  function useLearnerMatch(m) {
    const keep = { person_id: learner.person_id };
    learner = {
      ...learner, ...keep,
      first_name: m.first_name || '', middle_name: m.middle_name || '', last_name: m.last_name || '',
      birthdate: m.birthdate?.slice(0, 10) || '', sex: m.sex || '', grade: normalizeGrade(m.grade), section: m.section || '',
      contact_number: m.contact_number || '', address: m.address || ''
    };
    if (!adviserName.trim() && m.adviser_name) adviserName = m.adviser_name;
    const fixedSex = /** @type {Record<string, string>} */ ({ MOTHER: 'FEMALE', FATHER: 'MALE' });
    for (const p of m.parents ?? []) {
      const role = /** @type {'MOTHER'|'FATHER'|'GUARDIAN'} */ (p.role);
      const cur = optional[role];
      if (cur.included && (cur.first_name.trim() || cur.last_name.trim())) continue; // never overwrite what was typed
      optional[role] = {
        ...emptyPerson(), included: true,
        first_name: p.first_name || '', middle_name: p.middle_name || '', last_name: p.last_name || '',
        birthdate: p.birthdate?.slice(0, 10) || '', age: p.age ?? '', sex: fixedSex[role] ?? (p.sex || ''),
        occupation: p.occupation || '', contact_number: p.contact_number || '', address: p.address || ''
      };
    }
    matchCheckedKey = learnerNameKey;
    matchDismissedKey = matchCheckedKey;
    const latest = m.records?.[0];
    matchNotice = `Details filled in from ${latest ? `LRP-${String(latest.intake_sheet_id).padStart(5, '0')}` : 'an earlier record'}. Check the grade, section, adviser and contact details in case they have changed.`;
    matchDialog?.close();
  }
  function notSameLearner() {
    matchDismissedKey = learnerNameKey;
    matchDialog?.close();
  }
  /** @param {string|null} d */
  const fmtMatchDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  // The complainant may also be the mother, father or guardian entered above:
  // that complainant is the parent's own record, so nothing is typed twice.
  let parentComplainant = $state({ MOTHER: false, FATHER: false, GUARDIAN: false });
  const PARENT_ROLES = /** @type {('MOTHER'|'FATHER'|'GUARDIAN')[]} */ (['MOTHER', 'FATHER', 'GUARDIAN']);
  const PARENT_LABEL = /** @type {Record<string, string>} */ ({ MOTHER: 'Mother', FATHER: 'Father', GUARDIAN: 'Guardian' });
  const linkedParents = $derived(/** @type {('MOTHER'|'FATHER'|'GUARDIAN')[]} */ (['MOTHER', 'FATHER', 'GUARDIAN'])
    .filter((r) => parentComplainant[r] && optional[r].included));
  /** @type {any[]} */
  let allegedOffenders = $state([emptyPerson()]);
  // Annex E, II: an offender may not be known yet — a description stands in.
  let offenderUnidentified = $state(false);
  let offenderDescription = $state('');
  const OFFENDER_TYPES = [
    { value: 'school_personnel', label: 'School Personnel' },
    { value: 'student', label: 'Student' },
    { value: 'other', label: 'Other' }
  ];
  const DATE_TYPES = [
    { value: 'exact', label: 'Exact date' },
    { value: 'month_year', label: 'Month and year' },
    { value: 'year', label: 'Year only' },
    { value: 'other', label: 'Other estimate' }
  ];
  const todayPH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  /** Age at intake from a birthdate. @param {string} birthdate */
  function ageFrom(birthdate) {
    if (!birthdate) return '';
    const asOf = (header.date_of_intake || todayPH()).split('-').map(Number);
    const [y, m, d] = birthdate.split('-').map(Number);
    const age = asOf[0] - y - (asOf[1] < m || (asOf[1] === m && asOf[2] < d) ? 1 : 0);
    return age >= 0 ? age : '';
  }

  // ── Step 3: Incident details ─────────────────────────────────────────────
  function emptyIncident() {
    return { date_type: 'exact', date_of_incident: '', is_estimated_date: false, description: '' };
  }
  let incidents = $state([emptyIncident()]);

  // Name of the learner-victim's adviser (Annex E, I.A).
  let adviserName = $state('');
  let adviserBefore = $state('');
  let adviserAfter = $state('');

  // ── Step 4: Initial actions taken / Recommendations & next steps ────────
  let actions = $state([{ action_taken: '' }]);
  let recommendations = $state([{ recommendation: '' }]);
  // V. "Referral: YES / NO" — one answer per intake sheet. '' = not answered.
  let referral = $state({ answer: '', referred_to: '', referral_reason: '' });

  function referralPayload() {
    const yes = referral.answer === 'yes';
    return {
      is_referred: referral.answer === '' ? null : yes,
      referred_to: yes ? referral.referred_to.trim() : null,
      referral_reason: yes ? referral.referral_reason.trim() : null
    };
  }

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
    if (!r.actions?.create_intake_sheet) {
      noFullEditReason = r.status === 'new' || r.status === 'for_review'
        ? 'Review the learner report first. The intake sheet / incident report can be created once it has been reviewed.'
        : r.status === 'under_review'
          ? `This learner report is being handled by the ${r.routed_to_position_label || 'other school focal person'}. Only they can make it an intake sheet / incident report.`
        : r.status === 'linked'
          ? 'This learner report is already linked to an intake sheet / incident report.'
          : 'This learner report was dismissed. Undo the dismissal first if it should become an intake sheet / incident report.';
      noFullEdit = true;
      loading = false;
      return;
    }
    sourceReport = r;

    header.division_id = String(r.division_id);
    header.school_id = String(r.school_id);
    header.nature_of_case = r.nature_of_concern || '';
    header.nature_of_case_other = r.nature_of_concern_other || '';
    selectedSchool = r.school ? { school_id: r.school_id, name: r.school.name } : null;
    schoolQuery = r.school?.name || '';

    // Grade/section always describe the learner, regardless of who reported.
    learner.grade = normalizeGrade(r.reporter_grade);
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
    incidents = [{ ...emptyIncident(), description: r.description || '' }];

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
    // Full editing is limited to the creator and the school's own accounts;
    // division/regional focal persons update the four sections from the
    // intake sheet's page instead.
    if (data.permissions && !data.permissions.can_edit_all) {
      const where = { school: 'School', division: 'Division Office', regional: 'Regional Office' }[/** @type {'school'|'division'|'regional'} */ (data.routed_to)] ?? 'another office';
      noFullEditReason = data.status === 'resolved'
        ? 'This intake sheet is resolved and read-only.'
        : !data.permissions.holds_sheet
          ? `It has been forwarded and is now with the ${where}. Your office can't change it until it is forwarded back to your office.`
          : data.permissions.actions?.review
            ? 'Open the intake sheet and click "Review" first — editing is enabled once you have reviewed it.'
            : `Only the ${{ school: 'School', division: 'Division Office', regional: 'Regional Office' }[/** @type {'school'|'division'|'regional'} */ (data.origin_level || 'school')]}, where it was created, can change the case details, the people involved and the Incident Details. Other offices update Initial Actions Taken and Recommendations / Next Steps (including the Referral) from the intake sheet's page.`;
      noFullEdit = true;
      loading = false;
      return;
    }
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
      birthdate: p.birthdate?.slice(0, 10) || '', age: p.age ?? '', offender_type: p.offender_type || '', sex: p.sex || '',
      grade: normalizeGrade(p.grade), section: p.section || '', occupation: p.occupation || '',
      contact_number: p.contact_number || '', address: p.address || '',
      relation_to_learner_victim: p.relation_to_learner_victim || ''
    });

    const persons = data.persons || [];
    const learnerEntry = persons.find((/** @type {any} */ p) => p.role === 'LEARNER-VICTIM');
    if (learnerEntry) learner = toForm(learnerEntry);
    matchCheckedKey = `${header.school_id || ''}|${nameKeyOf(learner)}`; // don't ask about the learner already on this record

    const fixedSex = { MOTHER: 'FEMALE', FATHER: 'MALE' };
    for (const role of /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN'])) {
      const entry = persons.find((/** @type {any} */ p) => p.role === role);
      const forcedSex = fixedSex[/** @type {'MOTHER'|'FATHER'} */ (role)];
      optional[role] = entry
        ? { included: true, ...toForm(entry), ...(forcedSex ? { sex: forcedSex } : {}) }
        : { included: false, ...emptyPerson(), ...(forcedSex ? { sex: forcedSex } : {}) };
    }
    const self = persons.find((/** @type {any} */ p) => p.role === 'COMPLAINANT' && p.same_as_learner_victim);
    learnerIsComplainant = !!self;
    selfComplainant = { occupation: self?.occupation || '' };
    for (const r of /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN'])) {
      parentComplainant[r] = persons.some((/** @type {any} */ p) => p.role === 'COMPLAINANT' && p.same_as === r);
    }
    complainants = persons.filter((/** @type {any} */ p) => p.role === 'COMPLAINANT' && !p.same_as_learner_victim && !p.same_as).map(toForm);
    allegedOffenders = persons.filter((/** @type {any} */ p) => p.role === 'ALLEGED-OFFENDER').map(toForm);
    if (allegedOffenders.length === 0) allegedOffenders = [emptyPerson()];
    offenderUnidentified = !!data.offender_unidentified;
    offenderDescription = data.offender_description || '';

    incidents = (data.detailed_incidents || []).map((/** @type {any} */ i) => ({
      date_type: i.date_type || (i.date_of_incident ? 'other' : 'exact'), date_of_incident: i.date_of_incident || '', is_estimated_date: !!i.is_estimated_date, description: i.description || ''
    }));
    if (incidents.length === 0) incidents = [emptyIncident()];

    actions = (data.actions_taken || []).map((/** @type {any} */ a) => ({ action_taken: a.action_taken }));
    if (actions.length === 0) actions = [{ action_taken: '' }];

    recommendations = (data.recommendations || []).map((/** @type {any} */ r) => ({ recommendation: r.recommendation }));
    if (recommendations.length === 0) recommendations = [{ recommendation: '' }];

    adviserName = data.adviser_name || '';
    adviserBefore = data.adviser_observation_before || '';
    adviserAfter = data.adviser_observation_after || '';
    referral = {
      answer: data.is_referred === true ? 'yes' : data.is_referred === false ? 'no' : '',
      referred_to: data.referred_to || '',
      referral_reason: data.referral_reason || ''
    };

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

  // ── Step navigation ──────────────────────────────────────────────────────
  /** A row the user actually typed in (blank rows are ignored). @param {any} p */
  const hasContent = (p) => ['first_name', 'middle_name', 'last_name', 'birthdate', 'age', 'offender_type', 'sex', 'grade', 'section', 'occupation', 'contact_number', 'address', 'relation_to_learner_victim']
    .some((f) => String(p[f] ?? '').trim());
  /** @param {any} i */
  const incidentHasContent = (i) => !!(String(i.date_of_incident ?? '').trim() || String(i.description ?? '').trim());

  /**
   * Everything missing on a step, keyed like the backend's errors, so every
   * field that needs attention is marked at once.
   * @param {number} step
   * @returns {Record<string, string[]>}
   */
  function stepErrors(step) {
    /** @type {Record<string, string[]>} */
    const errs = {};
    /** @param {string|null} key @param {any} value @param {string} message */
    const need = (key, value, message) => { if (key && !String(value ?? '').trim()) errs[key] = [message]; };
    if (step === 1) {
      need('division_id', header.division_id, 'Select a division.');
      need('school_id', header.school_id, 'Search for and select a school.');
      need('date_of_intake', header.date_of_intake, 'Set the date of intake.');
      need('nature_of_case', header.nature_of_case, 'Select the nature of the case.');
      if (needsSpecify(header.nature_of_case)) need('nature_of_case_other', header.nature_of_case_other, header.nature_of_case === 'NON_BULLYING' ? 'Specify what kind of non-bullying incident it is.' : 'Specify the nature of the case.');
    }
    if (step === 2) {
      if (learnerIncluded) {
        need(pf(learner, 'first_name'), learner.first_name, 'Enter the first name.');
        need(pf(learner, 'last_name'), learner.last_name, 'Enter the last name.');
      }
      if (!nonBullying) {
        need(pf(learner, 'birthdate'), learner.birthdate, 'Enter the date of birth.');
        need(pf(learner, 'sex'), learner.sex, 'Select the sex.');
        need(pf(learner, 'grade'), learner.grade, 'Enter the grade level.');
        need(pf(learner, 'section'), learner.section, 'Enter the section.');
        need('adviser_name', adviserName, 'Enter the name of the adviser.');
      }
      const parents = ['MOTHER', 'FATHER', 'GUARDIAN'].filter((r) => optional[r].included);
      if (!parents.length && !nonBullying) errs.parents = ['Enter at least one: mother, father or guardian.'];
      for (const r of parents) {
        need(pf(optional[r], 'first_name'), optional[r].first_name, 'Enter the first name.');
        need(pf(optional[r], 'last_name'), optional[r].last_name, 'Enter the last name.');
      }
      const filled = complainants.filter(hasContent);
      if (!nonBullying && !learnerIsComplainant && !linkedParents.length && !filled.length) errs.complainants = ['Enter the complainant, or tick who among the learner-victim and parents / guardian is the complainant.'];
      for (const c of filled) {
        need(pf(c, 'first_name'), c.first_name, 'Enter the first name.');
        need(pf(c, 'last_name'), c.last_name, 'Enter the last name.');
        if (!nonBullying) need(pf(c, 'relation_to_learner_victim'), c.relation_to_learner_victim, 'Enter the relation to the learner-victim.');
      }
    }
    if (step === 3) {
      if (offenderUnidentified) {
        need('offender_description', offenderDescription, 'Describe what is known about the alleged offender.');
      } else {
        const filled = allegedOffenders.filter(hasContent);
        if (!filled.length) errs.offenders = ['Enter the alleged offender, or tick that they are not yet identified.'];
        for (const o of filled) {
          need(pf(o, 'first_name'), o.first_name, 'Enter the first name.');
          need(pf(o, 'last_name'), o.last_name, 'Enter the last name.');
          need(pf(o, 'offender_type'), o.offender_type, 'Select the type.');
          if (!o.birthdate && String(o.age ?? '').trim() === '') errs[/** @type {string} */ (pf(o, 'birthdate'))] = ['Enter the birthdate, or the age if unknown.'];
          need(pf(o, 'sex'), o.sex, 'Select the sex.');
          need(pf(o, 'address'), o.address, 'Enter the address.');
          need(pf(o, 'relation_to_learner_victim'), o.relation_to_learner_victim, 'Enter the relationship to the learner-victim.');
          if (o.offender_type === 'student') {
            need(pf(o, 'grade'), o.grade, 'Enter the grade level.');
            need(pf(o, 'section'), o.section, 'Enter the section.');
          }
        }
      }
    }
    if (step === 4) {
      const filled = incidents.filter(incidentHasContent);
      if (!filled.length) errs.detailed_incidents = ['Enter at least one incident: when it happened and the details.'];
      for (const inc of filled) {
        need(incKey(inc, 'date_of_incident'), inc.date_of_incident, 'Enter the date or an estimate.');
        need(incKey(inc, 'description'), inc.description, 'Enter the details of the incident.');
      }
    }
    if (step === 5 && referral.answer === 'yes') {
      need('referred_to', referral.referred_to, 'Referral is YES — say who the case was referred to.');
      need('referral_reason', referral.referral_reason, 'Referral is YES — give the reason for the referral.');
    }
    return errs;
  }

  /** @param {Record<string, string[]>} errs */
  function showErrors(errs) {
    submitValidationErrors = errs;
    submitError = 'Please fix the following before continuing:';
  }

  function peoplePayload() {
    return {
      persons: buildPersons(),
      adviser_name: adviserName.trim() || null,
      adviser_observation_before: adviserBefore.trim() || null,
      adviser_observation_after: adviserAfter.trim() || null,
      offender_unidentified: offenderUnidentified,
      offender_description: offenderUnidentified ? offenderDescription.trim() || null : null
    };
  }
  const incidentRows = () => incidents.filter(incidentHasContent).map((i) => ({
    ...i, date_of_incident: String(i.date_of_incident ?? '').trim() || null, description: String(i.description ?? '').trim() || null
  }));

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
        nature_of_case_other: needsSpecify(header.nature_of_case) ? header.nature_of_case_other : null
      };
      const result = sheetId
        ? await intakeSheetsService.updateIntakeSheet(sheetId, payload)
        : await intakeSheetsService.createIntakeSheet(payload);
      if (result.success && !sheetId) sheetId = result.data.intake_sheet_id;
      return result;
    }
    // Persons are saved as one list, so both people steps send all of them.
    if (currentStep === 2 || currentStep === 3) {
      return intakeSheetsService.updateIntakeSheet(sheetId, peoplePayload());
    }
    if (currentStep === 4) {
      return intakeSheetsService.updateIntakeSheet(sheetId, {
        detailed_incidents: incidentRows()
      });
    }
    if (currentStep === 5) {
      return intakeSheetsService.updateIntakeSheet(sheetId, {
        actions_taken: actions.filter((a) => a.action_taken.trim()),
        recommendations: recommendations.filter((r) => r.recommendation.trim()),
        ...referralPayload()
      });
    }
    return { success: true };
  }

  async function next() {
    const errs = stepErrors(currentStep);
    if (Object.keys(errs).length) { showErrors(errs); return; }
    submitError = '';
    submitValidationErrors = {};
    draftNotice = '';

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

  // Save Draft: keep what's been typed so far without the required-field
  // checks. A person still needs a name to be stored at all, and step 1 is
  // needed to create the record.
  let draftNotice = $state('');
  async function saveDraft() {
    submitError = ''; submitValidationErrors = {}; draftNotice = '';
    if (!sheetId) {
      const errs = stepErrors(1);
      if (Object.keys(errs).length) { currentStep = 1; showErrors(errs); return; }
    }
    const peopleEntered = hasContent(learner) || ['MOTHER', 'FATHER', 'GUARDIAN'].some((r) => optional[r].included)
      || learnerIsComplainant || linkedParents.length > 0 || complainants.some(hasContent) || allegedOffenders.some(hasContent);
    if ((currentStep === 2 || currentStep === 3) && peopleEntered && learnerIncluded && !(learner.first_name.trim() && learner.last_name.trim())) {
      /** @type {Record<string, string[]>} */
      const errs = {};
      if (!learner.first_name.trim()) errs['persons.0.first_name'] = ['Enter the first name to save the people on this draft.'];
      if (!learner.last_name.trim()) errs['persons.0.last_name'] = ['Enter the last name to save the people on this draft.'];
      currentStep = 2; showErrors(errs); return;
    }
    submitting = true;
    const result = (currentStep === 2 || currentStep === 3) && !peopleEntered
      ? await intakeSheetsService.updateIntakeSheet(sheetId, { ...peoplePayload(), persons: undefined })
      : await saveCurrentStep();
    submitting = false;
    if (result.success) {
      draftNotice = `Draft saved at ${new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}. You can come back and finish it later.`;
    } else {
      submitError = /** @type {any} */ (result).error || 'Could not save the draft';
      submitValidationErrors = /** @type {any} */ (result).validationErrors || {};
    }
  }

  function back() {
    draftNotice = '';
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
    const persons = learnerIncluded ? [{ role: 'LEARNER-VICTIM', ...learner }] : [];
    for (const role of /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN'])) {
      if (optional[role].included) persons.push({ role, ...stripIncluded(optional[role]) });
    }
    if (learnerIsComplainant && learnerIncluded) {
      persons.push({
        ...learner, role: 'COMPLAINANT', same_as_learner_victim: true, same_as: 'LEARNER-VICTIM',
        occupation: selfComplainant.occupation.trim() || null, relation_to_learner_victim: 'Self'
      });
    }
    for (const r of linkedParents) {
      persons.push({ ...stripIncluded(optional[r]), role: 'COMPLAINANT', same_as: r, relation_to_learner_victim: PARENT_LABEL[r] });
    }
    for (const c of complainants) if (hasContent(c)) persons.push({ role: 'COMPLAINANT', ...c, offender_type: null });
    if (!offenderUnidentified) {
      for (const o of allegedOffenders) {
        if (!hasContent(o)) continue;
        const student = o.offender_type === 'student';
        persons.push({
          role: 'ALLEGED-OFFENDER', ...o, offender_type: o.offender_type || null,
          age: o.birthdate || o.age === '' || o.age == null ? null : Number(o.age),
          grade: student ? o.grade : '', section: student ? o.section : ''
        });
      }
    }
    return persons.map((p) => ({ ...p, age: p.age === '' ? null : p.age, offender_type: p.offender_type || null }));
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
      nature_of_case_other: needsSpecify(header.nature_of_case) ? header.nature_of_case_other : null,
      ...peoplePayload(),
      detailed_incidents: incidentRows(),
      actions_taken: actions.filter((a) => a.action_taken.trim()),
      recommendations: recommendations.filter((r) => r.recommendation.trim()),
      ...referralPayload()
    };
  }

  async function handleSubmit() {
    // Every step is checked here too: a draft may have been saved incomplete.
    for (let step = 1; step < STEPS.length; step++) {
      const errs = stepErrors(step);
      if (Object.keys(errs).length) { currentStep = step; showErrors(errs); return; }
    }
    submitting = true;
    submitError = '';
    submitValidationErrors = {};
    draftNotice = '';

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

  // ── data-field keys, matching the backend's "persons.3.first_name" etc. ──
  // The payload only sends filled-in rows, so a row's index there can differ
  // from its position on screen; these replay the same filtering.
  /** @param {any} person @param {string} field */
  function pf(person, field) {
    let idx = 0;
    if (person === learner) return learnerIncluded ? `persons.0.${field}` : null;
    idx = learnerIncluded ? 1 : 0;
    for (const role of /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN'])) {
      if (!optional[role].included) continue;
      if (optional[role] === person) return `persons.${idx}.${field}`;
      idx++;
    }
    if (learnerIsComplainant && learnerIncluded) {
      if (person === selfComplainant) return `persons.${idx}.${field}`;
      idx++;
    }
    idx += linkedParents.length;
    for (const p of [...complainants, ...(offenderUnidentified ? [] : allegedOffenders)]) {
      if (!hasContent(p)) { if (p === person) return null; continue; }
      if (p === person) return `persons.${idx}.${field}`;
      idx++;
    }
    return null;
  }
  /** @param {any[]} rows @param {(r: any) => boolean} kept @param {any} row @param {string} group @param {string} field */
  function rowKey(rows, kept, row, group, field) {
    const idx = rows.filter(kept).indexOf(row);
    return idx < 0 ? null : `${group}.${idx}.${field}`;
  }
  /** @param {any} inc @param {string} field */
  const incKey = (inc, field) => rowKey(incidents, incidentHasContent, inc, 'detailed_incidents', field);
  /** @param {any} a */
  const actKey = (a) => rowKey(actions, (x) => x.action_taken.trim(), a, 'actions_taken', 'action_taken');
  /** @param {any} r */
  const recKey = (r) => rowKey(recommendations, (x) => x.recommendation.trim(), r, 'recommendations', 'recommendation');

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
    actions_taken: 'Initial Action Taken', action_taken: 'Initial Action Taken',
    recommendations: 'Recommendation / Next Step', recommendation: 'Recommendation / Next Step',
    is_referred: 'Referral', referred_to: 'Referral To', referral_reason: 'Reason for Referral',
    adviser_name: 'Name of Adviser', age: 'Age', offender_type: 'Type',
    parents: 'Parents / Guardian', complainants: 'Complainant', offenders: 'Alleged Offender',
    offender_description: 'Alleged Offender (not yet identified)'
  };
  // "Person #2" says nothing about who #2 actually is — swap in the role
  // instead wherever there's only ever one of it (Mother, Father, etc.).
  // Complainant/Alleged-Offender can repeat, so those keep a number, just
  // counted within their own role instead of the overall array position.
  const ROLE_LABELS = {
    'LEARNER-VICTIM': 'Learner-Victim', MOTHER: 'Mother', FATHER: 'Father', GUARDIAN: 'Guardian',
    COMPLAINANT: 'Complainant', 'ALLEGED-OFFENDER': 'Alleged Offender'
  };
  const REPEATABLE_ROLES = ['COMPLAINANT', 'ALLEGED-OFFENDER'];
  const STEP_FOR_PREFIX = [
    { prefix: 'persons', step: 2 },
    { prefix: 'detailed_incidents', step: 4 },
    { prefix: 'actions_taken', step: 5 },
    { prefix: 'recommendations', step: 5 },
    { prefix: 'is_referred', step: 5 },
    { prefix: 'referred_to', step: 5 },
    { prefix: 'referral_reason', step: 5 },
    { prefix: 'adviser_name', step: 2 },
    { prefix: 'adviser_observation', step: 2 },
    { prefix: 'parents', step: 2 },
    { prefix: 'complainants', step: 2 },
    { prefix: 'offenders', step: 3 },
    { prefix: 'offender_description', step: 3 }
  ];

  /** "persons.0.first_name" → "Learner-Victim — First Name"; "persons.3.first_name" (2nd complainant) → "Complainant #2 — First Name" */
  /** @param {string} key */
  function humanizeFieldPath(key) {
    const parts = key.split('.');
    if (parts.length === 3 && /^\d+$/.test(parts[1])) {
      const [group, idx, field] = parts;
      const fieldLabel = FIELD_LABELS[field] || field.replace(/_/g, ' ');
      if (group === 'persons') {
        const globalIdx = Number(idx);
        const allPersons = buildPersons();
        const role = allPersons[globalIdx]?.role;
        const roleLabel = role ? ROLE_LABELS[/** @type {keyof typeof ROLE_LABELS} */ (role)] : null;
        if (role && REPEATABLE_ROLES.includes(role)) {
          const sameRoleIdx = allPersons.slice(0, globalIdx + 1).filter((p) => p.role === role).length;
          return `${roleLabel} #${sameRoleIdx} — ${fieldLabel}`;
        }
        if (roleLabel) return `${roleLabel} — ${fieldLabel}`;
        // Role couldn't be resolved (e.g. rows changed after the error was
        // reported) — fall back to the plain index rather than guessing.
        return `Person #${globalIdx + 1} — ${fieldLabel}`;
      }
      const groupLabel = FIELD_LABELS[group] || group;
      return `${groupLabel} #${Number(idx) + 1} — ${fieldLabel}`;
    }
    return FIELD_LABELS[key] || key.replace(/_/g, ' ');
  }

  /** @param {string} key */
  function stepForField(key) {
    // An alleged offender's field lives on the Respondent step.
    const m = key.match(/^persons\.(\d+)\./);
    if (m && buildPersons()[Number(m[1])]?.role === 'ALLEGED-OFFENDER') return 3;
    const hit = STEP_FOR_PREFIX.find((s) => key === s.prefix || key.startsWith(`${s.prefix}.`) || (s.prefix === 'adviser_observation' && key.startsWith(s.prefix)));
    return hit ? hit.step : 1;
  }

  let validationEntries = $derived(Object.entries(submitValidationErrors));
  // Once there's a field-by-field breakdown below, the generic top banner
  // ("Validation failed" / "Failed to save this step") is redundant — swap
  // it for an actionable intro instead. Non-validation errors (a real save
  // failure, the report-link failure, etc.) still show their own message.
  let errorIntro = $derived(validationEntries.length ? 'Please fix the following before continuing:' : submitError);
</script>

{#snippet personFields(/** @type {any} */ person, /** @type {string} */ prefix, /** @type {any} */ opts = {})}
  {@const star = (/** @type {string} */ f) => (opts.required ?? []).includes(f) ? ' *' : ''}
  {#if opts.showOffenderType}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 pr-20 sm:pr-0">
      <div class="form-control">
        <label class="label py-1" for="{prefix}-type"><span class="label-text text-xs">Type *</span></label>
        <select id="{prefix}-type" data-field={pf(person, 'offender_type')} class="select select-bordered select-sm" bind:value={person.offender_type}>
          <option value="">Select type…</option>
          {#each OFFENDER_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
        </select>
      </div>
    </div>
  {/if}
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div class="form-control">
      <label class="label py-1" for="{prefix}-first"><span class="label-text text-xs">First Name *</span></label>
      <input id="{prefix}-first" data-field={pf(person, 'first_name')} type="text" class="input input-bordered input-sm" bind:value={person.first_name} required />
    </div>
    <div class="form-control">
      <label class="label py-1" for="{prefix}-mid"><span class="label-text text-xs">Middle Name</span></label>
      <input id="{prefix}-mid" data-field={pf(person, 'middle_name')} type="text" class="input input-bordered input-sm" bind:value={person.middle_name} />
    </div>
    <div class="form-control">
      <label class="label py-1" for="{prefix}-last"><span class="label-text text-xs">Last Name *</span></label>
      <input id="{prefix}-last" data-field={pf(person, 'last_name')} type="text" class="input input-bordered input-sm" bind:value={person.last_name} required />
    </div>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
    <div class="form-control">
      <label class="label py-1" for="{prefix}-bd"><span class="label-text text-xs">Birthdate{star('birthdate')}</span></label>
      <input id="{prefix}-bd" data-field={pf(person, 'birthdate')} type="date" max={todayPH()} class="input input-bordered input-sm" bind:value={person.birthdate} />
    </div>
    {#if opts.ageFromBirthdate}
      <div class="form-control">
        <label class="label py-1" for="{prefix}-age"><span class="label-text text-xs">Age (from birthdate)</span></label>
        <input id="{prefix}-age" type="text" class="input input-bordered input-sm" disabled value={person.birthdate ? ageFrom(person.birthdate) : ''} placeholder="Enter the birthdate" />
      </div>
    {:else if opts.showAge}
      <div class="form-control">
        <label class="label py-1" for="{prefix}-age"><span class="label-text text-xs">Age {person.birthdate ? '(from birthdate)' : `(if no birthdate)${star('age')}`}</span></label>
        {#if person.birthdate}
          <input id="{prefix}-age" type="text" class="input input-bordered input-sm" disabled value={ageFrom(person.birthdate)} />
        {:else}
          <input id="{prefix}-age" data-field={pf(person, 'age')} type="number" min="0" max="120" class="input input-bordered input-sm" bind:value={person.age} />
        {/if}
      </div>
    {/if}
    {#if !opts.hideSex}
      <div class="form-control">
        <label class="label py-1" for="{prefix}-sex"><span class="label-text text-xs">Sex{star('sex')}</span></label>
        <select id="{prefix}-sex" data-field={pf(person, 'sex')} class="select select-bordered select-sm" bind:value={person.sex}>
          <option value="">—</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </div>
    {/if}
    <div class="form-control">
      <label class="label py-1" for="{prefix}-contact"><span class="label-text text-xs">Contact Number</span></label>
      <input id="{prefix}-contact" data-field={pf(person, 'contact_number')} type="tel" inputmode="tel" class="input input-bordered input-sm" bind:value={person.contact_number} />
    </div>
  </div>
  {#if opts.showGradeSection}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <div class="form-control">
        <label class="label py-1" for="{prefix}-grade"><span class="label-text text-xs">Grade Level{star('grade')}</span></label>
        <select id="{prefix}-grade" data-field={pf(person, 'grade')} class="select select-bordered select-sm" bind:value={person.grade}>
          <option value="">Select grade level…</option>
          {#each GRADE_GROUPS as g}
            <optgroup label={g.label}>
              {#each g.options as o}<option value={o.value}>{o.label}</option>{/each}
            </optgroup>
          {/each}
        </select>
      </div>
      <div class="form-control">
        <label class="label py-1" for="{prefix}-section"><span class="label-text text-xs">Section{star('section')}</span></label>
        <input id="{prefix}-section" data-field={pf(person, 'section')} type="text" class="input input-bordered input-sm" bind:value={person.section} />
      </div>
    </div>
  {/if}
  {#if opts.showOccupation}
    <div class="form-control mt-3">
      <label class="label py-1" for="{prefix}-occ"><span class="label-text text-xs">Occupation</span></label>
      <input id="{prefix}-occ" data-field={pf(person, 'occupation')} type="text" class="input input-bordered input-sm" bind:value={person.occupation} />
    </div>
  {/if}
  <div class="form-control mt-3">
    <label class="label py-1" for="{prefix}-addr"><span class="label-text text-xs">Address{star('address')}</span></label>
    <input id="{prefix}-addr" data-field={pf(person, 'address')} type="text" class="input input-bordered input-sm" bind:value={person.address} />
  </div>
  {#if opts.showRelation}
    <div class="form-control mt-3">
      <label class="label py-1" for="{prefix}-rel"><span class="label-text text-xs">Relationship to the Learner-Victim{star('relation_to_learner_victim')}</span></label>
      <input id="{prefix}-rel" data-field={pf(person, 'relation_to_learner_victim')} type="text" class="input input-bordered input-sm" placeholder="e.g. Neighbor, Classmate, Homeroom Adviser" bind:value={person.relation_to_learner_victim} />
    </div>
  {/if}
{/snippet}

<div class="max-w-4xl mx-auto space-y-4 sm:space-y-6 pb-24 sm:pb-6">
  <div class="flex items-center gap-2">
    <h1 class="text-xl sm:text-2xl font-bold">{isEdit ? 'Edit Intake Sheet / Incident Report' : 'New Intake Sheet / Incident Report'}</h1>
    {#if isDraftFlow}
      <span class="badge badge-warning badge-sm" title="Each step is saved as you go — safe to leave and resume later">Draft</span>
    {/if}
  </div>

  {#if isFromReport && sourceReport}
    <div class="alert alert-info text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
      </svg>
      <span>Pre-filled from Learner Report RPT-{String(fromReportId).padStart(5, '0')}. Review each step and fill in anything missing — it'll be linked back to the report once you submit.</span>
    </div>
  {/if}

  <!-- Compact step indicator (mobile): the full labeled steps bar below doesn't
       fit 6 labels on a narrow screen without wrapping, so under md we show a
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
  {:else if noFullEdit}
    <div class="alert bg-warning/10 border border-warning/40 text-sm flex-col items-start gap-2">
      <p class="font-semibold">{isFromReport ? "This learner report can't be turned into an intake sheet yet." : "You can't edit this intake sheet here."}</p>
      <p>{noFullEditReason}</p>
      {#if isFromReport}
        <a class="btn btn-sm btn-outline" href={`/admin/lrp/reports/${fromReportId}`}>Go to the learner report</a>
      {:else}
        <a class="btn btn-sm btn-outline" href={`/admin/lrp/intake-sheets/${intakeSheetId}`}>Go to the intake sheet</a>
      {/if}
    </div>
  {:else}
    {#if submitError}
      <!-- One child only: DaisyUI's .alert is a grid that would put the list
           beside the message instead of under it. -->
      <div class="alert alert-error text-sm" role="alert">
        <div class="w-full text-left">
          <div class="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 shrink-0 mt-0.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
            </svg>
            <p class="font-medium">{errorIntro}</p>
          </div>
          {#if validationEntries.length}
            <ul class="list-disc mt-2 pl-12 space-y-1">
              {#each validationEntries as [field, messages]}
                <li>
                  <button type="button" class="underline underline-offset-2 font-medium" onclick={() => { currentStep = stepForField(field); focusField(document, field); }}>
                    {humanizeFieldPath(field)}
                  </button>: {Array.isArray(messages) ? messages.map(humanizeMessage).join(' ') : humanizeMessage(messages)}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/if}

    {#if draftNotice}<div class="alert alert-success text-sm" role="status"><span>{draftNotice}</span></div>{/if}

    <div class="card bg-base-100 shadow-sm border border-base-200 p-4 sm:p-5" use:fieldErrors={{ errors: submitValidationErrors, key: currentStep, rest: false }}>
      <!-- Step 1: Intake Info -->
      {#if currentStep === 1}
        <h2 class="font-semibold text-lg mb-4">Intake Information</h2>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label py-1" for="division"><span class="label-text text-xs">Division *</span></label>
            {#if isRegional}
              <select id="division" data-field="division_id" class="select select-bordered select-sm" bind:value={header.division_id}>
                <option value="">Select division…</option>
                {#each divisions as d}
                  <option value={String(d.division_id)}>{d.name}</option>
                {/each}
              </select>
            {:else}
              <input type="text" data-field="division_id" class="input input-bordered input-sm" value={ownDivisionName} disabled />
            {/if}
          </div>

          <div class="form-control relative">
            <label class="label py-1" for="school"><span class="label-text text-xs">School *</span></label>
            {#if ownSchool}
              <input id="school" type="text" data-field="school_id" class="input input-bordered input-sm" value={ownSchool.name} disabled />
            {:else}
              <input
                id="school" type="text" data-field="school_id" class="input input-bordered input-sm"
                placeholder="Type at least 2 characters to search…"
                bind:value={schoolQuery} oninput={onSchoolQueryInput} autocomplete="off"
              />
            {/if}
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
            {#if selectedSchool && !ownSchool}
              <span class="text-xs text-success mt-1">Selected: {selectedSchool.name}</span>
            {/if}
          </div>

          <div class="form-control">
            <label class="label py-1" for="doi"><span class="label-text text-xs">Date of Intake *</span></label>
            <input id="doi" data-field="date_of_intake" type="date" class="input input-bordered input-sm" bind:value={header.date_of_intake} />
          </div>

          <div class="form-control">
            <label class="label py-1" for="noc"><span class="label-text text-xs">Nature of Case *</span></label>
            <select id="noc" data-field="nature_of_case" class="select select-bordered select-sm" bind:value={header.nature_of_case}>
              <option value="">Select nature of case…</option>
              {#each NATURE_OF_CASE_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>

          {#if needsSpecify(header.nature_of_case)}
            <div class="form-control">
              <label class="label py-1" for="noc-other"><span class="label-text text-xs">{header.nature_of_case === 'NON_BULLYING' ? 'What kind of non-bullying incident? *' : 'Please Specify *'}</span></label>
              <input id="noc-other" data-field="nature_of_case_other" type="text" maxlength="255" class="input input-bordered input-sm" placeholder={header.nature_of_case === 'NON_BULLYING' ? 'e.g. Fighting, Theft, Vandalism' : ''} bind:value={header.nature_of_case_other} />
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 2: Learner-Victim / Complainant — the learner-victim, their parents / guardian, complainants -->
      {#if currentStep === 2}
        <h2 class="font-semibold text-lg mb-1">Learner-Victim / Complainant</h2>
        {#if fe('persons')}<p class="text-xs text-error mb-3">{fe('persons')}</p>{/if}
        <p class="text-xs text-base-content/50 mb-4">The learner-victim, their parents or guardian, and anyone who filed the complaint. The respondent comes in the next step.</p>
        <section>

          <p class="text-sm font-medium mb-1">Learner-Victim{nonBullying ? '' : ' *'}</p>
          {#if nonBullying}<p class="text-xs text-base-content/50 mb-2">Optional for a Non-bullying case. Leave blank if there is no learner-victim.</p>{/if}
          {@render personFields(learner, 'lv', { showGradeSection: true, required: nonBullying ? [] : ['birthdate', 'sex', 'grade', 'section'] })}
          {#if matchNotice}
            <div class="alert alert-success alert-soft text-sm mt-3 py-2" role="status">
              <div class="flex items-start justify-between gap-3">
                <span>{matchNotice}</span>
                <button type="button" class="btn btn-ghost btn-xs" onclick={() => (matchNotice = '')}>Dismiss</button>
              </div>
            </div>
          {:else if learnerMatches.length && matchDismissedKey === learnerNameKey}
            <p class="text-xs text-base-content/60 mt-2">
              This name matches {learnerMatches.length === 1 ? 'a learner' : `${learnerMatches.length} learners`} in earlier records of this school.
              <button type="button" class="link link-primary" onclick={() => matchDialog?.showModal()}>Review the match{learnerMatches.length === 1 ? '' : 'es'}</button>
            </p>
          {/if}
          <div class="form-control mt-3">
            <label class="label py-1" for="lv-adviser"><span class="label-text text-xs">Name of Adviser{nonBullying ? '' : ' *'}</span></label>
            <input id="lv-adviser" data-field="adviser_name" type="text" class="input input-bordered input-sm" maxlength="255" placeholder="The learner-victim's class adviser" bind:value={adviserName} />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div class="form-control">
              <label class="label py-1" for="lv-obs-before"><span class="label-text text-xs">Adviser's observations before the incident</span></label>
              <textarea id="lv-obs-before" data-field="adviser_observation_before" class="textarea textarea-bordered textarea-sm" rows="3" maxlength="5000" placeholder="School performance, peer interaction, health concerns" bind:value={adviserBefore}></textarea>
            </div>
            <div class="form-control">
              <label class="label py-1" for="lv-obs-after"><span class="label-text text-xs">Adviser's observations after the incident</span></label>
              <textarea id="lv-obs-after" data-field="adviser_observation_after" class="textarea textarea-bordered textarea-sm" rows="3" maxlength="5000" placeholder="School performance, peer interaction, health concerns" bind:value={adviserAfter}></textarea>
            </div>
          </div>

          <p class="text-sm font-medium mt-5">Parents / Guardian{nonBullying ? '' : ' *'}</p>
          <p class="text-xs text-base-content/50">{nonBullying ? 'Optional for a Non-bullying case.' : 'Include at least one.'}</p>
          {#if fe('parents')}<p class="text-xs text-error mt-1" role="alert">{fe('parents')}</p>{/if}

          {#each /** @type {const} */ (['MOTHER', 'FATHER', 'GUARDIAN']) as role}
            <div class="flex items-center justify-between gap-3 mt-5 mb-2 pb-2 border-b border-base-200">
              <span class="text-sm font-medium">{role.charAt(0) + role.slice(1).toLowerCase()} <span class="font-normal text-base-content/50">of the learner-victim</span></span>
              <label class="flex items-center gap-2 text-xs text-base-content/60 cursor-pointer shrink-0">
                <input type="checkbox" class="checkbox checkbox-sm" bind:checked={optional[role].included} />
                Include
              </label>
            </div>
            {#if optional[role].included}
              {@render personFields(optional[role], role.toLowerCase(), { hideSex: role === 'MOTHER' || role === 'FATHER' })}
            {/if}
          {/each}

          <p class="text-sm font-medium mt-5 mb-2 pb-2 border-b border-base-200">Complainant(s){nonBullying ? '' : ' *'}</p>
          {#if nonBullying}<p class="text-xs text-base-content/50 -mt-1 mb-2">Optional for a Non-bullying case.</p>{/if}
          {#if fe('complainants')}<p class="text-xs text-error mb-2" role="alert">{fe('complainants')}</p>{/if}
          <label class="flex items-start gap-2 text-sm cursor-pointer mb-3">
            <input type="checkbox" class="checkbox checkbox-sm checkbox-primary mt-0.5" bind:checked={learnerIsComplainant} disabled={!learnerIncluded} />
            <span>The learner-victim is also the complainant
              <span class="block text-xs text-base-content/50">Their details are taken from the learner-victim above, and the relationship is recorded as Self.</span>
            </span>
          </label>
          {#if learnerIsComplainant}
            <div class="border border-primary/30 bg-primary/5 rounded-lg p-3 mb-3">
              <p class="text-xs font-medium text-base-content/60 mb-2">Complainant: the learner-victim <span class="font-normal">(locked — change these in the Learner-Victim details above)</span></p>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="form-control">
                  <label class="label py-1" for="self-name"><span class="label-text text-xs">Name</span></label>
                  <input id="self-name" type="text" class="input input-bordered input-sm" disabled value={[learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ') || '—'} />
                </div>
                <div class="form-control">
                  <label class="label py-1" for="self-bd"><span class="label-text text-xs">Birthdate</span></label>
                  <input id="self-bd" type="text" class="input input-bordered input-sm" disabled value={learner.birthdate || '—'} />
                </div>
                <div class="form-control">
                  <label class="label py-1" for="self-age"><span class="label-text text-xs">Age</span></label>
                  <input id="self-age" type="text" class="input input-bordered input-sm" disabled value={learner.birthdate ? ageFrom(learner.birthdate) : '—'} />
                </div>
                <div class="form-control">
                  <label class="label py-1" for="self-contact"><span class="label-text text-xs">Contact Number</span></label>
                  <input id="self-contact" type="text" class="input input-bordered input-sm" disabled value={learner.contact_number || '—'} />
                </div>
                <div class="form-control sm:col-span-2">
                  <label class="label py-1" for="self-addr"><span class="label-text text-xs">Address</span></label>
                  <input id="self-addr" type="text" class="input input-bordered input-sm" disabled value={learner.address || '—'} />
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div class="form-control">
                  <label class="label py-1" for="self-rel"><span class="label-text text-xs">Relation to Learner-Victim</span></label>
                  <input id="self-rel" type="text" class="input input-bordered input-sm" disabled value="Self" />
                </div>
              </div>
            </div>
          {/if}
          <div class="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            {#each PARENT_ROLES as r}
              <label class="flex items-start gap-2 text-sm {optional[r].included ? 'cursor-pointer' : 'opacity-50'}" title={optional[r].included ? '' : `Include the ${PARENT_LABEL[r].toLowerCase()} above first`}>
                <input type="checkbox" class="checkbox checkbox-sm checkbox-primary mt-0.5" bind:checked={parentComplainant[r]} disabled={!optional[r].included} />
                <span>The {PARENT_LABEL[r].toLowerCase()} is a complainant
                  {#if !optional[r].included}<span class="block text-xs text-base-content/50">Include the {PARENT_LABEL[r].toLowerCase()} above first</span>{/if}
                </span>
              </label>
            {/each}
          </div>
          {#each linkedParents as r}
            <div class="border border-primary/30 bg-primary/5 rounded-lg px-3 py-2 mb-3 text-sm">
              <span class="text-xs font-medium text-base-content/60">Complainant:</span>
              <span class="font-medium">{[optional[r].first_name, optional[r].middle_name, optional[r].last_name].filter(Boolean).join(' ') || '—'}</span>
              <span class="text-base-content/60"> · {PARENT_LABEL[r]} of the learner-victim</span>
              <span class="block text-xs text-base-content/50">Details come from the {PARENT_LABEL[r]} section above. Change them there.</span>
            </div>
          {/each}
          {#each complainants as c, i}
            <div class="border border-base-200 rounded-lg p-3 mb-3 relative">
              <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeComplainant(i)}>Remove</button>
              {@render personFields(c, `comp-${i}`, { hideSex: true, ageFromBirthdate: true, showRelation: true, required: nonBullying ? [] : ['relation_to_learner_victim'] })}
            </div>
          {/each}
          <button type="button" class="btn btn-outline btn-sm" onclick={addComplainant}>+ Add Complainant</button>
        </section>
      {/if}

      <!-- Step 3: Respondent — who the complaint is against -->
      {#if currentStep === 3}
        <h2 class="font-semibold text-lg mb-1">Respondent / Alleged Offender(s)</h2>
        <p class="text-xs text-base-content/50 mb-3">The person or persons the complaint is against.</p>
        {#if fe('offenders')}<p class="text-xs text-error mb-2" role="alert">{fe('offenders')}</p>{/if}
        <label class="flex items-start gap-2 text-sm cursor-pointer mb-3">
          <input type="checkbox" class="checkbox checkbox-sm checkbox-primary mt-0.5" bind:checked={offenderUnidentified} />
          <span>The alleged offender is not yet identified</span>
        </label>
        {#if offenderUnidentified}
          <div class="form-control">
            <label class="label py-1" for="off-desc"><span class="label-text text-xs">What is known about them? *</span></label>
            <textarea id="off-desc" data-field="offender_description" class="textarea textarea-bordered textarea-sm" rows="3" maxlength="2000" placeholder="e.g. appearance, where they were seen, how the learner knows them" bind:value={offenderDescription}></textarea>
          </div>
        {:else}
          <section>
            {#each allegedOffenders as o, i}
              <div class="border border-base-200 rounded-lg p-3 mb-3 relative">
                {#if allegedOffenders.length > 1}
                  <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeOffender(i)}>Remove</button>
                {/if}
                {@render personFields(o, `off-${i}`, {
                  showOffenderType: true, showAge: true, showOccupation: o.offender_type !== 'student', showRelation: true,
                  showGradeSection: o.offender_type === 'student',
                  required: ['sex', 'address', 'relation_to_learner_victim', 'grade', 'section', 'age']
                })}
              </div>
            {/each}
            <button type="button" class="btn btn-outline btn-sm" onclick={addOffender}>+ Add Alleged Offender</button>
          </section>
        {/if}
      {/if}

      <!-- Step 4: Incident Details -->
      {#if currentStep === 4}
        <h2 class="font-semibold text-lg mb-4">Incident Details</h2>
        {#if fe('detailed_incidents')}<p class="text-xs text-error mb-2" role="alert">{fe('detailed_incidents')}</p>{/if}
        {#each incidents as inc, i}
          <div class="border border-base-200 rounded-lg p-3 mb-3 relative space-y-3">
            {#if incidents.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error absolute top-2 right-2" onclick={() => removeIncident(i)}>Remove</button>
            {/if}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-0 sm:pr-20">
              <div class="form-control">
                <label class="label py-1" for="inc-dtype-{i}"><span class="label-text text-xs">When it happened *</span></label>
                <select id="inc-dtype-{i}" class="select select-bordered select-sm" bind:value={inc.date_type} onchange={() => { inc.date_of_incident = ''; inc.is_estimated_date = false; }}>
                  {#each DATE_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
                </select>
              </div>
              <div class="form-control">
                <label class="label py-1" for="inc-date-{i}"><span class="label-text text-xs">{DATE_TYPES.find((t) => t.value === inc.date_type)?.label} *</span></label>
                {#if inc.date_type === 'exact'}
                  <input id="inc-date-{i}" data-field={incKey(inc, 'date_of_incident')} type="date" max={todayPH()} class="input input-bordered input-sm" bind:value={inc.date_of_incident} />
                {:else if inc.date_type === 'month_year'}
                  <input id="inc-date-{i}" data-field={incKey(inc, 'date_of_incident')} type="month" max={todayPH().slice(0, 7)} class="input input-bordered input-sm" bind:value={inc.date_of_incident} />
                {:else if inc.date_type === 'year'}
                  <input id="inc-date-{i}" data-field={incKey(inc, 'date_of_incident')} type="text" inputmode="numeric" maxlength="4" placeholder="e.g. 2025" class="input input-bordered input-sm" bind:value={inc.date_of_incident} />
                {:else}
                  <input id="inc-date-{i}" data-field={incKey(inc, 'date_of_incident')} type="text" maxlength="255" placeholder="e.g. around the start of the school year" class="input input-bordered input-sm" bind:value={inc.date_of_incident} />
                {/if}
              </div>
            </div>
            <div class="form-control">
              <label class="label py-1" for="inc-desc-{i}"><span class="label-text text-xs">Details of the incident *</span></label>
              <textarea id="inc-desc-{i}" data-field={incKey(inc, 'description')} class="textarea textarea-bordered textarea-sm" rows="4" bind:value={inc.description}></textarea>
            </div>
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm" onclick={addIncident}>+ Add Another Incident</button>
      {/if}

      <!-- Step 5: IV. Initial Actions Taken · V. Recommendations / Next Steps -->
      {#if currentStep === 5}
        <h2 class="font-semibold text-lg mb-1">Initial Actions Taken <span class="text-sm font-normal text-base-content/50">(optional)</span></h2>
        <p class="text-xs text-base-content/50 mb-2">If left blank, the sheet records that the incident was reported on the date of intake.</p>
        {#each actions as a, i}
          <div class="flex flex-wrap gap-2 mb-2" data-field-wrap>
            <span class="text-sm text-base-content/50 pt-2 w-5 shrink-0">{i + 1}.</span>
            <textarea data-field={actKey(a)} class="textarea textarea-bordered textarea-sm flex-1" rows="2" placeholder="Initial action taken…" bind:value={a.action_taken}></textarea>
            {#if actions.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error" onclick={() => removeAction(i)}>✕</button>
            {/if}
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm mb-6" onclick={addAction}>+ Add Initial Action</button>

        <h2 class="font-semibold text-lg mb-2">Recommendations / Next Steps <span class="text-sm font-normal text-base-content/50">(can be added later)</span></h2>
        <div class="border border-base-200 rounded-lg p-3 mb-4">
          <p class="text-sm font-medium mb-2">Referral</p>
          <div class="flex flex-wrap gap-4" data-field-wrap>
            {#each [['yes', 'Yes'], ['no', 'No']] as [val, label]}
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" class="radio radio-sm radio-primary" name="is_referred" data-field="is_referred" value={val} bind:group={referral.answer} />
                {label}
              </label>
            {/each}
            {#if referral.answer}
              <button type="button" class="btn btn-ghost btn-xs" onclick={() => (referral.answer = '')}>Clear answer</button>
            {/if}
          </div>
          {#if referral.answer === 'yes'}
            <div class="form-control mt-3">
              <label class="label py-1" for="ref-to"><span class="label-text text-xs">Referral to *</span></label>
              <input id="ref-to" data-field="referred_to" type="text" class="input input-bordered input-sm" maxlength="255" placeholder="e.g. DSWD, Barangay VAWC Desk, RHU" bind:value={referral.referred_to} />
            </div>
            <div class="form-control mt-2">
              <label class="label py-1" for="ref-reason"><span class="label-text text-xs">Reason for referral *</span></label>
              <textarea id="ref-reason" data-field="referral_reason" class="textarea textarea-bordered textarea-sm" rows="3" bind:value={referral.referral_reason}></textarea>
            </div>
          {/if}
        </div>

        <p class="text-sm font-medium mb-1">Other recommendations / next steps</p>
        {#each recommendations as r, i}
          <div class="flex flex-wrap gap-2 mb-2" data-field-wrap>
            <span class="text-sm text-base-content/50 pt-2 w-5 shrink-0">{i + 1}.</span>
            <textarea data-field={recKey(r)} class="textarea textarea-bordered textarea-sm flex-1" rows="2" placeholder="Recommendation / next step…" bind:value={r.recommendation}></textarea>
            {#if recommendations.length > 1}
              <button type="button" class="btn btn-ghost btn-sm text-error" onclick={() => removeRecommendation(i)}>✕</button>
            {/if}
          </div>
        {/each}
        <button type="button" class="btn btn-outline btn-sm" onclick={addRecommendation}>+ Add Recommendation</button>
      {/if}

      <!-- Step 6: Review -->
      {#if currentStep === 6}
        <h2 class="font-semibold text-lg mb-4">Review &amp; Submit</h2>
        <div class="space-y-4 text-sm">
          <div>
            <p class="font-medium text-base-content/70">Intake Info</p>
            <p>{selectedSchool?.name || '—'} · {header.date_of_intake}</p>
            <p>
              {NATURE_OF_CASE_OPTIONS.find((o) => o.value === header.nature_of_case)?.label || '—'}
              {#if needsSpecify(header.nature_of_case) && header.nature_of_case_other}: {header.nature_of_case_other}{/if}
            </p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Learner-Victim</p>
            <p>{learner.first_name} {learner.middle_name} {learner.last_name} {#if learner.grade}· {gradeSection(learner.grade, learner.section)}{/if}</p>
            {#if adviserName.trim()}<p class="text-base-content/60">Adviser: {adviserName}</p>{/if}
          </div>
          <div>
            <p class="font-medium text-base-content/70">Parents / Guardian &amp; Complainants</p>
            <p>
              {#each ['MOTHER', 'FATHER', 'GUARDIAN'] as role}
                {#if optional[role].included}{role.charAt(0) + role.slice(1).toLowerCase()} of the learner-victim: {optional[role].first_name} {optional[role].last_name}<br/>{/if}
              {/each}
              {#if learnerIsComplainant}Complainant: the learner-victim<br/>{/if}
              {#each linkedParents as r}Complainant: the {PARENT_LABEL[r].toLowerCase()} ({optional[r].first_name} {optional[r].last_name})<br/>{/each}
              {complainants.filter((c) => c.first_name || c.last_name).length} other complainant(s)
            </p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Respondent / Alleged Offender(s)</p>
            <p>
              {#if offenderUnidentified}Not yet identified{:else}{#each allegedOffenders.filter(hasContent) as o}{o.first_name} {o.last_name}{#if o.offender_type} · {OFFENDER_TYPES.find((t) => t.value === o.offender_type)?.label}{/if}<br/>{:else}None recorded{/each}{/if}
            </p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Incident(s)</p>
            <p>{incidents.filter(incidentHasContent).length} recorded</p>
          </div>
          <div>
            <p class="font-medium text-base-content/70">Follow-up</p>
            <p>
              {actions.filter((a) => a.action_taken.trim()).length || 'Automatic entry for'} initial action(s) ·
              {recommendations.filter((r) => r.recommendation.trim()).length} other recommendation(s) ·
              Referral: {referral.answer === 'yes' ? `Yes — ${referral.referred_to}` : referral.answer === 'no' ? 'No' : 'not answered'}
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
        {#if isDraftFlow && currentStep < STEPS.length}
          <button type="button" class="btn btn-outline" disabled={submitting} onclick={saveDraft}>Save Draft</button>
        {/if}
        {#if currentStep < STEPS.length}
          <button type="button" class="btn btn-primary flex-1 sm:flex-none" disabled={submitting} onclick={next}>
            {#if submitting}<span class="loading loading-spinner loading-xs"></span> Saving…{:else}Next »{/if}
          </button>
        {:else}
          <button type="button" class="btn btn-primary flex-1 sm:flex-none" disabled={submitting} onclick={handleSubmit}>
            {#if submitting}<span class="loading loading-spinner loading-xs"></span>{/if}
            {isEdit && !isDraftFlow ? 'Save Changes' : isFromReport ? 'Finalize & Link to Report' : 'Finalize'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- "Is this the same learner?" -->
<dialog bind:this={matchDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg">Is this the same learner?</h3>
    <p class="text-sm text-base-content/70 mt-1">
      {learnerMatches.length === 1 ? 'A learner' : 'Learners'} with this name {learnerMatches.length === 1 ? 'is' : 'are'} already in earlier records of this school.
      If it's the same person, their details can be filled in for you.
    </p>
    <div class="space-y-2 mt-4 max-h-[55vh] overflow-y-auto">
      {#each learnerMatches as m}
        <div class="rounded-lg border border-base-300 p-3">
          <p class="font-semibold">{[m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ')}</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs mt-1">
            <dt class="text-base-content/50">Birthdate</dt><dd>{m.birthdate ? `${fmtMatchDate(m.birthdate.slice(0, 10))} (age ${ageFrom(m.birthdate.slice(0, 10))})` : '—'}</dd>
            <dt class="text-base-content/50">Sex</dt><dd>{m.sex ? m.sex.charAt(0) + m.sex.slice(1).toLowerCase() : '—'}</dd>
            <dt class="text-base-content/50">Grade / Section</dt><dd>{gradeSection(m.grade, m.section) || '—'}</dd>
            <dt class="text-base-content/50">School</dt><dd>{m.school_name || '—'}</dd>
            {#if m.parents?.length}
              <dt class="text-base-content/50">Parents / Guardian</dt>
              <dd>{m.parents.map((/** @type {any} */ p) => `${p.first_name} ${p.last_name} (${p.role.charAt(0) + p.role.slice(1).toLowerCase()})`).join(', ')}</dd>
            {/if}
            <dt class="text-base-content/50">Records</dt>
            <dd>{m.record_count} · latest LRP-{String(m.records[0].intake_sheet_id).padStart(5, '0')}, {fmtMatchDate(m.records[0].date_of_intake)}{m.records[0].is_draft ? ' (draft)' : ''}</dd>
          </dl>
          <button type="button" class="btn btn-primary btn-sm w-full mt-3" onclick={() => useLearnerMatch(m)}>Yes, same learner — fill in the details</button>
        </div>
      {/each}
    </div>
    <div class="modal-action">
      <button type="button" class="btn btn-ghost btn-sm" onclick={notSameLearner}>No, this is a different learner</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button onclick={notSameLearner}>close</button></form>
</dialog>
