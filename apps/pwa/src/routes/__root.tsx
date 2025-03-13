import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { LeafIcon } from "lucide-react"
import { useOpenClose } from "@nasti/ui/hooks"
import { SettingsMenuModal } from "@/components/app/SettingsMenu"
import { Button } from "@nasti/ui/button"
import React from "react"
import { SupabaseAuthClient } from "@supabase/supabase-js/dist/module/lib/SupabaseAuthClient"
import { useAuth } from "@/hooks/useAuth"

const TanStackRouterDevtools = import.meta.env.DEV
  ? React.lazy(() =>
      // Lazy load in development
      import("@tanstack/router-devtools").then((res) => ({
        default: res.TanStackRouterDevtools,
        // For Embedded Mode
        // default: res.TanStackRouterDevtoolsPanel
      })),
    )
  : () => null // Render nothing in production

export const Route = createRootRouteWithContext<{
  isLoggedIn: boolean
  getSession?: SupabaseAuthClient["getSession"]
}>()({
  component: () => {
    const { isLoggedIn } = useAuth()

    const { isOpen, open, close } = useOpenClose()

    return (
      <div className="h-screen">
        {isLoggedIn && (
          <div className="flex justify-end py-2 pr-2">
            <Button
              // asChild
              onClick={open}
              className="bg-secondary-background h-9 w-9 rounded-xl p-2"
              size={"icon"}
            >
              <LeafIcon />
            </Button>
          </div>
        )}
        <Outlet />
        <TanStackRouterDevtools />
        <SettingsMenuModal isOpen={isOpen} close={close} />
      </div>
    )
  },
})
