import { useEffect, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function maskPassword(hash = '') {
  if (!hash) return '••••••••'
  return '••••••••'
}

export default function Extensions() {
  const [extensions, setExtensions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ extNumber: '', password: '' })
  const [editingId, setEditingId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchExtensions = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/extensions`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to fetch extensions.')
      }

      const payload = await response.json()
      setExtensions(payload?.extensions || [])
    } catch (err) {
      console.error('Extensions fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExtensions()
  }, [])

  const resetForm = () => {
    setForm({ extNumber: '', password: '' })
    setEditingId('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.extNumber || !form.password) {
      setError('Extension number and password are required.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const endpoint = editingId ? `${API_BASE_URL}/extensions/update` : `${API_BASE_URL}/extensions/create`
      const payload = {
        extNumber: form.extNumber,
        password: form.password,
      }

      if (editingId) {
        payload.extensionId = editingId
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.message || 'Failed to save extension.')
      }

      await fetchExtensions()
      resetForm()
    } catch (err) {
      console.error('Extension submit error:', err)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (extension) => {
    setEditingId(extension.id)
    setForm({ extNumber: extension.extNumber, password: '' })
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this extension?')) return

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/extensions/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extensionId: id }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.message || 'Failed to delete extension.')
      }

      await fetchExtensions()
    } catch (err) {
      console.error('Extension delete error:', err)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Extensions</h1>
          <p className="text-sm text-slate-600">
            Create and manage extension credentials for your agents. Passwords are stored securely and only editable via reset.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700" htmlFor="extNumber">
              Extension number
            </label>
            <input
              id="extNumber"
              name="extNumber"
              value={form.extNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, extNumber: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="e.g. 1001"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Enter a strong password"
              required={!editingId}
            />
          </div>

          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {editingId ? (submitting ? 'Updating…' : 'Update Extension') : submitting ? 'Creating…' : 'Add Extension'}
            </button>
          </div>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          </div>
        ) : extensions.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-600">No extensions found yet. Create your first extension above.</div>
        ) : (
          <table className="min-w-full table-auto divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Extension</th>
                <th className="px-4 py-3 font-medium">Password</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {extensions.map((extension) => (
                <tr key={extension.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{extension.extNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{maskPassword(extension.passwordHash)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleEdit(extension)}
                        disabled={submitting}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => handleDelete(extension.id)}
                        disabled={submitting}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
