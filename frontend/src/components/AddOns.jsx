import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const ADDON_CATALOG = [
  {
    id: 'tfn',
    label: 'Extra Toll-Free Number',
    description: 'Provision an additional toll-free number for inbound campaigns.',
    price: 19.99,
    unit: 'per number',
  },
  {
    id: 'extension',
    label: 'Additional Extension',
    description: 'Create an extra extension for a new agent or department.',
    price: 4.99,
    unit: 'per extension',
  },
  {
    id: 'monitoring',
    label: 'Monitoring Pack',
    description: 'Enable live call monitoring, barge-in, and whisper tools.',
    price: 29.0,
    unit: 'per month',
  },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export default function AddOns() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [addons, setAddons] = useState(() =>
    ADDON_CATALOG.reduce((acc, item) => {
      acc[item.id] = { active: false, lastPurchasedAt: null }
      return acc
    }, {})
  )

  const headers = useMemo(() => {
    const base = { 'Content-Type': 'application/json' }
    if (token) {
      base.Authorization = `Bearer ${token}`
    }
    return base
  }, [token])

  useEffect(() => {
    const loadAddons = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE_URL}/addons`, {
          headers,
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to load add-on details.')
        }

        const payload = await response.json()
        const statusMap = payload?.addons || {}

        setAddons((prev) => ({
          ...prev,
          ...Object.keys(statusMap).reduce((acc, key) => {
            acc[key] = {
              active: Boolean(statusMap[key]?.active),
              lastPurchasedAt: statusMap[key]?.lastPurchasedAt || null,
            }
            return acc
          }, {}),
        }))
      } catch (err) {
        console.error('Add-ons fetch error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadAddons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePurchase = async (addonId) => {
    setSubmitting(true)
    setError('')

    try {
      const addon = ADDON_CATALOG.find((item) => item.id === addonId)
      if (!addon) {
        throw new Error('Unknown add-on requested.')
      }

      const response = await fetch(`${API_BASE_URL}/billing/create-checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          intent: 'wallet_top_up',
          walletTopUpCents: Math.round(addon.price * 100),
          successUrl: `${window.location.origin}/admin/checkout/success`,
          cancelUrl: `${window.location.origin}/admin/addons`,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Could not start checkout for add-on purchase.')
      }

      const payload = await response.json()

      if (payload?.url) {
        window.location.href = payload.url
        return
      }

      if (payload?.clientToken) {
        navigate('/admin/checkout/success', {
          state: {
            selection: {
              intent: 'wallet_top_up',
              walletTopUpCents: Math.round(addon.price * 100),
              addonId,
            },
          },
        })
        return
      }

      throw new Error('Checkout session did not return redirect details.')
    } catch (err) {
      console.error('Add-on purchase error:', err)
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Add-ons Marketplace</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enhance your subscription with toll-free numbers, additional extensions, and monitoring capabilities. Purchases deduct from your wallet balance instantly.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {ADDON_CATALOG.map((addon) => {
          const status = addons[addon.id]
          const isActive = status?.active

          return (
            <article
              key={addon.id}
              className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{addon.label}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <p className="mt-3 flex-1 text-sm text-slate-600">{addon.description}</p>

              <div className="mt-4">
                <p className="text-2xl font-semibold text-slate-900">
                  {formatCurrency(addon.price)}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-500">{addon.unit}</p>
              </div>

              {status?.lastPurchasedAt && (
                <p className="mt-3 text-xs text-slate-500">
                  Last activated {new Date(status.lastPurchasedAt).toLocaleString()}
                </p>
              )}

              <button
                type="button"
                onClick={() => handlePurchase(addon.id)}
                className="btn-primary mt-6"
                disabled={submitting || loading}
              >
                {isActive ? 'Purchase Again' : 'Purchase'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
