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
