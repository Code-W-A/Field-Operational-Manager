"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RefreshCw, AlertTriangle, Clock, Package, Wrench } from "lucide-react"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/contexts/AuthContext"

interface ReinterventionReasonDialogProps {
  isOpen: boolean
  onClose: () => void
  lucrareId: string
  onSuccess: () => void
  className?: string
}

interface ReinterventionReasons {
  remediereNeconforma: boolean
  necesitaTimpSuplimentar: boolean
  necesitaPieseSuplimentare: boolean
}

export function ReinterventionReasonDialog({ 
  isOpen, 
  onClose, 
  lucrareId, 
  onSuccess,
  className 
}: ReinterventionReasonDialogProps) {
  const [reasons, setReasons] = useState<ReinterventionReasons>({
    remediereNeconforma: false,
    necesitaTimpSuplimentar: false,
    necesitaPieseSuplimentare: false
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { userData } = useAuth()

  const handleReasonChange = (reason: keyof ReinterventionReasons, checked: boolean) => {
    setReasons(prev => ({
      ...prev,
      [reason]: checked
    }))
  }

  const hasSelectedReasons = Object.values(reasons).some(reason => reason)

  const handleConfirm = async () => {
    if (!hasSelectedReasons) {
      toast({
        title: "Eroare",
        description: "Te rog să selectezi cel puțin un motiv pentru reintervenție.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const reinterventieMotiv = {
        remediereNeconforma: reasons.remediereNeconforma,
        necesitaTimpSuplimentar: reasons.necesitaTimpSuplimentar,
        necesitaPieseSuplimentare: reasons.necesitaPieseSuplimentare,
        dataReinterventie: new Date().toLocaleString('ro-RO'),
        decisaDe: userData?.displayName || "Administrator necunoscut"
      }

      await updateLucrare(lucrareId, { reinterventieMotiv })

      toast({
        title: "Motive înregistrate",
        description: "Motivele reintervenției au fost salvate. Se continuă cu procesul de reintervenție.",
      })

      handleCancel()
      
      // Call the success callback to continue with reintervention flow
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error("Eroare la salvarea motivelor reintervenției:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea motivelor. Te rog să încerci din nou.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setReasons({
      remediereNeconforma: false,
      necesitaTimpSuplimentar: false,
      necesitaPieseSuplimentare: false
    })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-orange-600" />
            Motivul reintervenției
          </DialogTitle>
          <DialogDescription>
            Pentru a înțelege cauzele care au dus la necesitatea reintervenției, 
            te rog să selectezi motivele aplicabile din lista de mai jos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Aceste informații vor fi salvate în detaliile lucrarii originale
              precum si in lucrarea noua care va fi creata.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <Checkbox
                id="remediere-neconforma"
                checked={reasons.remediereNeconforma}
                onCheckedChange={(checked) => handleReasonChange('remediereNeconforma', checked as boolean)}
                disabled={isSubmitting}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label 
                  htmlFor="remediere-neconforma" 
                  className="flex items-center gap-2 font-medium cursor-pointer"
                >
                  <Wrench className="h-4 w-4 text-red-600" />
                  Remediere neconformă
                </Label>
            
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <Checkbox
                id="timp-suplimentar"
                checked={reasons.necesitaTimpSuplimentar}
                onCheckedChange={(checked) => handleReasonChange('necesitaTimpSuplimentar', checked as boolean)}
                disabled={isSubmitting}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label 
                  htmlFor="timp-suplimentar" 
                  className="flex items-center gap-2 font-medium cursor-pointer"
                >
                  <Clock className="h-4 w-4 text-orange-600" />
                  Necesită timp suplimentar
                </Label>
             
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <Checkbox
                id="piese-suplimentare"
                checked={reasons.necesitaPieseSuplimentare}
                onCheckedChange={(checked) => handleReasonChange('necesitaPieseSuplimentare', checked as boolean)}
                disabled={isSubmitting}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label 
                  htmlFor="piese-suplimentare" 
                  className="flex items-center gap-2 font-medium cursor-pointer"
                >
                  <Package className="h-4 w-4 text-blue-600" />
                  Necesită piese suplimentare
                </Label>
                
              </div>
            </div>
          </div>

          {hasSelectedReasons && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800 font-medium mb-1">Motive selectate:</p>
              <ul className="text-xs text-green-700 space-y-1">
                {reasons.remediereNeconforma && <li>• Remediere neconformă</li>}
                {reasons.necesitaTimpSuplimentar && <li>• Necesită timp suplimentar</li>}
                {reasons.necesitaPieseSuplimentare && <li>• Necesită piese suplimentare</li>}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Anulează
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !hasSelectedReasons}
            className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Se salvează...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Continuă reintervenția
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 