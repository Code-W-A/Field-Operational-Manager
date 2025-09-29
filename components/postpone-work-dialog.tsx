"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, AlertTriangle } from "lucide-react"
import { updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { sendWorkOrderPostponedNotification } from "@/components/work-order-notification-service"
import { WORK_STATUS } from "@/lib/utils/constants"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import { serverTimestamp } from "firebase/firestore"

interface PostponeWorkDialogProps {
  lucrareId: string
  onSuccess?: () => void
  className?: string
}

export function PostponeWorkDialog({ lucrareId, onSuccess, className }: PostponeWorkDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [motiv, setMotiv] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { userData } = useAuth()

  const handlePostpone = async () => {
    if (!motiv.trim()) {
      toast({
        title: "Eroare",
        description: "Te rog să completezi motivul amânării.",
        variant: "destructive",
      })
      return
    }

    if (motiv.trim().length < 10) {
      toast({
        title: "Eroare", 
        description: "Motivul trebuie să aibă cel puțin 10 caractere.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const updateData: any = {
        statusLucrare: WORK_STATUS.POSTPONED,
        motivAmanare: motiv.trim(),
        dataAmanare: new Date().toLocaleString('ro-RO'),
        amanataDe: userData?.displayName || "Tehnician necunoscut",
        tehnicieni: [], // Eliminăm tehnicianul din lucrare
        updatedAt: serverTimestamp(),
        updatedBy: userData?.displayName || "Tehnician necunoscut"
      }

      await updateLucrare(lucrareId, updateData)

      // Trimitem email clientului despre amânare (preferăm email-ul persoanei de contact a locației)
      try {
        // Obținem datele actuale ale lucrării pentru a construi corect payload-ul
        const lucrare = await getLucrareById(lucrareId)

        const result = await sendWorkOrderPostponedNotification({
          id: lucrareId,
          motivAmanare: updateData.motivAmanare,
          dataAmanare: updateData.dataAmanare,
          locatie: lucrare?.locatie,
          persoanaContact: lucrare?.persoanaContact,
          tipLucrare: lucrare?.tipLucrare,
          dataInterventie: lucrare?.dataInterventie,
          // Trimitem numele clientului ca string pentru a permite rezolvarea corectă a emailului în serviciu
          client: lucrare?.client,
        })

        if (result?.success) {
          const recipients = result?.result?.clientEmails || []
          toast({
            title: "Notificare amânare trimisă",
            description: `Către: ${Array.isArray(recipients) && recipients.length ? recipients.join(", ") : "client"}`,
          })
        }
      } catch (e) {
        console.warn("Nu s-a putut trimite notificarea de amânare către client:", e)
      }

      toast({
        title: "Lucrare amânată",
        description: "Lucrarea a fost amânată cu succes. Nu va mai apărea în lista ta de lucrări.",
      })

      setIsOpen(false)
      setMotiv("")
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error("Eroare la amânarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la amânarea lucrării. Te rog să încerci din nou.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setIsOpen(false)
    setMotiv("")
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className={className}
          size="sm"
        >
          <Clock className="h-4 w-4 mr-2" />
          Amână lucrarea
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-600" />
            Amână lucrarea
          </DialogTitle>
          <DialogDescription>
            Lucrarea va fi amânată și va dispărea din lista ta de lucrări. 
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Atenție:</strong> După amânare, nu vei mai avea acces la această lucrare. 
              Lucrarea va trebui reatribuită de către dispecer.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="motiv-amanare">
              Motivul amânării <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="motiv-amanare"
              placeholder="Descrie motivul pentru care amâni această lucrare"
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
              className="min-h-[100px] resize-none"
              maxLength={500}
              disabled={isSubmitting}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Minim 10 caractere</span>
              <span>{motiv.length}/500</span>
            </div>
          </div>
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
            onClick={handlePostpone}
            disabled={isSubmitting || !motiv.trim() || motiv.trim().length < 10}
            className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Se amână...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-2" />
                Confirmă amânarea
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 