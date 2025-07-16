"use client"

import { useEffect } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import type { Table } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  persistenceKey?: string // Cheia pentru localStorage (ex: "lucrari", "clienti", etc.)
}

export function DataTablePagination<TData>({ table, persistenceKey }: DataTablePaginationProps<TData>) {
  // Încărcăm page size-ul salvat la inițializare
  useEffect(() => {
    if (persistenceKey) {
      const savedPageSize = localStorage.getItem(`pageSize_${persistenceKey}`)
      if (savedPageSize) {
        const pageSize = parseInt(savedPageSize, 10)
        if ([10, 20, 30, 40, 50].includes(pageSize)) {
          table.setPageSize(pageSize)
        }
      }
    }
  }, [table, persistenceKey])

  // Funcție pentru salvarea page size-ului
  const handlePageSizeChange = (value: string) => {
    const pageSize = Number(value)
    table.setPageSize(pageSize)
    
    // Salvăm în localStorage dacă avem persistenceKey
    if (persistenceKey) {
      localStorage.setItem(`pageSize_${persistenceKey}`, value)
    }
  }
  return (
    <div className="flex items-center justify-end px-2">
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rânduri per pagină</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Pagina {table.getState().pagination.pageIndex + 1} din {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Mergi la prima pagină</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Mergi la pagina anterioară</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Mergi la pagina următoare</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Mergi la ultima pagină</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
