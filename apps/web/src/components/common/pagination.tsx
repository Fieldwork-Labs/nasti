import {
  Pagination as ShadCnPagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@nasti/ui/pagination"
import { useState } from "react"

type PaginationProps = {
  page: number
  pageCount: number
  nextPage: () => void
  prevPage: () => void
  setPage: (page: number) => void
}

export const usePagination = (
  initialPage: number = 1,
  pageSize: number = 100,
) => {
  const [page, setPage] = useState(initialPage)

  const nextPage = () => setPage((prev) => prev + 1)
  const prevPage = () => setPage((prev) => Math.max(prev - 1, 1))

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
}: PaginationProps) => {
  if (pageCount <= 1) return null
  return (
    <ShadCnPagination>
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
