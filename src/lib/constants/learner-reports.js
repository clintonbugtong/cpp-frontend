// Nature-of-concern shares the same vocabulary as intake sheets' nature-of-case
// (see lib/constants/intake-sheets.js) — reuse those labels rather than duplicate.
export { NATURE_OF_CASE_OPTIONS as NATURE_OF_CONCERN_OPTIONS, natureOfCaseLabel as natureOfConcernLabel } from './intake-sheets.js';

export const RELATIONSHIP_OPTIONS = [
	{ value: 'STUDENT', label: 'Student (self)' },
	{ value: 'PARENT', label: 'Parent' },
	{ value: 'GUARDIAN', label: 'Guardian' },
	{ value: 'OTHER', label: 'Other' }
];

/** @param {string|null|undefined} value */
export function relationshipLabel(value) {
	return RELATIONSHIP_OPTIONS.find((o) => o.value === value)?.label || '—';
}

export const STATUS_OPTIONS = [
	{ value: 'new', label: 'New' },
	{ value: 'for_review', label: 'For Review' },
	{ value: 'under_review', label: 'Under Review' },
	{ value: 'linked', label: 'Linked to Intake Sheet / Incident Report' },
	{ value: 'dismissed', label: 'Dismissed' }
];

/** @param {string|null|undefined} value */
export function statusLabel(value) {
	return STATUS_OPTIONS.find((o) => o.value === value)?.label || value || '—';
}

/** @param {string|null|undefined} value */
export function statusBadgeClass(value) {
	switch (value) {
		case 'new': return 'badge-warning';
		case 'for_review': return 'badge-warning badge-outline';
		case 'under_review': return 'badge-info';
		case 'linked': return 'badge-success';
		case 'dismissed': return 'badge-ghost';
		default: return 'badge-ghost';
	}
}
