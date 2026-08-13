<script>
  /**
   * Small multi-series line chart, plain SVG, no charting library.
   * Built for comparing 1-3 series over a shared set of x-axis labels
   * (e.g. monthly volume). Ships with a legend, hover crosshair + tooltip,
   * end-dots, and a table-view toggle (the WCAG-clean twin of the chart).
   *
   * The SVG's viewBox is kept 1:1 with its actual on-screen pixel width
   * (via clientWidth, not a fixed viewBox scaled by CSS) — otherwise text
   * sized for a wide desktop card shrinks to unreadable on a narrow phone
   * screen. Height is capped independently so the chart also stays compact
   * on wide containers instead of growing with a fixed aspect ratio.
   *
   * @typedef {{ label: string }} Point
   * @typedef {{ name: string, color: string, values: number[] }} Series
   */
  let {
    /** @type {Point[]} */
    months = [],
    /** @type {Series[]} */
    series = [],
    unit = ''
  } = $props();

  let containerWidth = $state(0);
  let W = $derived(containerWidth || 320);
  // Compact on every screen size: scales gently with width but never
  // taller than a small stat card, never so short labels collide.
  let H = $derived(Math.round(Math.min(130, Math.max(96, W * 0.26))));

  const PAD_L = 4;
  const PAD_R = 4;
  const PAD_T = 12;
  let PAD_B = $derived(Math.round(H * 0.16) + 8);
  let PLOT_W = $derived(W - PAD_L - PAD_R);
  let PLOT_H = $derived(H - PAD_T - PAD_B);

  let maxVal = $derived(Math.max(1, ...series.flatMap((s) => s.values), 1));
  // Round the axis ceiling up to a clean step so gridline labels aren't jagged.
  let niceMax = $derived.by(() => {
    const raw = maxVal;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    const step = magnitude / 2 || 1;
    return Math.max(step, Math.ceil(raw / step) * step);
  });

  /** @param {number} i */
  function xAt(i) {
    if (months.length <= 1) return PAD_L + PLOT_W / 2;
    return PAD_L + (i / (months.length - 1)) * PLOT_W;
  }
  /** @param {number} v */
  function yAt(v) {
    return PAD_T + PLOT_H - (v / niceMax) * PLOT_H;
  }

  /** @param {number[]} values */
  function pathFor(values) {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  }

  let hoverIndex = $state(/** @type {number|null} */ (null));
  let showTable = $state(false);

  /** @param {PointerEvent} e */
  function handlePointerMove(e) {
    const target = /** @type {SVGGraphicsElement} */ (e.currentTarget);
    const svg = target.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // rect is real on-screen px and W/H are now the same units (viewBox ==
    // clientWidth), so this maps 1:1 without a separate scale factor.
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = months.length <= 1 ? 0 : Math.round(((relX - PAD_L) / PLOT_W) * (months.length - 1));
    hoverIndex = Math.max(0, Math.min(months.length - 1, idx));
  }
  function handlePointerLeave() {
    hoverIndex = null;
  }

  // Gridlines at 0 / 50% / 100% of the axis ceiling.
  const gridSteps = [0, 0.5, 1];

  const FONT = 10;
  // Keep the tooltip box on-canvas near the right edge; sized relative to W
  // so it doesn't swallow most of the chart on a narrow phone screen.
  let tooltipW = $derived(Math.round(Math.min(120, Math.max(92, W * 0.4))));
  let tooltipX = $derived.by(() => {
    if (hoverIndex === null) return 0;
    const x = xAt(hoverIndex) + 8;
    return x + tooltipW > W - PAD_R ? xAt(hoverIndex) - tooltipW - 8 : x;
  });
</script>

