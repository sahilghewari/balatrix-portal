import { useEffect, useState } from 'react'
import { fetchSubscriptionSummary } from '../../services/subscriptionApi'
import { useAuth } from '../../hooks/useAuth'

function formatCurrency(cents = 0, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Number(cents || 0) / 100)
}

export default function SupportDashboard() {
  const { token } = useAuth()
  const [state, setState] = useState({ status: 'loading', summary: null, error: '' })

  useEffect(() => {
    let ignore = false

    async function loadSummary() {
      setState((prev) => ({ ...prev, status: 'loading', error: '' }))

      try {
        const data = await fetchSubscriptionSummary(token)
        if (!ignore) {
          setState({ status: 'success', summary: data.summary, error: '' })
        }
      } catch (error) {
        console.error('Failed to load subscription summary', error)
        if (!ignore) {
          setState({ status: 'error', summary: null, error: error.message || 'Unable to load summary.' })
        }
      }
    }

    loadSummary()

    return () => {
      ignore = true
    }
  }, [token])

  const { status, summary, error } = state

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Support Dashboard</h1>
        <p className="mt-3 text-sm text-slate-600">
          Access call routing tools, extensions, and monitoring features.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Subscription overview</h2>
        <p className="mt-1 text-sm text-slate-500">Support teams can view plan limits and renewal dates.</p>

        {status === 'loading' && (
          <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            Loading subscription details…
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {status === 'success' && !summary && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No subscription assigned yet. Contact your administrator for access.
          </div>
        )}

        {status === 'success' && summary && (
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">{summary.status}</dd>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan tier</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">{summary.planTier}</dd>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Billing cycle</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">{summary.billingCycle}</dd>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Next billing</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {summary.nextBillingDate ? new Date(summary.nextBillingDate).toLocaleDateString() : 'Not scheduled'}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan amount</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {formatCurrency(summary.planAmountCents, summary.currency?.toUpperCase())}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Add-on total</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {formatCurrency(summary.addonAmountCents, summary.currency?.toUpperCase())}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </section>
  )
}
