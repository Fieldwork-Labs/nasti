import { createFileRoute } from "@tanstack/react-router"
import { buttonVariants } from "@nasti/ui/button"
import { useConfirmationUrl } from "@/hooks/useConfirmationUrl"

const ConfirmSignupPage = () => {
  const confirmationUrl = useConfirmationUrl({
    redirectPath: "/auth/set-password",
  })

  if (!confirmationUrl) return null

  return (
    <div className="mt-6 flex flex-col gap-4 pb-6 sm:w-full md:w-1/2 lg:w-1/3">
      <div>
        <h4 className="mb-2 text-xl font-bold">Confirm Signup</h4>
        <p>Click the button to confirm signing up to NASTI.</p>
      </div>

      <a href={confirmationUrl} className={buttonVariants()}>
        Confirm
      </a>
    </div>
  )
}

export const Route = createFileRoute("/auth/confirm-signup")({
  component: ConfirmSignupPage,
})
