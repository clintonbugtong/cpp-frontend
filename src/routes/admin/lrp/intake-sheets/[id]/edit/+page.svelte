<script>
  import { page } from '$app/state';
  import IntakeSheetForm from '$lib/components/IntakeSheetForm.svelte';
</script>

<IntakeSheetForm intakeSheetId={page.params.id} />
