import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export default function TfnSelection() {
  const navigate = useNavigate()
  const [numbers, setNumbers] = useState([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const fetchNumbers = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE_URL}/tfns?status=available`)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to fetch toll-free numbers.')
        }

        const payload = await response.json()
        setNumbers(payload?.tfns || [])
      } catch (err) {
        console.error('TFN fetch error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchNumbers()
  }, [])

  const handleSubmit = async () => {
    if (!selectedNumber) {
      setError('Please select a toll-free number before continuing.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/tfns/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: selectedNumber,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to assign the toll-free number.')
      }

      setSuccess('Toll-free number assigned successfully!')
      setTimeout(() => navigate('/admin/dashboard', { replace: true }), 1500)
    } catch (err) {
      console.error('TFN selection error:', err)
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Choose your toll-free number</h1>
        <p className="text-sm text-slate-600">
          Select a toll-free number from the available pool. This number will be provisioned to your subscription immediately.
        </p>
      </header>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">No toll-free numbers are currently available. Please contact support.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full table-auto divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Select</th>
                <th className="px-4 py-3 font-medium">Phone Number</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {numbers.map((item) => (
                <tr key={item.id || item.phoneNumber} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <input
                      type="radio"
                      name="tfn"
                      value={item.phoneNumber}
                      checked={selectedNumber === item.phoneNumber}
                      onChange={() => setSelectedNumber(item.phoneNumber)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{item.phoneNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{item.provisioningStatus || 'available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <div className="max-w-sm">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || loading}
          className="btn-primary"
        >
          {submitting ? 'Assigning…' : 'Assign selected number'}
        </button>
      </div>
    </section>
  )
}
