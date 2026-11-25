// Keep in sync with IntakeSheet::NATURE_OF_CASE_OPTIONS on the backend.
export const NATURE_OF_CASE_OPTIONS = [
	{ value: 'BULLYING', label: 'Bullying' },
	{ value: 'NON_BULLYING', label: 'Non-bullying' },
	{ value: 'CHILD_ABUSE', label: 'Child Abuse' },
	{ value: 'PHYSICAL_ABUSE', label: 'Physical Abuse' },
	{ value: 'SEXUAL_ABUSE_HARASSMENT', label: 'Sexual Abuse / Harassment' },
	{ value: 'DISCRIMINATION', label: 'Discrimination' },
	{ value: 'NEGLECT', label: 'Neglect' },
	{ value: 'OTHERS', label: 'Others' }
];

/** Categories that need the "please specify" text (kept in nature_of_case_other). */
export const NATURE_NEEDS_SPECIFY = ['NON_BULLYING', 'OTHERS'];

/** @param {string|null|undefined} value */
export function needsSpecify(value) {
	return !!value && NATURE_NEEDS_SPECIFY.includes(value);
}

/** @param {string|null|undefined} value */
export function natureOfCaseLabel(value) {
	return NATURE_OF_CASE_OPTIONS.find((o) => o.value === value)?.label || '—';
}

// Review route: School → Division Office → Regional Office
// (see IntakeSheet::getStatusAttribute on the backend).
export const STATUS_OPTIONS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'not_forwarded', label: 'Not yet forwarded' },
	{ value: 'for_review', label: 'For review' },
	{ value: 'under_review', label: 'Under review' },
	{ value: 'recommended_resolved', label: 'Recommended as resolved' },
	{ value: 'resolved', label: 'Resolved' }
];

/** Offices on the review route. */
export const LEVEL_LABELS = /** @type {Record<string, string>} */ ({
	school: 'School',
	division: 'Division Office',
	regional: 'Regional Office'
});

/** @param {string|null|undefined} level */
export function levelLabel(level) {
	return (level && LEVEL_LABELS[level]) || '—';
}

/** @param {string|null|undefined} value */
export function statusLabel(value) {
	return STATUS_OPTIONS.find((o) => o.value === value)?.label || value || '—';
}

/** @param {string|null|undefined} value */
export function statusBadgeClass(value) {
	switch (value) {
		case 'draft': return 'badge-ghost';
		case 'not_forwarded': return 'badge-ghost badge-outline';
		case 'for_review': return 'badge-warning';
		case 'under_review': return 'badge-info';
		case 'returned': return 'badge-error badge-outline';
		case 'recommended_resolved': return 'badge-accent';
		case 'resolved': return 'badge-success';
		default: return 'badge-ghost';
	}
}
