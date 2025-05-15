"use client"

import { useState, useEffect } from "react"
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTablePagination } from "./data-table-pagination"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  defaultSort?: { id: string; desc: boolean }
  onRowClick?: (row: TData) => void
  table?: any
  setTable?: (table: any) => void
  showFilters?: boolean // Adăugăm acest prop
}

export function DataTable<TData, TValue>({
  columns,
  data,
  defaultSort,
  onRowClick,
  table: externalTable,
  setTable: setExternalTable,
  showFilters = true, // Valoarea implicită este true
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort ? [defaultSort] : [])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")

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
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, columnId, filterValue) => {
      const safeValue = (() => {
        const value = row.getValue(columnId)

        // Verificăm dacă valoarea este null sau undefined
        if (value === null || value === undefined) return ""

        // Verificăm dacă valoarea este un obiect Date
        if (value instanceof Date) {
          return value.toLocaleDateString("ro-RO")
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

  // Configure column filters
  useEffect(() => {
    // For each filterable column
    table.getAllColumns().forEach((column) => {
      if (column.getCanFilter() && column.id !== "actions") {
        // Set default filter function based on column type
        const headerText =
          typeof column.columnDef.header === "string" ? column.columnDef.header.toLowerCase() : column.id.toLowerCase()

        if (headerText.includes("data")) {
          column.columnDef.filterFn = "equals"
        } else {
          column.columnDef.filterFn = "multiSelect"
        }
      }
    })
  }, [table])

  // Expose table instance to parent component if needed
  useEffect(() => {
    if (setExternalTable) {
      setExternalTable(table)
    }
  }, [table, setExternalTable])

  const handleGlobalFilterChange = (value: string) => {
    setGlobalFilter(value)
  }

  return (
    <div className="space-y-4 w-full overflow-x-auto">
      <div className="rounded-md border data-table">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
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
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
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
