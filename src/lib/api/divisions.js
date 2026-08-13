import { api } from './client.js';

class DivisionsService {
	async getStatistics() {
		try {
			const response = await api.get('/divisions/statistics');
			return { success: true, data: response?.data || response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const divisionsService = new DivisionsService();
