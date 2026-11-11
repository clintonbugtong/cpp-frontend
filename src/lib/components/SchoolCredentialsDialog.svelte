<script>
  // Shows newly created school account credentials exactly once. The
  // temporary passwords aren't stored anywhere readable — if this is closed
  // without saving them, the school uses "Forgot password" or an admin resets it.
  /** @type {{ accounts: any[] }} */
  let { accounts = [] } = $props();

  /** @type {HTMLDialogElement|null} */
  let dialog = $state(null);
  let copied = $state(false);

  export function open() {
    copied = false;
    dialog?.showModal();
  }

  async function copyAll() {
    const text = accounts.map((a) => `${a.school_name}\tUsername: ${a.username}\tTemporary password: ${a.temporary_password}`).join('\n');
    try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = false; }
  }

  function downloadCsv() {
    /** @param {string} v */
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['School', 'Username', 'Temporary password', 'Emailed to school'], ...accounts.map((a) => [a.school_name, a.username, a.temporary_password, a.emailed ? 'yes' : 'no'])];
    const blob = new Blob([rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href; link.download = 'school-accounts.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  }
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-2xl">
    <h3 class="font-bold text-lg">{accounts.length} school account{accounts.length === 1 ? '' : 's'} created</h3>
    <div class="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <strong>These temporary passwords are shown only once.</strong> They were also emailed to each school's address where one is on file.
      Each school must set its own password on first sign-in.
    </div>

    <div class="mt-3 max-h-80 overflow-y-auto rounded-lg border border-base-200">
      <table class="table table-sm">
        <thead class="sticky top-0 bg-base-100"><tr><th>School</th><th>Username</th><th>Temporary password</th><th class="text-center">Emailed</th></tr></thead>
        <tbody>
          {#each accounts as a}
            <tr>
              <td class="min-w-40">{a.school_name}</td>
              <td class="font-mono text-xs">{a.username}</td>
              <td class="font-mono text-xs select-all">{a.temporary_password}</td>
              <td class="text-center">{a.emailed ? '✓' : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="modal-action flex-wrap">
      <button class="btn btn-outline btn-sm" onclick={copyAll}>{copied ? 'Copied ✓' : 'Copy all'}</button>
      <button class="btn btn-outline btn-sm" onclick={downloadCsv}>Download CSV</button>
      <button class="btn btn-primary btn-sm" onclick={() => dialog?.close()}>I've saved them</button>
    </div>
  </div>
</dialog>
