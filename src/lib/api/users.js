import { api } from './client.js';

class UsersService {
	async getUsers(params = {}) {
		try {
			const response = await api.get('/users', params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async getUser(id) {
		try {
			const response = await api.get(`/users/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async createUser(data) {
		try {
			const response = await api.post('/users', data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	async updateUser(id, data) {
		try {
			const response = await api.put(`/users/${id}`, data);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message, validationErrors: err.validationErrors };
		}
	}

	async deleteUser(id) {
		try {
			const response = await api.delete(`/users/${id}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async restoreUser(id) {
		try {
			const response = await api.post(`/users/${id}/restore`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async forceDeleteUser(id) {
		try {
			await api.delete(`/users/${id}/force`);
			return { success: true };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async activateUser(id) {
		try {
			const response = await api.post(`/users/${id}/activate`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async deactivateUser(id) {
		try {
			const response = await api.post(`/users/${id}/deactivate`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async assignRole(id, roleSlug) {
		try {
			const response = await api.post(`/users/${id}/assign-role`, { role_slug: roleSlug });
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async removeRole(id, roleSlug) {
		try {
			// DELETE /api/users/{id}/remove-role requires a JSON body
			const response = await api.delete(`/users/${id}/remove-role`, { role_slug: roleSlug });
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async syncRoles(id, roles) {
		try {
			const response = await api.post(`/users/${id}/sync-roles`, { roles });
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async getRoles() {
		try {
			const response = await api.get('/roles');
			return { success: true, data: Array.isArray(response) ? response : [] };
		} catch (err) {
			return { success: false, error: err.message, data: [] };
		}
	}

	async getUserAuditLogs(userId, params = {}) {
		try {
			const response = await api.get(`/users/${userId}/audit-logs`, params);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	/** List a user's remembered ("skip 2FA") devices — Super Admin / LIS Admin only. */
	async getTrustedDevices(userId) {
		try {
			const response = await api.get(`/users/${userId}/trusted-devices`);
			return { success: true, data: response.devices || [] };
		} catch (err) {
			return { success: false, error: err.message, data: [] };
		}
	}

	async revokeTrustedDevice(userId, deviceId) {
		try {
			const response = await api.delete(`/users/${userId}/trusted-devices/${deviceId}`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}

	async revokeAllTrustedDevices(userId) {
		try {
			const response = await api.post(`/users/${userId}/trusted-devices/revoke-all`);
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const usersService = new UsersService();
