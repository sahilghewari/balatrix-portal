import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PLANS = [
  {
    id: 'starter',
    title: 'Starter',
    description: 'Perfect for small teams getting started.',
    freeMinutes: 500,
    pricing: {
      monthly: 49.99,
      quarterly: 139.99,
      yearly: 499.99,
    },
  },
  {
    id: 'professional',
    title: 'Professional',
    description: 'Advanced features for growing organizations.',
    freeMinutes: 1500,
    pricing: {
      monthly: 99.99,
      quarterly: 279.99,
      yearly: 999.99,
    },
  },
  {
    id: 'call_center',
    title: 'Call Center',
    description: 'High-volume operations and call centers.',
    freeMinutes: 5000,
    pricing: {
      monthly: 149.99,
      quarterly: 419.99,
      yearly: 1499.99,
    },
  },
]

const BILLING_CYCLES = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export default function PlanSelection() {
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState(PLANS[0].id)
  const [billingCycle, setBillingCycle] = useState(BILLING_CYCLES[0].id)
  const [addons, setAddons] = useState([])

  const price = useMemo(() => {
    const plan = PLANS.find((item) => item.id === selectedPlan)
    if (!plan) return 0
    return plan.pricing[billingCycle]
  }, [selectedPlan, billingCycle])

  const handleCheckout = () => {
    navigate('/admin/checkout', {
      state: {
        selection: {
          intent: 'plan_purchase',
          planTier: selectedPlan,
          billingCycle,
          addons,
        },
      },
    })
  }

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Choose your plan</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Select the subscription tier and billing cycle that suits your organization. Prices include bundled free minutes for outbound calling.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {BILLING_CYCLES.map((cycle) => (
          <button
            key={cycle.id}
            type="button"
            onClick={() => setBillingCycle(cycle.id)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              billingCycle === cycle.id
                ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {cycle.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isActive = plan.id === selectedPlan
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={`flex h-full flex-col rounded-2xl border p-6 text-left shadow-sm transition-colors ${
                isActive
                  ? 'border-indigo-500 bg-white'
                  : 'border-slate-200 bg-white hover:border-indigo-200'
              }`}
            >
              <div className="flex-1 space-y-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    {plan.title}
                  </span>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{plan.title} Plan</h2>
                  <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                </div>

                <div className="space-y-1 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">Free minutes included</p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {plan.freeMinutes.toLocaleString()} minutes
                  </p>
                </div>

                <div className="pt-2">
                  <p className="text-sm text-slate-600">{billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)} pricing</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-900">{formatCurrency(plan.pricing[billingCycle])}</p>
                </div>
              </div>

              {isActive && (
                <div className="mt-4 text-xs font-medium uppercase tracking-wide text-indigo-500">
                  Selected
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="max-w-sm">
        <button
          type="button"
          onClick={handleCheckout}
          className="btn-primary"
        >
          Proceed to Checkout
        </button>
      </div>
    </section>
  )
}
