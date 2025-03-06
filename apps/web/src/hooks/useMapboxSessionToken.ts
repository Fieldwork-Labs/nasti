import { useState, useEffect } from "react"

const STORAGE_KEY = "mapbox_session_token"
const SESSION_DURATION = 60 * 60 * 1000 // 60 minutes in milliseconds

interface StoredSession {
  token: string
  timestamp: number
}

const generateNewSession = () => {
  const newToken = crypto.randomUUID()
  const session: StoredSession = {
    token: newToken,
    timestamp: Date.now(),
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  return newToken
}

export function useMapboxSession() {
  const [sessionToken, setSessionToken] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const session: StoredSession = JSON.parse(stored)
      const isExpired = Date.now() - session.timestamp > SESSION_DURATION

      if (!isExpired) {
        return session.token
      }
      localStorage.removeItem(STORAGE_KEY)
    }
    return generateNewSession()
  })

  useEffect(() => {
    // Clear expired sessions
    const interval = setInterval(() => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const session: StoredSession = JSON.parse(stored)
        if (Date.now() - session.timestamp > SESSION_DURATION) {
          localStorage.removeItem(STORAGE_KEY)
          setSessionToken("")
        }
      }
    }, 1000) // Check every second

    return () => clearInterval(interval)
  }, [])

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY)
    setSessionToken("")
  }

  return {
    sessionToken,
    generateNewSession,
    clearSession,
  }
}
