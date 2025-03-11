import { createFileRoute } from "@tanstack/react-router"

import { useNavigate, Link } from "@tanstack/react-router"
import { useForm } from "react-hook-form"

import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { useCallback } from "react"
import { useToast } from "@nasti/ui/hooks"
import { useAuth } from "@/hooks/useAuth"

type FormData = {
  email: string
  password: string
}

const LoginForm = () => {
  const navigate = useNavigate()
  const { login, user } = useAuth()

  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<FormData>({ mode: "all" })

  const onSubmit = useCallback(
    async (values: FormData) => {
      const { email, password } = values

      await login.mutateAsync({
        email,
        password,
      })

      if (login.isError) {
        if (login.error.message === "Failed to fetch") {
          toast({
            description: "Unable to connect to server",
            variant: "destructive",
          })
        } else
          toast({ description: login.error.message, variant: "destructive" })
      } else {
        toast({ description: "Logged in successfully!" })
        navigate({ to: "/" })
      }
    },
    [login, navigate, toast],
  )

  return (
    <div className="my-auto flex items-center justify-center px-2">
      {user ? (
        <div className="bg-secondary-background w-full max-w-md rounded-lg p-8 text-center shadow-md">
          <h2 className="mb-6 text-2xl font-bold text-gray-700 dark:text-gray-300">
            You're already logged in
          </h2>
          <Link className="underline" to="/">
            Go to Trips
          </Link>
        </div>
      ) : (
        <div className="bg-secondary-background w-full max-w-md rounded-lg p-8 shadow-md">
          <h2 className="mb-6 text-center text-2xl font-bold text-gray-700 dark:text-gray-300">
            Login
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Input */}
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                type="email"
                id="email"
                required
                autoComplete="email"
                {...register("email")}
                placeholder="you@example.com"
              />
            </div>

            {/* Password Input */}

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                id="password"
                required
                autoComplete="current-password"
                {...register("password")}
                placeholder="••••••••"
              />
            </div>

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
  )
}

export const Route = createFileRoute("/auth/login")({
  component: LoginForm,
})
