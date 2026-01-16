import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useAuth } from '../../hooks/useAuth.jsx'
import walletApi from '../../services/walletApi.js'

const DEFAULT_AMOUNTS = [25, 50, 100, 250]

function centsToCurrency(amountCents, currency = 'usd') {
  if (typeof amountCents !== 'number') return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

export default function WalletTopUpModal({ onClose, onCompleted }) {
  const stripe = useStripe()
  const elements = useElements()
  const { token } = useAuth()
  const [selectedAmount, setSelectedAmount] = useState(DEFAULT_AMOUNTS[0] * 100)
  const [customAmount, setCustomAmount] = useState('')
  const [currency, setCurrency] = useState('usd')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [inFlight, setInFlight] = useState(false)

  useEffect(() => {
    let active = true
    const preload = async () => {
      try {
        const { data } = await walletApi.getSummary(token)
        if (!active) return
        if (data?.currency) {
          setCurrency(data.currency.toLowerCase())
        }
      } catch (error) {
        console.warn('Failed to load wallet summary before top-up', error)
      }
    }
    preload()
    return () => {
      active = false
    }
  }, [token])

  const amountCents = useMemo(() => {
    if (customAmount) {
      const parsed = Number(customAmount)
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null
    }
    return selectedAmount
  }, [selectedAmount, customAmount])

  const handleConfirm = async (event) => {
    event.preventDefault()
    if (!stripe || !elements) return

    if (!amountCents || amountCents <= 0) {
      setStatus('error')
      setMessage('Enter a valid amount to continue.')
      return
    }

    setInFlight(true)
    setStatus('processing')
    setMessage('Creating Stripe payment…')

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        throw new Error('Payment form is not ready yet. Please try again.')
      }

      const { data } = await walletApi.createTopUp(token, {
        amountCents,
        currency,
      })

      setMessage('Confirming payment with Stripe…')

      const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card: cardElement,
        },
      })

      if (error) {
        setStatus('error')
        setMessage(error.message || 'Stripe could not confirm the payment.')
        return
      }

      if (paymentIntent?.status === 'requires_action') {
        setStatus('pending_action')
        setMessage('Additional authentication required. Please follow the prompt in the embedded window.')
        return
      }

      if (paymentIntent?.status === 'succeeded') {
        setStatus('success')
        setMessage('Top-up successful! Updating wallet balance…')
        onCompleted?.()
        return
      }

      setStatus('pending_action')
      setMessage('Payment submitted. Please complete any additional steps that appear.')
    } catch (error) {
      console.error('Top-up error:', error)
      setStatus('error')
      setMessage(error.message || 'Failed to complete the top-up.')
    } finally {
      setInFlight(false)
    }
  }

  const isSubmitDisabled = !stripe || !elements || !amountCents || amountCents <= 0 || inFlight

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-[480px] rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Stripe Top-Up</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add funds securely. Your card will be charged once, and the wallet updates automatically when Stripe marks the payment as succeeded.
              </p>
            </div>
            <button type="button" className="text-slate-500 transition hover:text-slate-700" onClick={onClose}>
              <span className="sr-only">Close</span>
              ×
            </button>
          </div>
        </header>

        <form className="space-y-6 px-6 py-5" onSubmit={handleConfirm}>
          <section className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Choose amount</p>
            <div className="grid grid-cols-2 gap-3">
              {DEFAULT_AMOUNTS.map((amount) => {
                const cents = amount * 100
                const isActive = !customAmount && selectedAmount === cents
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(cents)
                      setCustomAmount('')
                    }}
                    className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${isActive ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600'}`}
                  >
                    {centsToCurrency(cents, currency)}
                  </button>
                )
              })}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="custom-amount">
                Custom amount
              </label>
              <input
                id="custom-amount"
                type="number"
                min="1"
                step="0.01"
                value={customAmount}
                onChange={(event) => {
                  setCustomAmount(event.target.value)
                }}
                placeholder="Enter custom amount"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <p className="text-xs text-slate-500">
                {amountCents ? `You will be charged ${centsToCurrency(amountCents, currency)}.` : 'Enter a value greater than zero.'}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Payment method</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#0f172a',
                      '::placeholder': {
                        color: '#94a3b8',
                      },
                    },
                    invalid: {
                      color: '#e11d48',
                    },
                  },
                }}
              />
            </div>
          </section>

          {status !== 'idle' && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                status === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : status === 'success'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700'
              }`}
            >
              {message}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={inFlight}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitDisabled}>
              {inFlight ? 'Processing…' : `Pay ${centsToCurrency(amountCents || 0, currency)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

WalletTopUpModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onCompleted: PropTypes.func,
}

WalletTopUpModal.defaultProps = {
  onCompleted: undefined,
}
