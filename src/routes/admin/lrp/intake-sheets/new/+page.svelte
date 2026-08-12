<script>
  import { page } from '$app/state';
  import IntakeSheetForm from '$lib/components/IntakeSheetForm.svelte';
</script>

<IntakeSheetForm fromReportId={page.url.searchParams.get('from_report')} />
