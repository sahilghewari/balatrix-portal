const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function buildHeaders(token, extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

async function parseResponse(response) {
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const error = new Error(payload.message || response.statusText || 'Request failed')
    error.status = response.status
    error.data = payload
    throw error
  }

  return payload
}

export async function getSummary(token) {
  const response = await fetch(`${API_BASE_URL}/wallet/summary`, {
    method: 'GET',
    headers: buildHeaders(token),
    credentials: 'include',
  })

  const payload = await parseResponse(response)
  return { data: payload }
}

export async function createTopUp(token, body) {
  const response = await fetch(`${API_BASE_URL}/wallet/top-ups`, {
    method: 'POST',
    headers: buildHeaders(token),
    credentials: 'include',
    body: JSON.stringify(body),
  })

  const payload = await parseResponse(response)
  return { data: payload }
}

export async function listTopUps(token, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const response = await fetch(`${API_BASE_URL}/wallet/top-ups?${params.toString()}`, {
    method: 'GET',
    headers: buildHeaders(token),
    credentials: 'include',
  })

  const payload = await parseResponse(response)
  return { data: payload }
}

export default {
  getSummary,
  createTopUp,
  listTopUps,
}
