"use client"

import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Client {
  id: string
  nume: string
}

interface ClientSearchSelectProps {
  clients: Client[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ClientSearchSelect({
  clients,
  value,
  onValueChange,
  placeholder = "Selectați clientul...",
  className,
  disabled = false
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  // Găsim clientul selectat
  const selectedClient = clients.find((client) => client.id === value)
  const selectedLabel = value === "UNASSIGNED" ? "Neasignat" : selectedClient?.nume || placeholder

  // Filtrăm clienții pe baza căutării
  const filteredClients = clients.filter((client) =>
    client.nume.toLowerCase().includes(searchValue.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Căutați client..."
              value={searchValue}
              onValueChange={setSearchValue}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <CommandEmpty>Nu s-au găsit clienți.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {/* Opțiunea Neasignat */}
            <CommandItem
              value="unassigned"
              onSelect={() => {
                onValueChange("UNASSIGNED")
                setOpen(false)
                setSearchValue("")
              }}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  value === "UNASSIGNED" ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="text-muted-foreground italic">Neasignat</span>
            </CommandItem>
            
            {/* Lista de clienți filtrați */}
            {filteredClients.map((client) => (
              <CommandItem
                key={client.id}
                value={client.id}
                onSelect={(currentValue) => {
                  onValueChange(currentValue === value ? "UNASSIGNED" : currentValue)
                  setOpen(false)
                  setSearchValue("")
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === client.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {client.nume}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 