<div class="space-y-2.5">
  <div class="flex items-center justify-between">
    <!-- Legend — a line-key (short stroke), not a filled box, per series. -->
    {#if series.length > 1}
      <div class="flex items-center gap-3 flex-wrap">
        {#each series as s}
          <div class="flex items-center gap-1.5">
            <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
              <line x1="0" y1="4" x2="12" y2="4" stroke={s.color} stroke-width="2" stroke-linecap="round" />
            </svg>
            <span class="text-xs text-base-content/60">{s.name}</span>
          </div>
        {/each}
      </div>
    {:else}
      <span></span>
    {/if}
    <button type="button" class="text-xs text-base-content/40 hover:text-base-content/70 underline underline-offset-2 shrink-0" onclick={() => (showTable = !showTable)}>
      {showTable ? 'View chart' : 'View as table'}
    </button>
  </div>

  {#if showTable}
    <div class="overflow-x-auto">
      <table class="table table-xs">
        <thead>
          <tr>
            <th class="text-base-content/50">Month</th>
            {#each series as s}
              <th class="text-base-content/50">{s.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each months as m, i}
            <tr>
              <td>{m.label}</td>
              {#each series as s}
                <td class="tabular-nums">{s.values[i] ?? 0}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if months.length}
    <div bind:clientWidth={containerWidth}>
      <svg viewBox="0 0 {W} {H}" width={W} height={H} class="w-full block" style="max-height:{H}px" role="img" aria-label="Monthly trend line chart">
        <!-- Gridlines -->
        {#each gridSteps as g}
          {@const y = PAD_T + PLOT_H - g * PLOT_H}
          <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} class="stroke-base-300" stroke-width="1" />
          <text x={PAD_L} y={y - 3} class="fill-base-content/30" font-size={FONT}>{Math.round(g * niceMax)}{unit}</text>
        {/each}

        <!-- X-axis labels: first + last only — kept sparse so they stay legible on a narrow screen -->
        {#each months as m, i}
          {#if i === 0 || i === months.length - 1}
            <text x={xAt(i)} y={H - 4} font-size={FONT} class="fill-base-content/30" text-anchor={i === 0 ? 'start' : 'end'}>{m.label}</text>
          {/if}
        {/each}

        <!-- Series lines -->
        {#each series as s}
          <path d={pathFor(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <!-- End dot, direct-labeled with its final value -->
          {@const lastI = s.values.length - 1}
          <circle cx={xAt(lastI)} cy={yAt(s.values[lastI])} r="3.5" fill={s.color} class="stroke-base-100" stroke-width="2" />
        {/each}

        <!-- Hover crosshair + per-series dots + tooltip -->
        {#if hoverIndex !== null}
          <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={PAD_T} y2={PAD_T + PLOT_H} class="stroke-base-300" stroke-width="1" />
          {#each series as s}
            <circle cx={xAt(hoverIndex)} cy={yAt(s.values[hoverIndex])} r="3.5" fill={s.color} class="stroke-base-100" stroke-width="2" />
          {/each}

          {@const boxH = 14 + series.length * 13}
          {@const boxY = Math.max(PAD_T, Math.min(yAt(Math.max(...series.map((s) => s.values[hoverIndex ?? 0]))) - boxH / 2, PAD_T + PLOT_H - boxH))}
          <g>
            <rect x={tooltipX} y={boxY} width={tooltipW} height={boxH} rx="5" class="fill-base-100 stroke-base-300" stroke-width="1" />
            <text x={tooltipX + 6} y={boxY + 11} font-size={FONT - 1} class="fill-base-content/50">{months[hoverIndex]?.label}</text>
            {#each series as s, si}
              <line x1={tooltipX + 6} x2={tooltipX + 13} y1={boxY + 22 + si * 13} y2={boxY + 22 + si * 13} stroke={s.color} stroke-width="2" stroke-linecap="round" />
              <text x={tooltipX + 18} y={boxY + 25 + si * 13} font-size={FONT - 1} class="fill-base-content/60">{s.name}</text>
              <text x={tooltipX + tooltipW - 6} y={boxY + 25 + si * 13} font-size={FONT - 1} font-weight="700" text-anchor="end" class="fill-base-content">{s.values[hoverIndex]}{unit}</text>
            {/each}
          </g>
        {/if}

        <!-- Full-plot hover/hit target (bigger than the lines themselves) -->
        <rect
          x={PAD_L} y="0" width={PLOT_W} height={H}
          fill="transparent"
          onpointermove={handlePointerMove}
          onpointerleave={handlePointerLeave}
          role="presentation"
        />
      </svg>
    </div>
  {:else}
    <p class="text-sm text-base-content/30 text-center py-6">No activity data</p>
  {/if}
</div>
