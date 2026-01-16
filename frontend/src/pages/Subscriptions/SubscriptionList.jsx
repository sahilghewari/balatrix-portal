import { useEffect, useState } from 'react'
import { fetchSubscriptions } from '../../services/subscriptionApi.js'
import { useAuth } from '../../hooks/useAuth.jsx'

function formatCurrency(amountCents, currency) {
  const value = Number(amountCents || 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value)
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

const statusTone = {
  active: 'ring-emerald-200 text-emerald-700 bg-emerald-50',
  canceled: 'ring-slate-200 text-slate-600 bg-slate-50',
  inactive: 'ring-amber-200 text-amber-700 bg-amber-50',
  overdue: 'ring-rose-200 text-rose-700 bg-rose-50',
}

export default function SubscriptionList() {
  const { token } = useAuth()
  const [state, setState] = useState({ status: 'idle', items: [], error: '' })

  useEffect(() => {
    let ignore = false

    async function load() {
      setState((prev) => ({ ...prev, status: 'loading', error: '' }))
      try {
        const data = await fetchSubscriptions(token)
        if (!ignore) {
          setState({ status: 'success', items: data.subscriptions || [], error: '' })
        }
      } catch (error) {
        console.error('Failed to load subscriptions', error)
        if (!ignore) {
          setState({ status: 'error', items: [], error: error.message || 'Unable to load subscriptions.' })
        }
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [token])

  const { status, items, error } = state

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Subscriptions</h1>
        <p className="mt-3 text-sm text-slate-600">
          Review past and current plans, billing cycles, and renewal details associated with your account.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {status === 'loading' && (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            Loading subscriptions…
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}

        {status === 'success' && items.length === 0 && (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            <p>No subscriptions found yet. Choose a plan to get started.</p>
            <a
              href="/admin/plans"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Browse plans
            </a>
          </div>
        )}

        {status === 'success' && items.length > 0 && (
          <div className="space-y-4">
            {items.map((subscription) => (
              <article
                key={subscription.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:border-indigo-200 hover:shadow"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {subscription.planTier?.replace('_', ' ') || 'Unknown plan'}
                    </h2>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{subscription.billingCycle} billing</p>
                    <dl className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan amount</dt>
                        <dd className="mt-1 font-medium text-slate-900">
                          {formatCurrency(subscription.planAmountCents, subscription.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Add-ons</dt>
                        <dd className="mt-1 font-medium text-slate-900">
                          {formatCurrency(subscription.addonAmountCents, subscription.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Start date</dt>
                        <dd className="mt-1 text-slate-900">
                          {subscription.startDate ? new Date(subscription.startDate).toLocaleDateString() : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Next billing</dt>
                        <dd className="mt-1 text-slate-900">
                          {subscription.nextBillingDate ? new Date(subscription.nextBillingDate).toLocaleDateString() : 'Not scheduled'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-col items-start gap-3 text-sm text-slate-600 sm:items-end">
                    <span
                      className={classNames(
                        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset',
                        statusTone[subscription.status] || statusTone.inactive
                      )}
                    >
                      {subscription.status}
                    </span>
                    <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-500">
                      <p>Auto-renew: {subscription.autoRenew ? 'Enabled' : 'Disabled'}</p>
                      {subscription.monitoringPurchased && <p>Monitoring add-on enabled</p>}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
