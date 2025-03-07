import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { Spinner } from "@nasti/ui/spinner"
import { supabase } from "@/lib/supabase"
import {
  createFileRoute,
  useLoaderData,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback } from "react"
import { useForm } from "react-hook-form"

type FormData = {
  email: string
  password: string
  password2: string
}

const getInvitationByToken = async (token: string) => {
  const { data: invitation, error } = await supabase.rpc(
    "get_invitation_by_token",
    { token_value: token },
  )

  if (error) {
    if (error.details === "The result contains 0 rows")
      throw new Error("Invitation not found")
    throw new Error(error.message)
  }
  if (!invitation) throw new Error("Invitation not found")

  if (
    !invitation.expires_at ||
    Date.parse(invitation.expires_at) < Date.now()
  ) {
    throw new Error("Invitation is not available or has expired")
  }
  return invitation
}

const InvitationAcceptPage = () => {
  const { invitation, token } = useLoaderData({ from: "/invitations/accept" })
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<FormData>({ mode: "all" })

  const onSubmit = useCallback(
    async (data: FormData) => {
      if (!invitation) throw new Error("Invitation not found")

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept_invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: invitation.id, token, ...data }),
        },
      )

      if (response.ok) {
        navigate({ to: "/trips" })
      } else {
        const { error } = await response.json()
        setError("root", {
          message: `Unable to accept invitation: ${error}`,
        })
      }
    },
    [invitation, token, setError, navigate],
  )

  return (
    <div>
      <h1 className="text-lg">Welcome to NASTI</h1>
      {invitation && (
        <div className="flex flex-col gap-2 lg:w-1/3">
          <p className="bg-secondary-background rounded p-4 text-sm">
            You have been invited to join {invitation.organisation_name}. Please
            enter your signup details to continue.
          </p>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-2"
          >
            <FormField
              label="Email"
              type="email"
              {...register("email", {
                required: "Required",
                pattern: {
                  value:
                    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
                  message: "Invalid email address",
                },
              })}
              error={errors.email}
            />
            <FormField
              label="Password"
              type="password"
              {...register("password", {
                required: "Required",
                minLength: { value: 6, message: "Minimum length of 6" },
              })}
              error={errors.password}
            />
            <FormField
              label="Confirm Password"
              type="password"
              {...register("password2", {
                required: "Required",
                minLength: { value: 6, message: "Minimum length of 6" },
                validate: (value) =>
                  value === watch("password") || "Passwords do not match",
              })}
              error={errors.password2}
            />
            {errors.root && (
              <div className="align-right flex rounded-md border bg-orange-200 p-2 text-xs text-orange-800">
                {errors.root.message}
              </div>
            )}

            <Button disabled={!isValid || isSubmitting} type="submit">
              {!isSubmitting && "Accept invitation"}
              {isSubmitting && <Spinner />}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}

type SearchParams = {
  token: string
}

export const Route = createFileRoute("/invitations/accept")({
  component: InvitationAcceptPage,
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search: { token } }) => ({
    token,
  }),
  loader: async ({ deps: { token } }) => {
    const invitation = await getInvitationByToken(token)
    return { invitation, token }
  },
  errorComponent: ({ error }) => {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg">Unable to accept invitation</h1>
        {error instanceof Error && error.message && <p>{error.message}</p>}
        {error instanceof Error || <p>Unknown error</p>}
      </div>
    )
  },
})
