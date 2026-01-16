import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Login from './components/Login.jsx'
import Signup from './components/Signup.jsx'
import AdminDashboard from './components/dashboard/AdminDashboard.jsx'
import SupportDashboard from './components/dashboard/SupportDashboard.jsx'
import SuperAdminOverview from './components/dashboard/SuperAdminOverview.jsx'
import PlanSelection from './components/PlanSelection.jsx'
import Checkout from './components/Checkout.jsx'
import CheckoutSuccess from './components/CheckoutSuccess.jsx'
import TfnSelection from './components/TfnSelection.jsx'
import Extensions from './components/Extensions.jsx'
import Wallet from './components/Wallet.jsx'
import AddOns from './components/AddOns.jsx'
import ProtectedRoute from './components/routes/ProtectedRoute.jsx'
import RoleRedirect from './components/routes/RoleRedirect.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import SupportUserManagement from './pages/Support/SupportUserManagement.jsx'
import UsageDashboard from './pages/Usage/UsageDashboard.jsx'
import SubscriptionList from './pages/Subscriptions/SubscriptionList.jsx'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const Dashboard = () => (
  <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-semibold text-slate-900">Welcome to Balatrix Portal</h1>
    <p className="mt-3 text-sm text-slate-600">
      Use the navigation above to explore subscriptions, wallet, and toll-free numbers.
    </p>
  </section>
)

const Placeholder = ({ title }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
    <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
    <p className="mt-3 text-sm text-slate-600">Feature coming soon.</p>
  </section>
)

function App() {
  return (
    <AuthProvider>
      <Elements stripe={stripePromise}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route element={<ProtectedRoute allowedRoles={['admin', 'support', 'super_admin']} />}>
            <Route element={<Layout />}>
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/plans" element={<PlanSelection />} />
                <Route path="/admin/checkout" element={<Checkout />} />
                <Route path="/admin/checkout/success" element={<CheckoutSuccess />} />
                <Route path="/admin/tfns/select" element={<TfnSelection />} />
                <Route path="/admin/extensions" element={<Extensions />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['support']} />}>
                <Route path="/support/dashboard" element={<SupportDashboard />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
                <Route path="/superadmin/overview" element={<SuperAdminOverview />} />
              </Route>

              <Route path="/subscriptions" element={<SubscriptionList />} />
              <Route path="/support-users" element={<SupportUserManagement />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/usage" element={<UsageDashboard />} />
              <Route path="/addons" element={<AddOns />} />
              <Route path="/tfns" element={<Placeholder title="Toll-Free Numbers" />} />
            </Route>
          </Route>

          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </Elements>
    </AuthProvider>
  )
}

export default App
