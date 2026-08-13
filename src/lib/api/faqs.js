import { api } from './client.js';

/** Admin management of the learner portal's public FAQ content.
 *  Backend restricts writes to Super Admin or a regional-level
 *  Learner Right Protection Focal Person (see FaqController::canManage()). */
class FaqsService {
	async getFaqs() {
		try {
			const response = await api.get('/faqs');
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {{question: string, answer: string, category?: string|null, sort_order?: number, is_published?: boolean}} payload */
	async createFaq(payload) {
		try {
			const response = await api.post('/faqs', payload);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** @param {number|string} id @param {{question?: string, answer?: string, category?: string|null, sort_order?: number, is_published?: boolean}} payload */
	async updateFaq(id, payload) {
		try {
			const response = await api.put(`/faqs/${id}`, payload);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** @param {number|string} id */
	async deleteFaq(id) {
		try {
			const response = await api.delete(`/faqs/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** @param {number|string} id */
	async restoreFaq(id) {
		try {
			const response = await api.post(`/faqs/${id}/restore`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const faqsService = new FaqsService();
