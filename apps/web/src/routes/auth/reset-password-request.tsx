import { createFileRoute } from "@tanstack/react-router"

import { useCallback, useState } from "react"
import { supabase } from "@/lib/supabase"
import { type SubmitHandler, useForm } from "react-hook-form"
import { Spinner } from "@nasti/ui/spinner"
import { FormField } from "@nasti/ui/formField"
import { Button } from "@nasti/ui/button"

type FormData = {
  email: string
}

const ResetPasswordRequestPage = () => {
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isValid, isSubmitting },
    watch,
  } = useForm<FormData>({ mode: "all" })

  const emailValue = watch("email")

  const onSubmit: SubmitHandler<FormData> = useCallback(
    async ({ email }) => {
      clearErrors()
      const { data, error } = await supabase.auth.resetPasswordForEmail(email)

      if (error) {
        setError("email", { message: error.message })
        return
      } else if (data) setSuccess(true)
    },
    [clearErrors, setError, setSuccess],
  )

  return (
    <div className="mt-6 flex flex-col gap-4 sm:w-full sm:px-2 md:w-1/2 lg:w-1/3">
      <div>
        <h4 className="mb-2 text-xl font-bold">Reset Password</h4>
        {!success && (
          <p>Enter your email address to request a password reset.</p>
        )}
      </div>
      {!success && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
          <FormField
            label="Email"
            type="email"
            {...register("email", {
              required: "Required",
            })}
            error={errors.email}
          />

          {!errors.root?.login && <div className="h-[34px]" />}
          <Button disabled={!isValid || isSubmitting} type="submit">
            {!isSubmitting && "Submit"}
            {isSubmitting && <Spinner />}
          </Button>
        </form>
      )}
      {success && (
        <p>
          Password reset request email has been sent to {emailValue}. Please
          check your inbox for the email.
        </p>
      )}
    </div>
  )
}

export const Route = createFileRoute("/auth/reset-password-request")({
  component: ResetPasswordRequestPage,
})
