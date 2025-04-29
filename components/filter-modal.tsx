"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"
import { useLockBody } from "@/hooks/use-lock-body"

export interface FilterOption {
  id: string
  label: string
  type: "text" | "select" | "multiselect" | "date" | "checkbox" | "dateRange"
  options?: { value: string; label: string }[]
  value?: any
}

interface FilterModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  filterOptions: FilterOption[]
  onApplyFilters: (filters: FilterOption[]) => void
  onResetFilters: () => void
}

export function FilterModal({
  isOpen,
  onClose,
  title,
  filterOptions,
  onApplyFilters,
  onResetFilters,
}: FilterModalProps) {
  const [filters, setFilters] = useState<FilterOption[]>(filterOptions)

  // Use our custom hook to manage body scroll locking
  useLockBody(isOpen)

  // Actualizăm starea filtrelor când se schimbă opțiunile
  useEffect(() => {
    setFilters(filterOptions)
  }, [filterOptions])

  const handleFilterChange = (id: string, value: any) => {
    setFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, value } : filter)))
  }

  const handleApply = () => {
    onApplyFilters(filters)
    onClose()
  }

  const handleReset = () => {
    onResetFilters()
    onClose()
  }

  // Ensure proper cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Force any remaining overlay elements to be removed
      const overlays = document.querySelectorAll("[data-radix-dialog-overlay]")
      overlays.forEach((overlay) => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay)
        }
      })
    }
  }, [])

  const renderFilterInput = (filter: FilterOption) => {
    switch (filter.type) {
      case "text":
        return (
          <Input
            id={filter.id}
            value={filter.value || ""}
            onChange={(e) => handleFilterChange(filter.id, e.target.value)}
            placeholder={`Filtrează după ${filter.label.toLowerCase()}`}
            className="w-full"
          />
        )
      case "select":
        return (
          <Select value={filter.value || ""} onValueChange={(value) => handleFilterChange(filter.id, value)}>
            <SelectTrigger>
              <SelectValue placeholder={`Selectează ${filter.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              {filter.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case "multiselect":
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1 mb-2">
              {filter.value && Array.isArray(filter.value) && filter.value.length > 0 ? (
                filter.value.map((val) => {
                  const option = filter.options?.find((opt) => opt.value === val)
                  return (
                    <Badge key={val} variant="secondary" className="flex items-center gap-1">
                      {option?.label || val}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() =>
                          handleFilterChange(
                            filter.id,
                            filter.value.filter((v: string) => v !== val),
                          )
                        }
                      />
                    </Badge>
                  )
                })
              ) : (
                <span className="text-sm text-muted-foreground">Nicio selecție</span>
              )}
            </div>
            <ScrollArea className="h-40 rounded-md border">
              <div className="p-2 space-y-2">
                {filter.options?.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`${filter.id}-${option.value}`}
                      checked={
                        filter.value && Array.isArray(filter.value) ? filter.value.includes(option.value) : false
                      }
                      onCheckedChange={(checked) => {
                        const currentValues = Array.isArray(filter.value) ? filter.value : []
                        if (checked) {
                          handleFilterChange(filter.id, [...currentValues, option.value])
                        } else {
                          handleFilterChange(
                            filter.id,
                            currentValues.filter((val) => val !== option.value),
                          )
                        }
                      }}
                    />
                    <Label htmlFor={`${filter.id}-${option.value}`}>{option.label}</Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )
      case "date":
        return (
          <Input
            id={filter.id}
            type="date"
            value={filter.value || ""}
            onChange={(e) => handleFilterChange(filter.id, e.target.value)}
            className="w-full"
          />
        )
      case "dateRange":
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${filter.id}-from`} className="text-xs">
                De la
              </Label>
              <Input
                id={`${filter.id}-from`}
                type="date"
                value={(filter.value && filter.value.from) || ""}
                onChange={(e) =>
                  handleFilterChange(filter.id, {
                    ...filter.value,
                    from: e.target.value,
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor={`${filter.id}-to`} className="text-xs">
                Până la
              </Label>
              <Input
                id={`${filter.id}-to`}
                type="date"
                value={(filter.value && filter.value.to) || ""}
                onChange={(e) =>
                  handleFilterChange(filter.id, {
                    ...filter.value,
                    to: e.target.value,
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        )
      case "checkbox":
        return (
          <Checkbox
            id={filter.id}
            checked={filter.value || false}
            onCheckedChange={(checked) => handleFilterChange(filter.id, checked)}
          />
        )
      default:
        return null
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          // Ensure we properly clean up when dialog is closed
          setTimeout(() => onClose(), 10)
        }
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-hidden bg-white"
        onEscapeKeyDown={onClose}
        onInteractOutside={onClose}
        onPointerDownOutside={onClose}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {filters.map((filter) => (
              <div key={filter.id} className="space-y-2">
                <Label htmlFor={filter.id}>{filter.label}</Label>
                {renderFilterInput(filter)}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={handleReset}>
            Resetează
          </Button>
          <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700">
            Aplică filtrele
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
