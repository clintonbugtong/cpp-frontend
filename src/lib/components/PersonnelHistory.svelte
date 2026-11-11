<script>
  // The people who have handled a school's shared account, newest first.
  // Handing over adds a new person and automatically closes the previous
  // one's assignment — nobody is ever deleted, so the history stays complete
  // even after staff leave.
  import { schoolReportsService } from '$lib/api/school-reports.js';

  /** @type {{ schoolId?: any, personnel: any[], canEdit?: boolean, onchange?: () => void }} */
  let { schoolId = null, personnel = [], canEdit = true, onchange = () => {} } = $props();

  /** @type {HTMLDialogElement|null} */
  let addDialog = $state(null);
  /** @type {HTMLDialogElement|null} */
  let endDialog = $state(null);

  let saving = $state(false);
  let error = $state('');
  /** @type {Record<string, string[]>} */
  let fieldErrors = $state({});

  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  let form = $state({ full_name: '', position: '', email: '', contact_number: '', started_at: today() });
  /** @type {any} */
  let ending = $state(null);
  let endForm = $state({ ended_at: today(), end_reason: '' });

  const current = $derived(personnel.find((p) => !p.ended_at) ?? null);

  function openAdd() {
    form = { full_name: '', position: '', email: '', contact_number: '', started_at: today() };
    error = ''; fieldErrors = {};
    addDialog?.showModal();
  }

  /** @param {any} p */
  function openEnd(p) {
    ending = p;
    endForm = { ended_at: today(), end_reason: '' };
    error = ''; fieldErrors = {};
    endDialog?.showModal();
  }

  /** @param {Event} e */
  async function submitAdd(e) {
    e.preventDefault();
    saving = true; error = ''; fieldErrors = {};
    const res = await schoolReportsService.addPersonnel({ ...form, ...(schoolId ? { school_id: schoolId } : {}) });
    saving = false;
    if (res.success) { addDialog?.close(); onchange(); }
    else { error = res.error || 'Could not save.'; fieldErrors = res.validationErrors || {}; }
  }

  /** @param {Event} e */
  async function submitEnd(e) {
    e.preventDefault();
    saving = true; error = ''; fieldErrors = {};
    const res = await schoolReportsService.updatePersonnel(ending.school_personnel_id, endForm);
    saving = false;
    if (res.success) { endDialog?.close(); onchange(); }
    else { error = res.error || 'Could not save.'; fieldErrors = res.validationErrors || {}; }
  }

  /** @param {string} f */
  const fe = (f) => (fieldErrors[f] || []).join(' ');

  /** @param {string|null} d */
  function fmt(d) {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between gap-2">
    <div>
      <h3 class="font-semibold">Who handles this account</h3>
      <p class="text-xs text-base-content/60">Full history is kept, including people who have left.</p>
    </div>
    {#if canEdit}
      <button class="btn btn-primary btn-sm" onclick={openAdd}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        {current ? 'Hand over' : 'Record person'}
      </button>
    {/if}
  </div>

  {#if personnel.length === 0}
    <div class="rounded-lg border border-dashed border-warning/50 bg-warning/10 p-4 text-sm">
      No one is recorded yet. Record the person currently using this account — monthly reports can't be submitted until someone is on record.
    </div>
  {:else}
    <ol class="relative border-l-2 border-base-300 ml-2 space-y-3">
      {#each personnel as p (p.school_personnel_id)}
        <li class="ml-4">
          <span class="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-base-100 {p.ended_at ? 'bg-base-300' : 'bg-success'}"></span>
          <div class="rounded-lg border {p.ended_at ? 'border-base-200 bg-base-200/30' : 'border-success/40 bg-success/5'} p-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium">{p.full_name}
                  {#if !p.ended_at}<span class="badge badge-success badge-sm ml-1">Current</span>{/if}
                </p>
                <p class="text-xs text-base-content/60">{p.position || 'Position not given'}</p>
              </div>
              {#if canEdit && !p.ended_at}
                <button class="btn btn-ghost btn-xs text-error" onclick={() => openEnd(p)}>Mark as left</button>
              {/if}
            </div>
            <p class="text-xs mt-1">
              <span class="text-base-content/70">{fmt(p.started_at)} – {p.ended_at ? fmt(p.ended_at) : 'present'}</span>
              {#if p.end_reason}<span class="text-base-content/50"> · {p.end_reason}</span>{/if}
            </p>
            {#if p.email || p.contact_number}
              <p class="text-xs text-base-content/50 mt-0.5 break-all">{[p.email, p.contact_number].filter(Boolean).join(' · ')}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<dialog bind:this={addDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg">{current ? 'Hand over the account' : 'Record who handles this account'}</h3>
    {#if current}
      <p class="text-sm text-base-content/70 mt-1"><strong>{current.full_name}</strong>'s assignment will be closed the day before the start date below. Their record stays in the history.</p>
    {/if}
    {#if error}<div class="alert alert-error text-sm mt-3"><span>{error}</span></div>{/if}
    <form onsubmit={submitAdd} class="space-y-3 mt-3">
      <div class="form-control">
        <label class="label py-1" for="pn-name"><span class="label-text text-xs">Full name *</span></label>
        <input id="pn-name" class="input input-bordered input-sm" class:input-error={fe('full_name')} bind:value={form.full_name} required maxlength="200" />
        {#if fe('full_name')}<p class="text-xs text-error mt-1">{fe('full_name')}</p>{/if}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="pn-pos"><span class="label-text text-xs">Position</span></label>
          <input id="pn-pos" class="input input-bordered input-sm" placeholder="e.g. Guidance Counselor" bind:value={form.position} maxlength="150" />
        </div>
        <div class="form-control">
          <label class="label py-1" for="pn-start"><span class="label-text text-xs">Started handling the account *</span></label>
          <input id="pn-start" type="date" class="input input-bordered input-sm" class:input-error={fe('started_at')} bind:value={form.started_at} max={today()} required />
          {#if fe('started_at')}<p class="text-xs text-error mt-1">{fe('started_at')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="pn-email"><span class="label-text text-xs">Email</span></label>
          <input id="pn-email" type="email" class="input input-bordered input-sm" class:input-error={fe('email')} bind:value={form.email} />
          {#if fe('email')}<p class="text-xs text-error mt-1">{fe('email')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="pn-contact"><span class="label-text text-xs">Contact number</span></label>
          <input id="pn-contact" class="input input-bordered input-sm" bind:value={form.contact_number} maxlength="50" />
        </div>
      </div>
      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => addDialog?.close()}>Cancel</button>
        <button class="btn btn-primary btn-sm" disabled={saving}>{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}Save</button>
      </div>
    </form>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={endDialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Mark {ending?.full_name} as no longer handling the account</h3>
    <p class="text-sm text-base-content/70 mt-1">Their record is kept in the history. Remember to record who takes over — reports can't be submitted with no one on record.</p>
    {#if error}<div class="alert alert-error text-sm mt-3"><span>{error}</span></div>{/if}
    <form onsubmit={submitEnd} class="space-y-3 mt-3">
      <div class="form-control">
        <label class="label py-1" for="pe-date"><span class="label-text text-xs">Last day *</span></label>
        <input id="pe-date" type="date" class="input input-bordered input-sm" class:input-error={fe('ended_at')} bind:value={endForm.ended_at} max={today()} required />
        {#if fe('ended_at')}<p class="text-xs text-error mt-1">{fe('ended_at')}</p>{/if}
      </div>
      <div class="form-control">
        <label class="label py-1" for="pe-reason"><span class="label-text text-xs">Reason</span></label>
        <input id="pe-reason" class="input input-bordered input-sm" placeholder="e.g. Transferred, retired, resigned" bind:value={endForm.end_reason} maxlength="255" />
      </div>
      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => endDialog?.close()}>Cancel</button>
        <button class="btn btn-error btn-sm" disabled={saving}>{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}Confirm</button>
      </div>
    </form>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
