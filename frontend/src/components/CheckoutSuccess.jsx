import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function formatCurrency(cents = 0, currency = 'USD') {
  if (Number.isNaN(Number(cents))) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Number(cents) / 100)
}

export default function CheckoutSuccess() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [searchParams] = useSearchParams()
  const clientToken = searchParams.get('session')

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

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
    if (!clientToken) {
      setStatus('error')
      setError('Missing checkout session token. Please try purchasing again.')
      return
    }

    if (!token) {
      setStatus('error')
      setError('Please log in again to finalize your checkout.')
      return
    }

    let ignore = false

    async function finalizeCheckout() {
      try {
        const response = await fetch(`${API_BASE_URL}/billing/finalize-checkout`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ clientToken }),
        })

        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload.message || 'Unable to finalize checkout.')
        }

        if (!ignore) {
          setResult(payload)
          setStatus('success')
        }
      } catch (err) {
        console.error('Finalize checkout error:', err)
        if (!ignore) {
          setError(err.message || 'Payment confirmation failed.')
          setStatus('error')
        }
      }
    }

    finalizeCheckout()

    return () => {
      ignore = true
    }
  }, [clientToken, headers, token])

  const subscription = result?.subscription
  const wallet = result?.wallet

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center gap-6">
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <h1 className="text-xl font-semibold text-slate-900">Finalizing your purchase…</h1>
          <p className="text-sm text-slate-600">
            We’re confirming the payment with Stripe. This usually takes only a moment.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm">{error}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary w-auto"
              onClick={() => navigate('/admin/plans', { replace: true })}
            >
              Back to Plans
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {status === 'success' && subscription && (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">Subscription activated</h1>
            <p className="text-sm text-slate-600">
              Your {subscription.planTier} plan is now active. You can continue to set up toll-free numbers and extensions.
            </p>
          </header>

          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Billing cycle</dt>
              <dd className="font-medium text-slate-900">{subscription.billingCycle}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Plan price</dt>
              <dd className="font-medium text-slate-900">
                {formatCurrency(subscription.planAmountCents, subscription.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Add-ons</dt>
              <dd className="font-medium text-slate-900">
                {formatCurrency(subscription.addonAmountCents, subscription.currency)}
              </dd>
            </div>
            {subscription.nextBillingDate && (
              <div>
                <dt className="text-slate-500">Next billing date</dt>
                <dd className="font-medium text-slate-900">
                  {new Date(subscription.nextBillingDate).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary w-auto"
              onClick={() => navigate('/admin/tfns/select', { replace: true })}
            >
              Set Up Toll-Free Number
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/admin/dashboard')}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {status === 'success' && !subscription && wallet && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Wallet recharged</h1>
          <p className="text-sm text-slate-600">
            Your wallet has been topped up successfully. You can now continue using calling services without interruption.
          </p>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Current balance</dt>
              <dd className="font-medium text-slate-900">${Number(wallet.balance).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Balance status</dt>
              <dd className="font-medium text-slate-900">{wallet.balanceZero ? 'Zero' : 'Active'}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn-primary w-auto"
            onClick={() => navigate('/wallet', { replace: true })}
          >
            View Wallet
          </button>
        </div>
      )}
    </section>
  )
}
