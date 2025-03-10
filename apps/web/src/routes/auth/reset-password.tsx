import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@nasti/common/supabase"
import { type SubmitHandler, useForm } from "react-hook-form"
import { Spinner } from "@nasti/ui/spinner"
import { FormField } from "@nasti/ui/formField"
import { Button } from "@nasti/ui/button"

type FormData = {
  password: string
  password2: string
}

const ResetPasswordPage = () => {
  const navigate = useNavigate()

  const [ready, setReady] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isValid, isSubmitting },
    watch,
  } = useForm<FormData>({ mode: "all" })

  const p1 = watch("password")
  const p2 = watch("password2")

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event == "PASSWORD_RECOVERY") {
          setReady(true)
        }
      },
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [setError])

  useEffect(() => {
    if (ready && errors.root?.login) clearErrors("root.login")
  }, [clearErrors, ready, errors.root?.login, p1, p2])

  const onSubmit: SubmitHandler<FormData> = useCallback(
    async (data) => {
      clearErrors()
      const {
        data: { user },
        error,
      } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        console.log("error", error)
        setError("root.login", { message: error.message })
        return
      }
      if (user) {
        navigate({ to: "/trips" })
      }
    },
    [clearErrors, setError, navigate],
  )

  return (
    <div className="mt-6 flex flex-col gap-4 pb-6 sm:w-full md:w-1/2 lg:w-1/3">
      <div>
        <h4 className="mb-2 text-xl font-bold">Set Password</h4>
        <p>Please set your new password.</p>
      </div>
      {errors.root?.login && (
        <div className="align-right flex rounded-md border bg-orange-200 p-2 text-xs text-orange-800">
          {errors.root.login.message}
        </div>
      )}
      {ready && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
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
          {errors.root?.login && (
            <div className="align-right flex rounded-md border bg-orange-200 p-2 text-xs text-orange-800">
              {errors.root.login.message}
            </div>
          )}
          {!errors.root?.login && <div className="h-[34px]" />}
          <Button disabled={!isValid || isSubmitting} type="submit">
            {!isSubmitting && "Submit"}
            {isSubmitting && <Spinner />}
          </Button>
        </form>
      )}
    </div>
  )
}

export const Route = createFileRoute("/auth/reset-password")({
  component: ResetPasswordPage,
})
