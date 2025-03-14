import { createFileRoute } from "@tanstack/react-router"

import { useNavigate, Link } from "@tanstack/react-router"
import { useForm } from "react-hook-form"

import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { useCallback, useEffect, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@nasti/ui/utils"

type FormData = {
  email: string
  password: string
}

const LoginForm = () => {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  // to prevent flash of "Already logged in" state after submitting
  const hasLoggedIn = useRef(false)

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors },
    setError,
    clearErrors,
  } = useForm<FormData>({ mode: "all" })

  useEffect(() => {
    if (login.isError)
      setError("root", { type: "manual", message: login.error.message })
  }, [login.isError, login.error, setError])

  const onSubmit = useCallback(
    async (values: FormData) => {
      hasLoggedIn.current = true
      clearErrors()
      const { email, password } = values
      await login.mutateAsync({
        email,
        password,
      })

      if (login.isError) {
        hasLoggedIn.current = false
        if (login.error.message === "Failed to fetch") {
          setError("root", {
            message: "Unable to connect to server",
          })
        } else
          setError("root", { type: "manual", message: login.error.message })
      } else {
        navigate({ to: "/trips" })
      }
    },
    [login, navigate, setError, clearErrors],
  )

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="relative -top-20 flex flex-col items-center justify-center md:px-2">
        {user && !hasLoggedIn.current ? (
          <div className="bg-secondary-background w-full max-w-md rounded-lg p-8 text-center shadow-md">
            <h2 className="mb-6 text-2xl font-bold text-gray-700 dark:text-gray-300">
              You're already logged in
            </h2>
            <Link className="underline" to="/trips">
              Go to Trips
            </Link>
          </div>
        ) : (
          <div className="bg-secondary-background/60 pwa:text-lg w-full max-w-md flex-grow p-4 shadow-md md:rounded-lg md:p-8">
            <h2 className="mb-6 text-center text-2xl font-bold text-gray-700 dark:text-gray-300">
              Login
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="pwa:text-base">
                  Email Address
                </Label>
                <Input
                  className="pwa:text-base"
                  type="email"
                  id="email"
                  required
                  autoComplete="email"
                  {...register("email")}
                  placeholder="you@example.com"
                />
                {errors.email && (
                  <div className="flex justify-end text-xs text-orange-600">
                    {errors.email.message}
                  </div>
                )}
              </div>

              {/* Password Input */}

              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="pwa:text-base">
                  Password
                </Label>
                <Input
                  className={cn(
                    "pwa:text-base",
                    errors.password ? "border-orange-600/80" : "",
                  )}
                  type="password"
                  id="password"
                  required
                  autoComplete="current-password"
                  {...register("password")}
                  placeholder="••••••••"
                />
                {errors.password && (
                  <div className="flex justify-end text-xs text-orange-600">
                    {errors.password.message}
                  </div>
                )}
              </div>
              {errors.root && (
                <div className="rounded-lg bg-orange-600/30 p-2 text-xs text-orange-600">
                  {errors.root.message}
                </div>
              )}

              {/* Submit Button */}
              <div>
                <Button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="w-full"
                >
                  {isSubmitting ? "Logging in..." : "Login"}
                </Button>
              </div>
            </form>
            <div className="mt-2 flex justify-end text-sm underline">
              {/* <Link to="/auth/reset-password-request">Forgot password?</Link> */}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/auth/login")({
  component: LoginForm,
})
