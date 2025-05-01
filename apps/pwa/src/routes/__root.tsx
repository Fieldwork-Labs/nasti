import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { CircleAlert, LeafIcon } from "lucide-react"
import { useOpenClose } from "@nasti/ui/hooks"
import { SettingsMenuModal } from "@/components/app/SettingsMenu"
import { Button } from "@nasti/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import React from "react"
import { SupabaseAuthClient } from "@supabase/supabase-js/dist/module/lib/SupabaseAuthClient"
import { useAuth } from "@/hooks/useAuth"
import { useNetwork } from "@/hooks/useNetwork"

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

const OfflineIndicator = () => {
  const { isOnline } = useNetwork()

  if (!isOnline) {
    return (
      <Popover>
        <PopoverTrigger>
          <div className="bg-secondary-background text-muted-foreground flex h-6 items-center gap-1 rounded-lg px-2 py-1 text-center align-middle text-xs">
            <CircleAlert size={10} />
            <span>Offline</span>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-sm">
          You are currently offline. Data may be out of sync. You can continue
          to record new data,and it will be uploaded when you are back online.
        </PopoverContent>
      </Popover>
    )
  }
  return null
}

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
          <div className="flex items-center justify-end gap-4 py-2 pr-2">
            <OfflineIndicator />
            <Button
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
