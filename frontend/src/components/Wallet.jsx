import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import WalletTopUpModal from './wallet/WalletTopUpModal.jsx'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const LOW_BALANCE_THRESHOLD = 50

function formatCurrency(value) {
  if (typeof value !== 'number') return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export default function Wallet() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState(0)
  const [freeMinutes, setFreeMinutes] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const headers = useMemo(() => {
    const result = {
      'Content-Type': 'application/json',
    }

    if (token) {
      result.Authorization = `Bearer ${token}`
    }

    return result
  }, [token])

  const fetchWallet = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/wallet`, {
        headers,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to load wallet details.')
      }

      const payload = await response.json()
      const wallet = payload?.wallet || {}

      setBalance(Number(wallet.balance) || 0)
      setFreeMinutes(Number(wallet.freeMinutesRemaining ?? wallet.freeMinutes) || 0)
      setTransactions(payload?.transactions || [])
    } catch (err) {
      console.error('Wallet fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchWallet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchWallet()
  }

  const handleTopUpCompleted = () => {
    setTopUpOpen(false)
    handleRefresh()
  }

  const isLowBalance = balance <= LOW_BALANCE_THRESHOLD

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Wallet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Monitor your available balance, free minutes, and recent transactions. Add funds instantly to keep services active.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Current Balance</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCurrency(balance)}</p>
          {isLowBalance && (
            <p className="mt-3 text-sm font-medium text-red-600">
              Warning: Low balance. Please recharge to avoid service disruption.
            </p>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Free Minutes Remaining</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{freeMinutes.toLocaleString()}</p>
          <p className="mt-3 text-sm text-slate-600">
            Free minutes are consumed before wallet deductions each billing cycle.
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Add Funds</p>
          <p className="mt-3 text-sm text-slate-600">
            Top up via Stripe. Funds become available once payment completes successfully.
          </p>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => setTopUpOpen(true)}
          >
            Start Stripe Top-Up
          </button>
        </article>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Transaction History</h2>
            <p className="text-sm text-slate-600">Track wallet recharges, deductions, and adjustments.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-600">
            No transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Balance After</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {transactions.map((transaction) => (
                  <tr key={transaction.id || `${transaction.createdAt}-${transaction.amount}`} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      {transaction.createdAt
                        ? new Date(transaction.createdAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-6 py-3 capitalize">{transaction.type || 'unknown'}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {formatCurrency(Number(transaction.amount) || 0)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {formatCurrency(Number(transaction.balanceAfter) || 0)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{transaction.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {topUpOpen && (
        <WalletTopUpModal
          onClose={() => setTopUpOpen(false)}
          onCompleted={handleTopUpCompleted}
        />
      )}
    </section>
  )
}
