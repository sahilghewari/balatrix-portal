const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function buildHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function handleResponse(response, fallbackMessage) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = payload.message || fallbackMessage
    throw new Error(message)
  }

  return response.json()
}

export async function fetchUsageSummary(token, params = {}) {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${API_BASE_URL}/usage/summary${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: buildHeaders(token),
  })

  return handleResponse(response, 'Unable to load usage summary.')
}

export async function fetchRecentCdrs(token, params = {}) {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${API_BASE_URL}/usage/cdrs${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: buildHeaders(token),
  })

  return handleResponse(response, 'Unable to load recent calls.')
}

export async function fetchUsageLedger(token, params = {}) {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${API_BASE_URL}/usage/ledger${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: buildHeaders(token),
  })

  return handleResponse(response, 'Unable to load usage ledger.')
}

export async function fetchWalletDeductions(token, params = {}) {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${API_BASE_URL}/usage/wallet-deductions${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: buildHeaders(token),
  })

  return handleResponse(response, 'Unable to load wallet deductions.')
}

