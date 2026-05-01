import { useState } from 'react'
import { AssetsScreen } from './features/assets/AssetsScreen'
import { AuthScreen } from './features/auth/AuthScreen'
import type { AuthUser } from './features/auth/types'

const SESSION_STORAGE_KEY = 'permutador.current-session'

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const rawSession = localStorage.getItem(SESSION_STORAGE_KEY)

    if (!rawSession) {
      return null
    }

    try {
      const parsed = JSON.parse(rawSession) as AuthUser

      if (parsed.email && parsed.name) {
        return parsed
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }

    return null
  })

  function handleAuthenticated(user: AuthUser) {
    setCurrentUser(user)
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
  }

  function handleLogout() {
    setCurrentUser(null)
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }

  if (currentUser) {
    return <AssetsScreen onLogout={handleLogout} user={currentUser} />
  }

  return <AuthScreen onAuthenticated={handleAuthenticated} />
}

export default App
