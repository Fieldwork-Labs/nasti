import { supabase } from "@nasti/common/supabase"
import { TIMED_OUT, withTimeout } from "../withTimeout"

export type RequestCredentials = { accessToken: string }

export interface UploadCredentials {
  acquire(timeoutMs?: number): Promise<RequestCredentials | null>
  confirm(credentials: RequestCredentials, timeoutMs?: number): Promise<boolean>
}

const ACQUIRE_TIMEOUT_MS = 30_000
const CONFIRM_TIMEOUT_MS = 10_000

export const liveUploadCredentials: UploadCredentials = {
  async acquire(timeoutMs = ACQUIRE_TIMEOUT_MS) {
    try {
      const result = await withTimeout(supabase.auth.getSession(), timeoutMs)
      if (result === TIMED_OUT || result.error || !result.data.session) return null
      const accessToken = result.data.session.access_token
      return accessToken ? { accessToken } : null
    } catch {
      return null
    }
  },

  async confirm(credentials, timeoutMs = CONFIRM_TIMEOUT_MS) {
    try {
      const result = await withTimeout(
        supabase.auth.getUser(credentials.accessToken),
        timeoutMs,
      )
      return result !== TIMED_OUT && !result.error && Boolean(result.data.user)
    } catch {
      return false
    }
  },
}
