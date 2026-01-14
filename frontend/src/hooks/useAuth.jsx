import { createContext, useContext, useMemo, useState } from 'react'
import { jwtDecode } from 'jwt-decode'
import { clearToken, loadToken, saveToken } from '../services/sessionStorage'

const AuthContext = createContext(null)

function decodeToken(jwt) {
  if (!jwt) return null
  try {
    return jwtDecode(jwt)
  } catch (error) {
    console.error('Failed to decode JWT', error)
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => loadToken())
  const [user, setUser] = useState(() => {
    const stored = loadToken()
    const decoded = decodeToken(stored)
    if (!decoded) {
      clearToken()
    }
    return decoded
  })

  const value = useMemo(
    () => ({
      token,
      user,
      login: (jwt) => {
        saveToken(jwt)
        setToken(jwt)
        setUser(decodeToken(jwt))
      },
      logout: () => {
        clearToken()
        setToken('')
        setUser(null)
      },
    }),
    [token, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
