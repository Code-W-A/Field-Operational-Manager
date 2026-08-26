"use client"

import { useState, useEffect, useRef } from "react"
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
  type PaginationState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isPrimaryUnmodifiedClick, openHrefInNewTab, preventMiddleClickAutoscroll } from "@/lib/utils/open-in-new-tab"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  defaultSort?: { id: string; desc: boolean }
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  onRowClick?: (row: TData) => void
  /** Dacă e setat, click pe scroll / Ctrl·Cmd+click deschide URL-ul în tab nou (fără schimbare UI). */
  getRowHref?: (row: TData) => string | undefined
  table?: any
  setTable?: (table: any) => void
  showFilters?: boolean
  getRowClassName?: (row: TData) => string // Adăugăm această proprietate pentru a permite colorarea rândurilor
  persistenceKey?: string // (neutilizat momentan)
  tableClassName?: string
  enablePagination?: boolean
  initialPageSize?: number
  pageSizeOptions?: number[]
  initialColumnVisibility?: VisibilityState
}

export function DataTable<TData, TValue>({
  columns,
  data,
  defaultSort,
  sorting: externalSorting,
  onSortingChange: onExternalSortingChange,
  onRowClick,
  getRowHref,
  table: externalTable,
  setTable: setExternalTable,
  showFilters = true,
  getRowClassName,
  persistenceKey,
  tableClassName,
  enablePagination = false,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  initialColumnVisibility,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSort ? [defaultSort] : [])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility ?? {})
  const [rowSelection, setRowSelection] = useState({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: initialPageSize })

  // Use external sorting if provided, otherwise use internal
  const sorting = externalSorting !== undefined ? externalSorting : internalSorting
  
  // Handle sorting changes with updater function support
  const handleSortingChange = (updaterOrValue: any) => {
    if (onExternalSortingChange) {
      if (typeof updaterOrValue === 'function') {
        onExternalSortingChange(updaterOrValue(sorting))
      } else {
        onExternalSortingChange(updaterOrValue)
      }
    } else {
      setInternalSorting(updaterOrValue)
    }
  }

  // Keep page index in range when data or filters change
  useEffect(() => {
    if (!enablePagination) return
    const total = data.length
    const maxPageIndex = Math.max(0, Math.ceil(total / pagination.pageSize) - 1)
    if (pagination.pageIndex > maxPageIndex) {
      setPagination((prev) => ({ ...prev, pageIndex: maxPageIndex }))
    }
  }, [enablePagination, data.length, pagination.pageIndex, pagination.pageSize])

  // Create a table instance
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
      ...(enablePagination ? { pagination } : {}),
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    ...(enablePagination ? { onPaginationChange: setPagination } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    globalFilterFn: (row, columnId, filterValue) => {
      const safeValue = (() => {
        const value = row.getValue(columnId)

        // Verificăm dacă valoarea este null sau undefined
        if (value === null || value === undefined) return ""

        // Verificăm dacă valoarea este un obiect Date
        if (value instanceof Date) {
                      const day = value.getDate().toString().padStart(2, "0")
            const month = (value.getMonth() + 1).toString().padStart(2, "0")
            const year = value.getFullYear()
            return `${day}.${month}.${year}`
        }

        // Verificăm dacă valoarea este un array
        if (Array.isArray(value)) {
          return value.join(" ")
        }

        // Convertim la string pentru căutare
        return String(value).toLowerCase()
      })()

      const searchValue = String(filterValue).toLowerCase()

      // Verificăm dacă valoarea conține textul căutat
      return safeValue.includes(searchValue)
    },
    filterFns: {
      // Multi-select filter function
      multiSelect: (row, columnId, filterValue) => {
        // If no filter value or empty array, show all rows
        if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true

        const value = row.getValue(columnId)

        // If value is undefined or null, return false for non-empty filters
        if (value === undefined || value === null) return false

        // If cell value is an array (e.g., technicians)
        if (Array.isArray(value)) {
          // Check if any value in the array matches any filter value
          return value.some((v) =>
            Array.isArray(filterValue) ? filterValue.includes(String(v)) : String(v) === String(filterValue),
          )
        }

        // For simple values, check if value matches any filter value
        return Array.isArray(filterValue) ? filterValue.includes(String(value)) : String(value) === String(filterValue)
      },

      // Contains filter function
      contains: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        return String(value).toLowerCase().includes(String(filterValue).toLowerCase())
      },

      // Equals filter function
      equals: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        if (value instanceof Date && filterValue instanceof Date) {
          return value.getTime() === filterValue.getTime()
        }

        return String(value).toLowerCase() === String(filterValue).toLowerCase()
      },

      // Starts with filter function
      startsWith: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase())
      },

      // Ends with filter function
      endsWith: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase())
      },

      // Greater than filter function
      greaterThan: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        if (value instanceof Date && filterValue instanceof Date) {
          return value.getTime() > filterValue.getTime()
        }

        return Number(value) > Number(filterValue)
      },

      // Less than filter function
      lessThan: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        if (value instanceof Date && filterValue instanceof Date) {
          return value.getTime() < filterValue.getTime()
        }

        return Number(value) < Number(filterValue)
      },

      // Between filter function
      between: (row, columnId, filterValue) => {
        const value = row.getValue(columnId)
        if (value === undefined || value === null) return false

        if (!Array.isArray(filterValue) || filterValue.length !== 2) return false

        const [min, max] = filterValue

        if (value instanceof Date && min instanceof Date && max instanceof Date) {
          return value.getTime() >= min.getTime() && value.getTime() <= max.getTime()
        }

        return Number(value) >= Number(min) && Number(value) <= Number(max)
      },

      // Is null filter function
      isNull: (row, columnId) => {
        const value = row.getValue(columnId)
        return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)
      },

      // Is not null filter function
      isNotNull: (row, columnId) => {
        const value = row.getValue(columnId)
        return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0)
      },
    },
  })

  // Configure column filters (only once to avoid infinite loops)
  const hasConfiguredFilters = useRef(false)
  useEffect(() => {
    if (hasConfiguredFilters.current) return
    // For each filterable column
    table.getAllColumns().forEach((column) => {
      if (column.getCanFilter() && column.id !== "actions") {
        // Set default filter function based on column type
        const headerText =
          typeof column.columnDef.header === "string" ? column.columnDef.header.toLowerCase() : column.id.toLowerCase()

        if (headerText.includes("data")) {
          column.columnDef.filterFn = table.options.filterFns?.equals
        } else {
          column.columnDef.filterFn = table.options.filterFns?.multiSelect
        }
      }
    })
    hasConfiguredFilters.current = true
  }, [table])

  // Expose table instance to parent component if needed (only once to avoid infinite loops)
  const hasExposedTable = useRef(false)
  useEffect(() => {
    if (setExternalTable && !hasExposedTable.current) {
      setExternalTable(table)
      hasExposedTable.current = true
    }
  }, [table, setExternalTable])

  const handleGlobalFilterChange = (value: string) => {
    setGlobalFilter(value)
  }

  const pageItems = (() => {
    if (!enablePagination) return []
    const totalPages = table.getPageCount()
    const current = pagination.pageIndex + 1
    if (totalPages <= 1) return [1]

    const siblingCount = 2
    const items: Array<number | "..."> = []

    if (totalPages <= 7 + siblingCount * 2) {
      for (let i = 1; i <= totalPages; i++) items.push(i)
      return items
    }

    items.push(1)

    const left = Math.max(2, current - siblingCount)
    const right = Math.min(totalPages - 1, current + siblingCount)

    if (left > 2) items.push("...")
    for (let i = left; i <= right; i++) items.push(i)
    if (right < totalPages - 1) items.push("...")

    items.push(totalPages)
    return items
  })()

  return (
    <div className="space-y-4 w-full">
      {showFilters ? (
        <Input
          aria-label="Caută în tabel"
          className="max-w-sm"
          value={globalFilter}
          onChange={(event) => handleGlobalFilterChange(event.target.value)}
          placeholder="Caută..."
        />
      ) : null}
      <div className="rounded-md border overflow-x-auto">
        <Table className={tableClassName}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gray-100">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={[
                      "whitespace-nowrap font-bold",
                      (header.column.columnDef.meta as any)?.thClassName,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort() ? "flex items-center gap-1 cursor-pointer select-none" : ""
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: " 🔼",
                          desc: " 🔽",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => {
                // Determinăm clasa pentru rând în funcție de status sau index
                let rowClass = index % 2 === 0 ? "bg-white" : "bg-gray-50"

                // Dacă avem o funcție pentru a determina clasa rândului, o folosim
                if (getRowClassName && row.original) {
                  const customClass = getRowClassName(row.original)
                  if (customClass) {
                    rowClass = `${rowClass} ${customClass}`
                  }
                }

                const rowHref = getRowHref?.(row.original)

                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onMouseDown={(event) => preventMiddleClickAutoscroll(event, Boolean(rowHref))}
                    onClick={(event) => {
                      if (!onRowClick) return
                      if (rowHref && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        openHrefInNewTab(rowHref)
                        return
                      }
                      if (!isPrimaryUnmodifiedClick(event)) return
                      onRowClick(row.original)
                    }}
                    onAuxClick={(event) => {
                      if (event.button !== 1 || !rowHref) return
                      event.preventDefault()
                      openHrefInNewTab(rowHref)
                    }}
                    className={`${rowClass} hover:bg-gray-100 ${onRowClick ? "cursor-pointer" : ""} transition-colors`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={(cell.column.columnDef.meta as any)?.tdClassName}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Nu există date disponibile.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {enablePagination ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {(() => {
              const total = table.getFilteredRowModel().rows.length
              const start = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
              const end = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)
              return `${start}-${end} din ${total}`
            })()}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rânduri/pagină:</span>
            <select
              aria-label="Rânduri pe pagină"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={pagination.pageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value) || initialPageSize
                setPagination({ pageIndex: 0, pageSize: nextSize })
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              {pageItems.map((it, idx) => {
                if (it === "...") {
                  return (
                    <span key={`dots-${idx}`} className="px-2 text-sm text-muted-foreground select-none">
                      ...
                    </span>
                  )
                }
                const pageNum = it
                const isActive = pageNum === pagination.pageIndex + 1
                return (
                  <Button
                    key={`p-${pageNum}`}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className={isActive ? "h-9 min-w-9 px-2" : "h-9 min-w-9 px-2"}
                    onClick={() => table.setPageIndex(pageNum - 1)}
                    disabled={pageNum < 1 || pageNum > table.getPageCount()}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Înapoi
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Înainte
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
