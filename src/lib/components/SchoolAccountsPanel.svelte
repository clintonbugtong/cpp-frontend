<script>
  // A school's personal accounts — School Head / Principal and Guidance
  // Counselor / Designate — plus the history of everyone who held them.
  // Super Admin / Division Admin (data.can_manage) can create an account for a
  // vacant position and deactivate one when the holder moves out. Nothing is
  // deleted: a moved-out holder stays in the history and on everything they did.
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import { fieldErrors } from '$lib/actions/field-errors.js';

  /** @type {{ data: any, onchange?: (data: any) => void }} */
  let { data, onchange } = $props();

  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  // ── create ──
  /** @type {string|null} position key being filled */
  let creating = $state(null);
  let form = $state({ first_name: '', middle_name: '', last_name: '', email: '', contact_number: '', send_email: true });
  let saving = $state(false);
  let formError = $state('');
  /** @type {Record<string, string[]>} errors keyed by field, shown under each input */
  let formErrors = $state({});
  const BANNER = 'Please fix the errors shown below.';
  /** @type {any} one-time credentials of the account just created */
  let credentials = $state(null);
  let copied = $state(false);

  /** @param {string} key */
  function startCreate(key) {
    creating = key; formError = ''; formErrors = {}; credentials = null; closing = null;
    form = { first_name: '', middle_name: '', last_name: '', email: '', contact_number: '', send_email: true };
  }

  async function create() {
    /** @type {Record<string, string[]>} */
    const missing = {};
    if (!form.first_name.trim()) missing.first_name = ['Enter the first name.'];
    if (!form.last_name.trim()) missing.last_name = ['Enter the last name.'];
    if (!form.email.trim()) missing.email = ['Enter their own email address.'];
    formErrors = missing;
    if (Object.keys(missing).length) { formError = BANNER; return; }
    saving = true; formError = '';
    const res = await schoolReportsService.createAccount({
      school_id: data.school.school_id, school_position: /** @type {any} */ (creating),
      first_name: form.first_name.trim(), middle_name: form.middle_name.trim() || undefined, last_name: form.last_name.trim(),
      email: form.email.trim(), contact_number: form.contact_number.trim() || undefined, send_email: form.send_email
    });
    saving = false;
    if (res.success) {
      credentials = res.data.credentials; copied = false; creating = null;
      onchange?.(res.data);
    } else {
      formErrors = res.validationErrors || {};
      formError = Object.keys(formErrors).length ? BANNER : res.error || 'Could not create the account.';
    }
  }

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(`${credentials.full_name} (${credentials.position}, ${credentials.school_name})\nUsername: ${credentials.username}\nTemporary password: ${credentials.temporary_password}`);
      copied = true;
    } catch { copied = false; }
  }

  // ── deactivate (moved out) ──
  /** @type {any} account being closed */
  let closing = $state(null);
  let endForm = $state({ ended_at: '', end_reason: '' });

  /** @param {any} account */
  function startClose(account) {
    closing = account; creating = null; formError = ''; formErrors = {};
    endForm = { ended_at: today(), end_reason: '' };
  }

  async function deactivate() {
    if (!endForm.end_reason.trim()) { formErrors = { end_reason: ['Say why the account is being closed.'] }; formError = BANNER; return; }
    saving = true; formError = ''; formErrors = {};
    const res = await schoolReportsService.deactivateAccount(closing.user_id, { ended_at: endForm.ended_at, end_reason: endForm.end_reason.trim() });
    saving = false;
    if (res.success) { closing = null; onchange?.(res.data); }
    else { formErrors = res.validationErrors || {}; formError = Object.keys(formErrors).length ? BANNER : res.error || 'Could not deactivate the account.'; }
  }

  /** @param {string|null} d */
  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  /** @param {string|null} iso */
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';

  const past = $derived((data?.history ?? []).filter((/** @type {any} */ h) => !h.is_current));
</script>

