import { createFileRoute } from "@tanstack/react-router"
import { useConfirmationUrl } from "@/hooks/useConfirmationUrl"

/**
 * This page just redirects to the confirmation url after resetting the redirect url on that!
 */
const ResetPasswordConfirmPage = () => {
  const confirmationUrl = useConfirmationUrl({
    redirectPath: "/auth/reset-password",
  })

  if (confirmationUrl) window.location.replace(confirmationUrl)

  if (!confirmationUrl) return null
}

export const Route = createFileRoute("/auth/reset-password-confirm")({
  component: ResetPasswordConfirmPage,
})
