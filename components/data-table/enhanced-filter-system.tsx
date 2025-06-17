"use client"
import { useState, useEffect, useMemo } from "react"
import {
  Filter,
  X,
  ChevronDown,
  CalendarIcon,
  Plus,
  Save,
  Trash2,
  Check,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format, isValid } from "date-fns"
import { ro } from "date-fns/locale"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Table } from "@tanstack/react-table"

interface EnhancedFilterSystemProps<TData> {
  table: Table<TData>
  persistenceKey?: string // Cheie pentru persistența automată
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
  | "notEquals"

interface FilterCondition {
  id: string
  column: string
  operator: FilterOperator
  value: any
  valueEnd?: any // For "between" operator
}

interface SavedFilter {
  id: string
  name: string
  description?: string
  conditions: FilterCondition[]
  globalFilter?: string
  createdAt: number
}

// Modificăm funcția principală pentru a folosi Dialog în loc de Popover
export function EnhancedFilterSystem<TData>({ table, persistenceKey }: EnhancedFilterSystemProps<TData>) {
  const [mounted, setMounted] = useState(false)
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false) // Redenumim din isFilterPanelOpen
  const [activeTab, setActiveTab] = useState<string>("quick")
  const [globalFilter, setGlobalFilter] = useState("")
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])
  const [newCondition, setNewCondition] = useState<Partial<FilterCondition>>({})
  const [columnOptions, setColumnOptions] = useState<Record<string, { label: string; value: string }[]>>({})
  const [expandedColumns, setExpandedColumns] = useState<string[]>([])

  // State for saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false)
  const [newFilterName, setNewFilterName] = useState("")
  const [newFilterDescription, setNewFilterDescription] = useState("")

  // Animation states
  const [isApplyingFilter, setIsApplyingFilter] = useState(false)
  const [lastAppliedFilter, setLastAppliedFilter] = useState<string | null>(null)

  // Set mounted to true after component is mounted to avoid hydration issues
  useEffect(() => {
    setMounted(true)

    // Load saved filters from localStorage
    const storedFilters = localStorage.getItem("savedFilters")
    if (storedFilters) {
      try {
        setSavedFilters(JSON.parse(storedFilters))
      } catch (e) {
        console.error("Failed to parse saved filters", e)
      }
    }

    // Load active filters from persistence if key is provided
    if (persistenceKey) {
      const storageKey = `table-settings-${persistenceKey}`
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          const settings = JSON.parse(saved)
          if (settings.activeFilters) {
            // Restore active filters
            settings.activeFilters.forEach((filter: any) => {
              if (filter.id === 'global') {
                table.setGlobalFilter(filter.value)
                setGlobalFilter(filter.value)
              } else {
                const column = table.getColumn(filter.id)
                if (column) {
                  column.setFilterValue(filter.value)
                }
              }
            })
          }
        }
      } catch (error) {
        console.error("Error loading active filters:", error)
      }
    }
  }, [persistenceKey, table])

  // Save active filters to persistence when they change
  useEffect(() => {
    if (mounted && persistenceKey) {
      const columnFilters = table.getState().columnFilters
      const globalFilter = table.getState().globalFilter
      
      // Build filters array for persistence
      const filtersToSave = columnFilters.map((filter: any) => ({
        id: filter.id,
        value: filter.value,
        type: Array.isArray(filter.value) ? 'multiselect' : 'text'
      }))
      
      if (globalFilter) {
        filtersToSave.push({
          id: 'global',
          value: globalFilter,
          type: 'text'
        })
      }

      // Save to localStorage
      const storageKey = `table-settings-${persistenceKey}`
      try {
        const current = localStorage.getItem(storageKey)
        const currentSettings = current ? JSON.parse(current) : {}
        const updated = { ...currentSettings, activeFilters: filtersToSave }
        localStorage.setItem(storageKey, JSON.stringify(updated))
      } catch (error) {
        console.error("Error saving active filters:", error)
      }
    }
  }, [table.getState().columnFilters, table.getState().globalFilter, mounted, persistenceKey, table])

  // Save filters to localStorage when they change
  useEffect(() => {
    if (mounted && savedFilters.length > 0) {
      localStorage.setItem("savedFilters", JSON.stringify(savedFilters))
    }
  }, [savedFilters, mounted])

  // Sync filter state with table
  useEffect(() => {
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
  useEffect(() => {
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
  const getColumnDataType = (columnId: string): "text" | "number" | "date" | "array" | "boolean" => {
    const column = table.getColumn(columnId)
    if (!column) return "text"

    const headerText =
      typeof column.columnDef.header === "string" ? column.columnDef.header.toLowerCase() : columnId.toLowerCase()

    if (headerText.includes("data")) return "date"

    // Check first row value to determine type
    const firstRow = table.getPreFilteredRowModel().rows[0]
    if (!firstRow) return "text"

    const value = firstRow.getValue(columnId)
    if (columnId === "necesitaOferta") return "boolean"
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
      case "boolean":
        return [
          { label: "Este", value: "equals" },
          { label: "Nu este", value: "notEquals" },
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

    // Show animation
    animateFilterApplication(condition.column)
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
      case "notEquals":
        column.setFilterValue(!condition.value)
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
      case "notEquals":
        return "nu este egal cu"
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

  // Save current filter configuration
  const saveCurrentFilter = () => {
    if (!newFilterName.trim()) return

    const newFilter: SavedFilter = {
      id: `filter_${Date.now()}`,
      name: newFilterName.trim(),
      description: newFilterDescription.trim() || undefined,
      conditions: [...filterConditions],
      globalFilter: globalFilter || undefined,
      createdAt: Date.now(),
    }

    setSavedFilters([...savedFilters, newFilter])
    setIsSaveDialogOpen(false)
    setNewFilterName("")
    setNewFilterDescription("")
  }

  // Load a saved filter
  const loadSavedFilter = (filter: SavedFilter) => {
    // Clear existing filters
    clearAllFilters()

    // Apply global filter if exists
    if (filter.globalFilter) {
      handleGlobalFilterChange(filter.globalFilter)
    }

    // Apply all conditions
    filter.conditions.forEach((condition) => {
      applyFilterToTable(condition)
    })

    // Update state
    setFilterConditions(filter.conditions)
    setIsLoadDialogOpen(false)

    // Show animation for all columns
    if (filter.conditions.length > 0) {
      filter.conditions.forEach((condition, index) => {
        setTimeout(() => {
          animateFilterApplication(condition.column)
        }, index * 100)
      })
    }
  }

  // Delete a saved filter
  const deleteSavedFilter = (filterId: string) => {
    setSavedFilters(savedFilters.filter((f) => f.id !== filterId))
  }

  // Animate filter application
  const animateFilterApplication = (columnId: string) => {
    setIsApplyingFilter(true)
    setLastAppliedFilter(columnId)

    setTimeout(() => {
      setIsApplyingFilter(false)
      setLastAppliedFilter(null)
    }, 1000)
  }

  // Get filterable columns
  const filterableColumns = table.getAllColumns().filter((column) => column.getCanFilter() && column.id !== "actions")

  // Group columns by category for better organization
  const groupedColumns = useMemo(() => {
    const groups: Record<string, typeof filterableColumns> = {
      Date: [],
      "Informații Client": [],
      "Detalii Lucrare": [],
      Status: [],
      Altele: [],
    }

    filterableColumns.forEach((column) => {
      const headerText = getColumnDisplayName(column.id).toLowerCase()

      if (headerText.includes("data")) {
        groups["Date"].push(column)
      } else if (headerText.includes("client") || headerText.includes("contact") || headerText.includes("telefon")) {
        groups["Informații Client"].push(column)
      } else if (headerText.includes("lucrare") || headerText.includes("descriere") || headerText.includes("tip")) {
        groups["Detalii Lucrare"].push(column)
      } else if (headerText.includes("status")) {
        groups["Status"].push(column)
      } else {
        groups["Altele"].push(column)
      }
    })

    // Remove empty groups
    return Object.entries(groups).filter(([_, columns]) => columns.length > 0)
  }, [filterableColumns])

  // Înlocuim secțiunea de render cu Dialog în loc de Popover
  if (!mounted) return null

  return (
    <div className="space-y-4">
      {/* Buton pentru deschiderea dialogului de filtrare */}
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-9 gap-1 transition-all duration-200 relative",
          filterConditions.length > 0 && "border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100",
        )}
        onClick={() => setIsFilterDialogOpen(true)}
      >
        <Filter className={cn("h-4 w-4 mr-1 transition-all", filterConditions.length > 0 && "text-blue-600")} />
        <span>Filtre</span>
        {filterConditions.length > 0 && (
          <Badge className="ml-1 bg-blue-600 text-white hover:bg-blue-700">{filterConditions.length}</Badge>
        )}
      </Button>

      {/* Dialog pentru filtrare - înlocuiește Popover */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 border-b bg-gradient-to-r from-blue-50 to-white">
            <DialogTitle className="text-blue-800">Filtre</DialogTitle>
            <DialogDescription>
              Filtrați datele după criterii specifice pentru a găsi informațiile dorite
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 pt-4">
              <TabsList className="grid w-full grid-cols-2 p-1">
                <TabsTrigger value="quick" className="text-sm">
                  <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                  Filtrare rapidă
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Quick filter tab */}
            <TabsContent value="quick" className="p-4">
              <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-1">
                {groupedColumns.map(([groupName, columns]) => (
                  <div key={groupName} className="mb-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-2">
                      {groupName}
                    </div>
                    <Accordion type="multiple" className="w-full">
                      {columns.map((column) => {
                        const columnId = column.id
                        const headerText = getColumnDisplayName(columnId)
                        const dataType = getColumnDataType(columnId)

                        // Check if column has active filters
                        const hasActiveFilter = filterConditions.some((c) => c.column === columnId)
                        const isHighlighted = lastAppliedFilter === columnId && isApplyingFilter

                        return (
                          <AccordionItem
                            key={columnId}
                            value={columnId}
                            className={cn(
                              "border border-transparent rounded-md mb-1 overflow-hidden transition-all duration-300",
                              hasActiveFilter && "border-blue-200 bg-blue-50",
                              isHighlighted && "border-blue-400 bg-blue-100 shadow-sm",
                            )}
                          >
                            <AccordionTrigger
                              className={cn(
                                "px-3 py-2 text-sm hover:no-underline rounded-md",
                                hasActiveFilter && "text-blue-700 font-medium",
                                isHighlighted && "text-blue-800 font-medium",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span>{headerText}</span>
                                {hasActiveFilter && (
                                  <Badge className="bg-blue-600 text-white hover:bg-blue-700">Activ</Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3 pt-1">
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
                                        animateFilterApplication(columnId)
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
                                        animateFilterApplication(columnId)
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
                ))}
              </div>
            </TabsContent>

            {/* Advanced filter tab */}
            <TabsContent value="advanced" className="p-4">
              <Card className="mb-4 border-blue-100">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-800">Adaugă condiție de filtrare</CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
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
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Selectați coloana" />
                        </SelectTrigger>
                        <SelectContent>
                          {groupedColumns.map(([groupName, columns]) => (
                            <SelectGroup key={groupName}>
                              <SelectLabel>{groupName}</SelectLabel>
                              {columns.map((column) => (
                                <SelectItem key={column.id} value={column.id}>
                                  {getColumnDisplayName(column.id)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
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
                          <SelectTrigger className="bg-white">
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
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start text-left font-normal bg-white"
                                  >
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
                                        className="w-full justify-start text-left font-normal bg-white"
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
                              className="bg-white"
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
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Adaugă filtru
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Active filters */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-blue-800 px-1">Filtre active</h3>
                {filterConditions.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">Nu există filtre active</p>
                ) : (
                  <div className="space-y-2">
                    {filterConditions.map((condition) => (
                      <div
                        key={condition.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md",
                          lastAppliedFilter === condition.column && isApplyingFilter
                            ? "bg-blue-100 border border-blue-300"
                            : "bg-blue-50 border border-blue-200",
                        )}
                      >
                        <div className="text-sm">
                          <span className="font-medium text-blue-800">{getColumnDisplayName(condition.column)}</span>
                          <span className="mx-1 text-muted-foreground">
                            {getOperatorDisplayText(condition.operator)}
                          </span>
                          <span className="text-blue-700">{formatFilterValue(condition)}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
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

          <DialogFooter className="p-4 border-t flex justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              disabled={filterConditions.length === 0 && !globalFilter}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Resetează toate
            </Button>
            <Button
              size="sm"
              onClick={() => setIsFilterDialogOpen(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Aplică
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active filters display */}
      {(filterConditions.length > 0 || globalFilter) && (
        <div className="flex flex-wrap gap-2 pt-2">
          {filterConditions.map((condition) => (
            <Badge
              key={condition.id}
              variant="outline"
              className={cn(
                "flex items-center gap-1 py-1.5 px-2 border-blue-200 bg-blue-50 text-blue-800",
                lastAppliedFilter === condition.column && isApplyingFilter && "border-blue-400 bg-blue-100",
              )}
            >
              <span className="font-medium">{getColumnDisplayName(condition.column)}:</span>
              <span>{getOperatorDisplayText(condition.operator)}</span>
              <span className="font-medium">{formatFilterValue(condition)}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1 text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-full"
                onClick={() => removeFilterCondition(condition.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
          {filterConditions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100"
              onClick={clearAllFilters}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Resetează toate
            </Button>
          )}
        </div>
      )}

      {/* Păstrăm dialogurile existente pentru salvare și încărcare filtre */}
      {/* Save Filter Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Salvează filtrul curent</DialogTitle>
            <DialogDescription>
              Creează un nume pentru filtrul curent pentru a-l putea folosi mai târziu.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filter-name" className="text-right">
                Nume
              </Label>
              <Input
                id="filter-name"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                className="col-span-3"
                placeholder="Ex: Lucrări în așteptare"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filter-description" className="text-right">
                Descriere
              </Label>
              <Textarea
                id="filter-description"
                value={newFilterDescription}
                onChange={(e) => setNewFilterDescription(e.target.value)}
                className="col-span-3"
                placeholder="Descriere opțională pentru acest filtru"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={saveCurrentFilter} disabled={!newFilterName.trim()}>
              <Save className="h-4 w-4 mr-1" />
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Filter Dialog */}
      <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Filtre salvate</DialogTitle>
            <DialogDescription>Selectați un filtru salvat pentru a-l aplica.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto">
            {savedFilters.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">Nu există filtre salvate</div>
            ) : (
              <div className="space-y-2">
                {savedFilters.map((filter) => (
                  <Card key={filter.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between p-3 border-b">
                        <div>
                          <h4 className="font-medium">{filter.name}</h4>
                          {filter.description && <p className="text-sm text-muted-foreground">{filter.description}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-blue-700"
                            onClick={() => loadSavedFilter(filter)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() => deleteSavedFilter(filter.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3 bg-muted/20">
                        <div className="text-xs text-muted-foreground mb-1">
                          Conține {filter.conditions.length} condiții de filtrare
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {filter.conditions.map((condition) => (
                            <Badge
                              key={condition.id}
                              variant="outline"
                              className="text-xs bg-blue-50 border-blue-200 text-blue-800"
                            >
                              {getColumnDisplayName(condition.column)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLoadDialogOpen(false)}>
              Închide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [open, setOpen] = useState(false)

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
          className={cn("min-h-10 w-full justify-between bg-white", className)}
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
                        className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 hover:bg-blue-200"
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
                    <Badge variant="secondary" className="px-2 py-0.5 bg-blue-100 text-blue-800">
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
        <div className="max-h-[300px] overflow-y-auto">
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

          <div className="py-1">
            <Input placeholder="Caută opțiuni..." className="px-2 py-1 mb-1 mx-2 w-[calc(100%-16px)]" />

            {options.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              <div className="space-y-1">
                {options.map((option) => {
                  // Check if option is selected
                  const isSelected = selected.includes(option.value)

                  return (
                    <div
                      key={option.value}
                      className="flex items-center px-2 py-1.5 hover:bg-blue-50 cursor-pointer"
                      onClick={() => handleSelect(option.value)}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="mr-2 h-4 w-4"
                        onCheckedChange={() => handleSelect(option.value)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
