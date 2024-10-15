import { createFileRoute } from "@tanstack/react-router"

import { useNavigate } from "@tanstack/react-router"
import { supabase } from "@/lib/supabase"
import useUserStore from "@/store/userStore"
import { useForm } from "@tanstack/react-form"

import { toast } from "react-toastify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const LoginForm = () => {
  const navigate = useNavigate()
  const { setUser, setSession } = useUserStore()

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },

    onSubmit: async ({ value }) => {
      // Do something with form data
      console.log(value)
      const { email, password } = value

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
      } else {
        setSession(data.session)
        setUser(data.user)

        toast.success("Logged in successfully!")
        navigate({ to: "/dashboard" })
      }
    },
  })

  return (
    <div className="flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-secondary-background p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 dark:text-gray-300 text-gray-700 text-center">
          Login to NASTI
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className="space-y-6"
        >
          {/* Email Input */}
          <form.Field
            name="email"
            children={(field) => (
              <div>
                <Label htmlFor={field.name}>Email Address</Label>
                <Input
                  type="email"
                  id="email"
                  required
                  autoComplete="email"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            )}
          />

          {/* Password Input */}
          <form.Field
            name="password"
            children={(field) => (
              <div>
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  type="password"
                  id="password"
                  required
                  autoComplete="current-password"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}
          />

          {/* Submit Button */}
          <div>
            <Button
              type="submit"
              disabled={form.state.isSubmitting || !form.state.isValid}
              className="w-full"
            >
              {form.state.isSubmitting ? "Logging in..." : "Login"}
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
