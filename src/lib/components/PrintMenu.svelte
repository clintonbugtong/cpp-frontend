<script>
  // One "Print" button with a small menu of the documents a page can download
  // as PDF — the same design everywhere (first made for the intake sheet page).
  // Each item: { title, description, icon, tone, available?, reason?, run }.
  // run() does the download; the button shows "Generating…" until it finishes.
  import { tick } from 'svelte';

  /**
   * @typedef {{
   *   title: string, description?: string,
   *   icon?: 'document' | 'clipboard' | 'chart' | 'check',
   *   tone?: 'primary' | 'secondary' | 'accent',
   *   available?: boolean, reason?: string | null,
   *   run: () => Promise<any>
   * }} PrintItem
   */
  /** @type {{ items: PrintItem[], label?: string, disabled?: boolean }} */
  let { items, label = 'Print', disabled = false } = $props();

  let open = $state(false);
  let busy = $state(false);
  /** @type {HTMLDivElement|null} */
  let root = $state(null);

  const ICONS = {
    document: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
    clipboard: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
    chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z'
  };
  // Full class names (not built from parts) so Tailwind keeps them.
  const TONE = { primary: 'bg-primary/10 text-primary', secondary: 'bg-secondary/10 text-secondary', accent: 'bg-accent/10 text-accent' };

  const enabledItems = () => /** @type {HTMLElement[]} */ ([...(root?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? [])]);

  async function show() {
    open = true;
    await tick();
    enabledItems()[0]?.focus();
  }
  function hide(refocus = true) {
    open = false;
    if (refocus) root?.querySelector('button')?.focus();
  }
  /** @param {PrintItem} item */
  async function choose(item) {
    hide();
    busy = true;
    try { await item.run(); } finally { busy = false; }
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    const list = enabledItems();
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'Escape') { e.preventDefault(); hide(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Tab') hide(false);
  }
  /** Click anywhere else closes it. @param {MouseEvent} e */
  function onWindowClick(e) {
    if (open && !root?.contains(/** @type {Node} */ (e.target))) hide(false);
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative" bind:this={root}>
  <button
    type="button" class="btn btn-outline btn-sm gap-1.5" disabled={busy || disabled} aria-haspopup="menu" aria-expanded={open}
    onclick={() => (open ? hide() : show())}
  >
    {#if busy}<span class="loading loading-spinner loading-xs"></span> Generating…{:else}
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"/></svg>
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5 transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
    {/if}
  </button>
  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      role="menu" tabindex="-1" aria-label="Choose a document to download" onkeydown={onKey}
      class="z-30 mt-2 rounded-2xl border border-base-200 bg-base-100 p-1.5 shadow-xl ring-1 ring-black/5 max-sm:fixed max-sm:inset-x-4 sm:absolute sm:right-0 sm:w-80"
    >
      <p class="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-base-content/50">Download as PDF</p>
      {#each items as item, i}
        {@const ok = item.available !== false}
        <button
          role="menuitem" type="button"
          class="{ok
            ? 'group w-full flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-primary/5 hover:border-primary/20 focus:bg-primary/5 focus:border-primary/30 focus:outline-none'
            : 'w-full flex items-start gap-3 rounded-xl border border-dashed border-base-300 bg-base-200/70 px-3 py-2.5 text-left cursor-not-allowed'} {i ? 'mt-1' : ''}"
          disabled={!ok} aria-disabled={!ok} onclick={() => choose(item)}
        >
          <span class="mt-0.5 grid place-items-center w-9 h-9 shrink-0 rounded-lg {ok ? TONE[item.tone ?? 'primary'] : 'bg-base-300/70 text-base-content/60'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d={ok ? ICONS[item.icon ?? 'document'] : ICONS.lock} /></svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="text-sm font-semibold {ok ? '' : 'text-base-content/75'}">{item.title}</span>
              {#if !ok}<span class="badge badge-xs border-base-300 bg-base-100 text-base-content/70 font-medium">Not available</span>{/if}
            </span>
            {#if ok}
              {#if item.description}<span class="block text-xs text-base-content/60 mt-0.5">{item.description}</span>{/if}
            {:else}
              <span class="block text-xs text-base-content/75 mt-0.5 leading-snug">{item.reason}</span>
            {/if}
          </span>
          {#if ok}<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 shrink-0 text-base-content/30 transition-all group-hover:text-primary group-hover:translate-y-0.5 group-focus:text-primary" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
