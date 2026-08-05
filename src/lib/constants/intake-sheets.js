// Keep in sync with IntakeSheet::NATURE_OF_CASE_OPTIONS on the backend.
export const NATURE_OF_CASE_OPTIONS = [
	{ value: 'BULLYING', label: 'Bullying' },
	{ value: 'CHILD_ABUSE', label: 'Child Abuse' },
	{ value: 'PHYSICAL_ABUSE', label: 'Physical Abuse' },
	{ value: 'SEXUAL_ABUSE_HARASSMENT', label: 'Sexual Abuse / Harassment' },
	{ value: 'DISCRIMINATION', label: 'Discrimination' },
	{ value: 'NEGLECT', label: 'Neglect' },
	{ value: 'OTHERS', label: 'Others' }
];

/** @param {string|null|undefined} value */
export function natureOfCaseLabel(value) {
	return NATURE_OF_CASE_OPTIONS.find((o) => o.value === value)?.label || '—';
}
