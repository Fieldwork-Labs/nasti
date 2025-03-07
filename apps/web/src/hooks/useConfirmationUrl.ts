import { useMemo } from "react"
import { useSearch } from "@tanstack/react-router"

/**
 * Gets the Supabase confirmation url for a password change and allows modifying the redirect url
 * @param redirectPath: the path to redirect to after confirming, should be a real application route
 * @returns a url to redirect the user to
 */
export const useConfirmationUrl = ({
  redirectPath,
}: {
  redirectPath?: string
}) => {
  const params = useSearch({ strict: false }) as {
    confirmation_url: string
  }
  const confirmationUrl = params.confirmation_url

  const redirectUrl = useMemo(() => {
    if (!confirmationUrl) return null
    const url = new URL(confirmationUrl)
    const params = new URLSearchParams(url.search)
    if (redirectPath)
      params.set("redirect_to", `${params.get("redirect_to")}${redirectPath}`)
    url.search = params.toString()
    return url.toString()
  }, [confirmationUrl, redirectPath])

  return redirectUrl
}
