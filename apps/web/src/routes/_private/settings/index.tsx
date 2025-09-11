import { createFileRoute, Link } from "@tanstack/react-router"
import { useAdminOnly } from "@/hooks/useAdminOnly"
import { Card } from "@nasti/ui/card"
import { Button } from "@nasti/ui/button"
import { Settings, Leaf, Users, SettingsIcon, MapPin } from "lucide-react"
import useUserStore from "@/store/userStore"

export const Route = createFileRoute("/_private/settings/")({
  component: SettingsDashboard,
})

function SettingsDashboard() {
  useAdminOnly()
  const { organisation } = useUserStore()

  const settingsCards = [
    {
      title: "Organisation Details",
      description: "Update organisation details",
      icon: SettingsIcon,
      href: "/settings/organisation-details",
      color: "bg-blue-500",
    },
    {
      title: "Storage Locations",
      description: "Manage seed storage locations and tracking",
      icon: MapPin,
      href: "/settings/storage-locations",
      color: "bg-orange-500",
    },
    {
      title: "Species list",
      description: "See all species and their associated collections",
      icon: Leaf,
      href: "/species",
      color: "bg-green-500",
    },
    {
      title: "User Management",
      description: "Manage team members and invitations",
      icon: Users,
      href: "/people",
      color: "bg-purple-500",
    },
  ]

  return (
    <div>
      <div className="mb-8 mt-2">
        <div className="mb-2 flex items-center gap-3">
          <Settings className="h-8 w-8" />
          <h1 className="text-3xl font-bold">{organisation?.name} Settings</h1>
        </div>
        <p className="text-gray-600">
          Manage your organisation configuration and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {settingsCards.map((card) => {
          const IconComponent = card.icon
          return (
            <Card
              key={card.href}
              className="p-6 transition-shadow hover:shadow-lg"
            >
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="flex flex-col items-start gap-2">
                  <div className={`rounded-lg p-3 ${card.color} text-white`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <div className="">
                    <h3 className="mb-2 text-lg font-semibold">{card.title}</h3>
                    <p className="text-primary mb-4 text-sm">
                      {card.description}
                    </p>
                  </div>
                </div>
                <Link to={card.href} from="/settings" className="w-full">
                  <Button variant="outline" className="w-full cursor-pointer">
                    Configure
                  </Button>
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
