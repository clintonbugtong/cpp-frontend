<script>
  // Period selector shared by the dashboard and the school's Monthly Report:
  // [All time] Monthly · Quarterly · Yearly, then Year and Month / Quarter —
  // the same controls as the Incident Summary.
  import { MONTH_NAMES, phNow } from '$lib/api/school-reports.js';

  /**
   * @type {{
   *   type?: string, year?: number, month?: number, quarter?: number,
   *   types?: string[], labels?: Record<string, string>, onchange?: () => void
   * }}
   */
  let {
    type = $bindable('all'),
    year = $bindable(phNow().year),
    month = $bindable(phNow().month),
    quarter = $bindable(phNow().quarter),
    types = ['all', 'monthly', 'quarterly', 'yearly'],
    labels = {},
    onchange
  } = $props();

  const now = phNow();
  const years = Array.from({ length: now.year - 2023 }, (_, i) => now.year - i);
  const LABEL = $derived(/** @type {Record<string, string>} */ ({ all: 'All time', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', ...labels }));

  /** @param {string} t */
  function pick(t) {
    if (type === t) return;
    type = t;
    onchange?.();
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <div class="join">
    {#each types as t}
      <button type="button" class="join-item btn btn-sm {type === t ? 'btn-active' : ''}" aria-pressed={type === t} onclick={() => pick(t)}>{LABEL[t]}</button>
    {/each}
  </div>
  {#if type !== 'all'}
    <select class="select select-bordered select-sm w-24" bind:value={year} onchange={() => onchange?.()} aria-label="Year">
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
  {/if}
  {#if type === 'monthly'}
    <select class="select select-bordered select-sm w-36" bind:value={month} onchange={() => onchange?.()} aria-label="Month">
      {#each MONTH_NAMES as name, i}<option value={i + 1}>{name}</option>{/each}
    </select>
  {:else if type === 'quarterly'}
    <select class="select select-bordered select-sm w-44" bind:value={quarter} onchange={() => onchange?.()} aria-label="Quarter">
      <option value={1}>Q1 (Jan–Mar)</option><option value={2}>Q2 (Apr–Jun)</option>
      <option value={3}>Q3 (Jul–Sep)</option><option value={4}>Q4 (Oct–Dec)</option>
    </select>
  {/if}
</div>
