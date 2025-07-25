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
import { useEffect, useState } from "react"

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

  const nextPage = () => setPage((prev) => prev + 1)
  const prevPage = () => setPage((prev) => Math.max(prev - 1, 1))

  useEffect(() => {
    if (onPageChange) onPageChange(page)
  }, [page, onPageChange])

  return {
    page,
    pageSize,
    nextPage,
    prevPage,
    setPage,
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
  if (pageCount < 1) return null
  return (
    <ShadCnPagination className={cn("w-fit", className)}>
      <PaginationContent>
        {page > pageCount && (
          <PaginationItem>
            <PaginationPrevious disabled={page === 1} onClick={prevPage} />
          </PaginationItem>
        )}
        {page > 2 && (
          <PaginationItem>
            <PaginationLink from="" onClick={() => setPage(page - 2)}>
              {page - 2}
            </PaginationLink>
          </PaginationItem>
        )}
        {page > 1 && (
          <PaginationItem>
            <PaginationLink onClick={() => setPage(page - 1)}>
              {page - 1}
            </PaginationLink>
          </PaginationItem>
        )}
        <PaginationItem>
          <PaginationLink isActive>{page}</PaginationLink>
        </PaginationItem>
        {pageCount - page > 1 && (
          <PaginationItem>
            <PaginationLink onClick={() => setPage(page + 1)}>
              {page + 1}
            </PaginationLink>
          </PaginationItem>
        )}
        {pageCount - page > 2 && (
          <PaginationItem>
            <PaginationLink onClick={() => setPage(page + 2)}>
              {page + 2}
            </PaginationLink>
          </PaginationItem>
        )}
        {pageCount - page > 3 && (
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        )}
        {page < pageCount && (
          <PaginationItem>
            <PaginationNext disabled={page === pageCount} onClick={nextPage} />
          </PaginationItem>
        )}
      </PaginationContent>
    </ShadCnPagination>
  )
}
