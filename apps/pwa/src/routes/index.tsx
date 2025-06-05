import { createFileRoute } from "@tanstack/react-router"
import nastiLogo from "@/assets/nasti-logo.png"
import { ButtonLink } from "@nasti/ui/button-link"
import { useAuth } from "@/hooks/useAuth"

export const HomePage = () => {
  const { isLoggedIn } = useAuth()
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="md:bg-background relative -top-20 mx-auto flex flex-col items-center justify-center gap-8 p-6 text-center md:w-2/3 md:rounded-xl lg:w-1/2">
        <h1 className="font-serif text-2xl">Welcome To Seed Store</h1>
        <img src={nastiLogo} alt="nasti logo" className="w-2/3 lg:w-1/2" />
        {!isLoggedIn && (
          <ButtonLink
            size={"lg"}
            to="/auth/login"
            className="bg-secondary-background mt-10 p-6 text-2xl ring-1 ring-gray-300"
          >
            Login
          </ButtonLink>
        )}
        {isLoggedIn && (
          <ButtonLink
            size={"lg"}
            to="/trips"
            className="bg-secondary-background mt-10 p-6 text-2xl ring-1 ring-gray-300"
          >
            Enter
          </ButtonLink>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: HomePage,
  // @ts-expect-error
  beforeLoad: async ({ location, context }) => {
    // can use context to determine auth state and redirect to login page
  },
})
