"use client"

import * as React from "react"
import { X, Filter, ChevronDown, Search, CalendarIcon, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format, isValid } from "date-fns"
import { ro } from "date-fns/locale"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import type { Table } from "@tanstack/react-table"

interface DataTableFilterSystemProps<TData> {
  table: Table<TData>
}

type FilterOperator =
  | "equals"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan"
  | "between"
  | "in"
  | "isNull"
  | "isNotNull"

interface FilterCondition {
  id: string
  column: string
  operator: FilterOperator
  value: any
  valueEnd?: any // For "between" operator
}

export function DataTableFilterSystem<TData>({ table }: DataTableFilterSystemProps<TData>) {
  const [mounted, setMounted] = React.useState(false)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<string>("quick")
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [filterConditions, setFilterConditions] = React.useState<FilterCondition[]>([])
  const [newCondition, setNewCondition] = React.useState<Partial<FilterCondition>>({})
  const [columnOptions, setColumnOptions] = React.useState<Record<string, { label: string; value: string }[]>>({})
  const [expandedColumns, setExpandedColumns] = React.useState<string[]>([])

  // Set mounted to true after component is mounted to avoid hydration issues
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Sync filter state with table
  React.useEffect(() => {
    if (mounted) {
      setGlobalFilter(table.getState().globalFilter || "")

      // Convert table column filters to our format
      const tableFilters = table.getState().columnFilters
      if (tableFilters.length > 0) {
        const conditions: FilterCondition[] = []

        tableFilters.forEach((filter) => {
          const column = table.getColumn(filter.id)
          if (!column) return

          if (Array.isArray(filter.value)) {
            conditions.push({
              id: `${filter.id}-${Date.now()}`,
              column: filter.id,
              operator: "in",
              value: filter.value,
            })
          } else if (filter.value instanceof Date) {
            conditions.push({
              id: `${filter.id}-${Date.now()}`,
              column: filter.id,
              operator: "equals",
              value: filter.value,
            })
          } else {
            conditions.push({
              id: `${filter.id}-${Date.now()}`,
              column: filter.id,
              operator: "contains",
              value: filter.value,
            })
          }
        })

        setFilterConditions(conditions)
      }
    }
  }, [table.getState().globalFilter, table.getState().columnFilters, mounted, table])

  // Generate options for dropdowns
  React.useEffect(() => {
    if (mounted) {
      const options: Record<string, { label: string; value: string }[]> = {}

      // For each filterable column
      table.getAllColumns().forEach((column) => {
        if (column.getCanFilter() && column.id !== "actions") {
          // Get all unique values for this column
          const uniqueValues = new Set<string>()

          table.getPreFilteredRowModel().rows.forEach((row) => {
            const value = row.getValue(column.id)

            if (value !== undefined && value !== null) {
              if (Array.isArray(value)) {
                // If value is an array (e.g., technicians), add each element
                value.forEach((v) => {
                  if (v !== undefined && v !== null) {
                    uniqueValues.add(String(v))
                  }
                })
              } else if (value instanceof Date) {
                // For dates, use dd.MM.yyyy format
                uniqueValues.add(format(value, "dd.MM.yyyy", { locale: ro }))
              } else if (typeof value === "object") {
                // For objects, convert to string
                uniqueValues.add(JSON.stringify(value))
              } else {
                // For simple values, convert to string
                uniqueValues.add(String(value))
              }
            }
          })

          // Convert unique values to options for dropdown and sort them
          options[column.id] = Array.from(uniqueValues)
            .filter(Boolean) // Remove empty values
            .sort((a, b) => a.localeCompare(b, "ro"))
            .map((value) => ({
              label: value,
              value: value,
            }))
        }
      })

      setColumnOptions(options)
    }
  }, [table.getPreFilteredRowModel().rows, mounted, table])

  // Update global filter
  const handleGlobalFilterChange = (value: string) => {
    table.setGlobalFilter(value)
    setGlobalFilter(value)
  }

  // Get column display name
  const getColumnDisplayName = (columnId: string): string => {
    const column = table.getColumn(columnId)
    if (!column) return columnId

    return typeof column.columnDef.header === "string"
      ? column.columnDef.header
      : columnId.charAt(0).toUpperCase() + columnId.slice(1)
  }

  // Get column data type
  const getColumnDataType = (columnId: string): "text" | "number" | "date" | "array" => {
    const column = table.getColumn(columnId)
    if (!column) return "text"

    const headerText =
      typeof column.columnDef.header === "string" ? column.columnDef.header.toLowerCase() : columnId.toLowerCase()

    if (headerText.includes("data")) return "date"

    // Check first row value to determine type
    const firstRow = table.getPreFilteredRowModel().rows[0]
    if (!firstRow) return "text"

    const value = firstRow.getValue(columnId)
    if (value instanceof Date) return "date"
    if (Array.isArray(value)) return "array"
    if (typeof value === "number") return "number"

    return "text"
  }

  // Get available operators for a column
  const getOperatorsForColumn = (columnId: string): { label: string; value: FilterOperator }[] => {
    const dataType = getColumnDataType(columnId)

    switch (dataType) {
      case "text":
        return [
          { label: "Conține", value: "contains" },
          { label: "Este egal cu", value: "equals" },
          { label: "Începe cu", value: "startsWith" },
          { label: "Se termină cu", value: "endsWith" },
          { label: "Este gol", value: "isNull" },
          { label: "Nu este gol", value: "isNotNull" },
        ]
      case "number":
        return [
          { label: "Este egal cu", value: "equals" },
          { label: "Mai mare decât", value: "greaterThan" },
          { label: "Mai mic decât", value: "lessThan" },
          { label: "Între", value: "between" },
          { label: "Este gol", value: "isNull" },
          { label: "Nu este gol", value: "isNotNull" },
        ]
      case "date":
        return [
          { label: "Este egal cu", value: "equals" },
          { label: "După", value: "greaterThan" },
          { label: "Înainte de", value: "lessThan" },
          { label: "Între", value: "between" },
          { label: "Este gol", value: "isNull" },
          { label: "Nu este gol", value: "isNotNull" },
        ]
      case "array":
        return [
          { label: "Conține", value: "contains" },
          { label: "Este egal cu", value: "equals" },
          { label: "Include oricare", value: "in" },
          { label: "Este gol", value: "isNull" },
          { label: "Nu este gol", value: "isNotNull" },
        ]
      default:
        return [
          { label: "Conține", value: "contains" },
          { label: "Este egal cu", value: "equals" },
        ]
    }
  }

  // Add a new filter condition
  const addFilterCondition = () => {
    if (!newCondition.column || !newCondition.operator) return

    const condition: FilterCondition = {
      id: `${newCondition.column}-${Date.now()}`,
      column: newCondition.column,
      operator: newCondition.operator as FilterOperator,
      value: newCondition.value,
      valueEnd: newCondition.valueEnd,
    }

    setFilterConditions([...filterConditions, condition])

    // Apply filter to table
    applyFilterToTable(condition)

    // Reset new condition form
    setNewCondition({})
  }

  // Remove a filter condition
  const removeFilterCondition = (id: string) => {
    const condition = filterConditions.find((c) => c.id === id)
    if (!condition) return

    // Remove from our state
    setFilterConditions(filterConditions.filter((c) => c.id !== id))

    // Remove from table
    table.getColumn(condition.column)?.setFilterValue(undefined)
  }

  // Clear all filters
  const clearAllFilters = () => {
    setFilterConditions([])
    table.resetGlobalFilter()
    table.resetColumnFilters()
    setGlobalFilter("")
  }

  // Apply filter to table
  const applyFilterToTable = (condition: FilterCondition) => {
    const column = table.getColumn(condition.column)
    if (!column) return

    switch (condition.operator) {
      case "equals":
        column.setFilterValue(condition.value)
        break
      case "contains":
        column.setFilterValue(condition.value)
        break
      case "startsWith":
        column.setFilterValue(condition.value)
        break
      case "endsWith":
        column.setFilterValue(condition.value)
        break
      case "greaterThan":
        column.setFilterValue(condition.value)
        break
      case "lessThan":
        column.setFilterValue(condition.value)
        break
      case "between":
        column.setFilterValue([condition.value, condition.valueEnd])
        break
      case "in":
        column.setFilterValue(condition.value)
        break
      case "isNull":
        column.setFilterValue("")
        break
      case "isNotNull":
        column.setFilterValue("not-null")
        break
    }
  }

  // Format filter value for display
  const formatFilterValue = (condition: FilterCondition): string => {
    if (condition.value === undefined || condition.value === null) {
      if (condition.operator === "isNull") return "este gol"
      if (condition.operator === "isNotNull") return "nu este gol"
      return ""
    }

    if (Array.isArray(condition.value)) {
      if (condition.value.length === 0) return ""
      if (condition.value.length === 1) return String(condition.value[0])
      return `${condition.value.length} selectate`
    }

    if (condition.value instanceof Date && isValid(condition.value)) {
      if (condition.operator === "between" && condition.valueEnd instanceof Date) {
        return `${format(condition.value, "dd.MM.yyyy", { locale: ro })} - ${format(condition.valueEnd, "dd.MM.yyyy", { locale: ro })}`
      }
      return format(condition.value, "dd.MM.yyyy", { locale: ro })
    }

    return String(condition.value)
  }

  // Get operator display text
  const getOperatorDisplayText = (operator: FilterOperator): string => {
    switch (operator) {
      case "equals":
        return "este egal cu"
      case "contains":
        return "conține"
      case "startsWith":
        return "începe cu"
      case "endsWith":
        return "se termină cu"
      case "greaterThan":
        return "mai mare decât"
      case "lessThan":
        return "mai mic decât"
      case "between":
        return "între"
      case "in":
        return "include oricare"
      case "isNull":
        return "este gol"
      case "isNotNull":
        return "nu este gol"
      default:
        return operator
    }
  }

  // Toggle column expansion in advanced filter
  const toggleColumnExpansion = (columnId: string) => {
    if (expandedColumns.includes(columnId)) {
      setExpandedColumns(expandedColumns.filter((id) => id !== columnId))
    } else {
      setExpandedColumns([...expandedColumns, columnId])
    }
  }

  // Get filterable columns
  const filterableColumns = table.getAllColumns().filter((column) => column.getCanFilter() && column.id !== "actions")

  if (!mounted) return null

  return (
    <div className="space-y-4">
      {/* Top filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Global search */}
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

        {/* Filter button */}
        <Popover open={isFilterPanelOpen} onOpenChange={setIsFilterPanelOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-9 gap-1", filterConditions.length > 0 && "border-blue-500 text-blue-500")}
            >
              <Filter className="h-4 w-4 mr-1" />
              <span>Filtre</span>
              {filterConditions.length > 0 && (
                <Badge className="ml-1 bg-blue-500 text-white">{filterConditions.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[400px] p-0">
            <div className="p-4 border-b">
              <h4 className="font-medium">Filtre avansate</h4>
              <p className="text-sm text-muted-foreground">Filtrați datele după criterii specifice</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 p-1 m-2">
                <TabsTrigger value="quick">Filtrare rapidă</TabsTrigger>
                <TabsTrigger value="advanced">Filtrare avansată</TabsTrigger>
              </TabsList>

              {/* Quick filter tab */}
              <TabsContent value="quick" className="p-2">
                <div className="max-h-[400px] overflow-y-auto">
                  <Accordion type="multiple" className="w-full">
                    {filterableColumns.map((column) => {
                      const columnId = column.id
                      const headerText = getColumnDisplayName(columnId)
                      const dataType = getColumnDataType(columnId)

                      // Check if column has active filters
                      const hasActiveFilter = filterConditions.some((c) => c.column === columnId)

                      return (
                        <AccordionItem key={columnId} value={columnId}>
                          <AccordionTrigger className="px-2 py-1 text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                              <span>{headerText}</span>
                              {hasActiveFilter && <Badge className="bg-blue-500 text-white">Activ</Badge>}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-2 pb-2">
                            {dataType === "date" ? (
                              <div className="space-y-2">
                                <Calendar
                                  mode="single"
                                  selected={column.getFilterValue() as Date}
                                  onSelect={(date) => {
                                    if (date) {
                                      const condition: FilterCondition = {
                                        id: `${columnId}-${Date.now()}`,
                                        column: columnId,
                                        operator: "equals",
                                        value: date,
                                      }
                                      setFilterConditions([
                                        ...filterConditions.filter((c) => c.column !== columnId),
                                        condition,
                                      ])
                                      column.setFilterValue(date)
                                    } else {
                                      setFilterConditions(filterConditions.filter((c) => c.column !== columnId))
                                      column.setFilterValue(undefined)
                                    }
                                  }}
                                  locale={ro}
                                  className="border rounded-md p-2"
                                />
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <MultiSelectFilter
                                  options={columnOptions[columnId] || []}
                                  selected={
                                    Array.isArray(column.getFilterValue())
                                      ? column.getFilterValue()
                                      : column.getFilterValue()
                                        ? [String(column.getFilterValue())]
                                        : []
                                  }
                                  onChange={(selected) => {
                                    if (selected.length > 0) {
                                      const condition: FilterCondition = {
                                        id: `${columnId}-${Date.now()}`,
                                        column: columnId,
                                        operator: "in",
                                        value: selected,
                                      }
                                      setFilterConditions([
                                        ...filterConditions.filter((c) => c.column !== columnId),
                                        condition,
                                      ])
                                      column.setFilterValue(selected)
                                    } else {
                                      setFilterConditions(filterConditions.filter((c) => c.column !== columnId))
                                      column.setFilterValue(undefined)
                                    }
                                  }}
                                  placeholder={`Selectați ${headerText.toLowerCase()}`}
                                  emptyText={`Nu există opțiuni pentru ${headerText.toLowerCase()}`}
                                />
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </div>
              </TabsContent>

              {/* Advanced filter tab */}
              <TabsContent value="advanced" className="p-2">
                <Card className="mb-4">
                  <CardContent className="p-3">
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-2">
                        <div className="space-y-1">
                          <label className="text-sm font-medium">Coloană</label>
                          <Select
                            value={newCondition.column}
                            onValueChange={(value) =>
                              setNewCondition({
                                ...newCondition,
                                column: value,
                                operator: undefined,
                                value: undefined,
                                valueEnd: undefined,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selectați coloana" />
                            </SelectTrigger>
                            <SelectContent>
                              {filterableColumns.map((column) => (
                                <SelectItem key={column.id} value={column.id}>
                                  {getColumnDisplayName(column.id)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {newCondition.column && (
                          <div className="space-y-1">
                            <label className="text-sm font-medium">Operator</label>
                            <Select
                              value={newCondition.operator}
                              onValueChange={(value) =>
                                setNewCondition({
                                  ...newCondition,
                                  operator: value as FilterOperator,
                                  value: undefined,
                                  valueEnd: undefined,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selectați operatorul" />
                              </SelectTrigger>
                              <SelectContent>
                                {getOperatorsForColumn(newCondition.column).map((op) => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {newCondition.column &&
                          newCondition.operator &&
                          !["isNull", "isNotNull"].includes(newCondition.operator) && (
                            <div className="space-y-1">
                              <label className="text-sm font-medium">Valoare</label>
                              {getColumnDataType(newCondition.column) === "date" ? (
                                <div className="flex flex-col space-y-2">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {newCondition.value instanceof Date ? (
                                          format(newCondition.value, "dd.MM.yyyy", { locale: ro })
                                        ) : (
                                          <span>Selectați data</span>
                                        )}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                      <Calendar
                                        mode="single"
                                        selected={newCondition.value as Date}
                                        onSelect={(date) =>
                                          setNewCondition({
                                            ...newCondition,
                                            value: date,
                                          })
                                        }
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>

                                  {newCondition.operator === "between" && (
                                    <>
                                      <label className="text-sm font-medium">Până la</label>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            className="w-full justify-start text-left font-normal"
                                          >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {newCondition.valueEnd instanceof Date ? (
                                              format(newCondition.valueEnd, "dd.MM.yyyy", { locale: ro })
                                            ) : (
                                              <span>Selectați data</span>
                                            )}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                          <Calendar
                                            mode="single"
                                            selected={newCondition.valueEnd as Date}
                                            onSelect={(date) =>
                                              setNewCondition({
                                                ...newCondition,
                                                valueEnd: date,
                                              })
                                            }
                                            initialFocus
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    </>
                                  )}
                                </div>
                              ) : newCondition.operator === "in" ? (
                                <MultiSelectFilter
                                  options={columnOptions[newCondition.column] || []}
                                  selected={Array.isArray(newCondition.value) ? newCondition.value : []}
                                  onChange={(selected) =>
                                    setNewCondition({
                                      ...newCondition,
                                      value: selected,
                                    })
                                  }
                                  placeholder="Selectați valorile"
                                  emptyText="Nu există opțiuni disponibile"
                                />
                              ) : (
                                <Input
                                  type={getColumnDataType(newCondition.column) === "number" ? "number" : "text"}
                                  value={newCondition.value || ""}
                                  onChange={(e) =>
                                    setNewCondition({
                                      ...newCondition,
                                      value: e.target.value,
                                    })
                                  }
                                  placeholder="Introduceți valoarea"
                                />
                              )}
                            </div>
                          )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={addFilterCondition}
                          disabled={
                            !newCondition.column ||
                            !newCondition.operator ||
                            (["isNull", "isNotNull"].includes(newCondition.operator as string)
                              ? false
                              : !newCondition.value) ||
                            (newCondition.operator === "between" && !newCondition.valueEnd)
                          }
                        >
                          <Plus className="h-4 w-4 mr-1" /> Adaugă filtru
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Active filters */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Filtre active</h3>
                  {filterConditions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nu există filtre active</p>
                  ) : (
                    <div className="space-y-2">
                      {filterConditions.map((condition) => (
                        <div key={condition.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                          <div className="text-sm">
                            <span className="font-medium">{getColumnDisplayName(condition.column)}</span>
                            <span className="mx-1 text-muted-foreground">
                              {getOperatorDisplayText(condition.operator)}
                            </span>
                            <span>{formatFilterValue(condition)}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeFilterCondition(condition.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="p-2 border-t flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                disabled={filterConditions.length === 0 && !globalFilter}
              >
                Resetează toate
              </Button>
              <Button size="sm" onClick={() => setIsFilterPanelOpen(false)}>
                Închide
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filters display */}
      {(filterConditions.length > 0 || globalFilter) && (
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
          {filterConditions.map((condition) => (
            <Badge key={condition.id} variant="secondary" className="flex items-center gap-1">
              <span>
                {getColumnDisplayName(condition.column)}: {getOperatorDisplayText(condition.operator)}{" "}
                {formatFilterValue(condition)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1"
                onClick={() => removeFilterCondition(condition.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAllFilters}>
            Resetează toate
          </Button>
        </div>
      )}
    </div>
  )
}

// MultiSelectFilter component for selecting multiple values
interface MultiSelectFilterProps {
  options: { label: string; value: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  className?: string
  emptyText?: string
}

function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder = "Selectați opțiuni...",
  className,
  emptyText = "Nu există opțiuni disponibile",
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false)

  // Remove a selected value
  const handleUnselect = (value: string) => {
    onChange(selected.filter((item) => item !== value))
  }

  // Handle selection of a value
  const handleSelect = (value: string) => {
    // Check if value is already selected
    const isSelected = selected.includes(value)

    // If selected, remove it; if not, add it
    const newSelected = isSelected ? selected.filter((item) => item !== value) : [...selected, value]

    // Call onChange with new selected values
    onChange(newSelected)
  }

  // Handle select/deselect all
  const handleSelectAll = () => {
    // If all options are selected, deselect all
    // Otherwise, select all options
    const allValues = options.map((option) => option.value)
    const newSelected = selected.length === options.length ? [] : allValues
    onChange(newSelected)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("min-h-10 w-full justify-between", className)}
        >
          <div className="flex flex-wrap gap-1 overflow-hidden">
            {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {selected.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1 overflow-hidden">
                  {selected.length <= 2 ? (
                    selected.map((value) => (
                      <Badge
                        key={value}
                        variant="secondary"
                        className="flex items-center gap-1 px-2 py-0.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnselect(value)
                        }}
                      >
                        {options.find((option) => option.value === value)?.label || value}
                        <X className="h-3 w-3 cursor-pointer" />
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="px-2 py-0.5">
                      {selected.length} selectate
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command className="max-h-[300px]">
          <CommandInput placeholder="Caută opțiuni..." />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <div className="border-b px-2 py-1.5">
                <div className="flex items-center">
                  <Checkbox
                    id="select-all"
                    checked={selected.length === options.length && options.length > 0}
                    onCheckedChange={handleSelectAll}
                    className="mr-2 h-4 w-4"
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault()
                      handleSelectAll()
                    }}
                  >
                    {selected.length === options.length ? "Deselectează tot" : "Selectează tot"}
                  </label>
                </div>
              </div>
              {options.map((option) => {
                // Check if option is selected
                const isSelected = selected.includes(option.value)

                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelect(option.value)
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="mr-2 h-4 w-4"
                        onCheckedChange={() => handleSelect(option.value)}
                      />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
