// K to 12 grade levels, ALS and SPED — stored as short codes (K, 1…12,
// ALS_ELEM, ALS_JHS, SPED). Same list as App\Support\GradeLevel on the backend.
// Records saved before the dropdown existed may hold free text ("7",
// "Grade 7"…): normalizeGrade() reads those, gradeLabel() shows anything else as typed.

const n = (/** @type {number} */ g) => ({ value: String(g), label: `Grade ${g}` });

export const GRADE_GROUPS = [
	{ label: 'Kindergarten', options: [{ value: 'K', label: 'Kindergarten' }] },
	{ label: 'Elementary', options: [1, 2, 3, 4, 5, 6].map(n) },
	{ label: 'Junior High School', options: [7, 8, 9, 10].map(n) },
	{ label: 'Senior High School', options: [11, 12].map(n) },
	{
		label: 'Alternative Learning System',
		options: [
			{ value: 'ALS_ELEM', label: 'ALS - Elementary' },
			{ value: 'ALS_JHS', label: 'ALS - Junior High School' }
		]
	},
	{ label: 'Special Education', options: [{ value: 'SPED', label: 'Non-graded (SPED)' }] }
];

const LABELS = /** @type {Record<string, string>} */ (
	Object.fromEntries(GRADE_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label])))
);

/** @param {any} value @returns {string} the code, or '' when it can't be read as a grade level */
export function normalizeGrade(value) {
	const v = String(value ?? '').trim();
	if (!v) return '';
	if (LABELS[v]) return v;
	const plain = v.replace(/^grade\s*/i, '');
	if (/^\d{1,2}$/.test(plain) && +plain >= 1 && +plain <= 12) return String(+plain);
	if (/^(k|kinder(garten)?)$/i.test(v)) return 'K';
	if (/^als\b.*\b(elem|elementary)/i.test(v)) return 'ALS_ELEM';
	if (/^als\b.*\b(jhs|junior)/i.test(v)) return 'ALS_JHS';
	if (/sped|non-?graded/i.test(v)) return 'SPED';
	return '';
}

/** @param {any} value "Grade 7", "Kindergarten"… or the text as typed */
export function gradeLabel(value) {
	const v = String(value ?? '').trim();
	if (!v) return '';
	const code = normalizeGrade(v);
	return code ? LABELS[code] : v;
}

/** "Grade 7 - Rizal" @param {any} grade @param {any} section */
export function gradeSection(grade, section) {
	return [gradeLabel(grade), String(section ?? '').trim()].filter(Boolean).join(' - ');
}
