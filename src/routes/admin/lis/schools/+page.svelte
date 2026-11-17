<script>
  import { fieldErrors } from '$lib/actions/field-errors.js';
  import { schoolsService } from '$lib/api/schools.js';
  import { statusLabel, statusBadgeClass, typeLabel, classificationLabel } from '$lib/constants/schools.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { onMount } from 'svelte';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import SchoolAccountDialog from '$lib/components/SchoolAccountDialog.svelte';

  // Division Admin is always scoped to their own division — the backend
  // enforces this in SchoolController::findScoped()/isDivisionLevelAdmin(),
  // this page just doesn't bother showing a division picker since there's
  // only ever one valid choice.

  /** @type {any[]} */
  let schools = $state([]);
  let loading = $state(true);
  let listError = $state('');
  let searchQuery = $state('');
  let statusFilter = $state('');
  let typeFilter = $state('');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);

  /** @type {HTMLDialogElement|null} */
  let createModal = $state(null);
  /** @type {HTMLDialogElement|null} */
  let editModal = $state(null);
  /** @type {HTMLDialogElement|null} */
  let deleteModal = $state(null);

  let formSubmitting = $state(false);
  let formError = $state('');
  /** @type {Record<string,string[]>} */
  let formErrors = $state({});
  /** @type {any} */
  let editingSchool = $state(null);
  /** @type {any} */
  let deletingSchool = $state(null);

  function emptyForm() {
    return {
      school_id_number: '', name: '', address: '', contact_number: '', email: '',
      status: 'pending', school_type: 'public', school_classification: ''
    };
  }
  let form = $state(emptyForm());

  onMount(loadSchools);

  async function loadSchools() {
    loading = true;
    listError = '';
    /** @type {Record<string,any>} */
    const params = { page: currentPage, per_page: 15 };
    if (searchQuery) params.search = searchQuery;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.school_type = typeFilter;

    const result = await schoolsService.getSchools(params);
    if (result.success) {
      schools = result.data?.data || [];
      totalPages = result.data?.last_page || 1;
      total = result.data?.total || 0;
    } else {
      listError = result.error || 'Failed to load schools';
    }
    loading = false;
  }

  function handleSearch() {
    currentPage = 1;
    loadSchools();
  }

  /** @param {number} p */
  function changePage(p) {
    currentPage = p;
    loadSchools();
  }

  function openCreate() {
    form = emptyForm();
    formError = '';
    formErrors = {};
    createModal?.showModal();
  }

  /** @param {Event} e */
  async function handleCreate(e) {
    e.preventDefault();
    formSubmitting = true;
    formError = '';
    formErrors = {};

    const result = await schoolsService.createSchool({
      school_id_number: form.school_id_number,
      name: form.name,
      address: form.address,
      contact_number: form.contact_number,
      email: form.email,
      status: form.status,
      school_type: form.school_type,
      school_classification: form.school_classification || null
    });
    if (result.success) {
      createModal?.close();
      await loadSchools();
      // Next step for a new school: create its School Head / Guidance
      // Counselor accounts.
      if (result.data?.school_id) accountDialog?.open(result.data.school_id, result.data.name);
    } else {
      formError = result.error || 'Failed to create school';
      formErrors = result.validationErrors || {};
    }
    formSubmitting = false;
  }

  /** @param {any} school */
  function openEdit(school) {
    formError = '';
    formErrors = {};
    editingSchool = school;
    form = {
      school_id_number: school.school_id_number || '',
      name: school.name || '',
      address: school.address || '',
      contact_number: school.contact_number || '',
      email: school.email || '',
      status: school.status || 'pending',
      school_type: school.school_type || 'public',
      school_classification: school.school_classification || ''
    };
    editModal?.showModal();
  }

  /** @param {Event} e */
  async function handleEdit(e) {
    e.preventDefault();
    formSubmitting = true;
    formError = '';
    formErrors = {};

    const result = await schoolsService.updateSchool(editingSchool.school_id, {
      school_id_number: form.school_id_number,
      name: form.name,
      address: form.address,
      contact_number: form.contact_number,
      email: form.email,
      status: form.status,
      school_type: form.school_type,
      school_classification: form.school_classification || null
    });
    if (result.success) {
      editModal?.close();
      await loadSchools();
    } else {
      formError = result.error || 'Failed to update school';
      formErrors = result.validationErrors || {};
    }
    formSubmitting = false;
  }

  /** @param {any} school */
  function openDelete(school) {
    deletingSchool = school;
    deleteModal?.showModal();
  }

  async function handleDelete() {
    if (!deletingSchool) return;
    const result = await schoolsService.deleteSchool(deletingSchool.school_id);
    if (result.success) {
      deleteModal?.close();
      await loadSchools();
    } else {
      listError = result.error || 'Failed to delete school';
    }
  }

  // ── School accounts: personal accounts for the School Head / Principal and
  //    the Guidance Counselor / Designate, with their history ──
  /** @type {any} */
  let accountDialog = $state(null);

  /** @param {string} field */
  function fe(field) {
    const errors = formErrors[field];
    return Array.isArray(errors) && errors.length ? errors.join(' ') : '';
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">School Management</h1>
      <p class="text-base-content/50 mt-1">
        {total} school{total !== 1 ? 's' : ''} in {authState.user?.division?.name || 'your division'}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
    <button onclick={openCreate} class="btn btn-primary">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
      </svg>
      Add School
    </button>
    </div>
  </div>

  <div class="flex flex-col sm:flex-row gap-3">
    <input
      type="text"
      placeholder="Search by name or ID number..."
      class="input input-bordered flex-1"
      bind:value={searchQuery}
      oninput={handleSearch}
    />
    <select class="select select-bordered w-full sm:w-40" bind:value={statusFilter} onchange={handleSearch}>
      <option value="">All Status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="pending">Pending</option>
    </select>
    <select class="select select-bordered w-full sm:w-40" bind:value={typeFilter} onchange={handleSearch}>
      <option value="">All Types</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  </div>

  {#if listError}
    <div class="alert alert-error"><span>{listError}</span></div>
  {/if}

  <!-- Mobile: card list -->
  <div class="sm:hidden space-y-3">
    {#if loading}
      <div class="text-center py-10"><span class="loading loading-spinner"></span></div>
    {:else if schools.length === 0}
      <div class="text-center py-10 text-base-content/50">No schools found</div>
    {:else}
      {#each schools as school}
        <div class="card bg-base-100 shadow-sm border border-base-200 p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-medium truncate">{school.name}</p>
              <p class="text-xs text-base-content/50">{school.school_id_number}</p>
            </div>
            <span class="badge badge-sm shrink-0 {statusBadgeClass(school.status)}">{statusLabel(school.status)}</span>
          </div>
          <div class="flex flex-wrap gap-1 mt-2">
            <span class="badge badge-ghost badge-sm">{typeLabel(school.school_type)}</span>
            {#if school.school_classification}
              <span class="badge badge-ghost badge-sm">{classificationLabel(school.school_classification)}</span>
            {/if}
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-outline btn-xs flex-1 {school.has_account ? '' : 'btn-warning'}" onclick={() => accountDialog?.open(school.school_id, school.name)}>Accounts {(school.account_positions ?? []).length}/2</button>
            <button class="btn btn-outline btn-xs flex-1" onclick={() => openEdit(school)}>Edit</button>
            <button class="btn btn-outline btn-error btn-xs flex-1" onclick={() => openDelete(school)}>Delete</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Desktop: table -->
  <div class="hidden sm:block card bg-base-100 shadow-sm border border-base-200">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>School</th>
            <th>Type</th>
            <th>Status</th>
            <th>Accounts</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="5" class="text-center py-10"><span class="loading loading-spinner"></span></td></tr>
          {:else if schools.length === 0}
            <tr><td colspan="5" class="text-center py-10 text-base-content/50">No schools found</td></tr>
          {:else}
            {#each schools as school}
              <tr class="hover">
                <td>
                  <p class="font-medium">{school.name}</p>
                  <p class="text-xs text-base-content/50">{school.school_id_number} · {school.email}</p>
                </td>
                <td class="text-sm">
                  <div class="flex flex-wrap gap-1">
                    <span class="badge badge-ghost badge-sm">{typeLabel(school.school_type)}</span>
                    {#if school.school_classification}
                      <span class="badge badge-ghost badge-sm">{classificationLabel(school.school_classification)}</span>
                    {/if}
                  </div>
                </td>
                <td>
                  <span class="badge badge-sm {statusBadgeClass(school.status)}">{statusLabel(school.status)}</span>
                </td>
                <td>
                  <button class="btn btn-ghost btn-xs gap-1 {school.has_account ? '' : 'text-warning'}" onclick={() => accountDialog?.open(school.school_id, school.name)} title="School Head and Guidance Counselor accounts, and their history">
                    <span class="h-2 w-2 rounded-full {school.has_account ? 'bg-success' : 'bg-warning'}"></span>
                    {(school.account_positions ?? []).length}/2
                    <span class="text-base-content/50 font-normal">{(school.account_positions ?? []).map((/** @type {string} */ k) => k === 'school_head' ? 'Head' : 'GC').join(' · ') || 'none'}</span>
                  </button>
                </td>
                <td>
                  <div class="flex items-center gap-1">
                    <button class="btn btn-outline btn-xs" onclick={() => openEdit(school)}>Edit</button>
                    <button class="btn btn-outline btn-error btn-xs" onclick={() => openDelete(school)}>Delete</button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    {#if totalPages > 1}
      <div class="p-4 border-t border-base-200 flex items-center justify-between">
        <span class="text-sm text-base-content/50">Page {currentPage} of {totalPages}</span>
        <div class="join">
          <button class="join-item btn btn-sm" disabled={currentPage <= 1} onclick={() => changePage(currentPage - 1)}>«</button>
          {#each Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1) as p}
            <button class="join-item btn btn-sm {p === currentPage ? 'btn-active' : ''}" onclick={() => changePage(p)}>{p}</button>
          {/each}
          <button class="join-item btn btn-sm" disabled={currentPage >= totalPages} onclick={() => changePage(currentPage + 1)}>»</button>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ── Create School Modal ── -->
<dialog bind:this={createModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-lg" use:fieldErrors={{ errors: formErrors, rest: false }}>
    <h3 class="font-bold text-lg mb-4">Add New School</h3>
    <p class="text-xs text-base-content/40 -mt-2 mb-3">Will be added to {authState.user?.division?.name || 'your division'}.</p>
    {#if formError}<div class="alert alert-error mb-4 text-sm"><span>{formError}</span></div>{/if}

    <form onsubmit={handleCreate} class="space-y-3">
      <div class="form-control">
        <label class="label py-1" for="c-sname"><span class="label-text text-xs">School Name *</span></label>
        <input id="c-sname" type="text" class="input input-bordered input-sm" class:input-error={fe('name')} bind:value={form.name} required />
        {#if fe('name')}<p class="text-xs text-error mt-1">{fe('name')}</p>{/if}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="c-sid"><span class="label-text text-xs">School ID Number *</span></label>
          <input id="c-sid" type="text" class="input input-bordered input-sm" class:input-error={fe('school_id_number')} bind:value={form.school_id_number} required />
          {#if fe('school_id_number')}<p class="text-xs text-error mt-1">{fe('school_id_number')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-semail"><span class="label-text text-xs">Email *</span></label>
          <input id="c-semail" type="email" class="input input-bordered input-sm" class:input-error={fe('email')} bind:value={form.email} required />
          {#if fe('email')}<p class="text-xs text-error mt-1">{fe('email')}</p>{/if}
        </div>
      </div>
      <div class="form-control">
        <label class="label py-1" for="c-saddr"><span class="label-text text-xs">Address *</span></label>
        <input id="c-saddr" type="text" class="input input-bordered input-sm" class:input-error={fe('address')} bind:value={form.address} required />
        {#if fe('address')}<p class="text-xs text-error mt-1">{fe('address')}</p>{/if}
      </div>
      <div class="form-control">
        <label class="label py-1" for="c-scontact"><span class="label-text text-xs">Contact Number *</span></label>
        <input id="c-scontact" type="text" class="input input-bordered input-sm" class:input-error={fe('contact_number')} bind:value={form.contact_number} required />
        {#if fe('contact_number')}<p class="text-xs text-error mt-1">{fe('contact_number')}</p>{/if}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="form-control">
          <label class="label py-1" for="c-sstatus"><span class="label-text text-xs">Status</span></label>
          <select id="c-sstatus" class="select select-bordered select-sm" bind:value={form.status}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-stype"><span class="label-text text-xs">Type</span></label>
          <select id="c-stype" class="select select-bordered select-sm" bind:value={form.school_type}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-sclass"><span class="label-text text-xs">Classification</span></label>
          <select id="c-sclass" class="select select-bordered select-sm" bind:value={form.school_classification}>
            <option value="">—</option>
            <option value="elementary">Elementary</option>
            <option value="secondary">Secondary</option>
            <option value="integrated">Integrated</option>
          </select>
        </div>
      </div>

      <div class="modal-action mt-4">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => createModal?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={formSubmitting}>
          {#if formSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
          Create School
        </button>
      </div>
    </form>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Edit School Modal ── -->
<dialog bind:this={editModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-lg" use:fieldErrors={{ errors: formErrors, rest: false }}>
    <h3 class="font-bold text-lg mb-4">Edit School</h3>
    {#if formError}<div class="alert alert-error mb-4 text-sm"><span>{formError}</span></div>{/if}

    <form onsubmit={handleEdit} class="space-y-3">
      <div class="form-control">
        <label class="label py-1" for="e-sname"><span class="label-text text-xs">School Name *</span></label>
        <input id="e-sname" type="text" class="input input-bordered input-sm" class:input-error={fe('name')} bind:value={form.name} required />
        {#if fe('name')}<p class="text-xs text-error mt-1">{fe('name')}</p>{/if}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="e-sid"><span class="label-text text-xs">School ID Number *</span></label>
          <input id="e-sid" type="text" class="input input-bordered input-sm" class:input-error={fe('school_id_number')} bind:value={form.school_id_number} required />
          {#if fe('school_id_number')}<p class="text-xs text-error mt-1">{fe('school_id_number')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-semail"><span class="label-text text-xs">Email *</span></label>
          <input id="e-semail" type="email" class="input input-bordered input-sm" class:input-error={fe('email')} bind:value={form.email} required />
          {#if fe('email')}<p class="text-xs text-error mt-1">{fe('email')}</p>{/if}
        </div>
      </div>
      <div class="form-control">
        <label class="label py-1" for="e-saddr"><span class="label-text text-xs">Address *</span></label>
        <input id="e-saddr" type="text" class="input input-bordered input-sm" bind:value={form.address} required />
      </div>
      <div class="form-control">
        <label class="label py-1" for="e-scontact"><span class="label-text text-xs">Contact Number *</span></label>
        <input id="e-scontact" type="text" class="input input-bordered input-sm" bind:value={form.contact_number} required />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="form-control">
          <label class="label py-1" for="e-sstatus"><span class="label-text text-xs">Status</span></label>
          <select id="e-sstatus" class="select select-bordered select-sm" bind:value={form.status}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-stype"><span class="label-text text-xs">Type</span></label>
          <select id="e-stype" class="select select-bordered select-sm" bind:value={form.school_type}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-sclass"><span class="label-text text-xs">Classification</span></label>
          <select id="e-sclass" class="select select-bordered select-sm" bind:value={form.school_classification}>
            <option value="">—</option>
            <option value="elementary">Elementary</option>
            <option value="secondary">Secondary</option>
            <option value="integrated">Integrated</option>
          </select>
        </div>
      </div>

      <div class="modal-action mt-4">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => editModal?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={formSubmitting}>
          {#if formSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
          Save Changes
        </button>
      </div>
    </form>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Delete Confirm Modal ── -->
<dialog bind:this={deleteModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Delete School</h3>
    <p class="py-4 text-base-content/70">
      Are you sure you want to delete <strong>{deletingSchool?.name}</strong>? This can be restored later by an administrator.
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => deleteModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" onclick={handleDelete}>Delete</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<SchoolAccountDialog bind:this={accountDialog} onchange={loadSchools} />
