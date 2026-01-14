import apiClient from './apiClient';

export async function listSupportUsers(adminId) {
  const params = adminId ? { adminId } : undefined;
  const response = await apiClient.get('/support-users', { params });
  return response.data.users;
}

export async function createSupportUser(payload) {
  const response = await apiClient.post('/support-users', payload);
  return response.data.user;
}

export async function updateSupportUser(supportUserId, payload) {
  const response = await apiClient.patch(`/support-users/${supportUserId}`, payload);
  return response.data.user;
}

export async function deleteSupportUser(supportUserId, params) {
  await apiClient.delete(`/support-users/${supportUserId}`, { params });
}

export async function getSeatAllocation(adminId) {
  const params = adminId ? { adminId } : undefined;
  const response = await apiClient.get('/support-users/allocation', { params });
  return response.data.allocation;
}

export async function updateSeatAllocation(payload) {
  const response = await apiClient.put('/support-users/allocation', payload);
  return response.data.allocation;
}

