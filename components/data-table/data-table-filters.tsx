"use client"

import { useState, useEffect } from "react"
import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface DataTableFiltersProps<TData> {
  table: Table<TData>
  filterableColumns?: {
    id: string
    title: string
    options: { label: string; value: string }[]
  }[]
  dateRangeColumn?: string
}

export function DataTableFilters<TData>({
  table,
  filterableColumns = [],
  dateRangeColumn,
}: DataTableFiltersProps<TData>) {
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

  // Funcție pentru a aplica filtrul de interval de date
  const applyDateRangeFilter = () => {
    if (dateRangeColumn && (startDate || endDate)) {
      table
        .getColumn(dateRangeColumn)
        ?.setFilterValue([startDate ? startDate.toISOString() : "", endDate ? endDate.toISOString() : ""])
    }
  }

  // Funcție pentru a reseta filtrul de interval de date
  const resetDateRangeFilter = () => {
    if (dateRangeColumn) {
      setStartDate(undefined)
      setEndDate(undefined)
      table.getColumn(dateRangeColumn)?.setFilterValue(null)
    }
  }

  // Funcție pentru a reseta toate filtrele
  const resetAllFilters = () => {
    table.resetColumnFilters()
    setStartDate(undefined)
    setEndDate(undefined)
  }

  // Adăugăm o funcție pentru a procesa valorile de filtrare pentru numărul de lucrări
  useEffect(() => {
    // Verificăm dacă avem o coloană pentru numărul de lucrări
    const numarLucrariColumn = table.getColumn("numarLucrari")
    if (numarLucrariColumn) {
      const filterValue = numarLucrariColumn.getFilterValue() as string

      if (filterValue) {
        // Procesăm valorile de filtrare
        if (filterValue === "0" || filterValue === "1-5" || filterValue === "5+") {
          // Filtrul este deja setat corect, nu trebuie să facem nimic
        }
      }
    }
  }, [table])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {filterableColumns.map((column) => (
          <div key={column.id} className="flex flex-col space-y-1 w-full sm:w-auto">
            <p className="text-sm font-medium">{column.title}</p>
            <Select
              value={(table.getColumn(column.id)?.getFilterValue() as string) || ""}
              onValueChange={(value) => {
                table.getColumn(column.id)?.setFilterValue(value === "all" ? undefined : value)
              }}
            >
              <SelectTrigger className="h-8 min-w-[150px]">
                <SelectValue placeholder={`Selectează ${column.title.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate</SelectItem>
                {column.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {dateRangeColumn && (
          <div className="flex flex-col space-y-1 w-full">
            <p className="text-sm font-medium">Interval de date</p>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd.MM.yyyy", { locale: ro }) : <span>Data început</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus locale={ro} />
                </PopoverContent>
              </Popover>
              <span>-</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd.MM.yyyy", { locale: ro }) : <span>Data sfârșit</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    locale={ro}
                    disabled={(date) => (startDate ? date < startDate : false)}
                  />
                </PopoverContent>
              </Popover>
              <div className="flex space-x-1">
                <Button variant="outline" size="sm" className="h-8" onClick={applyDateRangeFilter}>
                  Aplică
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={resetDateRangeFilter}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {table.getState().columnFilters.map((filter) => {
            // Găsim coloana filtrabilă corespunzătoare
            const column = filterableColumns.find((col) => col.id === filter.id)
            if (!column) return null

            // Găsim opțiunea selectată
            const filterValue = filter.value as string
            const option = column.options.find((opt) => opt.value === filterValue)

            return (
              <Badge key={filter.id} variant="secondary" className="rounded-sm px-1">
                <span className="font-medium mr-1">{column.title}:</span>
                {option?.label || filterValue}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 px-1 ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Șterge filtru</span>
                </Button>
              </Badge>
            )
          })}

          {dateRangeColumn && table.getColumn(dateRangeColumn)?.getFilterValue() && (
            <Badge variant="secondary" className="rounded-sm px-1">
              <span className="font-medium mr-1">Interval date:</span>
              {startDate && format(startDate, "dd.MM.yyyy", { locale: ro })} -{" "}
              {endDate && format(endDate, "dd.MM.yyyy", { locale: ro })}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 px-1 ml-1 text-muted-foreground hover:text-foreground"
                onClick={resetDateRangeFilter}
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Șterge filtru</span>
              </Button>
            </Badge>
          )}
        </div>

        {table.getState().columnFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={resetAllFilters} className="h-8">
            Resetează toate filtrele
          </Button>
        )}
      </div>
    </div>
  )
}
