import {
  Pagination as ShadCnPagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@nasti/ui/pagination"
import { cn } from "@nasti/ui/utils"
import { useCallback, useEffect, useMemo, useState } from "react"

type PaginationProps = {
  page: number
  pageCount: number
  nextPage: () => void
  prevPage: () => void
  setPage: (page: number) => void
  onPageChange?: (page: number) => void
  className?: string
}

export const usePagination = (
  initialPage: number = 1,
  pageSize: number = 100,
  onPageChange?: (page: number) => void,
) => {
  const [page, setPage] = useState(initialPage)

  const nextPage = useCallback(() => setPage((prev) => prev + 1), [])
  const prevPage = useCallback(
    () => setPage((prev) => Math.max(prev - 1, 1)),
    [],
  )
  const goToPage = useCallback(
    (newPage: number) => setPage(Math.max(1, newPage)),
    [],
  )

  useEffect(() => {
    onPageChange?.(page)
  }, [page, onPageChange])

  return {
    page,
    pageSize,
    nextPage,
    prevPage,
    setPage: goToPage,
  }
}

export const Pagination = ({
  page,
  pageCount,
  nextPage,
  prevPage,
  setPage,
  className,
}: PaginationProps) => {
  const canGoNext = page < pageCount
  const canGoPrev = page > 1

  // Generate the range of pages to show around current page
  const visiblePages = useMemo(() => {
    const delta = 2 // Show 2 pages on each side of current page
    const rangeWithDots = []

    // Calculate start and end of the range around current page
    const start = Math.max(1, page - delta)
    const end = Math.min(pageCount, page + delta)

    // Always show first page
    if (start > 1) {
      rangeWithDots.push(1)
      if (start > 2) {
        rangeWithDots.push("ellipsis-start")
      }
    }

    // Add pages in range
    for (let i = start; i <= end; i++) {
      rangeWithDots.push(i)
    }

    // Always show last page
    if (end < pageCount) {
      if (end < pageCount - 1) {
        rangeWithDots.push("ellipsis-end")
      }
      rangeWithDots.push(pageCount)
    }

    return rangeWithDots
  }, [page, pageCount])

  if (pageCount < 1) return null

  return (
    <ShadCnPagination
      className={cn("w-fit", className)}
      role="navigation"
      aria-label="Pagination"
    >
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            disabled={!canGoPrev}
            onClick={prevPage}
            aria-label="Go to previous page"
          />
        </PaginationItem>

        {visiblePages.map((pageNum, index) => {
          if (pageNum === "ellipsis-start" || pageNum === "ellipsis-end") {
            return (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            )
          }

          return (
            <PaginationItem key={pageNum}>
              <PaginationLink
                isActive={pageNum === page}
                onClick={() => setPage(pageNum as number)}
                aria-label={`Go to page ${pageNum}`}
                aria-current={pageNum === page ? "page" : undefined}
              >
                {pageNum}
              </PaginationLink>
            </PaginationItem>
          )
        })}

        <PaginationItem>
          <PaginationNext
            disabled={!canGoNext}
            onClick={nextPage}
            aria-label="Go to next page"
          />
        </PaginationItem>
      </PaginationContent>
    </ShadCnPagination>
  )
}
