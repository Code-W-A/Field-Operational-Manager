"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export type Option = {
  label: string
  value: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  className?: string
  emptyText?: string
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Selectați opțiuni...",
  className,
  emptyText = "Nu există opțiuni disponibile",
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  // Adăugăm un state pentru a controla valoarea input-ului de căutare
  const [inputValue, setInputValue] = React.useState("")

  // Funcție pentru a elimina o valoare selectată
  const handleUnselect = (value: string) => {
    onChange(selected.filter((item) => item !== value))
  }

  // Funcție pentru a gestiona selecția individuală - problema era aici
  const handleSelect = (value: string) => {
    // Verificăm dacă valoarea este deja selectată
    const isSelected = selected.includes(value)

    // Dacă este selectată, o eliminăm; dacă nu, o adăugăm
    const newSelected = isSelected ? selected.filter((item) => item !== value) : [...selected, value]

    // Apelăm callback-ul onChange cu noua listă de valori selectate
    onChange(newSelected)
  }

  // Funcție pentru a selecta/deselecta toate opțiunile
  const handleSelectAll = () => {
    // Dacă toate opțiunile sunt selectate, deselectăm tot
    // Altfel, selectăm toate opțiunile
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
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command className="max-h-[300px]">
          {/* Modificăm CommandInput pentru a fi controlat */}
          <CommandInput placeholder="Caută opțiuni..." value={inputValue} onValueChange={setInputValue} />
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
                // Verificăm dacă opțiunea este selectată
                const isSelected = selected.includes(option.value)

                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    // Modificăm handler-ul pentru a asigura că selecția funcționează corect
                    onSelect={() => {
                      // Prevenim comportamentul implicit al CommandItem
                      // și apelăm direct handleSelect
                      handleSelect(option.value)
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                  >
                    <div
                      onClick={(e) => {
                        // Oprim propagarea pentru a preveni comportamentul implicit al CommandItem
                        e.stopPropagation()
                        handleSelect(option.value)
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="mr-2 h-4 w-4"
                        // Adăugăm un handler explicit pentru checkbox
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
