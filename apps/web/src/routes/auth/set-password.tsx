import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { type SubmitHandler, useForm } from "react-hook-form"
import type { User } from "@supabase/supabase-js"
import { Spinner } from "@/components/ui/spinner"
import { FormField } from "@/components/ui/formField"
import { Button } from "@/components/ui/button"
import { useHashParams } from "@/hooks/useHashParams"

type FormData = {
  password: string
  password2: string
}

const SetPasswordPage = () => {
  const navigate = useNavigate()

  const [user, setUser] = useState<User | null>()

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

  const hashParams = useHashParams()

  useEffect(() => {
    const { access_token, refresh_token } = hashParams
    if (access_token && refresh_token) {
      supabase.auth.setSession({
        access_token,
        refresh_token,
      })
    } else {
      const errorMessage = hashParams.error_description
      if (errorMessage) {
        setError("root.login", {
          message: errorMessage,
        })
      }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN") {
          setUser(session?.user ?? null)
        }
      },
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [setError, hashParams])

  useEffect(() => {
    if (user && errors.root?.login) clearErrors("root.login")
  }, [clearErrors, user, errors.root?.login, p1, p2])

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
        <p>In order to use NASTI, you must set a password.</p>
      </div>
      {!user && errors.root?.login && (
        <div className="align-right flex rounded-md border bg-orange-200 p-2 text-xs text-orange-800">
          {errors.root.login.message}
        </div>
      )}
      {user && (
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

export const Route = createFileRoute("/auth/set-password")({
  component: SetPasswordPage,
})
