"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import type { Table } from "@tanstack/react-table"
import { Settings2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({ table }: DataTableViewOptionsProps<TData>) {
  // Obținem coloanele care pot fi ascunse
  const hideableColumns = table
    .getAllColumns()
    .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())

  // Calculăm numărul de coloane ascunse
  const hiddenColumnsCount = hideableColumns.filter((column) => !column.getIsVisible()).length

  // Funcție pentru a afișa/ascunde toate coloanele
  const toggleAllColumns = (visible: boolean) => {
    hideableColumns.forEach((column) => column.toggleVisibility(visible))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1">
          <Settings2 className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Vizualizare</span>
          {hiddenColumnsCount > 0 && (
            <span className="ml-1 rounded-full bg-primary w-4 h-4 text-xs flex items-center justify-center text-primary-foreground">
              {hiddenColumnsCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Coloane vizibile</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[300px] overflow-y-auto px-1">
          {hideableColumns.map((column) => {
            // Obținem header-ul coloanei pentru afișare
            const headerText =
              typeof column.columnDef.header === "string"
                ? column.columnDef.header
                : column.id.charAt(0).toUpperCase() + column.id.slice(1)

            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {headerText}
              </DropdownMenuCheckboxItem>
            )
          })}
        </div>
        <DropdownMenuSeparator />
        <div className="flex justify-between px-1 py-1">
          <DropdownMenuItem onClick={() => toggleAllColumns(true)} className="justify-start flex-1">
            <Eye className="mr-2 h-4 w-4" />
            <span>Arată toate</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleAllColumns(false)} className="justify-start flex-1">
            <EyeOff className="mr-2 h-4 w-4" />
            <span>Ascunde toate</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
