import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export default function Checkout() {
  const location = useLocation()
  const selection = location.state?.selection
  const { token } = useAuth()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const headers = useMemo(() => {
    const base = {
      'Content-Type': 'application/json',
    }

    if (token) {
      base.Authorization = `Bearer ${token}`
    }

    return base
  }, [token])

  useEffect(() => {
    if (!selection) return

    let ignore = false
    const createSession = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`${API_BASE_URL}/billing/create-checkout`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            intent: 'plan_purchase',
            planTier: selection.planTier,
            billingCycle: selection.billingCycle,
            addons: selection.addons || [],
            successUrl: window.location.origin + '/admin/checkout/success',
            cancelUrl: window.location.origin + '/admin/plans',
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Unable to start checkout.')
        }

        const { url } = await response.json()
        if (!url) {
          throw new Error('Checkout session did not provide a redirect URL.')
        }

        if (!ignore) {
          window.location.href = url
        }
      } catch (err) {
        console.error('Checkout error:', err)
        if (!ignore) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    createSession()

    return () => {
      ignore = true
    }
  }, [selection, headers])

  if (!selection) {
    return <Navigate to="/admin/plans" replace />
  }

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      <h1 className="text-xl font-semibold text-slate-900">Redirecting to Stripe…</h1>
      <p className="text-sm text-slate-600">Please wait while we prepare your secure checkout session.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && (
        <a
          href="/admin/plans"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Back to plans
        </a>
      )}
    </section>
  )
}
