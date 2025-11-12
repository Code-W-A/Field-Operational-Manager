"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTargetList } from "@/hooks/use-settings"
import { RotateCcw, DollarSign } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ContractPricingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pricing: Record<string, number>
  onSave: (pricing: Record<string, number>) => void
}

export function ContractPricingDialog({ open, onOpenChange, pricing, onSave }: ContractPricingDialogProps) {
  const [localPricing, setLocalPricing] = useState<Record<string, number>>({})
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [initialPricing, setInitialPricing] = useState<Record<string, number>>({})

  // Preia tipurile de servicii din setări
  const { items: serviceTypes } = useTargetList("contracts.create.serviceTypes")

  // Inițializează prețurile locale când se deschide dialogul
  useEffect(() => {
    if (open) {
      setLocalPricing({ ...pricing })
      setInitialPricing({ ...pricing })
    }
  }, [open, pricing])

  // Verifică dacă există modificări nesalvate
  const hasUnsavedChanges = () => {
    return JSON.stringify(localPricing) !== JSON.stringify(initialPricing)
  }

  // Handler pentru schimbarea prețului
  const handlePriceChange = (serviceType: string, value: string) => {
    const numericValue = value === "" ? 0 : parseFloat(value)
    setLocalPricing((prev) => ({
      ...prev,
      [serviceType]: isNaN(numericValue) ? 0 : numericValue,
    }))
  }

  // Resetează prețurile la 0 (prețurile de contract)
  const handleReset = () => {
    const resetPricing: Record<string, number> = {}
    serviceTypes?.forEach((service) => {
      resetPricing[service.name] = 0
    })
    setLocalPricing(resetPricing)
  }

  // Salvează prețurile
  const handleSave = () => {
    onSave(localPricing)
    onOpenChange(false)
  }

  // Handler pentru închiderea dialogului
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      onOpenChange(false)
    }
  }

  // Confirmă închiderea fără salvare
  const confirmClose = () => {
    setShowCloseAlert(false)
    onOpenChange(false)
  }

  // Anulează închiderea
  const cancelClose = () => {
    setShowCloseAlert(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => {
        if (!open) {
          handleCloseAttempt()
        } else {
          onOpenChange(open)
        }
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prețuri Contract</DialogTitle>
            <DialogDescription>
              Setați prețurile pentru fiecare tip de serviciu. Prețurile sunt în RON.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {serviceTypes && serviceTypes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {serviceTypes.map((service) => (
                    <div key={service.id} className="space-y-2">
                      <Label htmlFor={`price-${service.id}`} className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        {service.name}
                      </Label>
                      <Input
                        id={`price-${service.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={localPricing[service.name] || 0}
                        onChange={(e) => handlePriceChange(service.name, e.target.value)}
                        placeholder="0.00"
                        className="font-mono"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Resetează la prețurile de contract (0)
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Resetarea va seta toate prețurile la 0
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nu există tipuri de servicii definite în setări.</p>
                <p className="text-sm mt-2">
                  Mergeți la Setări → Formular Contract → Tipuri servicii pentru a adăuga tipuri de servicii.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseAttempt}
              className="w-full sm:w-auto"
            >
              Anulează
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="w-full sm:w-auto"
              disabled={!serviceTypes || serviceTypes.length === 0}
            >
              Salvează Prețuri
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog pentru confirmarea închiderii */}
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate la prețuri. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={cancelClose} className="w-full sm:w-auto">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClose} 
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              Da, închide fără salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

