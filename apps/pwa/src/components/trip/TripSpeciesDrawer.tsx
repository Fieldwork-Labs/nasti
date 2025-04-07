import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@nasti/ui/drawer"

import { Species } from "@nasti/common/types"
import { useNavigate } from "@tanstack/react-router"
import { X } from "lucide-react"

import { SpeciesSelectList } from "@/components/species/SpeciesSelectList"
import "mapbox-gl/dist/mapbox-gl.css"
import React, { useContext } from "react"
import { useOpenClose } from "@nasti/ui/hooks"

const SpeciesDrawerContext = React.createContext<
  ReturnType<typeof useOpenClose>
>({
  isOpen: false,
  toggle: () => {},
  setIsOpen: () => {},
  open: () => {},
  close: () => {},
})

export const SpeciesDrawerProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const openClose = useOpenClose()

  return (
    <SpeciesDrawerContext.Provider value={openClose}>
      {children}
    </SpeciesDrawerContext.Provider>
  )
}

export const useSpeciesDrawer = () => {
  const context = useContext(SpeciesDrawerContext)

  if (context === undefined)
    throw new Error(
      "useSpeciesDrawer must be used within a SpeciesDrawerProvider",
    )

  return context
}

export const SpeciesDrawer = ({
  species,
  tripId,
}: {
  species?: Species[] | null
  tripId: string
}) => {
  const { isOpen, setIsOpen } = useSpeciesDrawer()
  const navigate = useNavigate()
  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex justify-between">
            <DrawerTitle>Target Species</DrawerTitle>
            <DrawerClose>
              <X />
            </DrawerClose>
          </div>
          <DrawerDescription>
            Select a species to record a collection
          </DrawerDescription>
        </DrawerHeader>
        <SpeciesSelectList
          species={species ?? undefined}
          onSelectSpecies={(sp) =>
            navigate({
              to: "/trips/$id/collections/new",
              params: { id: tripId },
              search: { speciesId: sp.id },
            })
          }
        />
      </DrawerContent>
    </Drawer>
  )
}
