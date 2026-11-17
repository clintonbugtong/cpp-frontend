<script>
  // A school's personal accounts (School Head, Guidance Counselor / Designate)
  // and their history, in a dialog.
  // Open with: <SchoolAccountDialog bind:this={dlg} …/> then dlg.open(schoolId, name)
  import { schoolReportsService } from '$lib/api/school-reports.js';
  import SchoolAccountsPanel from '$lib/components/SchoolAccountsPanel.svelte';

  /** @type {{ onchange?: () => void }} */
  let { onchange } = $props();

  /** @type {HTMLDialogElement|null} */
  let dialog = $state(null);
  /** @type {any} */
  let data = $state(null);
  let loading = $state(false);
  let error = $state('');
  let schoolName = $state('');

  /** @param {any} id @param {string} name */
  export async function open(id, name) {
    schoolName = name; data = null; error = '';
    dialog?.showModal();
    loading = true;
    const res = await schoolReportsService.getAccounts(id);
    loading = false;
    if (res.success) data = res.data; else error = res.error || 'Could not load.';
  }

  /** @param {any} updated */
  function changed(updated) {
    data = { ...data, ...updated };
    onchange?.();
  }
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-xl">
    <h3 class="font-bold text-lg leading-snug">{schoolName}</h3>
    {#if error}<div class="alert alert-error text-sm mt-3"><span>{error}</span></div>{/if}

    {#if loading && !data}
      <div class="py-10 text-center"><span class="loading loading-spinner"></span></div>
    {:else if data}
      <div class="mt-3"><SchoolAccountsPanel {data} onchange={changed} /></div>
    {/if}

    <div class="modal-action"><button class="btn btn-sm" onclick={() => dialog?.close()}>Close</button></div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
