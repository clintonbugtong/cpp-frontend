<script>
  import { authState } from '$lib/stores/auth.svelte.js';
  import ComplianceView from '$lib/components/ComplianceView.svelte';
</script>

<!-- Division-level Focal Persons see their division; regional ones can filter by division. -->
<ComplianceView canFilterDivision={authState.isRegionalLevel()} />
