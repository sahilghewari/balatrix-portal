const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export async function fetchSubscriptionSummary(token) {
  const response = await fetch(`${API_BASE_URL}/subscriptions/summary`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = payload.message || 'Unable to load subscription summary.'
    throw new Error(message)
  }

  return response.json()
}

export async function fetchSubscriptions(token) {
  const response = await fetch(`${API_BASE_URL}/subscriptions`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = payload.message || 'Unable to load subscriptions.'
    throw new Error(message)
  }

  return response.json()
}
