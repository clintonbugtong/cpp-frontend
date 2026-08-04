<script>
  import { auditLogsService } from '$lib/api/audit-logs.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { onMount } from 'svelte';

  let logs = $state(/** @type {any[]} */ ([]));
  let loading = $state(true);
  let error = $state('');

  let currentPage = $state(1);
  let totalPages = $state(1);
  let total = $state(0);
  let perPage = $state(20);

  let filterAction = $state('');
  let filterDateFrom = $state('');
  let filterDateTo = $state('');
  let filterSearch = $state('');

  let searchTimeout = /** @type {any} */ (null);

  const ACTION_OPTIONS = /** @type {{ value: string, label: string }[]} */ ([
    { value: 'user_login',            label: 'Login' },
    { value: 'user_logout',           label: 'Logout' },
    { value: 'user_created',          label: 'User Created' },
    { value: 'user_updated',          label: 'User Updated' },
    { value: 'user_deleted',          label: 'User Deleted' },
    { value: 'user_restored',         label: 'User Restored' },
    { value: 'admin_case_created',    label: 'Case Created' },
    { value: 'admin_case_updated',    label: 'Case Updated' },
    { value: 'admin_case_deleted',    label: 'Case Deleted' },
    { value: 'complainant_created',   label: 'Complainant Created' },
    { value: 'complainant_updated',   label: 'Complainant Updated' },
    { value: 'complainant_deleted',   label: 'Complainant Deleted' },
    { value: 'respondent_created',    label: 'Respondent Created' },
    { value: 'respondent_updated',    label: 'Respondent Updated' },
    { value: 'respondent_deleted',    label: 'Respondent Deleted' },
    { value: 'document_uploaded',     label: 'Document Uploaded' },
    { value: 'document_updated',      label: 'Document Updated' },
    { value: 'document_deleted',      label: 'Document Deleted' },
    { value: 'certificate_issued',    label: 'Certificate Issued' },
    { value: 'certificate_revoked',   label: 'Certificate Revoked' },
  ]);

  const MODEL_LABELS = /** @type {Record<string,string>} */ ({
    'AdminCase': 'Admin Case',
    'User': 'User',
    'Complainant': 'Complainant',
    'Respondent': 'Respondent',
    'Charge': 'Charge',
    'Document': 'Document',
    'StatusAction': 'Status Action',
    'ChildCase': 'Child Protection Case',
    'TitlingApplication': 'Site Titling Application'
  });

  onMount(() => { loadLogs(); });

  async function loadLogs() {
    loading = true;
    error = '';

    /** @type {Record<string,any>} */
    const params = { page: currentPage, per_page: perPage };
    if (filterAction) params.action = filterAction;
    if (filterDateFrom) params.date_from = filterDateFrom;
    if (filterDateTo) params.date_to = filterDateTo;
    if (filterSearch) params.search = filterSearch;

    const result = await auditLogsService.getLogs(params);
    if (result.success) {
      const d = result.data;
      logs = d?.data ?? (Array.isArray(d) ? d : []);
      currentPage = d?.current_page ?? 1;
      totalPages = d?.last_page ?? Math.ceil((d?.total ?? 0) / perPage);
      total = d?.total ?? logs.length;
    } else {
      error = result.error || 'Failed to load audit logs';
    }
    loading = false;
  }

  function applyFilters() {
    currentPage = 1;
    loadLogs();
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 400);
  }

  /** @param {number} n */
  function goPage(n) {
    currentPage = n;
    loadLogs();
  }

  /** @param {string} modelType */
  function formatModel(modelType) {
    if (!modelType) return '—';
    const parts = modelType.split(/[\\\/]/);
    const raw = parts[parts.length - 1];
    return MODEL_LABELS[raw] ?? raw;
  }

  /** @param {string} action */
  function actionBadge(action) {
    if (!action) return 'badge-ghost';
    if (action.includes('login'))   return 'badge-primary';
    if (action.includes('logout'))  return 'badge-ghost';
    if (action.includes('restored')) return 'badge-warning';
    if (action.includes('created') || action.includes('issued') || action.includes('uploaded')) return 'badge-success';
    if (action.includes('updated') || action.includes('activated') || action.includes('deactivated')) return 'badge-info';
    if (action.includes('deleted') || action.includes('revoked')) return 'badge-error';
    return 'badge-ghost';
  }

  /** @param {string|null|undefined} dt */
  function formatDate(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
    <div>
      <h1 class="text-2xl font-bold">Audit Logs</h1>
      <p class="text-base-content/50 mt-1">
        Activity logs for {(/** @type {any} */ (authState.user))?.division?.name ?? 'your division'}
      </p>
    </div>
    {#if !loading}
      <span class="text-sm text-base-content/50">{total.toLocaleString()} record{total !== 1 ? 's' : ''}</span>
    {/if}
  </div>

  <!-- Filters -->
  <div class="card bg-base-100 shadow-sm border border-base-200">
    <div class="card-body p-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="form-control">
          <label class="label py-1" for="log-search"><span class="label-text text-xs">Search user / IP</span></label>
          <input
            id="log-search"
            type="text"
            class="input input-bordered input-sm"
            placeholder="Username or IP…"
            bind:value={filterSearch}
            oninput={onSearchInput}
          />
        </div>

        <div class="form-control">
          <label class="label py-1" for="log-action"><span class="label-text text-xs">Action</span></label>
          <select id="log-action" class="select select-bordered select-sm" bind:value={filterAction} onchange={applyFilters}>
            <option value="">All actions</option>
            {#each ACTION_OPTIONS as a}
              <option value={a.value}>{a.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-control">
          <label class="label py-1" for="log-date-from"><span class="label-text text-xs">Date from</span></label>
          <input id="log-date-from" type="date" class="input input-bordered input-sm" bind:value={filterDateFrom} onchange={applyFilters} />
        </div>

        <div class="form-control">
          <label class="label py-1" for="log-date-to"><span class="label-text text-xs">Date to</span></label>
          <input id="log-date-to" type="date" class="input input-bordered input-sm" bind:value={filterDateTo} onchange={applyFilters} />
        </div>
      </div>

      {#if filterAction || filterDateFrom || filterDateTo || filterSearch}
        <div class="flex justify-end mt-2">
          <button class="btn btn-ghost btn-xs" onclick={() => {
            filterAction = ''; filterDateFrom = '';
            filterDateTo = ''; filterSearch = ''; applyFilters();
          }}>Clear filters</button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Table -->
  <div class="card bg-base-100 shadow-sm border border-base-200 overflow-hidden">
    {#if loading}
      <div class="flex justify-center py-12">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else if error}
      <div class="p-6">
        <div class="alert alert-error">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>{error}</span>
        </div>
      </div>
    {:else if logs.length === 0}
      <div class="p-10 text-center text-base-content/50">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        No audit logs found.
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="text-xs text-base-content/50 uppercase tracking-wider">
              <th class="w-8">#</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th class="hidden md:table-cell">IP Address</th>
              <th>Date &amp; Time</th>
              <th class="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log (log.audit_log_id ?? log.id)}
              <tr class="hover">
                <td class="text-base-content/40 text-xs">{log.audit_log_id ?? log.id}</td>
                <td>
                  {#if log.user}
                    <div class="font-medium text-sm">{log.user.username ?? log.user.name ?? log.user.email}</div>
                    <div class="text-xs text-base-content/40">{log.user.email ?? ''}</div>
                  {:else}
                    <span class="text-base-content/40 text-xs">User #{log.user_id ?? '—'}</span>
                  {/if}
                </td>
                <td class="max-w-[180px]">
                  <span class="badge badge-sm {actionBadge(log.action)} h-auto whitespace-normal break-words text-center leading-tight py-1">{log.action ?? '—'}</span>
                </td>
                <td>
                  <div class="text-sm">{formatModel(log.model_type)}</div>
                  {#if log.model_id}
                    <div class="text-xs text-base-content/40">ID: {log.model_id}</div>
                  {/if}
                </td>
                <td class="hidden md:table-cell text-xs text-base-content/50">{log.ip_address ?? '—'}</td>
                <td class="text-xs text-base-content/60 whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td>
                  <div class="dropdown dropdown-end">
                    <button aria-label="View details" class="btn btn-outline btn-xs btn-square">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    </button>
                    <div class="dropdown-content z-10 card card-compact shadow-lg bg-base-100 border border-base-200 w-80 p-0">
                      <div class="card-body p-4 space-y-3">
                        <h3 class="font-semibold text-sm">Log Details</h3>
                        {#if log.old_values && Object.keys(log.old_values).length > 0}
                          <div>
                            <p class="text-xs font-medium text-base-content/50 uppercase mb-1">Before</p>
                            <pre class="text-xs bg-base-200 rounded p-2 overflow-auto max-h-32">{JSON.stringify(log.old_values, null, 2)}</pre>
                          </div>
                        {/if}
                        {#if log.new_values && Object.keys(log.new_values).length > 0}
                          <div>
                            <p class="text-xs font-medium text-base-content/50 uppercase mb-1">After</p>
                            <pre class="text-xs bg-base-200 rounded p-2 overflow-auto max-h-32">{JSON.stringify(log.new_values, null, 2)}</pre>
                          </div>
                        {/if}
                        {#if (!log.old_values || Object.keys(log.old_values).length === 0) && (!log.new_values || Object.keys(log.new_values).length === 0)}
                          <p class="text-xs text-base-content/40">No additional details.</p>
                        {/if}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex items-center justify-between px-4 py-3 border-t border-base-200">
          <span class="text-sm text-base-content/50">Page {currentPage} of {totalPages}</span>
          <div class="join">
            <button class="join-item btn btn-sm" disabled={currentPage <= 1} onclick={() => goPage(currentPage - 1)}>«</button>
            {#each Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const half = 2;
              let start = Math.max(1, currentPage - half);
              let end = Math.min(totalPages, start + 4);
              start = Math.max(1, end - 4);
              return start + i;
            }) as pg}
              <button class="join-item btn btn-sm" class:btn-active={pg === currentPage} onclick={() => goPage(pg)}>{pg}</button>
            {/each}
            <button class="join-item btn btn-sm" disabled={currentPage >= totalPages} onclick={() => goPage(currentPage + 1)}>»</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
