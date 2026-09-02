<script>
  import { usersService } from '$lib/api/users.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { api } from '$lib/api/client.js';
  import { onMount } from 'svelte';

  // List state
  /** @type {any[]} */
  let users = $state([]);
  let loading = $state(true);
  let listError = $state('');
  let searchQuery = $state('');
  let roleFilter = $state('');
  let statusFilter = $state('');
  let divisionFilter = $state('');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);
  // A regional-level LIS admin (no division_id) manages all divisions and can
  // filter by one; a division-level LIS admin is already scoped server-side.
  /** @type {any[]} */
  let divisions = $state([]);

  // Modal refs
  /** @type {HTMLDialogElement|null} */
  let createModal = $state(null);
  /** @type {HTMLDialogElement|null} */
  let editModal = $state(null);
  /** @type {HTMLDialogElement|null} */
  let deleteModal = $state(null);

  // Shared form state
  let formSubmitting = $state(false);
  let formError = $state('');
  /** @type {Record<string,string[]>} */
  let formErrors = $state({});
  /** @type {any} */
  let editingUser = $state(null);
  /** @type {any} */
  let deletingUser = $state(null);

  // --- Security modal (2FA / online status / remembered devices) ---
  /** @type {HTMLDialogElement|null} */
  let securityModal = $state(null);
  /** @type {any} */
  let securityUser = $state(null);
  /** @type {any[]} */
  let securityDevices = $state([]);
  let securityLoading = $state(false);
  let securityError = $state('');

  let form = $state(emptyForm());

  function emptyForm() {
    return {
      username: '', email: '', password: '', password_confirmation: '',
      first_name: '', middle_name: '', last_name: '',
      contact_number: '', position: '',
      roles: /** @type {string[]} */ ([]), school_id: '', is_active: true
    };
  }

  // ── School search-as-you-type — designates a Learner Right Protection Focal
  // Person as school-level (e.g. a guidance counselor) instead of the default
  // division-level. The backend only allows picking a school within this
  // admin's own division. Leave blank for a division-level account.
  let schoolQuery = $state('');
  /** @type {any[]} */
  let schoolResults = $state([]);
  let schoolSearching = $state(false);
  /** @type {any} */
  let selectedSchool = $state(null);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let schoolSearchTimeout;

  function onSchoolQueryInput() {
    selectedSchool = null;
    form.school_id = '';
    clearTimeout(schoolSearchTimeout);
    const q = schoolQuery.trim();
    if (q.length < 2) { schoolResults = []; return; }
    schoolSearchTimeout = setTimeout(async () => {
      schoolSearching = true;
      try {
        const res = await api.get('/search/schools/quick', { q, per_page: 10 });
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
    form.school_id = String(school.school_id);
    schoolQuery = school.name;
    schoolResults = [];
  }

  function clearSchool() {
    selectedSchool = null;
    form.school_id = '';
    schoolQuery = '';
    schoolResults = [];
  }

  // A Division User Administrator cannot assign Super Admin — only roles
  // scoped to their own division.
  const ROLE_OPTIONS = [
    { slug: 'division-user-admin', name: 'Division User Administrator' },
    { slug: 'learner-rights-focal-person', name: 'Learner Right Protection Focal Person' }
  ];

  onMount(async () => {
    if (authState.isRegionalLevel()) {
      try {
        const response = await api.get('/divisions/all');
        divisions = response.data || [];
      } catch (e) {
        divisions = [];
      }
    }
    await loadUsers();
  });

  async function loadUsers() {
    loading = true;
    listError = '';
    /** @type {Record<string,any>} */
    const params = { page: currentPage, per_page: 15 };
    if (searchQuery) params.search = searchQuery;
    if (roleFilter) params.role = roleFilter;
    if (statusFilter !== '') params.is_active = statusFilter;
    if (divisionFilter) params.division_id = divisionFilter;

    const result = await usersService.getUsers(params);
    if (result.success) {
      users = result.data?.data || [];
      totalPages = result.data?.last_page || 1;
      total = result.data?.total || 0;
    } else {
      listError = result.error || 'Failed to load users';
    }
    loading = false;
  }

  function handleSearch() {
    currentPage = 1;
    loadUsers();
  }

  /** @param {number} p */
  function changePage(p) {
    currentPage = p;
    loadUsers();
  }

  // --- Create ---
  function openCreate() {
    form = emptyForm();
    formError = '';
    formErrors = {};
    clearSchool();
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
      username: form.username,
      email: form.email,
      password: form.password,
      password_confirmation: form.password_confirmation,
      first_name: form.first_name,
      last_name: form.last_name,
      contact_number: form.contact_number,
      position: form.position,
      roles: form.roles,
      is_active: form.is_active
      // division_id is auto-set by the backend to the LISA's division —
      // unless school_id is set below, which is school-level instead.
    };
    if (form.middle_name) data.middle_name = form.middle_name;
    if (form.school_id) data.school_id = parseInt(form.school_id);

    const result = await usersService.createUser(data);
    if (result.success) {
      createModal?.close();
      await loadUsers();
    } else {
      formError = result.error || 'Failed to create user';
      formErrors = result.validationErrors || {};
    }
    formSubmitting = false;
  }

  // Tracks the school_id this user had when the edit modal opened, so
  // handleEdit() can tell "cleared an existing school" apart from "never
  // touched school" — only the former should re-anchor them to this
  // division-user-admin's own division instead of leaving division_id alone.
  let originalSchoolId = $state('');

  // --- Edit ---
  /** @param {any} user */
  async function openEdit(user) {
    formError = '';
    formErrors = {};
    const result = await usersService.getUser(user.id);
    const detail = result.success ? (result.data?.user || result.data) : user;
    editingUser = detail;
    originalSchoolId = detail.school_id ? String(detail.school_id) : '';
    form = {
      username: detail.username || '',
      email: detail.email || '',
      password: '',
      password_confirmation: '',
      first_name: detail.first_name || '',
      middle_name: detail.middle_name || '',
      last_name: detail.last_name || '',
      contact_number: detail.contact_number || '',
      position: detail.position || '',
      roles: (detail.roles || []).map((/** @type {any} */ r) => typeof r === 'string' ? r : r.slug),
      school_id: detail.school_id ? String(detail.school_id) : '',
      is_active: detail.is_active ?? true
    };
    if (detail.school) {
      selectedSchool = { school_id: detail.school.id, name: detail.school.name };
      schoolQuery = detail.school.name;
      schoolResults = [];
    } else {
      clearSchool();
    }
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
      username: form.username,
      email: form.email,
      first_name: form.first_name,
      last_name: form.last_name,
      contact_number: form.contact_number,
      position: form.position,
      roles: form.roles,
      is_active: form.is_active,
      // Always sent explicitly so clearing it (back to division-level) reaches
      // the backend instead of being silently omitted.
      school_id: form.school_id ? parseInt(form.school_id) : null
    };
    // Only re-anchor to this admin's own division when an existing school
    // assignment was just cleared — otherwise leave division_id untouched so
    // an unrelated edit (e.g. just the phone number) can't silently re-scope
    // a user who was never school-level to begin with.
    if (originalSchoolId && !form.school_id) {
      data.division_id = authState.user?.division?.id ?? null;
    }
    if (form.middle_name !== undefined) data.middle_name = form.middle_name;
    if (form.password) {
      data.password = form.password;
      data.password_confirmation = form.password_confirmation;
    }

    const result = await usersService.updateUser(editingUser.id, data);
    if (result.success) {
      editModal?.close();
      await loadUsers();
    } else {
      formError = result.error || 'Failed to update user';
      formErrors = result.validationErrors || {};
    }
    formSubmitting = false;
  }

  // --- Delete ---
  /** @param {any} user */
  function openDelete(user) {
    deletingUser = user;
    deleteModal?.showModal();
  }

  async function handleDelete() {
    if (!deletingUser) return;
    const result = await usersService.deleteUser(deletingUser.id);
    if (result.success) {
      deleteModal?.close();
      await loadUsers();
    } else {
      listError = result.error || 'Failed to delete user';
    }
  }

  /** @param {any} user */
  async function toggleActive(user) {
    const fn = user.is_active
      ? usersService.deactivateUser.bind(usersService)
      : usersService.activateUser.bind(usersService);
    const result = await fn(user.id);
    if (result.success) await loadUsers();
    else listError = result.error;
  }

  // --- Security (2FA / online / remembered devices) ---
  /** @param {any} user */
  async function openSecurity(user) {
    securityUser = user;
    securityError = '';
    securityDevices = [];
    securityModal?.showModal();
    await loadSecurityDevices();
  }

  async function loadSecurityDevices() {
    if (!securityUser) return;
    securityLoading = true;
    const result = await usersService.getTrustedDevices(securityUser.id);
    if (result.success) {
      securityDevices = result.data;
    } else {
      securityError = result.error || 'Failed to load remembered devices';
    }
    securityLoading = false;
  }

  /** @param {number} deviceId */
  async function revokeDevice(deviceId) {
    const result = await usersService.revokeTrustedDevice(securityUser.id, deviceId);
    if (result.success) await loadSecurityDevices();
    else securityError = result.error || 'Failed to revoke device';
  }

  async function revokeAllDevices() {
    const result = await usersService.revokeAllTrustedDevices(securityUser.id);
    if (result.success) await loadSecurityDevices();
    else securityError = result.error || 'Failed to revoke devices';
  }

  /** @param {string} slug */
  function toggleRole(slug) {
    const idx = form.roles.indexOf(slug);
    if (idx >= 0) form.roles = form.roles.filter(r => r !== slug);
    else form.roles = [...form.roles, slug];
  }

  /** @param {any} user */
  function getInitials(user) {
    return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
  }

  /** @param {any} role */
  function getRoleBadge(role) {
    const name = typeof role === 'string' ? role : role.name;
    if (name?.includes('Division')) return 'badge-warning';
    if (name?.includes('Learner')) return 'badge-success';
    return 'badge-ghost';
  }

  /** @param {any} role */
  function getRoleName(role) {
    return typeof role === 'string' ? role : role.name;
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
      <h1 class="text-2xl font-bold">User Management</h1>
      <p class="text-base-content/50 mt-1">
        {#if authState.isRegionalLevel()}
          Manage users across all divisions · {total} user{total !== 1 ? 's' : ''}
        {:else}
          Manage users for {authState.user?.division?.name || 'your division'} · {total} user{total !== 1 ? 's' : ''}
        {/if}
      </p>
    </div>
    <button onclick={openCreate} class="btn btn-primary">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
      </svg>
      Add User
    </button>
  </div>

  {#if !authState.isRegionalLevel()}
    <div class="alert alert-info text-sm">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
      </svg>
      <span>You can only manage users within your Schools Division Office. New users will be automatically assigned to your division.</span>
    </div>
  {/if}

  <!-- Filters -->
  <div class="flex flex-col sm:flex-row gap-3">
    <input
      type="text"
      placeholder="Search by username..."
      class="input input-bordered flex-1"
      bind:value={searchQuery}
      oninput={handleSearch}
    />
    <select class="select select-bordered w-full sm:w-56" bind:value={roleFilter} onchange={handleSearch}>
      <option value="">All Roles</option>
      {#each ROLE_OPTIONS as r}
        <option value={r.slug}>{r.name}</option>
      {/each}
    </select>
    <select class="select select-bordered w-full sm:w-40" bind:value={statusFilter} onchange={handleSearch}>
      <option value="">All Status</option>
      <option value="true">Active</option>
      <option value="false">Inactive</option>
    </select>
    {#if authState.isRegionalLevel() && divisions.length}
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

  <!-- Table -->
  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Roles</th>
            {#if authState.isRegionalLevel()}<th>Division / School</th>{/if}
            <th>Position</th>
            <th>Status</th>
            <th>Security</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan={authState.isRegionalLevel() ? 7 : 6} class="text-center py-10"><span class="loading loading-spinner"></span></td></tr>
          {:else if users.length === 0}
            <tr><td colspan={authState.isRegionalLevel() ? 7 : 6} class="text-center py-10 text-base-content/50">No users found</td></tr>
          {:else}
            {#each users as user}
              <tr class="hover">
                <td>
                  <div class="flex items-center gap-3">
                    <div class="avatar placeholder">
                      <div class="w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <span class="text-xs font-bold leading-none">{getInitials(user)}</span>
                      </div>
                    </div>
                    <div>
                      <p class="font-medium">{user.full_name}</p>
                      <p class="text-xs text-base-content/50">{user.username} · {user.email}</p>
                    </div>
                  </div>
                </td>
                <td class="max-w-[220px]">
                  <div class="flex flex-wrap gap-1">
                    {#each (user.roles || []) as role}
                      <span class="badge badge-sm {getRoleBadge(role)} h-auto whitespace-normal break-words text-center leading-tight py-1">{getRoleName(role)}</span>
                    {/each}
                  </div>
                </td>
                {#if authState.isRegionalLevel()}
                  <td class="text-sm">
                    {#if user.school}
                      <span class="text-base-content/70">{user.school.name}</span>
                      <span class="badge badge-ghost badge-xs align-middle ml-1">School</span>
                    {:else if user.division}
                      <span class="text-base-content/70">{user.division.name}</span>
                    {:else}
                      <span class="badge badge-ghost badge-sm">Regional</span>
                    {/if}
                  </td>
                {/if}
                <td class="text-sm text-base-content/70">{user.position || '—'}</td>
                <td>
                  <span class="badge badge-sm {user.is_active ? 'badge-success' : 'badge-error'}">
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td class="max-w-[140px]">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="badge badge-sm {user.two_factor_enabled ? 'badge-info' : 'badge-ghost'} h-auto whitespace-normal break-words text-center leading-tight py-1" title="Two-factor authentication">
                      {user.two_factor_enabled ? '2FA On' : '2FA Off'}
                    </span>
                    <span class="inline-flex items-center gap-1 text-xs" title={user.is_online ? 'Has an active session' : 'No active session'}>
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 {user.is_online ? 'bg-success' : 'bg-base-300'}"></span>
                      {user.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="flex flex-wrap items-center gap-1">
                    <button class="btn btn-outline btn-xs" onclick={() => openSecurity(user)}>Security</button>
                    <button class="btn btn-outline btn-xs" onclick={() => openEdit(user)}>Edit</button>
                    <button
                      class="btn btn-outline btn-xs {user.is_active ? 'btn-warning' : 'btn-success'}"
                      onclick={() => toggleActive(user)}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-outline btn-error btn-xs" onclick={() => openDelete(user)}>Delete</button>
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

<!-- ── Create User Modal ── -->
<dialog bind:this={createModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-2xl">
    <h3 class="font-bold text-lg mb-4">Add New User</h3>

    {#if formError}
      <div class="alert alert-error mb-4 text-sm"><span>{formError}</span></div>
    {/if}

    <form onsubmit={handleCreate} class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="form-control">
          <label class="label py-1" for="c-first"><span class="label-text text-xs">First Name *</span></label>
          <input id="c-first" type="text" class="input input-bordered input-sm" class:input-error={fe('first_name')} bind:value={form.first_name} required />
          {#if fe('first_name')}<p class="text-xs text-error mt-1">{fe('first_name')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-mid"><span class="label-text text-xs">Middle Name</span></label>
          <input id="c-mid" type="text" class="input input-bordered input-sm" bind:value={form.middle_name} />
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-last"><span class="label-text text-xs">Last Name *</span></label>
          <input id="c-last" type="text" class="input input-bordered input-sm" class:input-error={fe('last_name')} bind:value={form.last_name} required />
          {#if fe('last_name')}<p class="text-xs text-error mt-1">{fe('last_name')}</p>{/if}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="c-user"><span class="label-text text-xs">Username *</span></label>
          <input id="c-user" type="text" class="input input-bordered input-sm" class:input-error={fe('username')} bind:value={form.username} required autocomplete="off" />
          {#if fe('username')}<p class="text-xs text-error mt-1">{fe('username')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-email"><span class="label-text text-xs">Email *</span></label>
          <input id="c-email" type="email" class="input input-bordered input-sm" class:input-error={fe('email')} bind:value={form.email} required />
          {#if fe('email')}<p class="text-xs text-error mt-1">{fe('email')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-pass"><span class="label-text text-xs">Password *</span></label>
          <input id="c-pass" type="password" class="input input-bordered input-sm" class:input-error={fe('password')} bind:value={form.password} required autocomplete="new-password" />
          {#if fe('password')}<p class="text-xs text-error mt-1">{fe('password')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-pass2"><span class="label-text text-xs">Confirm Password *</span></label>
          <input id="c-pass2" type="password" class="input input-bordered input-sm" bind:value={form.password_confirmation} required autocomplete="new-password" />
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-pos"><span class="label-text text-xs">Position *</span></label>
          <input id="c-pos" type="text" class="input input-bordered input-sm" class:input-error={fe('position')} bind:value={form.position} required />
          {#if fe('position')}<p class="text-xs text-error mt-1">{fe('position')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="c-contact"><span class="label-text text-xs">Contact Number *</span></label>
          <input id="c-contact" type="text" class="input input-bordered input-sm" class:input-error={fe('contact_number')} bind:value={form.contact_number} required />
          {#if fe('contact_number')}<p class="text-xs text-error mt-1">{fe('contact_number')}</p>{/if}
        </div>
      </div>

      <div class="form-control relative">
        <label class="label py-1" for="c-school"><span class="label-text text-xs">School (optional — for a school-level Focal Person)</span></label>
        <input
          id="c-school" type="text" class="input input-bordered input-sm"
          placeholder="Type to search schools in your division…" autocomplete="off"
          bind:value={schoolQuery} oninput={onSchoolQueryInput}
        />
        {#if schoolSearching}
          <span class="text-xs text-base-content/50 mt-1">Searching…</span>
        {/if}
        {#if schoolResults.length}
          <ul class="absolute z-10 top-full mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
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
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-success">Selected: {selectedSchool.name}</span>
            <button type="button" class="text-xs text-base-content/40 hover:text-base-content/70 underline" onclick={clearSchool}>clear</button>
          </div>
        {:else}
          <p class="text-xs text-base-content/40 mt-1">Leave blank for a division-level account (the default).</p>
        {/if}
      </div>

      <div class="form-control">
        <span class="label-text text-xs font-medium">Roles *</span>
        <div class="flex flex-wrap gap-2 mt-2">
          {#each ROLE_OPTIONS as r}
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
                checked={form.roles.includes(r.slug)}
                onchange={() => toggleRole(r.slug)}
              />
              <span class="text-sm">{r.name}</span>
            </label>
          {/each}
        </div>
        {#if fe('roles')}<p class="text-xs text-error mt-1">{fe('roles')}</p>{/if}
      </div>

      <div class="flex items-center gap-2">
        <input type="checkbox" id="c-active" class="toggle toggle-sm toggle-success" bind:checked={form.is_active} />
        <label for="c-active" class="text-sm">Active</label>
      </div>

      <div class="modal-action mt-4">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => createModal?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={formSubmitting}>
          {#if formSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
          Create User
        </button>
      </div>
    </form>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Edit User Modal ── -->
<dialog bind:this={editModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-2xl">
    <h3 class="font-bold text-lg mb-4">Edit User</h3>

    {#if formError}
      <div class="alert alert-error mb-4 text-sm"><span>{formError}</span></div>
    {/if}

    <form onsubmit={handleEdit} class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="form-control">
          <label class="label py-1" for="e-first"><span class="label-text text-xs">First Name *</span></label>
          <input id="e-first" type="text" class="input input-bordered input-sm" class:input-error={fe('first_name')} bind:value={form.first_name} required />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-mid"><span class="label-text text-xs">Middle Name</span></label>
          <input id="e-mid" type="text" class="input input-bordered input-sm" bind:value={form.middle_name} />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-last"><span class="label-text text-xs">Last Name *</span></label>
          <input id="e-last" type="text" class="input input-bordered input-sm" bind:value={form.last_name} required />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="e-user"><span class="label-text text-xs">Username *</span></label>
          <input id="e-user" type="text" class="input input-bordered input-sm" bind:value={form.username} required />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-email"><span class="label-text text-xs">Email *</span></label>
          <input id="e-email" type="email" class="input input-bordered input-sm" bind:value={form.email} required />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-pass"><span class="label-text text-xs">New Password</span></label>
          <input id="e-pass" type="password" class="input input-bordered input-sm" class:input-error={fe('password')} bind:value={form.password} autocomplete="new-password" placeholder="Leave blank to keep current" />
          {#if fe('password')}<p class="text-xs text-error mt-1">{fe('password')}</p>{/if}
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-pass2"><span class="label-text text-xs">Confirm New Password</span></label>
          <input id="e-pass2" type="password" class="input input-bordered input-sm" bind:value={form.password_confirmation} autocomplete="new-password" />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-pos"><span class="label-text text-xs">Position *</span></label>
          <input id="e-pos" type="text" class="input input-bordered input-sm" bind:value={form.position} required />
        </div>
        <div class="form-control">
          <label class="label py-1" for="e-contact"><span class="label-text text-xs">Contact Number *</span></label>
          <input id="e-contact" type="text" class="input input-bordered input-sm" bind:value={form.contact_number} required />
        </div>
      </div>

      <div class="form-control relative">
        <label class="label py-1" for="e-school"><span class="label-text text-xs">School (optional — for a school-level Focal Person)</span></label>
        <input
          id="e-school" type="text" class="input input-bordered input-sm"
          placeholder="Type to search schools in your division…" autocomplete="off"
          bind:value={schoolQuery} oninput={onSchoolQueryInput}
        />
        {#if schoolSearching}
          <span class="text-xs text-base-content/50 mt-1">Searching…</span>
        {/if}
        {#if schoolResults.length}
          <ul class="absolute z-10 top-full mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
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
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-success">Selected: {selectedSchool.name}</span>
            <button type="button" class="text-xs text-base-content/40 hover:text-base-content/70 underline" onclick={clearSchool}>clear</button>
          </div>
        {:else}
          <p class="text-xs text-base-content/40 mt-1">Leave blank for a division-level account (the default).</p>
        {/if}
      </div>

      <div class="form-control">
        <span class="label-text text-xs font-medium">Roles *</span>
        <div class="flex flex-wrap gap-2 mt-2">
          {#each ROLE_OPTIONS as r}
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
                checked={form.roles.includes(r.slug)}
                onchange={() => toggleRole(r.slug)}
              />
              <span class="text-sm">{r.name}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <input type="checkbox" id="e-active" class="toggle toggle-sm toggle-success" bind:checked={form.is_active} />
        <label for="e-active" class="text-sm">Active</label>
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
    <h3 class="font-bold text-lg">Delete User</h3>
    <p class="py-4 text-base-content/70">
      Are you sure you want to delete <strong>{deletingUser?.full_name}</strong>?
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => deleteModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" onclick={handleDelete}>Delete</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- ── Security Modal (2FA / online status / remembered devices) ── -->
<dialog bind:this={securityModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box w-full max-w-lg">
    <h3 class="font-bold text-lg">Security — {securityUser?.full_name}</h3>

    <div class="flex items-center gap-3 mt-3">
      <span class="badge {securityUser?.two_factor_enabled ? 'badge-info' : 'badge-ghost'}">
        {securityUser?.two_factor_enabled ? 'Two-Factor Enabled' : 'Two-Factor Disabled'}
      </span>
      <span class="inline-flex items-center gap-1.5 text-sm">
        <span class="w-2 h-2 rounded-full {securityUser?.is_online ? 'bg-success' : 'bg-base-300'}"></span>
        {securityUser?.is_online ? 'Currently logged in' : 'Not currently logged in'}
      </span>
    </div>

    {#if securityError}
      <div class="alert alert-error mt-3 text-sm"><span>{securityError}</span></div>
    {/if}

    <div class="mt-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium">Remembered Devices</span>
        {#if securityDevices.some((d) => d.is_valid)}
          <button class="btn btn-ghost btn-xs text-error" onclick={revokeAllDevices}>Revoke All</button>
        {/if}
      </div>

      {#if securityLoading}
        <div class="text-center py-6"><span class="loading loading-spinner loading-sm"></span></div>
      {:else if securityDevices.length === 0}
        <p class="text-sm text-base-content/50 py-4 text-center">No remembered devices for this account.</p>
      {:else}
        <ul class="space-y-2">
          {#each securityDevices as device}
            <li class="flex items-center justify-between border border-base-200 rounded-lg px-3 py-2">
              <div class="text-sm">
                <p>{device.device_info || 'Unknown device'} <span class="text-base-content/50">· {device.ip_address}</span></p>
                <p class="text-xs text-base-content/50">
                  {#if device.revoked_at}
                    Revoked {new Date(device.revoked_at).toLocaleString()}
                  {:else if device.is_valid}
                    Remembered until {new Date(device.expires_at).toLocaleDateString()}
                  {:else}
                    Expired {new Date(device.expires_at).toLocaleDateString()}
                  {/if}
                </p>
              </div>
              {#if device.is_valid}
                <button class="btn btn-ghost btn-xs text-error" onclick={() => revokeDevice(device.id)}>Revoke</button>
              {:else}
                <span class="badge badge-ghost badge-sm">Inactive</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => securityModal?.close()}>Close</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
