"use client"
import { useState, useEffect, useRef } from "react"
import { Search, Check, AlertCircle, ChevronDown, X } from "lucide-react"
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
  fallbackName?: string // Adăugăm un nume de echipament de rezervă pentru cazul în care nu avem ID
}

export function CustomEquipmentSelect({
  equipments,
  value,
  onSelect,
  disabled = false,
  className = "",
  placeholder = "Selectați echipamentul",
  emptyMessage = "Nu există echipamente disponibile",
  fallbackName = "", // Numele echipamentului din datele inițiale
}: CustomEquipmentSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEquipment, setSelectedEquipment] = useState<Echipament | null>(null)
  const [filteredEquipments, setFilteredEquipments] = useState<Echipament[]>(equipments)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [fallbackUsed, setFallbackUsed] = useState(false)
  const [manuallySelected, setManuallySelected] = useState(false)
  const prevEquipmentsCountRef = useRef<number>(0)

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

  // Efectul principal de selecție: folosim doar ID/cod pentru value;
  // folosim fallbackName doar când există o singură potrivire unică de nume.

  useEffect(() => {
    console.log("CustomEquipmentSelect - Efect principal de selecție rulat cu:", {
      value,
      fallbackName,
      equipmentsCount: equipments.length,
    })

    // Dacă nu avem echipamente, nu facem nimic
    if (equipments.length === 0) return

    // Prioritate 1: Selecție după ID/cod (cea mai precisă)
    if (value) {
  const vLower = value.toLowerCase()

  const equipment = equipments.find(
    e => e.id  === value           // id
      || e.cod === value           // cod
      || e.nume === value          // nume exact
      // opțional: potrivire case-insensitive
      || e.cod?.toLowerCase()  === vLower
      || e.nume.toLowerCase()   === vLower
  )
      if (equipment) {
        console.log("CustomEquipmentSelect - Echipament găsit după ID:", equipment)
        setSelectedEquipment(equipment)
        setFallbackUsed(false)
        // Nu setăm manuallySelected aici pentru a permite actualizări automate
        return
      } else {
        console.log("CustomEquipmentSelect - Echipamentul cu ID", value, "nu a fost găsit")
      }
    }

    // Prioritate 2: Fallback după nume doar când există o singură potrivire de nume
    if (!value && fallbackName) {
      const exactMatches = equipments.filter((e) => e.nume === fallbackName)
      const fallbackNameLower = fallbackName.toLowerCase()
      const partialMatches = exactMatches.length === 0
        ? equipments.filter((e) => e.nume.toLowerCase() === fallbackNameLower)
        : exactMatches

      const uniqueMatch = partialMatches.length === 1 ? partialMatches[0] : null
      if (uniqueMatch) {
        console.log("CustomEquipmentSelect - Fallback unic după nume:", uniqueMatch)
        setSelectedEquipment(uniqueMatch)
        onSelect(uniqueMatch.id || "", uniqueMatch)
        setFallbackUsed(true)
        return
      }
    }

    // Dacă nu am găsit nicio potrivire și nu avem o selecție manuală, resetăm
    if (!manuallySelected) {
      console.log("CustomEquipmentSelect - Resetăm selecția (nicio potrivire găsită)")
      setSelectedEquipment(null)
    }
  }, [value, equipments, fallbackName, onSelect, manuallySelected])

  // Funcție pentru a gestiona selecția unui echipament
  const handleEquipmentSelect = (equipment: Echipament) => {
    if (!equipment.id) {
      console.error("Echipamentul selectat nu are un ID valid:", equipment)
      return
    }

    console.log("CustomEquipmentSelect - Selecting equipment:", equipment)
    setSelectedEquipment(equipment)
    setManuallySelected(true) // Marcăm că utilizatorul a selectat manual
    onSelect(equipment.id, equipment)
    setOpen(false)
    setSearchTerm("")

    // Adăugăm un timeout pentru a reseta starea manuallySelected
    // Acest lucru permite actualizări automate ulterioare
    setTimeout(() => {
      setManuallySelected(false)
    }, 500)
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

  // Efect pentru debugging
  useEffect(() => {
    console.log("CustomEquipmentSelect - Current state:", {
      value,
      fallbackName,
      selectedEquipment,
      equipmentsCount: equipments.length,
      disabled,
      open,
      fallbackUsed,
      manuallySelected,
    })
  }, [value, fallbackName, selectedEquipment, equipments.length, disabled, open, fallbackUsed, manuallySelected])

  // Efect special pentru selecția inițială când se încarcă echipamentele
  useEffect(() => {
    // Rulăm acest efect doar când lista de echipamente se schimbă de la goală la populată
    if (equipments.length > 0 && prevEquipmentsCountRef.current === 0) {
      console.log("CustomEquipmentSelect - Lista de echipamente tocmai s-a încărcat, forțăm selecția")

      // Resetăm starea de selecție manuală pentru a permite selecția automată
      setManuallySelected(false)

      // Forțăm re-evaluarea selecției
      if (value) {
        const equipment = equipments.find((e) => e.id === value)
        if (equipment) {
          console.log("CustomEquipmentSelect - Forțăm selecția după ID:", equipment)
          setSelectedEquipment(equipment)
        } else if (fallbackName) {
          // Încercăm după nume dacă ID-ul nu a fost găsit
          const equipmentByName = equipments.find((e) => e.nume === fallbackName)
          if (equipmentByName) {
            console.log("CustomEquipmentSelect - Forțăm selecția după nume:", equipmentByName)
            setSelectedEquipment(equipmentByName)
            onSelect(equipmentByName.id || "", equipmentByName)
          }
        }
      }
    }

    // Actualizăm referința pentru numărul anterior de echipamente
    prevEquipmentsCountRef.current = equipments.length
  }, [equipments.length, value, fallbackName, onSelect])

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
              !selectedEquipment && !fallbackName && "text-muted-foreground",
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
              ) : fallbackName ? (
                <span className="font-semibold">{fallbackName}</span>
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
            <ScrollArea className="h-[250px]">
              <div 
                className="p-1"
                onWheel={(e) => {
                  // Permite scroll cu roata mouse-ului
                  const scrollContainer = e.currentTarget.closest('[data-radix-scroll-area-viewport]');
                  if (scrollContainer) {
                    scrollContainer.scrollTop += e.deltaY;
                    e.preventDefault();
                  }
                }}
              >
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
              {equipment.ultimaInterventie && (
                <p>
                  <span className="font-medium">Ultima intervenție:</span> {equipment.ultimaInterventie}
                </p>
              )}
              {equipment.status && (
                <p>
                  <span className="font-medium">Status:</span> {equipment.status}
                </p>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
