<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authState } from '$lib/stores/auth.svelte.js';
  import { faqsService } from '$lib/api/faqs.js';

  /** @type {any[]} */
  let faqs = $state([]);
  let loading = $state(true);
  let error = $state('');

  /** @type {HTMLDialogElement} */
  let editModal;
  /** @type {HTMLDialogElement} */
  let deleteModal;

  let editingId = $state(/** @type {number|null} */ (null));
  let form = $state({ question: '', answer: '', category: '', sort_order: 0, is_published: true });
  let saving = $state(false);
  let saveError = $state('');
  /** @type {Record<string, string[]>} */
  let validationErrors = $state({});

  let deleteTarget = $state(/** @type {any} */ (null));
  let deleting = $state(false);

  // Client-side guard mirroring the backend rule (Super Admin, or a
  // regional-level Learner Right Protection Focal Person) — the backend is
  // the real boundary, this just keeps the UX from dangling on a 403 page.
  onMount(() => {
    if (!authState.canManageFaqs()) {
      goto(authState.getPrimaryDashboard(), { replaceState: true });
      return;
    }
    load();
  });

  async function load() {
    loading = true;
    error = '';
    const result = await faqsService.getFaqs();
    if (result.success) {
      faqs = result.data?.data || [];
    } else {
      error = result.error || 'Failed to load FAQs';
    }
    loading = false;
  }

  function openCreate() {
    editingId = null;
    form = { question: '', answer: '', category: '', sort_order: 0, is_published: true };
    saveError = '';
    validationErrors = {};
    editModal?.showModal();
  }

  /** @param {any} f */
  function openEdit(f) {
    editingId = f.faq_id;
    form = {
      question: f.question,
      answer: f.answer,
      category: f.category || '',
      sort_order: f.sort_order ?? 0,
      is_published: !!f.is_published
    };
    saveError = '';
    validationErrors = {};
    editModal?.showModal();
  }

  async function handleSave() {
    saving = true;
    saveError = '';
    validationErrors = {};

    const payload = {
      question: form.question,
      answer: form.answer,
      category: form.category || null,
      sort_order: Number(form.sort_order) || 0,
      is_published: form.is_published
    };

    const result = editingId
      ? await faqsService.updateFaq(editingId, payload)
      : await faqsService.createFaq(payload);

    if (result.success) {
      editModal?.close();
      await load();
    } else {
      saveError = result.error || 'Failed to save FAQ';
      validationErrors = result.validationErrors || {};
    }
    saving = false;
  }

  /** @param {any} f */
  function confirmDelete(f) {
    deleteTarget = f;
    deleteModal?.showModal();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    deleting = true;
    const result = await faqsService.deleteFaq(deleteTarget.faq_id);
    deleting = false;
    if (result.success) {
      deleteModal?.close();
      deleteTarget = null;
      await load();
    } else {
      error = result.error || 'Failed to delete FAQ';
      deleteModal?.close();
    }
  }

  /** @param {string} field */
  function fieldError(field) {
    return validationErrors[field]?.[0] || '';
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">Manage FAQs</h1>
      <p class="text-base-content/50 mt-1">Content shown on the learner portal's public FAQ page · {faqs.length} item{faqs.length !== 1 ? 's' : ''}</p>
    </div>
    <button class="btn btn-primary" onclick={openCreate}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      New FAQ
    </button>
  </div>

  {#if error}
    <div class="alert alert-error"><span>{error}</span></div>
  {/if}

  {#if loading}
    <div class="card bg-base-100 shadow-sm border border-base-200 py-10">
      <span class="loading loading-spinner mx-auto"></span>
    </div>
  {:else if faqs.length === 0}
    <div class="card bg-base-100 shadow-sm border border-base-200 py-10">
      <p class="text-center text-base-content/50">No FAQs yet. Click "New FAQ" to add the first one.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each faqs as f (f.faq_id)}
        <div class="card bg-base-100 shadow-sm border border-base-200 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-medium">{f.question}</p>
                {#if !f.is_published}
                  <span class="badge badge-ghost badge-sm">Draft</span>
                {/if}
                {#if f.category}
                  <span class="badge badge-outline badge-sm">{f.category}</span>
                {/if}
              </div>
              <p class="text-sm text-base-content/60 mt-1 whitespace-pre-wrap line-clamp-3">{f.answer}</p>
              <p class="text-xs text-base-content/40 mt-2">
                Order {f.sort_order}
                {#if f.updated_by?.full_name} · Last edited by {f.updated_by.full_name}{/if}
              </p>
            </div>
            <div class="flex flex-col sm:flex-row gap-2 shrink-0">
              <button class="btn btn-outline btn-xs" onclick={() => openEdit(f)}>Edit</button>
              <button class="btn btn-outline btn-error btn-xs" onclick={() => confirmDelete(f)}>Delete</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<dialog bind:this={editModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg">{editingId ? 'Edit FAQ' : 'New FAQ'}</h3>

    {#if saveError}
      <div class="alert alert-error py-2 text-xs my-2"><span>{saveError}</span></div>
    {/if}

    <div class="space-y-3 mt-3">
      <div class="form-control">
        <label class="label py-1" for="faq-question"><span class="label-text text-xs">Question</span></label>
        <input id="faq-question" type="text" class="input input-bordered w-full" maxlength="500" bind:value={form.question} />
        {#if fieldError('question')}<p class="text-error text-xs mt-1">{fieldError('question')}</p>{/if}
      </div>

      <div class="form-control">
        <label class="label py-1" for="faq-answer"><span class="label-text text-xs">Answer</span></label>
        <textarea id="faq-answer" class="textarea textarea-bordered w-full" rows="5" bind:value={form.answer}></textarea>
        {#if fieldError('answer')}<p class="text-error text-xs mt-1">{fieldError('answer')}</p>{/if}
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="form-control">
          <label class="label py-1" for="faq-category"><span class="label-text text-xs">Category (optional)</span></label>
          <input id="faq-category" type="text" class="input input-bordered w-full" maxlength="100" placeholder="e.g. Reporting" bind:value={form.category} />
        </div>
        <div class="form-control">
          <label class="label py-1" for="faq-sort"><span class="label-text text-xs">Sort order</span></label>
          <input id="faq-sort" type="number" min="0" class="input input-bordered w-full" bind:value={form.sort_order} />
        </div>
      </div>

      <label class="label cursor-pointer justify-start gap-3 py-1">
        <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={form.is_published} />
        <span class="label-text text-sm">Published (visible on the public FAQ page)</span>
      </label>
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => editModal?.close()}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={saving || !form.question || !form.answer} onclick={handleSave}>
        {#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
        Save
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<dialog bind:this={deleteModal} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box max-w-sm">
    <h3 class="font-bold text-lg">Delete FAQ?</h3>
    <p class="py-2 text-sm text-base-content/60">
      This removes "{deleteTarget?.question}" from the public FAQ page.
    </p>
    <div class="modal-action">
      <button class="btn btn-ghost btn-sm" onclick={() => deleteModal?.close()}>Cancel</button>
      <button class="btn btn-error btn-sm" disabled={deleting} onclick={handleDelete}>
        {#if deleting}<span class="loading loading-spinner loading-xs"></span>{/if}
        Delete
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
