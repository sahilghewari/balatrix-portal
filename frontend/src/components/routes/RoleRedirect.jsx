import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { ROLE_ROUTE_MAP } from '../../constants/routes.js'

export default function RoleRedirect() {
  const { user } = useAuth()

  if (!user?.role) {
    return <Navigate to="/login" replace />
  }

  const destination = ROLE_ROUTE_MAP[user.role] || '/login'
  return <Navigate to={destination} replace />
}
