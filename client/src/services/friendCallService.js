import api from './api';

/**
 * Cuộc gọi 1-1 bạn bè — voice-service `/api/voice/calls/*`
 */
const friendCallService = {
  initiate: async ({ calleeId, media = 'video' }) => {
    return api.post('/voice/calls/initiate', { calleeId, media });
  },

  getCall: async (callId) => {
    return api.get(`/voice/calls/${encodeURIComponent(callId)}`);
  },

  accept: async (callId) => {
    return api.post(`/voice/calls/${encodeURIComponent(callId)}/accept`);
  },

  reject: async (callId) => {
    return api.post(`/voice/calls/${encodeURIComponent(callId)}/reject`);
  },

  cancel: async (callId) => {
    return api.post(`/voice/calls/${encodeURIComponent(callId)}/cancel`);
  },

  end: async (callId) => {
    return api.post(`/voice/calls/${encodeURIComponent(callId)}/end`);
  },
};

export default friendCallService;
