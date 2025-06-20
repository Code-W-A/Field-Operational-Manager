"use client"

import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ClientSearchDialog } from "./client-search-dialog"
import { cn } from "@/lib/utils"

interface Client {
  id: string
  nume: string
}

interface ClientSelectButtonProps {
  clients: Client[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ClientSelectButton({
  clients,
  value,
  onValueChange,
  placeholder = "Selectați clientul...",
  className,
  disabled = false
}: ClientSelectButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Găsim clientul selectat
  const selectedClient = clients.find((client) => client.id === value)
  const displayText = value === "UNASSIGNED" ? "Neasignat" : selectedClient?.nume || placeholder

  return (
    <>
      <Button
        variant="outline"
        role="combobox"
        className={cn("w-full justify-between", className)}
        disabled={disabled}
        onClick={() => setIsDialogOpen(true)}
        type="button"
      >
        <span className="truncate text-left">{displayText}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <ClientSearchDialog
        clients={clients}
        value={value}
        onValueChange={onValueChange}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        placeholder={placeholder}
      />
    </>
  )
} 