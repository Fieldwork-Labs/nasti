// authHooks.ts
import { useQuery } from "@tanstack/react-query"

interface AuthConfig {
  clientId: string
  clientSecret: string
}

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

const OAUTH_HOST = "auth.ala.org.au"
const OAUTH_PATH = "/cas/oidc/oidcAccessToken"
const SCOPE = "openid+email"

const fetchAuthToken = async (config: AuthConfig): Promise<TokenResponse> => {
  // Create Basic auth header
  const credentials = btoa(`${config.clientId}:${config.clientSecret}`)

  const response = await fetch(`https://${OAUTH_HOST}${OAUTH_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&scope=${SCOPE}`,
  })

  if (!response.ok) {
    throw new Error(`Auth Error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export const useALAAuth = () => {
  const authConfig = {
    clientId: import.meta.env.VITE_ALA_CLIENT_ID!,
    clientSecret: import.meta.env.VITE_ALA_CLIENT_SECRET!,
  }

  return useQuery({
    queryKey: ["alaAuth"],
    queryFn: () => fetchAuthToken(authConfig),
    // Token typically expires in 1 hour, but we'll refetch after 50 minutes
    staleTime: 50 * 60 * 1000,
    // Keep the token in cache for 55 minutes
    gcTime: 55 * 60 * 1000,
    retry: 3,
    enabled: Boolean(authConfig) && Boolean(authConfig.clientId),
  })
}
