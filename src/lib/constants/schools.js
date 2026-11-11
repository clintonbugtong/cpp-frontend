export const STATUS_OPTIONS = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' }
];

/** @param {string|null|undefined} value */
export function statusLabel(value) {
	return STATUS_OPTIONS.find((o) => o.value === value)?.label || value || '—';
}

/** @param {string|null|undefined} value */
export function statusBadgeClass(value) {
	switch (value) {
		case 'active': return 'badge-success';
		case 'inactive': return 'badge-error';
		case 'pending': return 'badge-warning';
		default: return 'badge-ghost';
	}
}

export const TYPE_OPTIONS = [
	{ value: 'public', label: 'Public' },
	{ value: 'private', label: 'Private' }
];

/** @param {string|null|undefined} value */
export function typeLabel(value) {
	return value === 'private' ? 'Private' : 'Public';
}

export const CLASSIFICATION_OPTIONS = [
	{ value: 'elementary', label: 'Elementary' },
	{ value: 'secondary', label: 'Secondary' },
	{ value: 'integrated', label: 'Integrated' }
];

/** @param {string|null|undefined} value */
export function classificationLabel(value) {
	return CLASSIFICATION_OPTIONS.find((o) => o.value === value)?.label || value || '—';
}
