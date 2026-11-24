import { api } from './client.js';

class LearnerReportsService {
	async getReports(params = {}) {
		try {
			const response = await api.get('/learner-reports', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {Record<string, any>} params */
	async getStatistics(params = {}) {
		try {
			const response = await api.get('/learner-reports/statistics', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async getReport(id) {
		try {
			const response = await api.get(`/learner-reports/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {number|string} id @param {'under_review'|'dismissed'} status */
	async reviewReport(id, status) {
		try {
			const response = await api.post(`/learner-reports/${id}/review`, { status });
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** @param {number|string} id @param {number|string} intakeSheetId */
	/**
	 * One step on the report's review route inside the school.
	 * @param {string|number} id
	 * @param {'review'|'forward'|'dismiss'|'undo'} action
	 * @param {string} [remarks]
	 */
	async routeReport(id, action, remarks = '') {
		try {
			const response = await api.post(`/learner-reports/${id}/route`, { action, remarks: remarks || null });
			return { success: true, data: response };
		} catch (e) {
			const err = /** @type {any} */ (e);
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/**
	 * Undo your own last status change on a report.
	 * @param {string|number} id
	 */
	async undoReport(id) {
		try {
			const response = await api.post(`/learner-reports/${id}/undo`, {});
			return { success: true, data: response };
		} catch (e) {
			const err = /** @type {any} */ (e);
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/**
	 * @param {string|number} id
	 * @param {string|number} intakeSheetId
	 */
	async linkReport(id, intakeSheetId) {
		try {
			const response = await api.post(`/learner-reports/${id}/link`, { intake_sheet_id: intakeSheetId });
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}
}

export const learnerReportsService = new LearnerReportsService();
