<script>
  import { schoolsService } from '$lib/api/schools.js';
  import { statusLabel, statusBadgeClass, typeLabel, classificationLabel } from '$lib/constants/schools.js';
  import { api } from '$lib/api/client.js';
  import { onMount } from 'svelte';
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import SchoolAccountDialog from '$lib/components/SchoolAccountDialog.svelte';
  import SchoolCredentialsDialog from '$lib/components/SchoolCredentialsDialog.svelte';

  // List state
  /** @type {any[]} */
  let schools = $state([]);
  let loading = $state(true);
  let listError = $state('');
  let searchQuery = $state('');
  let statusFilter = $state('');
  let typeFilter = $state('');
  let divisionFilter = $state('');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);
  /** @type {any[]} */
  let divisions = $state([]);

  // Modal refs
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
      division_id: '', status: 'pending', school_type: 'public', school_classification: ''
    };
  }
  let form = $state(emptyForm());

  onMount(async () => {
    await Promise.all([loadSchools(), loadDivisions()]);
  });

  async function loadDivisions() {
    try {
      const response = await api.get('/divisions/all');
      divisions = response.data || [];
    } catch (e) {
      divisions = [];
    }
  }

  async function loadSchools() {
    loading = true;
    listError = '';
    /** @type {Record<string,any>} */
    const params = { page: currentPage, per_page: 15 };
    if (searchQuery) params.search = searchQuery;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.school_type = typeFilter;
    if (divisionFilter) params.division_id = divisionFilter;

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

  // --- Create ---
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

    /** @type {Record<string,any>} */
    const data = {
      school_id_number: form.school_id_number,
      name: form.name,
      address: form.address,
      contact_number: form.contact_number,
      email: form.email,
      status: form.status,
      school_type: form.school_type
    };
    if (form.division_id) data.division_id = parseInt(form.division_id);
    if (form.school_classification) data.school_classification = form.school_classification;

    const result = await schoolsService.createSchool(data);
    if (result.success) {
      createModal?.close();
      await loadSchools();
      // The backend creates the school's account automatically on create.
      if (result.data?.school_account) showCredentials([result.data.school_account]);
    } else {
      formError = result.error || 'Failed to create school';
      formErrors = result.validationErrors || {};
    }
    formSubmitting = false;
  }

  // --- Edit ---
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
      division_id: school.division_id ? String(school.division_id) : '',
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

    /** @type {Record<string,any>} */
    const data = {
      school_id_number: form.school_id_number,
      name: form.name,
      address: form.address,
      contact_number: form.contact_number,
      email: form.email,
      status: form.status,
      school_type: form.school_type,
      school_classification: form.school_classification || null,
      division_id: form.division_id ? parseInt(form.division_id) : null
    };

    const result = await schoolsService.updateSchool(editingSchool.school_id, data);
    if (result.success) {
      editModal?.close();
      await loadSchools();
    } else {
      formError = result.error || 'Failed to update school';
      formErrors = result.validationErrors || {};
    }
    formSubmitting = false;
  }

  // --- Delete (soft) ---
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

  // ── School accounts (the shared Focal Person account each school files its
  //    monthly report with) ──
  /** @type {any} */
  let accountDialog = $state(null);
  /** @type {any} */
  let credentialsDialog = $state(null);
  /** @type {HTMLDialogElement|null} */
  let provisionModal = $state(null);
  /** @type {any[]} */
  let newAccounts = $state([]);
  let provisioning = $state(false);
  let provisionMessage = $state('');

  /** @param {any[]} created */
  function showCredentials(created) {
    if (!created?.length) return;
    newAccounts = created;
    // Let the {#each} render before the dialog opens.
    setTimeout(() => credentialsDialog?.open(), 0);
  }

  /** @param {{school_id?: any}} [opts] */
  async function provisionAccounts(opts = {}) {
    provisioning = true;
    provisionMessage = '';
    const result = await schoolReportsService.provisionAccounts(opts);
    provisioning = false;
    provisionModal?.close();
    if (result.success) {
      provisionMessage = result.data.message;
      showCredentials(result.data.created);
      await loadSchools();
    } else {
      listError = result.error || 'Could not create school accounts';
    }
  }

  /** @param {string} field */
  function fe(field) {
    const errors = formErrors[field];
    return Array.isArray(errors) && errors.length ? errors.join(' ') : '';
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">School Management</h1>
      <p class="text-base-content/50 mt-1">{total} school{total !== 1 ? 's' : ''} across all divisions</p>
    </div>
    <div class="flex flex-wrap gap-2">
    <button onclick={() => provisionModal?.showModal()} class="btn btn-outline" title="Create the shared account for every school that doesn't have one">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z"/></svg>
      Create school accounts
    </button>
    <button onclick={openCreate} class="btn btn-primary">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
      </svg>
      Add School
    </button>
    </div>
  </div>

  {#if provisionMessage}
    <div class="rounded-lg border border-success/30 bg-success/10 p-3 text-sm flex items-start justify-between gap-2">
      <span>{provisionMessage}</span><button class="btn btn-ghost btn-xs" onclick={() => (provisionMessage = '')} aria-label="Dismiss">✕</button>
    </div>
  {/if}

  <!-- Filters -->
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
    {#if divisions.length}
      <select class="select select-bordered w-full sm:w-48 {divisionFilter ? 'border-primary' : ''}" bind:value={divisionFilter} onchange={handleSearch}>
        <option value="">All Divisions</option>
        {#each divisions as d}
          <option value={String(d.division_id)}>{d.name}</option>
        {/each}
      </select>
    {/if}
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
              <p class="text-xs text-base-content/50">{school.school_id_number} · {school.division?.name || '—'}</p>
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
            <button class="btn btn-outline btn-xs flex-1 {school.has_account ? '' : 'btn-warning'}" onclick={() => accountDialog?.open(school.school_id, school.name)}>{school.has_account ? 'Account' : 'No account'}</button>
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
            <th>Division</th>
            <th>Type</th>
            <th>Status</th>
            <th>Account</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="6" class="text-center py-10"><span class="loading loading-spinner"></span></td></tr>
          {:else if schools.length === 0}
            <tr><td colspan="6" class="text-center py-10 text-base-content/50">No schools found</td></tr>
          {:else}
            {#each schools as school}
              <tr class="hover">
                <td>
                  <p class="font-medium">{school.name}</p>
                  <p class="text-xs text-base-content/50">{school.school_id_number} · {school.email}</p>
                </td>
                <td class="text-sm text-base-content/70">{school.division?.name || '—'}</td>
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
                  <button class="btn btn-ghost btn-xs gap-1 {school.has_account ? '' : 'text-warning'}" onclick={() => accountDialog?.open(school.school_id, school.name)} title="Account and personnel history">
                    <span class="h-2 w-2 rounded-full {school.has_account ? 'bg-success' : 'bg-warning'}"></span>
                    {school.has_account ? 'Active' : 'None'}
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
  <div class="modal-box w-full max-w-lg">
    <h3 class="font-bold text-lg mb-4">Add New School</h3>
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
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="c-scontact"><span class="label-text text-xs">Contact Number *</span></label>
          <input id="c-scontact" type="text" class="input input-bordered input-sm" class:input-error={fe('contact_number')} bind:value={form.contact_number} required />
          {#if fe('contact_number')}<p class="text-xs text-error mt-1">{fe('contact_number')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-sdiv"><span class="label-text text-xs">Division</span></label>
          <select id="c-sdiv" class="select select-bordered select-sm" bind:value={form.division_id}>
            <option value="">— Unassigned —</option>
            {#each divisions as d}
              <option value={String(d.division_id)}>{d.name}</option>
            {/each}
          </select>
        </div>
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
  <div class="modal-box w-full max-w-lg">
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
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="e-scontact"><span class="label-text text-xs">Contact Number *</span></label>
          <input id="e-scontact" type="text" class="input input-bordered input-sm" bind:value={form.contact_number} required />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-sdiv"><span class="label-text text-xs">Division</span></label>
          <select id="e-sdiv" class="select select-bordered select-sm" bind:value={form.division_id}>
            <option value="">— Unassigned —</option>
            {#each divisions as d}
              <option value={String(d.division_id)}>{d.name}</option>
            {/each}
          </select>
        </div>
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

<!-- ── Create school accounts ── -->
<dialog bind:this={provisionModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-md">
    <h3 class="font-bold text-lg">Create school accounts</h3>
    <p class="py-3 text-sm text-base-content/70">
      Every active school that doesn't have an account yet gets one shared <strong>Learner Right Protection Focal Person</strong> account,
      used to file its monthly incident report. Each school is emailed its username and a temporary password, and must change it on first sign-in.
      Schools that already have an account are skipped.
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => provisionModal?.close()}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={provisioning} onclick={() => provisionAccounts()}>
        {#if provisioning}<span class="loading loading-spinner loading-xs"></span>{/if}Create accounts
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<SchoolAccountDialog bind:this={accountDialog} canEdit onprovision={(sch) => provisionAccounts({ school_id: sch.school_id })} />
<SchoolCredentialsDialog bind:this={credentialsDialog} accounts={newAccounts} />
