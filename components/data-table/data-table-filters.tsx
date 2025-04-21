"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, X, Filter } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Calendar } from "@/components/ui/calendar"
import { format, isValid } from "date-fns"
import { ro } from "date-fns/locale"
import { cn } from "@/lib/utils"
import type { Column, Table } from "@tanstack/react-table"
import { MultiSelect, type Option } from "@/components/ui/multi-select"

interface DataTableFiltersProps<TData> {
  table: Table<TData>
}

export function DataTableFilters<TData>({ table }: DataTableFiltersProps<TData>) {
  const [mounted, setMounted] = useState(false)
  const [globalFilter, setGlobalFilter] = useState("")
  const [columnFilters, setColumnFilters] = useState<
    {
      id: string
      value: any
    }[]
  >([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<Record<string, Option[]>>({})

  // Setăm mounted la true după ce componenta este montată pentru a evita probleme de hidratare
  useEffect(() => {
    setMounted(true)
  }, [])

  // Sincronizăm starea filtrelor cu tabelul
  useEffect(() => {
    if (mounted) {
      setGlobalFilter(table.getState().globalFilter || "")
      setColumnFilters(table.getState().columnFilters as { id: string; value: any }[])
    }
  }, [table.getState().globalFilter, table.getState().columnFilters, mounted])

  // Generăm opțiunile pentru dropdown-uri
  useEffect(() => {
    if (mounted) {
      const options: Record<string, Option[]> = {}

      // Pentru fiecare coloană care poate fi filtrată
      table.getAllColumns().forEach((column) => {
        if (column.getCanFilter() && column.id !== "actions") {
          // Obținem toate valorile unice pentru această coloană
          const uniqueValues = new Set<string>()

          table.getPreFilteredRowModel().rows.forEach((row) => {
            const value = row.getValue(column.id)

            if (value !== undefined && value !== null) {
              if (Array.isArray(value)) {
                // Dacă valoarea este un array (ex: tehnicieni), adăugăm fiecare element
                value.forEach((v) => {
                  if (v !== undefined && v !== null) {
                    uniqueValues.add(String(v))
                  }
                })
              } else if (value instanceof Date) {
                // Pentru date, folosim formatul dd.MM.yyyy
                uniqueValues.add(format(value, "dd.MM.yyyy", { locale: ro }))
              } else if (typeof value === "object") {
                // Pentru obiecte, convertim la string
                uniqueValues.add(JSON.stringify(value))
              } else {
                // Pentru valori simple, convertim la string
                uniqueValues.add(String(value))
              }
            }
          })

          // Convertim valorile unice în opțiuni pentru dropdown și le sortăm
          options[column.id] = Array.from(uniqueValues)
            .filter(Boolean) // Eliminăm valorile goale
            .sort((a, b) => a.localeCompare(b, "ro"))
            .map((value) => ({
              label: value,
              value: value,
            }))
        }
      })

      setColumnOptions(options)
    }
  }, [table.getPreFilteredRowModel().rows, mounted])

  // Actualizăm filtrul global
  const handleGlobalFilterChange = (value: string) => {
    table.setGlobalFilter(value)
    setGlobalFilter(value)
  }

  // Actualizăm filtrul pentru o coloană specifică
  const handleColumnFilterChange = (columnId: string, value: any) => {
    // Verificăm dacă valoarea este un array gol și setăm filtrul la undefined în acest caz
    if (Array.isArray(value) && value.length === 0) {
      table.getColumn(columnId)?.setFilterValue(undefined)
    } else {
      // Asigurăm-ne că valoarea este setată corect pentru coloană
      table.getColumn(columnId)?.setFilterValue(value)

      // Forțăm reîmprospătarea tabelului pentru a aplica filtrul
      table.getColumn(columnId)?.getFilterFns()
    }
  }

  // Resetăm toate filtrele
  const resetAllFilters = () => {
    table.resetGlobalFilter()
    table.resetColumnFilters()
    setGlobalFilter("")
  }

  // Resetăm filtrul pentru o coloană specifică
  const resetColumnFilter = (columnId: string) => {
    table.getColumn(columnId)?.setFilterValue(undefined)
  }

  // Obținem coloanele care pot fi filtrate
  const filterableColumns = table.getAllColumns().filter((column) => column.getCanFilter() && column.id !== "actions")

  // Obținem filtrele active
  const activeFilters = columnFilters.filter(
    (filter) =>
      filter.value !== undefined &&
      filter.value !== "" &&
      (Array.isArray(filter.value) ? filter.value.length > 0 : true),
  )

  // Determinăm tipul de filtru pentru o coloană
  const getFilterType = (column: Column<TData, unknown>) => {
    const headerText =
      typeof column.columnDef.header === "string"
        ? column.columnDef.header
        : column.id.charAt(0).toUpperCase() + column.id.slice(1)

    if (headerText.toLowerCase().includes("data")) {
      return "date"
    }

    return "text"
  }

  // Formatăm valoarea filtrului pentru afișare
  const formatFilterValue = (columnId: string, value: any): string => {
    if (value === undefined || value === null) return ""

    if (Array.isArray(value)) {
      if (value.length === 0) return ""
      if (value.length === 1) return String(value[0])
      return `${value.length} selectate`
    }

    if (value instanceof Date && isValid(value)) {
      return format(value, "dd.MM.yyyy", { locale: ro })
    }

    return String(value)
  }

  if (!mounted) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Filtru global */}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Caută în toate coloanele..."
            value={globalFilter}
            onChange={(e) => handleGlobalFilterChange(e.target.value)}
            className="pl-8"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
              onClick={() => handleGlobalFilterChange("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Buton pentru filtre avansate */}
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-9 gap-1", activeFilters.length > 0 && "border-blue-500 text-blue-500")}
            >
              <Filter className="h-4 w-4 mr-1" />
              <span>Filtre</span>
              {activeFilters.length > 0 && (
                <Badge className="ml-1 bg-blue-500 text-white">{activeFilters.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[350px] p-0">
            <div className="p-4 border-b">
              <h4 className="font-medium">Filtre avansate</h4>
              <p className="text-sm text-muted-foreground">Filtrați datele după coloane specifice</p>
            </div>
            <div className="p-2 max-h-[400px] overflow-y-auto">
              <Accordion type="multiple" className="w-full">
                {filterableColumns.map((column) => {
                  const filterType = getFilterType(column)
                  const headerText =
                    typeof column.columnDef.header === "string"
                      ? column.columnDef.header
                      : column.id.charAt(0).toUpperCase() + column.id.slice(1)

                  const filterValue = column.getFilterValue()
                  const isActive =
                    filterValue !== undefined &&
                    filterValue !== "" &&
                    (Array.isArray(filterValue) ? filterValue.length > 0 : true)

                  return (
                    <AccordionItem key={column.id} value={column.id}>
                      <AccordionTrigger className="px-2 py-1 text-sm hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span>{headerText}</span>
                          {isActive && <Badge className="bg-blue-500 text-white">Activ</Badge>}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-2 pb-2">
                        {filterType === "date" ? (
                          <div className="space-y-2">
                            <Calendar
                              mode="single"
                              selected={filterValue as Date}
                              onSelect={(date) => handleColumnFilterChange(column.id, date)}
                              locale={ro}
                              className="border rounded-md p-2"
                            />
                            {isActive && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm">
                                  {isValid(filterValue as Date)
                                    ? format(filterValue as Date, "dd.MM.yyyy", { locale: ro })
                                    : "Data invalidă"}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => resetColumnFilter(column.id)}>
                                  <X className="h-3 w-3 mr-1" />
                                  Șterge
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <MultiSelect
                              options={columnOptions[column.id] || []}
                              selected={
                                Array.isArray(filterValue) ? filterValue : filterValue ? [String(filterValue)] : []
                              }
                              onChange={(selected) => handleColumnFilterChange(column.id, selected)}
                              placeholder={`Selectați ${headerText.toLowerCase()}`}
                              emptyText={`Nu există opțiuni pentru ${headerText.toLowerCase()}`}
                            />
                            {isActive && (
                              <div className="flex justify-end">
                                <Button variant="ghost" size="sm" onClick={() => resetColumnFilter(column.id)}>
                                  <X className="h-3 w-3 mr-1" />
                                  Șterge
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </div>
            <div className="p-2 border-t flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetAllFilters}
                disabled={activeFilters.length === 0 && !globalFilter}
              >
                Resetează toate
              </Button>
              <Button size="sm" onClick={() => setIsFilterOpen(false)}>
                Aplică
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Afișare filtre active */}
      {(activeFilters.length > 0 || globalFilter) && (
        <div className="flex flex-wrap gap-2 pt-2">
          {globalFilter && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span>Căutare: {globalFilter}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => handleGlobalFilterChange("")}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}
          {activeFilters.map((filter) => {
            const column = table.getColumn(filter.id)
            if (!column) return null

            const headerText =
              typeof column.columnDef.header === "string"
                ? column.columnDef.header
                : column.id.charAt(0).toUpperCase() + column.id.slice(1)

            const displayValue = formatFilterValue(filter.id, filter.value)

            return (
              <Badge key={filter.id} variant="secondary" className="flex items-center gap-1">
                <span>
                  {headerText}: {displayValue}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-1"
                  onClick={() => resetColumnFilter(filter.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )
          })}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetAllFilters}>
            Resetează toate
          </Button>
        </div>
      )}
    </div>
  )
}
