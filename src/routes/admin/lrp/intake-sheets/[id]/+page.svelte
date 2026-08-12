<script>
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { intakeSheetsService } from '$lib/api/intake-sheets.js';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { natureOfCaseLabel, statusLabel, statusBadgeClass } from '$lib/constants/intake-sheets.js';

  const id = page.params.id;

  let loading = $state(true);
  let error = $state('');
  /** @type {any} */
  let sheet = $state(null);

  /** @type {HTMLDialogElement|null} */
  let deleteModal = $state(null);
  let deleting = $state(false);
  let reviewing = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    const result = await intakeSheetsService.getIntakeSheet(id);
    if (result.success) {
      sheet = result.data;
    } else {
      error = result.error || 'Failed to load intake sheet';
    }
    loading = false;
  }

  async function handleDelete() {
    deleting = true;
    const result = await intakeSheetsService.deleteIntakeSheet(id);
    deleting = false;
    if (result.success) {
      goto('/admin/lrp/intake-sheets');
    } else {
      error = result.error || 'Failed to delete intake sheet';
      deleteModal?.close();
    }
  }

  async function toggleReview() {
    reviewing = true;
    const result = sheet.status === 'reviewed'
      ? await intakeSheetsService.unreviewIntakeSheet(id)
      : await intakeSheetsService.reviewIntakeSheet(id);
    if (result.success) sheet = result.data;
    else error = result.error || 'Failed to update review status';
    reviewing = false;
  }

  /** @param {any[]} persons @param {string} role */
  function personsByRole(persons, role) {
    return (persons || []).filter((p) => p.role === role);
  }
  /** @param {any} p */
  function fullName(p) {
    return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
  }

  const ROLE_LABELS = {
    'LEARNER-VICTIM': 'Learner-Victim',
    MOTHER: 'Mother',
    FATHER: 'Father',
    GUARDIAN: 'Guardian',
    COMPLAINANT: 'Complainant',
    'ALLEGED-OFFENDER': 'Alleged Offender'
  };
</script>

