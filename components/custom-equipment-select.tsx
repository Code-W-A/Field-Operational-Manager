"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Search, Check, AlertCircle, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Echipament } from "@/lib/firebase/firestore"

interface CustomEquipmentSelectProps {
  equipments: Echipament[]
  value?: string
  onSelect: (value: string, equipment: Echipament) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  emptyMessage?: string
}

export function CustomEquipmentSelect({
  equipments,
  value,
  onSelect,
  disabled = false,
  className = "",
  placeholder = "Selectați echipamentul",
  emptyMessage = "Nu există echipamente disponibile",
}: CustomEquipmentSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEquipment, setSelectedEquipment] = useState<Echipament | null>(null)
  const [filteredEquipments, setFilteredEquipments] = useState<Echipament[]>(equipments)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Actualizăm echipamentul selectat când se schimbă valoarea sau lista de echipamente
  useEffect(() => {
    if (value) {
      const equipment = equipments.find((e) => e.id === value)
      if (equipment) {
        setSelectedEquipment(equipment)
      }
    } else {
      setSelectedEquipment(null)
    }
  }, [value, equipments])

  // Adăugăm un log pentru debugging
  useEffect(() => {
    console.log("CustomEquipmentSelect - value:", value)
    console.log("CustomEquipmentSelect - selectedEquipment:", selectedEquipment)
  }, [value, selectedEquipment])

  // Actualizăm lista filtrată de echipamente când se schimbă termenul de căutare sau lista de echipamente
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredEquipments(equipments)
    } else {
      const lowercaseSearchTerm = searchTerm.toLowerCase()
      const filtered = equipments.filter(
        (equipment) =>
          equipment.nume.toLowerCase().includes(lowercaseSearchTerm) ||
          equipment.cod.toLowerCase().includes(lowercaseSearchTerm) ||
          (equipment.model && equipment.model.toLowerCase().includes(lowercaseSearchTerm)) ||
          (equipment.serie && equipment.serie.toLowerCase().includes(lowercaseSearchTerm)),
      )
      setFilteredEquipments(filtered)
    }
  }, [searchTerm, equipments])

  // Focus pe câmpul de căutare când se deschide dropdown-ul
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [open])

  // Funcție pentru a gestiona selecția unui echipament
  const handleEquipmentSelect = (equipment: Echipament) => {
    if (!equipment.id) {
      console.error("Echipamentul selectat nu are un ID valid:", equipment)
      return
    }

    console.log("Selectare echipament:", equipment)
    setSelectedEquipment(equipment)
    onSelect(equipment.id, equipment)
    setOpen(false)
    setSearchTerm("")
  }

  // Funcție pentru a formata denumirea echipamentului pentru afișare
  const formatEquipmentName = (equipment: Echipament) => {
    if (!equipment) return ""

    let formattedName = equipment.nume

    // Adăugăm modelul dacă există
    if (equipment.model) {
      formattedName += ` (${equipment.model})`
    }

    return formattedName
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between text-left font-normal",
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              !selectedEquipment && "text-muted-foreground",
            )}
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              setOpen(!open)
            }}
          >
            <div className="flex items-center gap-2 truncate">
              {selectedEquipment ? (
                <>
                  <span className="font-semibold">{formatEquipmentName(selectedEquipment)}</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {selectedEquipment.cod}
                  </Badge>
                </>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 opacity-70", open && "rotate-180")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start" sideOffset={4}>
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Căutare echipament..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-4 py-2 h-9 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchTerm("")}
                >
                  <span className="sr-only">Șterge</span>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {filteredEquipments.length > 0 ? (
            <ScrollArea className="h-[250px] overflow-y-auto">
              <div className="p-1">
                {filteredEquipments.map((equipment) => (
                  <EquipmentItem
                    key={equipment.id || `eq-${equipment.cod}`}
                    equipment={equipment}
                    isSelected={selectedEquipment?.id === equipment.id}
                    onSelect={() => handleEquipmentSelect(equipment)}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {searchTerm ? (
                <div className="flex flex-col items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <p>
                    Nu s-au găsit echipamente pentru "<span className="font-medium">{searchTerm}</span>"
                  </p>
                </div>
              ) : (
                <p>{emptyMessage}</p>
              )}
            </div>
          )}

          {filteredEquipments.length > 0 && (
            <div className="p-2 border-t text-xs text-muted-foreground">
              {filteredEquipments.length} {filteredEquipments.length === 1 ? "echipament" : "echipamente"} disponibile
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Componentă pentru un element individual din dropdown
function EquipmentItem({
  equipment,
  isSelected,
  onSelect,
}: {
  equipment: Echipament
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center justify-between w-full px-3 py-2 text-sm rounded-md cursor-pointer transition-colors",
              isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
            )}
            onClick={onSelect}
          >
            <div className="flex flex-col gap-0.5 truncate pr-2">
              <span className="font-medium truncate">{equipment.nume}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Cod: {equipment.cod}
                </Badge>
                {equipment.model && <span className="text-xs text-muted-foreground truncate">{equipment.model}</span>}
              </div>
            </div>
            {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[300px]">
          <div className="space-y-1.5">
            <p className="font-semibold">{equipment.nume}</p>
            <div className="text-xs space-y-1">
              <p>
                <span className="font-medium">Cod:</span> {equipment.cod}
              </p>
              {equipment.model && (
                <p>
                  <span className="font-medium">Model:</span> {equipment.model}
                </p>
              )}
              {equipment.serie && (
                <p>
                  <span className="font-medium">Serie:</span> {equipment.serie}
                </p>
              )}
              {equipment.dataInstalare && (
                <p>
                  <span className="font-medium">Data instalare:</span> {equipment.dataInstalare}
                </p>
              )}
              {equipment.ultimaInterventie && (
                <p>
                  <span className="font-medium">Ultima intervenție:</span> {equipment.ultimaInterventie}
                </p>
              )}
              {equipment.observatii && (
                <p>
                  <span className="font-medium">Observații:</span> {equipment.observatii}
                </p>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Componentă pentru antetul secțiunii (dacă implementăm gruparea)
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="sticky top-0 z-10 pt-1 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-background">
      {title}
    </div>
  )
}

// Iconița X pentru ștergerea textului din căutare
function X(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  )
}
