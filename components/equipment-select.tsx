"use client"

import { useState, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Echipament } from "@/lib/firebase/firestore"

interface EquipmentSelectProps {
  equipments: Echipament[]
  value?: string
  onSelect: (value: string, equipment: Echipament) => void
  disabled?: boolean
}

export function EquipmentSelect({ equipments, value, onSelect, disabled = false }: EquipmentSelectProps) {
  const [open, setOpen] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Echipament | null>(null)

  // Actualizăm echipamentul selectat când se schimbă valoarea
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

  // Adăugăm un efect pentru a afișa echipamentele disponibile în consolă
  useEffect(() => {
    console.log("Echipamente disponibile în EquipmentSelect:", equipments)
    console.log("Stare disabled:", disabled)
  }, [equipments, disabled])

  // Funcție pentru a gestiona selecția unui echipament
  const handleEquipmentSelect = (equipmentId: string, equipment: Echipament) => {
    console.log("Echipament selectat:", equipment)
    onSelect(equipmentId, equipment)
    setSelectedEquipment(equipment)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            disabled ? "opacity-50 cursor-not-allowed" : "opacity-100 cursor-pointer",
          )}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setOpen(!open)
            }
          }}
        >
          {selectedEquipment ? `${selectedEquipment.nume} (Cod: ${selectedEquipment.cod})` : "Selectați echipamentul"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Căutați echipamentul..." />
          <CommandList>
            <CommandEmpty>Nu s-au găsit echipamente.</CommandEmpty>
            <CommandGroup>
              {equipments.map((equipment) => (
                <CommandItem
                  key={equipment.id || `eq-${equipment.cod}`}
                  value={`${equipment.nume} ${equipment.cod}`}
                  onSelect={() => handleEquipmentSelect(equipment.id!, equipment)}
                  className="cursor-pointer hover:bg-gray-100"
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", selectedEquipment?.id === equipment.id ? "opacity-100" : "opacity-0")}
                  />
                  {equipment.nume} <span className="ml-2 text-gray-500">Cod: {equipment.cod}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
