import { api } from './client.js';

// Backend's generic org-wide dashboard endpoint (users + audit log stats).
// Shared by Super Admin (unscoped) and Division User Administrator
// (scoped to their own division by the backend — see DashboardController::index()).
class DashboardService {
	async getDashboard() {
		try {
			const response = await api.get('/dashboard');
			return { success: true, data: response };
		} catch (err) {
			return { success: false, error: err.message };
		}
	}
}

export const dashboardService = new DashboardService();
