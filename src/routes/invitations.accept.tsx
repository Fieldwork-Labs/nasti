import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/formField"
import { Spinner } from "@/components/ui/spinner"
import { supabase } from "@/lib/supabase"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"

type FormData = {
  email: string
  password: string
  password2: string
}

const InvitationAcceptPage = () => {
  const { token } = useSearch({ from: "/invitations/accept" }) as {
    token: string
  }
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string>()

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<FormData>({ mode: "all" })

  // query to get invitation
  const { data: invitation, error } = useQuery({
    queryKey: ["invitation", token],
    queryFn: async () => {
      if (!token) throw new Error("Token not found")

      const { data: invitation, error } = await supabase
        .from("invitation")
        .select("id, expires_at, organisation_id, organisation_name")
        .eq("token", token)
        .single()

      if (error) {
        throw new Error(error.message)
      }
      if (!invitation) throw new Error("Invitation not found")

      if (Date.parse(invitation.expires_at) < Date.now()) {
        throw new Error("Invitation has expired")
      }
      return invitation
    },
    refetchOnMount: false,
  })

  useEffect(() => {
    if (error) setErrorMessage(error.message)
  }, [error])

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
        navigate({ to: "/dashboard" })
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
      {errorMessage && <p className="text-red-500">{errorMessage}</p>}
      {invitation && (
        <div className="flex gap-2 flex-col lg:w-1/3">
          <p className="bg-secondary-background p-4 text-sm rounded">
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
              <div className="rounded-md border bg-orange-200 p-2 text-xs text-orange-800 flex align-right">
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

export const Route = createFileRoute("/invitations/accept")({
  component: InvitationAcceptPage,
})
