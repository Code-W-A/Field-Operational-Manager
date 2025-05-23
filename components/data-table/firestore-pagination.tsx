"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronsLeft, Loader2 } from "lucide-react"

interface FirestorePaginationProps {
  currentPage: number
  totalCount: number
  pageSize: number
  loading: boolean
  hasMore: boolean
  onFirstPage: () => void
  onNextPage: () => void
  onPreviousPage: () => void
}

export function FirestorePagination({
  currentPage,
  totalCount,
  pageSize,
  loading,
  hasMore,
  onFirstPage,
  onNextPage,
  onPreviousPage,
}: FirestorePaginationProps) {
  // Calculăm numărul total de pagini (aproximativ, deoarece nu avem acces la toate documentele)
  const totalPages = Math.ceil(totalCount / pageSize)

  // Calculăm intervalul de elemente afișate
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalCount)

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        {totalCount > 0 ? (
          <p>
            Afișare <span className="font-medium">{startItem}</span> până la{" "}
            <span className="font-medium">{endItem}</span> din <span className="font-medium">{totalCount}</span>{" "}
            rezultate
          </p>
        ) : (
          <p>Nu există rezultate</p>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="sm" onClick={onFirstPage} disabled={currentPage === 1 || loading}>
          <ChevronsLeft className="h-4 w-4" />
          <span className="sr-only">Prima pagină</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onPreviousPage} disabled={currentPage === 1 || loading}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Pagina anterioară</span>
        </Button>
        <div className="flex items-center gap-1 text-sm font-medium">
          Pagina {currentPage}
          {totalPages > 0 && <span className="text-muted-foreground">din ~{totalPages}</span>}
        </div>
        <Button variant="outline" size="sm" onClick={onNextPage} disabled={!hasMore || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          <span className="sr-only">Pagina următoare</span>
        </Button>
      </div>
    </div>
  )
}
