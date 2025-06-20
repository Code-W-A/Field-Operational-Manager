"use client"

import { useState, useRef } from "react"
import { Check, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface Client {
  id: string
  nume: string
}

interface ClientSearchDialogProps {
  clients: Client[]
  value: string
  onValueChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  placeholder?: string
}

export function ClientSearchDialog({
  clients,
  value,
  onValueChange,
  open,
  onOpenChange,
  placeholder = "Selectați clientul..."
}: ClientSearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filtrăm clienții pe baza căutării
  const filteredClients = clients.filter((client) => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return client.nume.toLowerCase().includes(searchLower)
  })

  // Funcție pentru selectarea unui client
  const handleSelectClient = (clientId: string) => {
    onValueChange(clientId)
    onOpenChange(false)
    setSearchTerm("") // Resetăm căutarea
  }

  // Resetăm căutarea când se deschide dialogul
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSearchTerm("")
      // Focus pe input după ce dialogul s-a deschis
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Selectați Clientul</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          {/* Input de căutare */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Căutați client după nume..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 h-11"
            />
            {searchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Lista de clienți */}
          <div className="border rounded-md max-h-[400px] overflow-y-auto">
            {/* Opțiunea Neasignat */}
            <div
              className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors border-b ${
                value === "UNASSIGNED" ? "bg-muted" : ""
              }`}
              onClick={() => handleSelectClient("UNASSIGNED")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Check
                    className={`h-4 w-4 ${
                      value === "UNASSIGNED" ? "opacity-100 text-primary" : "opacity-0"
                    }`}
                  />
                  <span className="text-muted-foreground italic">Neasignat</span>
                </div>
                {value === "UNASSIGNED" && (
                  <div className="flex items-center text-primary">
                    <span className="text-xs mr-1">Selectat</span>
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de clienți filtrați */}
            {filteredClients.length > 0 ? (
              <div className="divide-y">
                {filteredClients.map((client) => (
                  <div
                    key={client.id}
                    className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                      value === client.id ? "bg-muted" : ""
                    }`}
                    onClick={() => handleSelectClient(client.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Check
                          className={`h-4 w-4 flex-shrink-0 ${
                            value === client.id ? "opacity-100 text-primary" : "opacity-0"
                          }`}
                        />
                        <span className="font-medium text-sm truncate">
                          {client.nume}
                        </span>
                      </div>
                      {value === client.id && (
                        <div className="flex items-center text-primary">
                          <span className="text-xs mr-1">Selectat</span>
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : clients.length > 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nu s-au găsit clienți pentru "{searchTerm}"</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setSearchTerm("")}
                >
                  Șterge căutarea
                </Button>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p>Nu există clienți disponibili</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 