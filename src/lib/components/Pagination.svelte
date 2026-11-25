<script>
  // The list pager used across the admin pages (same look as the Intake Sheet /
  // Incident Report list): "Page 2 of 5 · 63 records" with « 1 2 3 … 5 » buttons.
  // Works for server-paged lists (pass pages + total) and lists paged in the
  // browser (pass total + perPage). `bare` drops the card, for use inside a card.
  /**
   * @type {{
   *   page: number, pages?: number, total?: number, perPage?: number,
   *   noun?: string, bare?: boolean, always?: boolean, onchange?: (page: number) => void
   * }}
   */
  let { page = $bindable(1), pages, total, perPage = 15, noun = 'records', bare = false, always = false, onchange } = $props();

  const pageCount = $derived(Math.max(1, pages ?? Math.ceil((total ?? 0) / perPage)));
  /** First, last and the pages around the current one; '…' for gaps. */
  const buttons = $derived.by(() => {
    /** @type {(number|string)[]} */
    const out = [];
    for (let n = 1; n <= pageCount; n++) {
      if (n === 1 || n === pageCount || Math.abs(n - page) <= 1) out.push(n);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  });
  /** @param {number} p */
  function go(p) {
    if (p < 1 || p > pageCount || p === page) return;
    page = p;
    onchange?.(p);
  }
</script>

{#if pageCount > 1 || (always && (total ?? 0) > 0)}
  <div class="{bare ? 'pt-3 border-t border-base-200' : 'card bg-base-100 shadow-sm border border-base-200 p-4'} flex flex-row flex-wrap items-center justify-between gap-2">
    <span class="text-sm text-base-content/50">Page {page} of {pageCount}{#if total != null} · {total} {noun}{/if}</span>
    <div class="join">
      <button type="button" class="join-item btn btn-sm" disabled={page <= 1} onclick={() => go(page - 1)} aria-label="Previous page">«</button>
      {#each buttons as b}
        {#if b === '…'}
          <button type="button" class="join-item btn btn-sm btn-disabled" tabindex="-1">…</button>
        {:else}
          <button type="button" class="join-item btn btn-sm {b === page ? 'btn-active' : ''}" aria-current={b === page ? 'page' : undefined} onclick={() => go(Number(b))}>{b}</button>
        {/if}
      {/each}
      <button type="button" class="join-item btn btn-sm" disabled={page >= pageCount} onclick={() => go(page + 1)} aria-label="Next page">»</button>
    </div>
  </div>
{/if}
