import { createContext, useContext, useMemo, useState } from 'react'
import { jwtDecode } from 'jwt-decode'

const STORAGE_KEY = 'balatrix_portal_token'

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
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const decoded = decodeToken(stored)
    if (!decoded) {
      localStorage.removeItem(STORAGE_KEY)
    }
    return decoded
  })

  const value = useMemo(
    () => ({
      token,
      user,
      login: (jwt) => {
        localStorage.setItem(STORAGE_KEY, jwt)
        setToken(jwt)
        setUser(decodeToken(jwt))
      },
      logout: () => {
        localStorage.removeItem(STORAGE_KEY)
        setToken('')
        setUser(null)
      },
    }),
    [token, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
