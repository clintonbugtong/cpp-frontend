import { api } from './client.js';

class IntakeSheetsService {
	async getIntakeSheets(params = {}) {
		try {
			const response = await api.get('/intake-sheets', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async getIntakeSheet(id) {
		try {
			const response = await api.get(`/intake-sheets/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async createIntakeSheet(data) {
		try {
			const response = await api.post('/intake-sheets', data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	async updateIntakeSheet(id, data) {
		try {
			const response = await api.put(`/intake-sheets/${id}`, data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	async deleteIntakeSheet(id) {
		try {
			const response = await api.delete(`/intake-sheets/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async restoreIntakeSheet(id) {
		try {
			const response = await api.post(`/intake-sheets/${id}/restore`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async reviewIntakeSheet(id) {
		try {
			const response = await api.post(`/intake-sheets/${id}/review`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async unreviewIntakeSheet(id) {
		try {
			const response = await api.post(`/intake-sheets/${id}/unreview`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const intakeSheetsService = new IntakeSheetsService();