<div class="max-w-4xl mx-auto space-y-6">
  {#if loading}
    <div class="text-center py-16"><span class="loading loading-spinner loading-lg"></span></div>
  {:else if error && !sheet}
    <div class="alert alert-error"><span>{error}</span></div>
  {:else if sheet}
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Intake Sheet #{sheet.intake_sheet_id}</h1>
        <p class="text-base-content/50 mt-1">{sheet.school?.name} · {sheet.division?.name} · {new Date(sheet.date_of_intake).toLocaleDateString()}</p>
        <span class="badge badge-sm badge-ghost mt-2">
          {natureOfCaseLabel(sheet.nature_of_case)}{#if sheet.nature_of_case === 'OTHERS' && sheet.nature_of_case_other}: {sheet.nature_of_case_other}{/if}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge {statusBadgeClass(sheet.status)}">{statusLabel(sheet.status)}</span>
        {#if authState.canManageIntakeSheets()}
          {#if !sheet.is_draft}
            <button class="btn btn-outline btn-sm" disabled={reviewing} onclick={toggleReview}>
              {sheet.status === 'reviewed' ? 'Mark Unreviewed' : 'Mark Reviewed'}
            </button>
          {/if}
          <button class="btn btn-outline btn-sm" onclick={() => goto(`/admin/lrp/intake-sheets/${id}/edit`)}>
            {sheet.is_draft ? 'Continue Editing' : 'Edit'}
          </button>
          <button class="btn btn-outline btn-error btn-sm" onclick={() => deleteModal?.showModal()}>Delete</button>
        {/if}
      </div>
    </div>

    {#if sheet.is_draft && authState.canManageIntakeSheets()}
      <div class="alert bg-base-200/60 border border-base-300 text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
        </svg>
        <span>This intake sheet is still a draft — some sections may be incomplete. It won't show up as a reviewable case until it's finalized.</span>
      </div>
    {/if}

    {#if error}
      <div class="alert alert-error text-sm"><span>{error}</span></div>
    {/if}

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">Prepared / Reviewed</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <p><span class="text-base-content/50">Prepared by:</span> {sheet.prepared_by?.full_name || '—'}</p>
        <p><span class="text-base-content/50">Reviewed by:</span> {sheet.reviewed_by?.full_name || '—'}</p>
      </div>
    </div>

    <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
      <h2 class="font-semibold text-lg mb-3">People Involved</h2>

      <!-- Mobile: card list -->
      <div class="sm:hidden space-y-3">
        {#each sheet.persons || [] as p}
          <div class="border border-base-200 rounded-lg p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-sm">{fullName(p)}</span>
              <span class="badge badge-sm badge-ghost shrink-0">{ROLE_LABELS[p.role] || p.role}</span>
            </div>
            <p class="text-xs text-base-content/60 mt-1">
              {#if p.role === 'LEARNER-VICTIM'}
                {p.grade ? `Grade ${p.grade}` : ''}{p.section ? ` - ${p.section}` : ''}
              {:else}
                {p.relation_to_learner_victim || p.occupation || ''}
              {/if}
              {#if p.contact_number} · {p.contact_number}{/if}
            </p>
          </div>
        {/each}
      </div>

      <!-- Tablet/desktop: table -->
      <div class="hidden sm:block overflow-x-auto">
        <table class="table table-sm">
          <thead><tr><th>Role</th><th>Name</th><th>Details</th><th>Contact</th></tr></thead>
          <tbody>
            {#each sheet.persons || [] as p}
              <tr>
                <td><span class="badge badge-sm badge-ghost">{ROLE_LABELS[p.role] || p.role}</span></td>
                <td>{fullName(p)}</td>
                <td class="text-base-content/70">
                  {#if p.role === 'LEARNER-VICTIM'}
                    {p.grade ? `Grade ${p.grade}` : ''}{p.section ? ` - ${p.section}` : ''}
                  {:else}
                    {p.relation_to_learner_victim || p.occupation || ''}
                  {/if}
                </td>
                <td class="text-base-content/70">{p.contact_number || '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if sheet.detailed_incidents?.length}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <h2 class="font-semibold text-lg mb-3">Incident Details</h2>
        <div class="space-y-4">
          {#each sheet.detailed_incidents as inc}
            <div class="border-l-2 border-base-300 pl-3">
              <p class="text-sm font-medium">{inc.date_of_incident}{#if inc.is_estimated_date} <span class="badge badge-xs badge-ghost">estimated</span>{/if}</p>
              <p class="text-sm text-base-content/70 whitespace-pre-wrap">{inc.description}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if sheet.actions_taken?.length}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <h2 class="font-semibold text-lg mb-3">Actions Taken</h2>
        <ul class="list-disc list-inside space-y-1 text-sm">
          {#each sheet.actions_taken as a}<li>{a.action_taken}</li>{/each}
        </ul>
      </div>
    {/if}

    {#if sheet.recommendations?.length}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <h2 class="font-semibold text-lg mb-3">Recommendations</h2>
        <ul class="list-disc list-inside space-y-1 text-sm">
          {#each sheet.recommendations as r}<li>{r.recommendation}</li>{/each}
        </ul>
      </div>
    {/if}

    {#if sheet.referrals?.length}
      <div class="card bg-base-100 shadow-sm border border-base-200 p-5">
        <h2 class="font-semibold text-lg mb-3">Referrals</h2>
        <div class="space-y-2 text-sm">
          {#each sheet.referrals as r}
            <p><span class="font-medium">{r.referred_to}</span> — <span class="text-base-content/70">{r.reason}</span></p>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<dialog bind:this={deleteModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Delete Intake Sheet</h3>
    <p class="py-4 text-base-content/70">Are you sure you want to delete intake sheet #{sheet?.intake_sheet_id}? This can be restored later by an administrator.</p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => deleteModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" disabled={deleting} onclick={handleDelete}>Delete</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
