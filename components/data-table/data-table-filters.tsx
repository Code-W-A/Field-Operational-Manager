"use client"

import { useState, useEffect, useMemo } from "react"
import type { Table } from "@tanstack/react-table"
import { X, ChevronDown, ChevronUp, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

interface DataTableFiltersProps<TData> {
  table: Table<TData>
  filterableColumns?: {
    id: string
    title: string
    options: { label: string; value: string }[]
  }[]
  dateRangeColumn?: string
  advancedFilters?: {
    id: string
    title: string
    type: "text" | "select" | "date" | "boolean" | "number"
    options?: { label: string; value: string }[]
  }[]
}

export function DataTableFilters<TData>({
  table,
  filterableColumns = [],
  dateRangeColumn,
  advancedFilters = [],
}: DataTableFiltersProps<TData>) {
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [advancedFilterValues, setAdvancedFilterValues] = useState<Record<string, any>>({})

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
    setAdvancedFilterValues({})
  }

  // Funcție pentru a aplica un filtru avansat
  const applyAdvancedFilter = (columnId: string, value: any) => {
    if (value === undefined || value === "" || value === null) {
      table.getColumn(columnId)?.setFilterValue(undefined)

      // Actualizăm starea locală
      setAdvancedFilterValues((prev) => {
        const newValues = { ...prev }
        delete newValues[columnId]
        return newValues
      })
    } else {
      table.getColumn(columnId)?.setFilterValue(value)

      // Actualizăm starea locală
      setAdvancedFilterValues((prev) => ({
        ...prev,
        [columnId]: value,
      }))
    }
  }

  // Calculăm numărul de filtre avansate active
  const activeAdvancedFiltersCount = useMemo(() => {
    return Object.keys(advancedFilterValues).length
  }, [advancedFilterValues])

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

        {/* Buton pentru filtre avansate */}
        {advancedFilters && advancedFilters.length > 0 && (
          <div className="flex flex-col space-y-1 w-full sm:w-auto">
            <p className="text-sm font-medium">Filtre avansate</p>
            <Button
              variant="outline"
              className="h-8 flex items-center justify-between"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <span>Filtre avansate</span>
              {activeAdvancedFiltersCount > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">{activeAdvancedFiltersCount}</Badge>
              )}
              {showAdvancedFilters ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>

      {/* Secțiunea de filtre avansate */}
      {showAdvancedFilters && advancedFilters && advancedFilters.length > 0 && (
        <div className="border rounded-md p-4 mt-2 bg-muted/20">
          <h3 className="text-sm font-medium mb-3">Filtre avansate</h3>
          <Accordion type="multiple" className="w-full">
            {advancedFilters.map((filter) => (
              <AccordionItem key={filter.id} value={filter.id}>
                <AccordionTrigger className="text-sm py-2">{filter.title}</AccordionTrigger>
                <AccordionContent>
                  <div className="py-2">
                    {filter.type === "text" && (
                      <div className="flex flex-col space-y-2">
                        <Label htmlFor={`filter-${filter.id}`} className="text-xs">
                          Caută în {filter.title.toLowerCase()}
                        </Label>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id={`filter-${filter.id}`}
                            placeholder={`Caută...`}
                            className="pl-8"
                            value={advancedFilterValues[filter.id] || ""}
                            onChange={(e) => applyAdvancedFilter(filter.id, e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {filter.type === "select" && filter.options && (
                      <div className="flex flex-col space-y-2">
                        <Label htmlFor={`filter-${filter.id}`} className="text-xs">
                          Selectează {filter.title.toLowerCase()}
                        </Label>
                        <Select
                          value={advancedFilterValues[filter.id] || ""}
                          onValueChange={(value) => applyAdvancedFilter(filter.id, value === "all" ? undefined : value)}
                        >
                          <SelectTrigger id={`filter-${filter.id}`}>
                            <SelectValue placeholder={`Selectează ${filter.title.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toate</SelectItem>
                            {filter.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {filter.type === "date" && (
                      <div className="flex flex-col space-y-2">
                        <Label className="text-xs">Selectează data pentru {filter.title.toLowerCase()}</Label>
                        <div className="flex items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {advancedFilterValues[filter.id] ? (
                                  format(new Date(advancedFilterValues[filter.id]), "dd.MM.yyyy", { locale: ro })
                                ) : (
                                  <span>Selectează data</span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={
                                  advancedFilterValues[filter.id]
                                    ? new Date(advancedFilterValues[filter.id])
                                    : undefined
                                }
                                onSelect={(date) => applyAdvancedFilter(filter.id, date?.toISOString())}
                                initialFocus
                                locale={ro}
                              />
                            </PopoverContent>
                          </Popover>
                          {advancedFilterValues[filter.id] && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2"
                              onClick={() => applyAdvancedFilter(filter.id, undefined)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {filter.type === "boolean" && (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`filter-${filter.id}`}
                          checked={advancedFilterValues[filter.id] === true}
                          onCheckedChange={(checked) => {
                            if (checked === "indeterminate") return
                            applyAdvancedFilter(filter.id, checked || undefined)
                          }}
                        />
                        <Label htmlFor={`filter-${filter.id}`} className="text-sm">
                          {filter.title}
                        </Label>
                      </div>
                    )}

                    {filter.type === "number" && (
                      <div className="space-y-2">
                        <Label htmlFor={`filter-${filter.id}`} className="text-xs">
                          {filter.title}
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`filter-${filter.id}-min`}
                            type="number"
                            placeholder="Min"
                            className="w-24"
                            value={advancedFilterValues[`${filter.id}-min`] || ""}
                            onChange={(e) => {
                              const min = e.target.value ? Number(e.target.value) : undefined
                              const max = advancedFilterValues[`${filter.id}-max`]

                              setAdvancedFilterValues((prev) => ({
                                ...prev,
                                [`${filter.id}-min`]: min,
                              }))

                              applyAdvancedFilter(filter.id, [min, max])
                            }}
                          />
                          <span>-</span>
                          <Input
                            id={`filter-${filter.id}-max`}
                            type="number"
                            placeholder="Max"
                            className="w-24"
                            value={advancedFilterValues[`${filter.id}-max`] || ""}
                            onChange={(e) => {
                              const max = e.target.value ? Number(e.target.value) : undefined
                              const min = advancedFilterValues[`${filter.id}-min`]

                              setAdvancedFilterValues((prev) => ({
                                ...prev,
                                [`${filter.id}-max`]: max,
                              }))

                              applyAdvancedFilter(filter.id, [min, max])
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

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

          {/* Afișăm badge-uri pentru filtrele avansate active */}
          {Object.entries(advancedFilterValues).map(([key, value]) => {
            // Ignorăm valorile min/max pentru filtrele de tip număr
            if (key.endsWith("-min") || key.endsWith("-max")) return null

            // Găsim filtrul avansat corespunzător
            const filter = advancedFilters?.find((f) => f.id === key)
            if (!filter) return null

            let displayValue = value

            // Formatăm valoarea în funcție de tipul filtrului
            if (filter.type === "date" && value) {
              displayValue = format(new Date(value), "dd.MM.yyyy", { locale: ro })
            } else if (filter.type === "select" && filter.options) {
              const option = filter.options.find((opt) => opt.value === value)
              if (option) displayValue = option.label
            } else if (filter.type === "boolean") {
              displayValue = value ? "Da" : "Nu"
            } else if (filter.type === "number" && Array.isArray(value)) {
              const [min, max] = value
              displayValue = `${min || ""}${min !== undefined && max !== undefined ? " - " : ""}${max || ""}`
            }

            return (
              <Badge key={key} variant="secondary" className="rounded-sm px-1">
                <span className="font-medium mr-1">{filter.title}:</span>
                {displayValue}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 px-1 ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => applyAdvancedFilter(key, undefined)}
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Șterge filtru</span>
                </Button>
              </Badge>
            )
          })}
        </div>

        {(table.getState().columnFilters.length > 0 ||
          (dateRangeColumn && table.getColumn(dateRangeColumn)?.getFilterValue()) ||
          Object.keys(advancedFilterValues).length > 0) && (
          <Button variant="ghost" size="sm" onClick={resetAllFilters} className="h-8">
            Resetează toate filtrele
          </Button>
        )}
      </div>
    </div>
  )
}
