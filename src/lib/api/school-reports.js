import { api } from './client.js';

/**
 * Monthly school incident reports ("zero incident" reporting), the school's
 * personal accounts and their history, compliance/summary views,
 * and the generated PDF documents.
 */

/** @typedef {{ success: boolean, data?: any, error?: string, validationErrors?: Record<string, string[]>, status?: number }} Result */

/** @param {any} err @returns {Result} */
const fail = (err) => ({ success: false, error: err.message, validationErrors: err.validationErrors, status: err.status });
/** @param {any} [data] @returns {Result} */
const ok = (data) => ({ success: true, data });

/** @param {Record<string, any>} params */
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));

class SchoolReportsService {
	/**
	 * The school account's own page: months, live counts, personnel.
	 * @param {Record<string, any>} [params] period_type / year / month / quarter for the history list
	 */
	async getMine(params = {}) {
		try { return ok(await api.get('/school-reports/my', clean(params))); } catch (err) { return fail(err); }
	}

	/** @param {{period_year: number, period_month: number, declaration?: 'zero_incident', remarks?: string}} payload */
	async submit(payload) {
		try { return ok(await api.post('/school-reports', payload)); } catch (err) { return fail(err); }
	}

	/** @param {Record<string, any>} params period_type, year, month|quarter, division_id */
	async getCompliance(params) {
		try { return ok(await api.get('/school-reports/compliance', clean(params))); } catch (err) { return fail(err); }
	}

	/** @param {Record<string, any>} params */
	async getIncidentSummary(params) {
		try { return ok(await api.get('/school-reports/incident-summary', clean(params))); } catch (err) { return fail(err); }
	}

	/** @param {{year: number, month: number, division_id?: any}} payload */
	async sendReminders(payload) {
		try { return ok(await api.post('/school-reports/send-reminders', clean(payload))); } catch (err) { return fail(err); }
	}

	/** A school's personal accounts (School Head, Guidance Counselor / Designate) and their history. @param {any} schoolId */
	async getAccounts(schoolId) {
		try { return ok(await api.get('/school-accounts', clean({ school_id: schoolId }))); } catch (err) { return fail(err); }
	}

	/**
	 * Create a personal account for the person now holding a position. The
	 * response carries the one-time credentials.
	 * @param {{school_id: any, school_position: 'school_head'|'guidance_counselor', first_name: string, middle_name?: string, last_name: string, email: string, contact_number?: string, send_email?: boolean}} payload
	 */
	async createAccount(payload) {
		try { return ok(await api.post('/school-accounts', payload)); } catch (err) { return fail(err); }
	}

	/** The holder moved out — deactivate (never delete). @param {any} userId @param {{ended_at: string, end_reason: string}} payload */
	async deactivateAccount(userId, payload) {
		try { return ok(await api.post(`/school-accounts/${userId}/deactivate`, payload)); } catch (err) { return fail(err); }
	}

	// ── School Head without a system account ──
	/** @param {{school_id: any, full_name: string, designation?: string, contact_number?: string, started_at: string}} payload */
	async recordSchoolHead(payload) {
		try { return ok(await api.post('/school-accounts/school-head', payload)); } catch (err) { return fail(err); }
	}
	/** @param {any} personnelId @param {{full_name: string, designation?: string, contact_number?: string, started_at: string}} payload */
	async updateSchoolHead(personnelId, payload) {
		try { return ok(await api.put(`/school-accounts/school-head/${personnelId}`, payload)); } catch (err) { return fail(err); }
	}
	/** @param {any} personnelId @param {{ended_at: string, end_reason: string}} payload */
	async endSchoolHead(personnelId, payload) {
		try { return ok(await api.post(`/school-accounts/school-head/${personnelId}/end`, payload)); } catch (err) { return fail(err); }
	}

	// ── PDFs ──
	/** @param {any} id */
	async intakeSheetPdf(id) {
		try { await api.download(`/intake-sheets/${id}/pdf`, {}, `intake-sheet-${id}.pdf`); return ok(); } catch (err) { return fail(err); }
	}
	/** LRP Concern Incident Report Form — same case, separate document. @param {any} id */
	async incidentReportPdf(id) {
		try { await api.download(`/intake-sheets/${id}/incident-report-pdf`, {}, `incident-report-${id}.pdf`); return ok(); } catch (err) { return fail(err); }
	}
	/** @param {any} id */
	async learnerReportPdf(id) {
		try { await api.download(`/learner-reports/${id}/pdf`, {}, `learner-report-${id}.pdf`); return ok(); } catch (err) { return fail(err); }
	}
	/** @param {Record<string, any>} params */
	async compliancePdf(params) {
		try { await api.download('/school-reports/compliance/pdf', clean(params), 'compliance.pdf'); return ok(); } catch (err) { return fail(err); }
	}
	/** @param {Record<string, any>} params */
	async incidentSummaryPdf(params) {
		try { await api.download('/school-reports/incident-summary/pdf', clean(params), 'incident-summary.pdf'); return ok(); } catch (err) { return fail(err); }
	}
}

export const schoolReportsService = new SchoolReportsService();

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Status → label + DaisyUI badge class, shared by the compliance views. */
export const REPORT_STATUS = /** @type {Record<string, {label: string, badge: string}>} */ ({
	zero_incident: { label: 'Zero incident', badge: 'badge-success' },
	with_incidents: { label: 'With recorded incidents', badge: 'badge-warning' },
	no_report: { label: 'No report', badge: 'badge-error' },
	partial: { label: 'Incomplete', badge: 'badge-warning badge-outline' },
	upcoming: { label: 'Not yet due', badge: 'badge-ghost' }
});

/** @param {string} status */
export function reportStatus(status) {
	return REPORT_STATUS[status] ?? { label: status, badge: 'badge-ghost' };
}

/** Today in Philippine time as {year, month (1-12), quarter}. */
export function phNow() {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
	const year = Number(parts.find((p) => p.type === 'year')?.value);
	const month = Number(parts.find((p) => p.type === 'month')?.value);
	return { year, month, quarter: Math.ceil(month / 3) };
}
