<script>
  import ComplianceView from '$lib/components/ComplianceView.svelte';
</script>

<!-- Division Admin: own division only (enforced server-side); can maintain each school's personnel history. -->
<ComplianceView canEditPersonnel />
