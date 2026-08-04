import { api } from './client.js';

class LisDashboardService {
  async getDashboard() {
    try {
      const response = await api.get('/dashboard');
      return { success: true, data: response };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export const lisDashboardService = new LisDashboardService();
