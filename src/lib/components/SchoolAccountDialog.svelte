<script>
  // A school's shared account + the history of people who handled it.
  // Open with: <SchoolAccountDialog bind:this={dlg} …/> then dlg.open(schoolId, name)
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import PersonnelHistory from '$lib/components/PersonnelHistory.svelte';

  /** @type {{ canEdit?: boolean, onprovision?: (school: {school_id: any, name: string}) => void }} */
  let { canEdit = false, onprovision } = $props();

  /** @type {HTMLDialogElement|null} */
  let dialog = $state(null);
  /** @type {any} */
  let data = $state(null);
  let loading = $state(false);
  let error = $state('');
  /** @type {any} */
  let schoolId = $state(null);
  let schoolName = $state('');

  /** @param {any} id @param {string} name */
  export async function open(id, name) {
    schoolId = id; schoolName = name; data = null; error = '';
    dialog?.showModal();
    await refresh();
  }

  async function refresh() {
    loading = true;
    const res = await schoolReportsService.getPersonnel(schoolId);
    loading = false;
    if (res.success) data = res.data; else error = res.error || 'Could not load.';
  }

  /** @param {string} iso */
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg leading-snug">{schoolName}</h3>
    {#if error}<div class="alert alert-error text-sm mt-3"><span>{error}</span></div>{/if}

    {#if loading && !data}
      <div class="py-10 text-center"><span class="loading loading-spinner"></span></div>
    {:else if data}
      <div class="mt-3 rounded-lg border p-3 text-sm {data.account ? 'border-base-200 bg-base-200/30' : 'border-warning/40 bg-warning/10'}">
        {#if data.account}
          <p class="text-xs text-base-content/60">Shared school account</p>
          <p class="font-mono font-medium">{data.account.username}
            <span class="badge badge-sm ml-1 {data.account.is_active ? 'badge-success' : 'badge-ghost'}">{data.account.is_active ? 'Active' : 'Disabled'}</span></p>
          <p class="text-xs text-base-content/60 mt-0.5">Last sign-in: {fmt(data.account.last_login_at)}</p>
        {:else}
          <p class="font-medium">No account yet</p>
          <p class="text-xs text-base-content/70">This school can't file monthly reports until its account is created.</p>
          {#if onprovision}
            <button class="btn btn-primary btn-xs mt-2" onclick={() => { dialog?.close(); onprovision({ school_id: schoolId, name: schoolName }); }}>Create account</button>
          {/if}
        {/if}
      </div>

      <div class="mt-4">
        <PersonnelHistory {schoolId} personnel={data.personnel} canEdit={canEdit && !!data.account} onchange={refresh} />
      </div>
    {/if}

    <div class="modal-action"><button class="btn btn-sm" onclick={() => dialog?.close()}>Close</button></div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