<div class="space-y-3" use:fieldErrors={{ errors: formErrors, key: creating ?? closing?.user_id }}>
  <div>
    <h3 class="font-semibold">School accounts</h3>
    <p class="text-xs text-base-content/60">Personal accounts in each holder's real name — one for the School Head / Principal and one for the Guidance Counselor / Designate. When someone moves out, their account is closed and kept on record.</p>
  </div>

  {#if credentials}
    <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <p class="font-semibold">Account created for {credentials.full_name} — {credentials.position}</p>
      <p class="mt-1 font-mono text-xs">Username: <span class="select-all">{credentials.username}</span><br>Temporary password: <span class="select-all">{credentials.temporary_password}</span></p>
      <p class="text-xs text-base-content/70 mt-1"><strong>Shown only once.</strong> {credentials.emailed ? 'It was also emailed to them.' : 'It was not emailed — hand it over securely.'} They must set their own password on first sign-in.</p>
      <div class="flex gap-2 mt-2">
        <button class="btn btn-outline btn-xs" onclick={copyCredentials}>{copied ? 'Copied ✓' : 'Copy'}</button>
        <button class="btn btn-ghost btn-xs" onclick={() => (credentials = null)}>I've saved it</button>
      </div>
    </div>
  {/if}

  {#each data?.positions ?? [] as p}
    <div class="rounded-lg border p-3 text-sm {p.account ? 'border-base-200 bg-base-200/30' : 'border-dashed border-base-300'}">
      <p class="text-xs uppercase tracking-wide text-base-content/50">{p.label}</p>
      {#if p.account}
        <div class="flex items-start justify-between gap-2 mt-0.5">
          <div class="min-w-0">
            <p class="font-medium">{p.account.full_name}</p>
            <p class="text-xs text-base-content/60 break-all">{p.account.username} · {p.account.email}</p>
            <p class="text-xs text-base-content/50">Since {fmtDate(p.account.since)} · last sign-in {fmtDateTime(p.account.last_login_at)}</p>
          </div>
          {#if data.can_manage && closing?.user_id !== p.account.user_id}
            <button class="btn btn-ghost btn-xs text-error shrink-0" onclick={() => startClose(p.account)}>Moved out…</button>
          {/if}
        </div>

        {#if closing?.user_id === p.account.user_id}
          <div class="mt-3 border-t border-base-200 pt-3 space-y-2">
            <p class="text-xs text-base-content/70">Close <strong>{p.account.full_name}</strong>'s account. They can no longer sign in; their name stays on everything they recorded.</p>
            <div class="grid gap-2 sm:grid-cols-3">
              <label class="form-control">
                <span class="label-text text-xs mb-1">Last day</span>
                <input type="date" class="input input-bordered input-sm" data-field="ended_at" max={today()} bind:value={endForm.ended_at} />
              </label>
              <label class="form-control sm:col-span-2">
                <span class="label-text text-xs mb-1">Reason</span>
                <input type="text" class="input input-bordered input-sm" maxlength="255" data-field="end_reason" placeholder="e.g. Transferred to another school, retired" bind:value={endForm.end_reason} />
              </label>
            </div>
            {#if formError}<p class="text-xs text-error">{formError}</p>{/if}
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost btn-xs" onclick={() => (closing = null)}>Cancel</button>
              <button class="btn btn-error btn-xs" disabled={saving} onclick={deactivate}>{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}Close account</button>
            </div>
          </div>
        {/if}
      {:else}
        <div class="flex items-center justify-between gap-2 mt-0.5">
          <p class="text-base-content/50">No account{p.key === 'guidance_counselor' ? ' — the school may have no guidance counselor or designate yet' : ''}</p>
          {#if data.can_manage && creating !== p.key}
            <button class="btn btn-primary btn-xs shrink-0" onclick={() => startCreate(p.key)}>Create account</button>
          {/if}
        </div>

        {#if creating === p.key}
          <div class="mt-3 border-t border-base-200 pt-3 space-y-2">
            <div class="grid gap-2 sm:grid-cols-3">
              <label class="form-control"><span class="label-text text-xs mb-1">First name *</span><input class="input input-bordered input-sm" data-field="first_name" maxlength="100" bind:value={form.first_name} /></label>
              <label class="form-control"><span class="label-text text-xs mb-1">Middle name</span><input class="input input-bordered input-sm" data-field="middle_name" maxlength="100" bind:value={form.middle_name} /></label>
              <label class="form-control"><span class="label-text text-xs mb-1">Last name *</span><input class="input input-bordered input-sm" data-field="last_name" maxlength="100" bind:value={form.last_name} /></label>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="form-control"><span class="label-text text-xs mb-1">Email (their own) *</span><input type="email" class="input input-bordered input-sm" maxlength="255" data-field="email" placeholder="name@deped.gov.ph" bind:value={form.email} /></label>
              <label class="form-control"><span class="label-text text-xs mb-1">Contact number</span><input class="input input-bordered input-sm" data-field="contact_number" maxlength="50" bind:value={form.contact_number} /></label>
            </div>
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" data-field="send_email" class="checkbox checkbox-xs" bind:checked={form.send_email} /> Email the sign-in details to them
            </label>
            {#if formError}<p class="text-xs text-error">{formError}</p>{/if}
            <div class="flex justify-end gap-2">
              <button class="btn btn-ghost btn-xs" onclick={() => (creating = null)}>Cancel</button>
              <button class="btn btn-primary btn-xs" disabled={saving} onclick={create}>{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}Create account</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/each}

  {#if past.length}
    <div>
      <p class="text-xs font-semibold text-base-content/60 mb-1">Previous account holders</p>
      <ul class="divide-y divide-base-200 rounded-lg border border-base-200">
        {#each past as h}
          <li class="px-3 py-2 text-sm">
            <p class="font-medium">{h.full_name} <span class="text-xs font-normal text-base-content/50">· {h.position}</span></p>
            <p class="text-xs text-base-content/60">{fmtDate(h.started_at)} – {fmtDate(h.ended_at)}{h.end_reason ? ` · ${h.end_reason}` : ''}{h.username ? ` · ${h.username} (closed)` : ''}</p>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
