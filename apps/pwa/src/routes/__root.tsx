import { useAuth } from "@/hooks/useAuth"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { LeafIcon } from "lucide-react"
import { useOpenClose } from "@nasti/ui/hooks"
import { SettingsMenuModal } from "@/components/app/SettingsMenu"
import { Button } from "@nasti/ui/button"

export const Route = createRootRoute({
  component: () => {
    const { isLoggedIn } = useAuth()
    const { isOpen, open, close } = useOpenClose()

    return (
      <>
        <div className="flex justify-between p-2">
          <span className="text-lead">Seed Store</span>
          {isLoggedIn && (
            <Button
              // asChild
              onClick={open}
              className="bg-secondary-background h-9 w-9 rounded-xl p-2"
              size={"icon"}
            >
              <LeafIcon />
            </Button>
          )}
        </div>
        <Outlet />
        <TanStackRouterDevtools />
        <SettingsMenuModal isOpen={isOpen} close={close} />
      </>
    )
  },
})
