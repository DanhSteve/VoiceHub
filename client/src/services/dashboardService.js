import api from './api';
import { unwrapApiData } from '../utils/helpers';

/** GET /api/dashboard/summary — counts + meetings (gateway BFF). */
export async function fetchDashboardSummary() {
  const res = await api.get('/dashboard/summary', { skipGlobalErrorHandling: true });
  return unwrapApiData(res) ?? res;
}
