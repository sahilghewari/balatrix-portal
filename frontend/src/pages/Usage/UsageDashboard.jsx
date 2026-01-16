import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  fetchUsageSummary,
  fetchRecentCdrs,
  fetchUsageLedger,
  fetchWalletDeductions,
} from '../../services/usageApi.js'
import { useAuth } from '../../hooks/useAuth.jsx'

function formatMinutes(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function formatCurrency(cents = 0, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch (error) {
    console.warn('Unable to format date', value, error)
    return '—'
  }
}

function formatRelative(value) {
  if (!value) return '—'
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true })
  } catch (error) {
    console.warn('Unable to format relative date', value, error)
    return '—'
  }
}

function StatusPill({ label }) {
  const tone = useMemo(() => {
    switch (label) {
      case 'usage_charge':
        return 'bg-amber-100 text-amber-700'
      case 'wallet_deduction':
        return 'bg-indigo-100 text-indigo-700'
      case 'rollover_credit':
        return 'bg-emerald-100 text-emerald-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }, [label])

  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

export default function UsageDashboard() {
  const { token, user } = useAuth()
  const [adminIdOverride, setAdminIdOverride] = useState('')
  const [summaryState, setSummaryState] = useState({ status: 'idle', data: null, error: '' })
  const [cdrState, setCdrState] = useState({ status: 'idle', items: [], error: '' })
  const [ledgerState, setLedgerState] = useState({ status: 'idle', items: [], error: '' })
  const [walletState, setWalletState] = useState({ status: 'idle', data: null, items: [], error: '' })

  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    const params = {}
    if (isSuperAdmin && adminIdOverride) {
      params.adminId = adminIdOverride.trim()
    }

    async function loadSummary() {
      setSummaryState((prev) => ({ ...prev, status: 'loading', error: '' }))
      try {
        const data = await fetchUsageSummary(token, params)
        setSummaryState({ status: 'success', data, error: '' })
      } catch (error) {
        console.error('Failed to load usage summary', error)
        setSummaryState({ status: 'error', data: null, error: error.message || 'Unable to load summary.' })
      }
    }

    async function loadCdrs() {
      setCdrState((prev) => ({ ...prev, status: 'loading', error: '' }))
      try {
        const data = await fetchRecentCdrs(token, { ...params, limit: 10 })
        setCdrState({ status: 'success', items: data.cdrs || [], error: '' })
      } catch (error) {
        console.error('Failed to load CDRs', error)
        setCdrState({ status: 'error', items: [], error: error.message || 'Unable to load recent calls.' })
      }
    }

    async function loadLedger() {
      setLedgerState((prev) => ({ ...prev, status: 'loading', error: '' }))
      try {
        const data = await fetchUsageLedger(token, { ...params, limit: 10 })
        setLedgerState({ status: 'success', items: data.entries || [], error: '' })
      } catch (error) {
        console.error('Failed to load usage ledger', error)
        setLedgerState({ status: 'error', items: [], error: error.message || 'Unable to load usage ledger.' })
      }
    }

    async function loadWallet() {
      setWalletState((prev) => ({ ...prev, status: 'loading', error: '' }))
      try {
        const data = await fetchWalletDeductions(token, { ...params, limit: 10 })
        setWalletState({
          status: 'success',
          data: data.wallet,
          items: data.deductions || [],
          error: '',
        })
      } catch (error) {
        console.error('Failed to load wallet deductions', error)
        setWalletState({ status: 'error', data: null, items: [], error: error.message || 'Unable to load wallet deductions.' })
      }
    }

    loadSummary()
    loadCdrs()
    loadLedger()
    loadWallet()
  }, [token, isSuperAdmin, adminIdOverride])

  const summary = summaryState.data?.summary
  const { currency } = summary || { currency: 'usd' }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usage & Call Activity</h1>
          <p className="mt-2 text-sm text-slate-600">
            Track free-minute burn-down, recent calls, and wallet deductions for this tenant.
          </p>
        </div>

        {isSuperAdmin && (
          <label className="flex w-full max-w-sm flex-col text-sm text-slate-600">
            <span className="mb-1 font-medium text-slate-700">Tenant admin ID</span>
            <input
              type="text"
              value={adminIdOverride}
              onChange={(event) => setAdminIdOverride(event.target.value)}
              placeholder="Paste admin UUID"
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        )}
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Free-minute balance</h2>
            <p className="text-sm text-slate-500">Live view of remaining included minutes and rollover.</p>
          </div>
          {summaryState.status === 'loading' && <div className="text-xs text-slate-500">Refreshing…</div>}
        </header>

        {summaryState.status === 'error' && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {summaryState.error}
          </div>
        )}

        {summaryState.status === 'success' && !summary && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No subscription activity found yet.
          </div>
        )}

        {summary && (
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Included minutes</dt>
              <dd className="mt-2 text-xl font-semibold text-slate-900">{formatMinutes(summary.includedMinutes)}</dd>
              <dd className="text-xs text-slate-500">≈ {formatMinutes(summary.includedSeconds / 60)} min</dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Consumed this period</dt>
              <dd className="mt-2 text-xl font-semibold text-slate-900">{formatMinutes(summary.consumedMinutes)}</dd>
              <dd className="text-xs text-slate-500">Balance updates nightly via CDR imports.</dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Remaining minutes</dt>
              <dd className="mt-2 text-xl font-semibold text-emerald-600">{formatMinutes(summary.remainingMinutes)}</dd>
              <dd className="text-xs text-slate-500">Includes rollover: {formatMinutes(summary.rolloverMinutes)} min</dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Billing period</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-900">
                {summary.billingPeriodStart ? new Date(summary.billingPeriodStart).toLocaleDateString() : '—'} →{' '}
                {summary.billingPeriodEnd ? new Date(summary.billingPeriodEnd).toLocaleDateString() : '—'}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Plan tier</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-900">{summary.planTier}</dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Currency</dt>
              <dd className="mt-2 text-sm font-semibold uppercase text-slate-900">{summary.currency}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent calls</h2>
              <p className="text-sm text-slate-500">Last 10 rated call detail records.</p>
            </div>
            {cdrState.status === 'loading' && <div className="text-xs text-slate-500">Refreshing…</div>}
          </header>

          {cdrState.status === 'error' && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {cdrState.error}
            </div>
          )}

          {cdrState.status === 'success' && cdrState.items.length === 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No CDR data available yet.
            </div>
          )}

          {cdrState.status === 'success' && cdrState.items.length > 0 && (
            <table className="mt-4 w-full table-auto overflow-hidden rounded-lg text-left text-sm text-slate-600">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Rated cost</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {cdrState.items.map((cdr) => (
                  <tr key={cdr.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{cdr.destination || 'Unknown'}</td>
                    <td className="px-4 py-3 capitalize">{cdr.direction}</td>
                    <td className="px-4 py-3">{Math.round((cdr.billableSeconds || 0) / 60)} min</td>
                    <td className="px-4 py-3">{formatCurrency(cdr.costCents, cdr.currency?.toUpperCase() || currency)}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-500">{formatDate(cdr.callStartedAt)}</div>
                      <div className="text-[11px] text-slate-400">{formatRelative(cdr.callStartedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Usage ledger</h2>
              <p className="text-sm text-slate-500">Charges, rollover credits, and wallet deductions.</p>
            </div>
            {ledgerState.status === 'loading' && <div className="text-xs text-slate-500">Refreshing…</div>}
          </header>

          {ledgerState.status === 'error' && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {ledgerState.error}
            </div>
          )}

          {ledgerState.status === 'success' && ledgerState.items.length === 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No usage ledger entries recorded yet.
            </div>
          )}

          {ledgerState.status === 'success' && ledgerState.items.length > 0 && (
            <ul className="mt-4 space-y-3">
              {ledgerState.items.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusPill label={entry.entryType} />
                        <span className="text-xs text-slate-500">{formatRelative(entry.occurredAt)}</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        Seconds: {entry.secondsDelta}
                        {entry.cdrRecordId && <span className="text-slate-400"> · CDR #{entry.cdrRecordId.slice(0, 8)}</span>}
                      </div>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <pre className="mt-2 overflow-x-auto text-xs text-slate-500">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="text-right text-sm font-semibold text-slate-900">
                      {formatCurrency(entry.amountCents, entry.currency?.toUpperCase() || currency)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Wallet deductions</h2>
            <p className="text-sm text-slate-500">Recent usage deductions and wallet balance snapshot.</p>
          </div>
          {walletState.status === 'loading' && <div className="text-xs text-slate-500">Refreshing…</div>}
        </header>

        {walletState.status === 'error' && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {walletState.error}
          </div>
        )}

        {walletState.status === 'success' && !walletState.data && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Wallet not initialized for this tenant yet.
          </div>
        )}

        {walletState.status === 'success' && walletState.data && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Current balance</dt>
              <dd className={`mt-2 text-xl font-semibold ${walletState.data.balanceZero ? 'text-amber-600' : 'text-slate-900'}`}>
                {formatCurrency(walletState.data.balance, walletState.data.currency?.toUpperCase() || currency)}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Auto-charge</dt>
              <dd className="mt-2 text-xs font-semibold uppercase text-slate-900">
                {walletState.data.autoCharge ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
          </div>
        )}

        {walletState.status === 'success' && walletState.items.length > 0 && (
          <table className="mt-6 w-full table-auto overflow-hidden rounded-lg text-left text-sm text-slate-600">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Occurred</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {walletState.items.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3">
                    <div>{formatDate(entry.occurredAt)}</div>
                    <div className="text-xs text-slate-400">{formatRelative(entry.occurredAt)}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatCurrency(entry.amountCents, entry.currency?.toUpperCase() || currency)}
                  </td>
                  <td className="px-4 py-3">
                    <pre className="max-w-xl overflow-x-auto text-xs text-slate-500">
                      {JSON.stringify(entry.metadata || {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  )
}

