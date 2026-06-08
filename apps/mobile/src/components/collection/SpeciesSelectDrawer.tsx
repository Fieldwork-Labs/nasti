import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@nasti/ui/drawer"
import { SpeciesSelectList } from "@/components/species/SpeciesSelectList"
import { Species } from "@nasti/common/types"
import { X } from "lucide-react"
import { useCallback } from "react"

export const SpeciesSelectDrawer = ({
  targetSpecies,
  isOpen,
  selectedSpeciesId,
  onSelectSpecies,
  onOpenChange,
}: {
  targetSpecies?: Species[] | null
  isOpen: boolean
  selectedSpeciesId?: string
  onSelectSpecies: (species: Species) => void
  onOpenChange: (isOpen: boolean) => void
}) => {
  const handeSelectSpecies = useCallback(
    (species: Species) => {
      onSelectSpecies(species)
      onOpenChange(false)
    },
    [onSelectSpecies, onOpenChange],
  )

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[70%]">
        <DrawerHeader>
          <div className="flex justify-between">
            <DrawerTitle>Species</DrawerTitle>
            <DrawerClose>
              <X />
            </DrawerClose>
          </div>
          <DrawerDescription>
            Select or search for the species for this collection
          </DrawerDescription>
        </DrawerHeader>
        <SpeciesSelectList
          targetSpecies={targetSpecies ?? undefined}
          selectedSpeciesId={selectedSpeciesId}
          onSelectSpecies={handeSelectSpecies}
        />
      </DrawerContent>
    </Drawer>
  )
}
