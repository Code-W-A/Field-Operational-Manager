"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface NoInvoiceReasonDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  onCancel: () => void
  className?: string
}

const PREDEFINED_REASONS = [
  { value: "contract-abonament", label: "Contract abonament" },
  { value: "garantie", label: "Garantie" },
  { value: "discount-100", label: "Discount 100%" },
  { value: "reinterventie-nrg", label: "Reintervenție pe cheltuiala NRG" },
  { value: "altul", label: "Altul (specificați)" },
]

export function NoInvoiceReasonDialog({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  className = ""
}: NoInvoiceReasonDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>("")
  const [customReason, setCustomReason] = useState<string>("")
  const [error, setError] = useState<string>("")

  const handleConfirm = () => {
    // Validare
    if (!selectedReason) {
      setError("Vă rugăm să selectați un motiv pentru nefacturare")
      return
    }

    if (selectedReason === "altul" && !customReason.trim()) {
      setError("Vă rugăm să specificați motivul pentru nefacturare")
      return
    }

    // Construim motivul final
    let finalReason = ""
    if (selectedReason === "altul") {
      finalReason = customReason.trim()
    } else {
      const reason = PREDEFINED_REASONS.find(r => r.value === selectedReason)
      finalReason = reason?.label || ""
    }

    // Resetăm formularul
    setSelectedReason("")
    setCustomReason("")
    setError("")
    
    // Confirmăm
    onConfirm(finalReason)
  }

  const handleCancel = () => {
    // Resetăm formularul
    setSelectedReason("")
    setCustomReason("")
    setError("")
    
    // Apelăm callback-ul de anulare
    onCancel()
  }

  const handleClose = () => {
    // Resetăm formularul
    setSelectedReason("")
    setCustomReason("")
    setError("")
    
    // Închidem dialogul
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={`sm:max-w-[500px] ${className}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Motiv nefacturare
          </DialogTitle>
          <DialogDescription>
            Selectați motivul pentru care această lucrare nu se va factura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
            <div className="space-y-3">
              {PREDEFINED_REASONS.map((reason) => (
                <div key={reason.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={reason.value} id={reason.value} />
                  <Label
                    htmlFor={reason.value}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {reason.label}
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>

          {selectedReason === "altul" && (
            <div className="space-y-2 pl-6 pt-2">
              <Label htmlFor="customReason" className="text-sm font-medium">
                Specificați motivul *
              </Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Introduceți motivul pentru nefacturare..."
                className="min-h-[100px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {customReason.length}/500 caractere
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
          >
            Anulează
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedReason || (selectedReason === "altul" && !customReason.trim())}
          >
            Confirmă
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

