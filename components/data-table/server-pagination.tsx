"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react"

interface ServerPaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  isLoading?: boolean
}

export function ServerPagination({
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: ServerPaginationProps) {
  const [pageSizeValue, setPageSizeValue] = useState(pageSize.toString())

  // Update pageSizeValue when pageSize prop changes
  useEffect(() => {
    setPageSizeValue(pageSize.toString())
  }, [pageSize])

  const handlePageSizeChange = (value: string) => {
    setPageSizeValue(value)
    if (onPageSizeChange) {
      onPageSizeChange(Number(value))
    }
  }

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page)
    }
  }

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pageNumbers = []
    const maxPagesToShow = 5 // Maximum number of page buttons to show

    if (totalPages <= maxPagesToShow) {
      // If total pages is less than or equal to maxPagesToShow, show all pages
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i)
      }
    } else {
      // Always include first page
      pageNumbers.push(1)

      // Calculate start and end of page range around current page
      let startPage = Math.max(2, currentPage - 1)
      let endPage = Math.min(totalPages - 1, currentPage + 1)

      // Adjust if we're at the start or end
      if (currentPage <= 2) {
        endPage = Math.min(totalPages - 1, 3)
      } else if (currentPage >= totalPages - 1) {
        startPage = Math.max(2, totalPages - 2)
      }

      // Add ellipsis before middle pages if needed
      if (startPage > 2) {
        pageNumbers.push(-1) // -1 represents ellipsis
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i)
      }

      // Add ellipsis after middle pages if needed
      if (endPage < totalPages - 1) {
        pageNumbers.push(-2) // -2 represents ellipsis
      }

      // Always include last page
      if (totalPages > 1) {
        pageNumbers.push(totalPages)
      }
    }

    return pageNumbers
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground mb-4 sm:mb-0">
        {totalPages > 0 ? (
          <p>
            Pagina {currentPage} din {totalPages}
          </p>
        ) : (
          <p>Nu există date</p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center space-x-2">
          <p className="text-sm whitespace-nowrap">Rânduri per pagină:</p>
          <Select value={pageSizeValue} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSizeValue} />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 30, 40, 50].map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1 || isLoading}
          >
            <span className="sr-only">Prima pagină</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
          >
            <span className="sr-only">Pagina anterioară</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center">
            {getPageNumbers().map((pageNumber, index) => {
              if (pageNumber === -1 || pageNumber === -2) {
                return (
                  <span key={`ellipsis-${index}`} className="px-2">
                    ...
                  </span>
                )
              }
              return (
                <Button
                  key={pageNumber}
                  variant={currentPage === pageNumber ? "default" : "outline"}
                  className="h-8 w-8 p-0 mx-1"
                  onClick={() => handlePageChange(pageNumber)}
                  disabled={isLoading}
                >
                  {pageNumber}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0 || isLoading}
          >
            <span className="sr-only">Pagina următoare</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0 || isLoading}
          >
            <span className="sr-only">Ultima pagină</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
        </div>
      </div>
    </div>
  )
}
