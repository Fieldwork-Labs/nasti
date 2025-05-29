import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@nasti/ui/button"
import { useConfirmationUrl } from "@/hooks/useConfirmationUrl"
import { useCallback, useState } from "react"

const ConfirmSignupPage = () => {
  const confirmationUrl = useConfirmationUrl({
    redirectPath: "/auth/set-password",
  })

  const [isClicked, setIsClicked] = useState(false)
  const handleConfirm = useCallback(() => {
    if (isClicked) return // Prevent double-click

    setIsClicked(true)
    if (!confirmationUrl) return
    window.location.href = confirmationUrl
  }, [isClicked, confirmationUrl])

  if (!confirmationUrl) return null

  return (
    <div className="mt-6 flex flex-col gap-4 pb-6 sm:w-full md:w-1/2 lg:w-1/3">
      <div>
        <h4 className="mb-2 text-xl font-bold">Confirm Signup</h4>
        <p>Click the button to confirm signing up to NASTI.</p>
      </div>
      <Button onClick={handleConfirm} disabled={isClicked}>
        {isClicked ? "Processing..." : "Confirm"}
      </Button>
    </div>
  )
}

export const Route = createFileRoute("/auth/confirm-signup")({
  component: ConfirmSignupPage,
})
