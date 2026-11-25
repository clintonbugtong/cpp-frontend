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

	/**
	 * Saved edits of a finalized sheet (who, when, what changed), latest first.
	 * @param {string|number} id
	 */
	async getHistory(id) {
		try {
			const response = await api.get(`/intake-sheets/${id}/history`);
			return { success: true, data: response };
		} catch (e) {
			return { success: false, error: /** @type {Error} */ (e).message };
		}
	}

	/**
	 * Intervention Plan (and other files): current version + earlier versions.
	 * @param {string|number} id
	 */
	async getAttachments(id) {
		try {
			return { success: true, data: await api.get(`/intake-sheets/${id}/attachments`) };
		} catch (e) {
			return { success: false, error: /** @type {Error} */ (e).message };
		}
	}

	/**
	 * Upload a new version (earlier versions are kept).
	 * @param {string|number} id @param {string} kind @param {File} file @param {string} [notes]
	 */
	async uploadAttachment(id, kind, file, notes = '') {
		const form = new FormData();
		form.append('kind', kind);
		form.append('file', file);
		if (notes.trim()) form.append('notes', notes.trim());
		try {
			return { success: true, data: await api.upload(`/intake-sheets/${id}/attachments`, form) };
		} catch (e) {
			const err = /** @type {any} */ (e);
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	/**
	 * The file as a Blob, for viewing it in the page (PDF and images).
	 * @param {string|number} id @param {string|number} attachmentId
	 */
	async viewAttachment(id, attachmentId) {
		try {
			return { success: true, data: await api.blob(`/intake-sheets/${id}/attachments/${attachmentId}/download`, { inline: 1 }) };
		} catch (e) {
			return { success: false, error: /** @type {Error} */ (e).message };
		}
	}

	/** @param {string|number} id @param {string|number} attachmentId @param {string} name */
	async downloadAttachment(id, attachmentId, name) {
		try {
			await api.download(`/intake-sheets/${id}/attachments/${attachmentId}/download`, {}, name);
			return { success: true };
		} catch (e) {
			return { success: false, error: /** @type {Error} */ (e).message };
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
