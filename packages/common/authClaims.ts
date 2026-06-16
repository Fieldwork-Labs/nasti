import type { Session } from "@supabase/supabase-js"
import type { Role } from "./types"

// Shape of the claims the custom_access_token_hook writes into the JWT.
// See supabase/migrations/20260608121845_custom_access_token_hook.sql.
export type SeedScoutAppMetadata = {
  org_id?: string
  org_name?: string
  role?: Role
}

type JwtPayload = {
  app_metadata?: SeedScoutAppMetadata
}

// Decode the payload of a JWT without verifying its signature. The token
// came from Supabase and we only read our own claims from it — signature
// verification happens server-side on every API call. Returns null on
// malformed input rather than throwing.
const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const payloadB64 = token.split(".")[1]
    if (!payloadB64) return null
    const normalized = payloadB64.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    )
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

// Read our custom claims from the JWT itself rather than from
// session.user.app_metadata. Supabase populates session.user from the
// auth.users table (specifically raw_app_meta_data), which is NOT the
// same data as the JWT's app_metadata claim written by the access-token
// hook. The signed JWT is the authoritative source for hook-injected
// claims, so we read from it directly.
export const getAppMeta = (
  session: Session | null | undefined,
): SeedScoutAppMetadata => {
  if (!session?.access_token) return {}
  return decodeJwtPayload(session.access_token)?.app_metadata ?? {}
}
