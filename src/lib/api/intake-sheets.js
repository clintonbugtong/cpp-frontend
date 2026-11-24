import { api } from './client.js';

class IntakeSheetsService {
	async getStatistics(params = {}) {
		try {
			const response = await api.get('/intake-sheets/statistics', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

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

	/**
	 * Earlier records whose learner-victim has this name (within the user's access).
	 * @param {Record<string, any>} params
	 */
	async findLearnerMatches(params) {
		try {
			const response = await api.get('/intake-sheets/learner-matches', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: /** @type {Error} */ (err).message };
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

	/**
	 * One step on the review route. forward needs a destination key from
	 * permissions.actions.destinations ("division", "school:school_head", …).
	 * @param {any} id
	 * @param {'review'|'forward'|'recommend_resolved'|'resolve'|'reopen'} action
	 * @param {string} [remarks]
	 * @param {string|null} [destination]
	 */
	async routeIntakeSheet(id, action, remarks, destination = null) {
		try {
			const response = await api.post(`/intake-sheets/${id}/route`, { action, remarks: remarks || null, destination });
			return { success: true, data: response };
		} catch (/** @type {any} */ err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** Marks a draft complete — requires exactly one Learner-Victim to already be saved. */
	async finalizeIntakeSheet(id) {
		try {
			const response = await api.post(`/intake-sheets/${id}/finalize`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	// ── Sub-resource CRUD (Incident Details, Initial Actions Taken, Other
	// Recommendations / Next Steps) — add/edit/soft-delete one entry at a time,
	// independent of the others. `type` is one of: 'detailed-incidents',
	// 'actions-taken', 'recommendations'. Each returns the whole updated sheet,
	// same shape as getIntakeSheet(). ──────────────────────────────────────

	/** @param {string} type @param {Record<string, any>} data */
	async addChild(id, type, data) {
		try {
			const response = await api.post(`/intake-sheets/${id}/${type}`, data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** @param {string} type @param {number|string} childId @param {Record<string, any>} data */
	async updateChild(id, type, childId, data) {
		try {
			const response = await api.put(`/intake-sheets/${id}/${type}/${childId}`, data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/**
	 * V. "Referral: YES / NO" — one answer per intake sheet.
	 * @param {any} id
	 * @param {{is_referred: boolean|null, referred_to?: string|null, referral_reason?: string|null}} data
	 */
	async updateReferral(id, data) {
		try {
			const response = await api.put(`/intake-sheets/${id}/referral`, data);
			return { success: true, data: response };
		} catch (/** @type {any} */ err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/** Soft-deletes one entry — it's never permanently removed. @param {string} type @param {number|string} childId */
	async deleteChild(id, type, childId) {
		try {
			const response = await api.delete(`/intake-sheets/${id}/${type}/${childId}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const intakeSheetsService = new IntakeSheetsService();
