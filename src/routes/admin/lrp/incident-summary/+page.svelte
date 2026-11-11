<script>
  import { authState } from '$lib/stores/auth.svelte.js';
  import IncidentSummaryView from '$lib/components/IncidentSummaryView.svelte';
</script>

<IncidentSummaryView canFilterDivision={authState.isRegionalLevel()} />
