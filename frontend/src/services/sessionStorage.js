const STORAGE_KEY = 'balatrix_portal_token';

export function loadToken() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function saveToken(token) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export default {
  STORAGE_KEY,
  loadToken,
  saveToken,
  clearToken,
};
