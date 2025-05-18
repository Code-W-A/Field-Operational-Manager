// This is a new file we need to create or modify

"use client"

import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Echipament } from "@/lib/firebase/firestore"

interface CustomEquipmentSelectProps {
  equipments: Echipament[]
  value: string
  onSelect: (id: string, equipment: Echipament) => void
  disabled?: boolean
  placeholder?: string
  emptyMessage?: string
  fallbackName?: string
}

export function CustomEquipmentSelect({
  equipments,
  value,
  onSelect,
  disabled = false,
  placeholder = "Selectați echipamentul",
  emptyMessage = "Nu există echipamente disponibile",
  fallbackName = "",
}: CustomEquipmentSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredEquipments, setFilteredEquipments] = useState<Echipament[]>([])
  const [selectedEquipment, setSelectedEquipment] = useState<Echipament | null>(null)

  // Filter equipments based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredEquipments(equipments)
      return
    }

    const lowercasedFilter = searchTerm.toLowerCase()
    const filtered = equipments.filter(
      (equipment) =>
        equipment.nume.toLowerCase().includes(lowercasedFilter) ||
        (equipment.cod && equipment.cod.toLowerCase().includes(lowercasedFilter)),
    )
    setFilteredEquipments(filtered)
  }, [searchTerm, equipments])

  // Find selected equipment when value changes
  useEffect(() => {
    if (value && equipments.length > 0) {
      const found = equipments.find((e) => e.id === value)
      setSelectedEquipment(found || null)
    } else {
      setSelectedEquipment(null)
    }
  }, [value, equipments])

  // Handle equipment selection
  const handleEquipmentSelect = (equipmentId: string) => {
    const equipment = equipments.find((e) => e.id === equipmentId)
    if (equipment) {
      setSelectedEquipment(equipment)
      onSelect(equipmentId, equipment)
      setOpen(false)
    }
  }

  // Get display name for the selected equipment
  const getDisplayName = () => {
    if (selectedEquipment) {
      return selectedEquipment.cod ? `${selectedEquipment.nume} (${selectedEquipment.cod})` : selectedEquipment.nume
    }

    if (fallbackName) {
      return fallbackName
    }

    return placeholder
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate">{getDisplayName()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Căutare echipament..."
              value={searchTerm}
              onValueChange={setSearchTerm}
              className="flex-1 border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            <CommandEmpty>{searchTerm ? "Nu s-au găsit echipamente" : emptyMessage}</CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-y-auto">
              {filteredEquipments.map((equipment) => (
                <CommandItem
                  key={equipment.id}
                  value={equipment.id}
                  onSelect={() => handleEquipmentSelect(equipment.id || "")}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === equipment.id ? "opacity-100" : "opacity-0")} />
                  <span>{equipment.nume}</span>
                  {equipment.cod && <span className="ml-2 text-gray-500">({equipment.cod})</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
