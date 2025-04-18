"use client"

import { useState, useEffect } from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Filter } from "lucide-react"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableViewOptions } from "./data-table-view-options"
import { DataTableFilters } from "./data-table-filters"
import { Card } from "@/components/ui/card"

// Modificăm interfața DataTableProps pentru a adăuga proprietatea showFilters
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchColumn?: string
  searchPlaceholder?: string
  filterableColumns?: {
    id: string
    title: string
    options: { label: string; value: string }[]
  }[]
  dateRangeColumn?: string
  defaultSort?: { id: string; desc: boolean }
  onRowClick?: (row: TData) => void
  showFilters?: boolean // Adăugăm această proprietate
}

// Modificăm funcția DataTable pentru a utiliza proprietatea showFilters
export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Caută...",
  filterableColumns = [],
  dateRangeColumn,
  defaultSort,
  onRowClick,
  showFilters = true, // Valoarea implicită este true
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort ? [defaultSort] : [])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [globalFilter, setGlobalFilter] = useState("")
  const [filtersVisible, setFiltersVisible] = useState(false)

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    filterFns: {
      // Adăugăm un filtru personalizat pentru numărul de lucrări
      numLucrariFilter: (row, columnId, filterValue) => {
        const rowValue = row.getValue(columnId) as number

        // Dacă nu avem valoare de filtru, returnăm true (afișăm toate rândurile)
        if (!filterValue) return true

        // Filtrăm în funcție de valoarea selectată
        if (filterValue === "0") {
          return rowValue === 0 || rowValue === null || rowValue === undefined
        } else if (filterValue === "1-5") {
          return rowValue >= 1 && rowValue <= 5
        } else if (filterValue === "5+") {
          return rowValue > 5
        }

        return true
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  })

  // Resetăm paginarea când se schimbă filtrele
  useEffect(() => {
    table.resetPageIndex(true)
  }, [table, columnFilters, globalFilter])

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center space-x-2">
            {searchColumn && (
              <div className="relative flex-1 max-w-sm">
                <Input
                  placeholder={searchPlaceholder}
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            )}
            <Button variant="outline" size="sm" className="h-9" onClick={() => setFiltersVisible(!filtersVisible)}>
              <Filter className="mr-2 h-4 w-4" />
              <span className="sm:inline">Filtre</span>
              {columnFilters.length > 0 && (
                <span className="ml-1 rounded-full bg-primary w-4 h-4 text-xs flex items-center justify-center text-primary-foreground">
                  {columnFilters.length}
                </span>
              )}
            </Button>
            <DataTableViewOptions table={table} />
          </div>
        </div>
      )}

      {filtersVisible && showFilters && (
        <Card className="p-4">
          <DataTableFilters table={table} filterableColumns={filterableColumns} dateRangeColumn={dateRangeColumn} />
        </Card>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="whitespace-nowrap">
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
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => onRowClick && onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
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

      <DataTablePagination table={table} />
    </div>
  )
}

// Adăugăm o componentă Filters la DataTable pentru a putea folosi filtrele independent
DataTable.Filters = function DataTableStandaloneFilters<TData>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Caută...",
  filterableColumns = [],
  dateRangeColumn,
}: Omit<DataTableProps<TData, any>, "onRowClick" | "defaultSort" | "showFilters">) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [filtersVisible, setFiltersVisible] = useState(false)

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    filterFns: {
      numLucrariFilter: (row, columnId, filterValue) => {
        const rowValue = row.getValue(columnId) as number
        if (!filterValue) return true
        if (filterValue === "0") {
          return rowValue === 0 || rowValue === null || rowValue === undefined
        } else if (filterValue === "1-5") {
          return rowValue >= 1 && rowValue <= 5
        } else if (filterValue === "5+") {
          return rowValue > 5
        }
        return true
      },
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchColumn && (
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full"
          />
        </div>
      )}
      <Button variant="outline" size="sm" className="h-9" onClick={() => setFiltersVisible(!filtersVisible)}>
        <Filter className="mr-2 h-4 w-4" />
        <span className="sm:inline">Filtre</span>
        {table.getState().columnFilters.length > 0 && (
          <span className="ml-1 rounded-full bg-primary w-4 h-4 text-xs flex items-center justify-center text-primary-foreground">
            {table.getState().columnFilters.length}
          </span>
        )}
      </Button>

      {filtersVisible && (
        <Card className="p-4 w-full mt-2">
          <DataTableFilters table={table} filterableColumns={filterableColumns} dateRangeColumn={dateRangeColumn} />
        </Card>
      )}
    </div>
  )
}
