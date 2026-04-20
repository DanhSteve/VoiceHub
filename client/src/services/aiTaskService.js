import api from './api';

/**
 * AI Task Service — qua API Gateway → ai-task-service
 */
const aiTaskService = {
  /** POST /api/ai/tasks/extract */
  extract: async (body, headers = {}) => {
    return await api.post('/ai/tasks/extract', body, { headers });
  },

  /** GET /api/ai/tasks/extractions/:id */
  getExtraction: async (extractionId, headers = {}) => {
    return await api.get(`/ai/tasks/extractions/${extractionId}`, { headers });
  },

  /** POST /api/ai/tasks/confirm */
  confirm: async (body, headers = {}) => {
    return await api.post('/ai/tasks/confirm', body, { headers });
  },
};

export default aiTaskService;
