const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function buildHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
}

export async function get(path, { params, headers } = {}) {
  const search = params
    ? `?${new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            acc[key] = value;
          }
          return acc;
        }, {})
      ).toString()}`
    : '';
  const response = await fetch(`${API_BASE_URL}${path}${search}`, {
    method: 'GET',
    headers: buildHeaders(headers),
    credentials: 'include',
  });

  return parseResponse(response);
}

export async function post(path, body, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(options.headers),
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}

export async function patch(path, body, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(options.headers),
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return parseResponse(response);
}

export async function del(path, { params, headers } = {}) {
  const search = params
    ? `?${new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            acc[key] = value;
          }
          return acc;
        }, {})
      ).toString()}`
    : '';
  const response = await fetch(`${API_BASE_URL}${path}${search}`, {
    method: 'DELETE',
    headers: buildHeaders(headers),
    credentials: 'include',
  });

  return parseResponse(response);
}

async function parseResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(payload.message || response.statusText || 'Request failed');
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return { data: payload };
}

export default {
  get,
  post,
  patch,
  delete: del,
};
