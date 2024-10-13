import { createFileRoute } from "@tanstack/react-router"

import { useNavigate } from "@tanstack/react-router"
import { supabase } from "@/lib/supabase"
import useUserStore from "@/store/userStore"
import { useForm } from "@tanstack/react-form"

import { toast } from "react-toastify"

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
    <div className="flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
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
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-gray-700"
                >
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="••••••••"
                />
              </div>
            )}
          />

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={form.state.isSubmitting || !form.state.isValid}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                form.state.isSubmitting
                  ? "bg-indigo-300"
                  : "bg-indigo-600 hover:bg-indigo-700"
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
            >
              {form.state.isSubmitting ? "Logging in..." : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/auth/login")({
  component: LoginForm,
})
