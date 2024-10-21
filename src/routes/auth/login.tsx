import { createFileRoute } from "@tanstack/react-router"

import { useNavigate } from "@tanstack/react-router"
import { supabase } from "@/lib/supabase"
import useUserStore from "@/store/userStore"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCallback } from "react"
import { useToast } from "@/hooks/use-toast"

type FormData = {
  email: string
  password: string
}

const LoginForm = () => {
  const navigate = useNavigate()
  const { setUser, setSession } = useUserStore()
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<FormData>({ mode: "all" })

  const onSubmit = useCallback(
    async (values: FormData) => {
      // Do something with form data
      const { email, password } = values

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.log({ error })
        toast({ description: error.message, variant: "destructive" })
      } else {
        setSession(data.session)
        setUser(data.user)

        toast({ description: "Logged in successfully!" })
        navigate({ to: "/dashboard" })
      }
    },
    [setSession, setUser, navigate, toast]
  )

  return (
    <div className="flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-background-secondary p-8 rounded-lg shadow-md dark:shadow-background-secondary">
        <h2 className="text-2xl font-bold mb-6 dark:text-gray-300 text-gray-700 text-center">
          Login to NASTI
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
      </div>
    </div>
  )
}

export const Route = createFileRoute("/auth/login")({
  component: LoginForm,
})
