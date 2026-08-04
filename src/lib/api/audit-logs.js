import { api } from './client.js';

class AuditLogsService {
  /** @param {Record<string,any>} params */
  async getLogs(params = {}) {
    try {
      const response = await api.get('/audit-logs', params);
      return { success: true, data: response };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export const auditLogsService = new AuditLogsService();
