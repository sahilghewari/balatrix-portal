import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/addons', label: 'Add-ons' },
  { to: '/usage', label: 'Usage' },
  { to: '/tfns', label: 'TFNs' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-semibold">Balatrix Portal</span>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `transition-colors hover:text-slate-900 ${isActive ? 'text-slate-900' : ''}`
                }
                end
              >
                {item.label}
              </NavLink>
            ))}
            {user ? (
              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
              >
                Logout
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <NavLink
                  to="/login"
                  className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  Login
                </NavLink>
                <NavLink
                  to="/signup"
                  className="rounded-lg border border-indigo-500 px-3 py-1 text-sm font-medium text-indigo-600 transition-colors hover:border-indigo-600 hover:text-indigo-700"
                >
                  Signup
                </NavLink>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
