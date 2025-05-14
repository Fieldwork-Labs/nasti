import { useALASpeciesImage } from "@nasti/common/hooks"
import type { CollectionPhoto, Species } from "@nasti/common/types"
import { LeafIcon } from "lucide-react"

import { useCollectionPhotoUploadProgress } from "@/hooks/useCollectionPhotosMutate"
import { Spinner } from "@nasti/ui/spinner"
import { useCollectionPhoto } from "@/hooks/useCollectionPhoto"
import { cn } from "@nasti/ui/utils"
import { Progress } from "@nasti/ui/progress"
import { usePhotoUrl } from "@/hooks/usePhotoUrl"

type Props = {
  id?: string
  onClick?: (url: string) => void
  species?: Species | null
  showCaption?: boolean
  className?: string
  showUploadProgress?: boolean
}

export function CollectionPhoto({
  id,
  onClick,
  species,
  showCaption,
  className,
  showUploadProgress,
}: Props) {
  const photo = useCollectionPhoto({ id })
  const fallback = useALASpeciesImage({ guid: species?.ala_guid })
  const { data: url, status } = usePhotoUrl({ photoId: id, fallback })
  const progress = useCollectionPhotoUploadProgress(id)
  const displayProgress = Boolean(
    showUploadProgress && progress && progress >= 0,
  )

  return (
    <span className={cn("flex flex-col items-start gap-1", className)}>
      {/* Image area ----------------------------------------------------------- */}
      {status === "pending" ? (
        <span className="flex aspect-square w-full items-center justify-center bg-slate-500">
          <Spinner className="h-8 w-8" />
        </span>
      ) : status === "success" && url ? (
        <>
          <div className="relative">
            <img
              src={url}
              alt={species?.name || "collection photo"}
              onClick={onClick ? () => onClick(url) : undefined}
              className={`aspect-square w-full object-cover ${onClick ? "cursor-pointer" : "cursor-default"} ${displayProgress ? "animate-pulse" : ""}`}
              role="button"
              tabIndex={0}
            />
            {displayProgress && (
              <div className="absolute bottom-1 left-1 right-1 z-10">
                <Progress value={progress} className="w-full" />
              </div>
            )}
          </div>
        </>
      ) : (
        /* status === "error" OR no url --------------------------------------- */
        <span className="flex aspect-square w-full items-center justify-center bg-slate-500">
          <LeafIcon className="h-8 w-8" />
        </span>
      )}

      {/* Optional caption ----------------------------------------------------- */}
      {showCaption &&
        photo &&
        "caption" in photo &&
        photo.caption &&
        status === "success" && <div className="text-sm">{photo.caption}</div>}
    </span>
  )
}
