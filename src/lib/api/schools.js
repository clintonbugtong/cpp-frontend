import { api } from './client.js';

// Schools are managed by Super Admin (all divisions) and Division Admin (own
// division only — enforced server-side in SchoolController::findScoped()).
class SchoolsService {
	/** @param {Record<string, any>} params */
	async getSchools(params = {}) {
		try {
			const response = await api.get('/schools', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {number|string} id */
	async getSchool(id) {
		try {
			const response = await api.get(`/schools/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {Record<string, any>} data */
	async createSchool(data) {
		try {
			const response = await api.post('/schools', data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** @param {number|string} id @param {Record<string, any>} data */
	async updateSchool(id, data) {
		try {
			const response = await api.put(`/schools/${id}`, data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** Soft-deletes — never a permanent delete. @param {number|string} id */
	async deleteSchool(id) {
		try {
			const response = await api.delete(`/schools/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {number|string} id */
	async restoreSchool(id) {
		try {
			const response = await api.post(`/schools/${id}/restore`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const schoolsService = new SchoolsService();
