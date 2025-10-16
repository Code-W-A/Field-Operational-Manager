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
  activeFilters?: FilterOption[]
  onApplyFilters: (filters: FilterOption[]) => void
  onResetFilters: () => void
}

export function FilterModal({
  isOpen,
  onClose,
  title,
  filterOptions,
  activeFilters,
  onApplyFilters,
  onResetFilters,
}: FilterModalProps) {
  const [filters, setFilters] = useState<FilterOption[]>(filterOptions)
  const [clientsSearch, setClientsSearch] = useState("")

  // Use our custom hook to manage body scroll locking
  const { unlockBody } = useLockBody()

  // Modifică funcția onClose pentru a asigura curățarea corectă
  const handleClose = () => {
    unlockBody() // Asigură-te că body-ul este deblocat
    onClose() // Apelează funcția originală onClose
  }

  // Actualizăm starea filtrelor când se schimbă opțiunile sau filtrele active
  useEffect(() => {
    const mergedFilters = filterOptions.map((option) => {
      // Căutăm filtrul activ corespunzător
      const activeFilter = activeFilters?.find((af) => af.id === option.id)
      if (activeFilter) {
        // Folosim valoarea din filtrul activ
        return { ...option, value: activeFilter.value }
      }
      return option
    })
    setFilters(mergedFilters)
  }, [filterOptions, activeFilters])

  const handleFilterChange = (id: string, value: any) => {
    setFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, value } : filter)))
  }

  const handleApply = () => {
    onApplyFilters(filters)
    handleClose()
  }

  const handleReset = () => {
    onResetFilters()
    handleClose()
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
        // Stilizare specială pentru statusul echipamentului
        if (filter.id === "statusEchipament") {
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 mb-2">
                {filter.value && Array.isArray(filter.value) && filter.value.length > 0 ? (
                  filter.value.map((val) => {
                    const option = filter.options?.find((opt) => opt.value === val)
                    // Determină clasa de stil pentru badge în funcție de valoarea statusului
                    let badgeClass = "flex items-center gap-1"
                    if (val === "Funcțional") badgeClass += " bg-green-100 text-green-800 border-green-200"
                    else if (val === "Parțial funcțional")
                      badgeClass += " bg-yellow-100 text-yellow-800 border-yellow-200"
                    else if (val === "Nefuncțional") badgeClass += " bg-red-100 text-red-800 border-red-200"
                    else badgeClass += " bg-gray-100 text-gray-800 border-gray-200"

                    return (
                      <Badge key={val} variant="secondary" className={badgeClass}>
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
                  {filter.options?.map((option) => {
                    // Determină clasa de stil pentru checkbox în funcție de valoarea statusului
                    let labelClass = "text-sm"
                    if (option.value === "Funcțional") labelClass += " text-green-700"
                    else if (option.value === "Parțial funcțional") labelClass += " text-yellow-700"
                    else if (option.value === "Nefuncțional") labelClass += " text-red-700"

                    return (
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
                        <Label htmlFor={`${filter.id}-${option.value}`} className={labelClass}>
                          {option.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )
        }
        // Multiselect cu search pentru lista mare de clienți
        if (filter.id === "clienti") {
          const normalized = (s: string) => (s || "").toLocaleLowerCase()
          const filteredOptions = (filter.options || []).filter((opt) =>
            normalized(opt.label).includes(normalized(clientsSearch)) || normalized(opt.value).includes(normalized(clientsSearch)),
          )

          return (
            <div className="space-y-2">
              <Input
                placeholder="Caută client..."
                value={clientsSearch}
                onChange={(e) => setClientsSearch(e.target.value)}
                className="w-full"
              />
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
                  {filteredOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${filter.id}-${option.value}`}
                        checked={
                          filter.value && Array.isArray(filter.value)
                            ? filter.value.includes(option.value)
                            : false
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
                  {filteredOptions.length === 0 && (
                    <div className="text-xs text-muted-foreground px-1">Niciun client găsit</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )
        }
        // Stilizare specială pentru statusul preluare
        if (filter.id === "preluatStatus") {
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 mb-2">
                {filter.value && Array.isArray(filter.value) && filter.value.length > 0 ? (
                  filter.value.map((val) => {
                    const option = filter.options?.find((opt) => opt.value === val)
                    // Determină clasa de stil pentru badge în funcție de valoarea statusului
                    let badgeClass = "flex items-center gap-1"
                    if (val === "preluat") badgeClass += " bg-green-100 text-green-800 border-green-200"
                    else if (val === "nepreluat") badgeClass += " bg-yellow-100 text-yellow-800 border-yellow-200"
                    else if (val === "nedefinit") badgeClass += " bg-gray-100 text-gray-800 border-gray-200"
                    else badgeClass += " bg-gray-100 text-gray-800 border-gray-200"

                    return (
                      <Badge key={val} variant="secondary" className={badgeClass}>
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
                  {filter.options?.map((option) => {
                    // Determină clasa de stil pentru checkbox în funcție de valoarea statusului
                    let labelClass = "text-sm"
                    if (option.value === "preluat") labelClass += " text-green-700"
                    else if (option.value === "nepreluat") labelClass += " text-yellow-700"
                    else if (option.value === "nedefinit") labelClass += " text-gray-700"

                    return (
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
                        <Label htmlFor={`${filter.id}-${option.value}`} className={labelClass}>
                          {option.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )
        }
        // Stilizare specială pentru necesitaOferta
        if (filter.id === "necesitaOferta") {
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1 mb-2">
                {filter.value && Array.isArray(filter.value) && filter.value.length > 0 ? (
                  filter.value.map((val) => {
                    const option = filter.options?.find((opt) => opt.value === val)
                    // Determină clasa de stil pentru badge în funcție de valoarea
                    let badgeClass = "flex items-center gap-1"
                    if (val === "da") badgeClass += " bg-orange-100 text-orange-800 border-orange-200"
                    else if (val === "nu") badgeClass += " bg-blue-100 text-blue-800 border-blue-200"
                    else badgeClass += " bg-gray-100 text-gray-800 border-gray-200"

                    return (
                      <Badge key={val} variant="secondary" className={badgeClass}>
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
                  {filter.options?.map((option) => {
                    // Determină clasa de stil pentru checkbox în funcție de valoarea
                    let labelClass = "text-sm"
                    if (option.value === "da") labelClass += " text-orange-700"
                    else if (option.value === "nu") labelClass += " text-blue-700"

                    return (
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
                        <Label htmlFor={`${filter.id}-${option.value}`} className={labelClass}>
                          {option.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )
        }
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
        if (!open) handleClose()
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-hidden bg-white"
        onEscapeKeyDown={handleClose}
        onInteractOutside={handleClose}
        onPointerDownOutside={handleClose}
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
