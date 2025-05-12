"use client"

// Presupunând că aveți o componentă de dialog care conține formularul client

import { useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClientForm } from "@/components/client-form"
import type { ClientFormRef } from "@/components/client-form" // Trebuie să definiți acest tip

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (clientName: string) => void
}

export function ClientFormDialog({ open, onOpenChange, onSuccess }: ClientFormDialogProps) {
  const formRef = useRef<ClientFormRef>(null)

  // Această funcție va fi apelată când utilizatorul încearcă să închidă dialogul
  const handleOpenChange = (newOpen: boolean) => {
    // Dacă se încearcă închiderea dialogului
    if (!newOpen && open) {
      // Verificăm dacă există modificări nesalvate
      if (formRef.current?.hasUnsavedChanges()) {
        // Dacă există modificări nesalvate, afișăm confirmarea
        if (
          window.confirm(
            "Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.",
          )
        ) {
          // Dacă utilizatorul confirmă, închidem dialogul
          onOpenChange(false)
        }
      } else {
        // Dacă nu există modificări nesalvate, închidem dialogul direct
        onOpenChange(false)
      }
    } else {
      // Dacă se deschide dialogul, actualizăm starea
      onOpenChange(newOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adăugare Client Nou</DialogTitle>
        </DialogHeader>
        <ClientForm
          ref={formRef}
          onSuccess={(clientName) => {
            onSuccess?.(clientName)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
