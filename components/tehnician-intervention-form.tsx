"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { updateLucrare } from "@/lib/firebase/firestore"
import { useToast } from "@/components/ui/use-toast"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { useRouter } from "next/navigation"

interface TehnicianInterventionFormProps {
  lucrare: any
  onUpdate?: () => void
}

export function TehnicianInterventionForm({ lucrare, onUpdate }: TehnicianInterventionFormProps) {
  const [descriereInterventie, setDescriereInterventie] = useState(lucrare?.descriereInterventie || "")
  const [constatareLaLocatie, setConstatareLaLocatie] = useState(lucrare?.constatareLaLocatie || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [equipmentVerified, setEquipmentVerified] = useState(lucrare?.equipmentVerified || false)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    // Update state when lucrare changes
    setDescriereInterventie(lucrare?.descriereInterventie || "")
    setConstatareLaLocatie(lucrare?.constatareLaLocatie || "")
    setEquipmentVerified(lucrare?.equipmentVerified || false)
  }, [lucrare])

  const handleSubmit = async () => {
    if (!lucrare?.id) return

    setIsSubmitting(true)

    try {
      await updateLucrare(lucrare.id, {
        descriereInterventie,
        constatareLaLocatie,
      })

      toast({
        title: "Succes",
        description: "Intervenția a fost actualizată cu succes.",
      })

      if (onUpdate) {
        onUpdate()
      }
    } catch (error) {
      console.error("Eroare la actualizarea intervenției:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea intervenției.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGenerateReport = () => {
    if (!lucrare?.id) return
    router.push(`/raport/${lucrare.id}`)
  }

  const handleQRScanSuccess = () => {
    setEquipmentVerified(true)
    if (onUpdate) {
      onUpdate()
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Intervenție Tehnician</CardTitle>
        <CardDescription>Completați detaliile intervenției efectuate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="constatareLaLocatie">Constatare la locație</Label>
          <Textarea
            id="constatareLaLocatie"
            placeholder="Descrieți ce ați constatat la locație..."
            value={constatareLaLocatie}
            onChange={(e) => setConstatareLaLocatie(e.target.value)}
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="descriereInterventie">Descriere intervenție</Label>
          <Textarea
            id="descriereInterventie"
            placeholder="Descrieți intervenția efectuată..."
            value={descriereInterventie}
            onChange={(e) => setDescriereInterventie(e.target.value)}
            rows={6}
          />
        </div>

        <div className="space-y-2">
          <Label>Verificare echipament</Label>
          <div className="flex items-center gap-4">
            {equipmentVerified ? (
              <div className="rounded-md bg-green-50 p-3 text-green-700 border border-green-200">
                Echipamentul a fost verificat cu succes
                {lucrare?.timpSosire && lucrare?.oraSosire && (
                  <div className="text-xs mt-1">
                    Timp sosire: {lucrare.timpSosire} {lucrare.oraSosire}
                  </div>
                )}
              </div>
            ) : (
              <QRCodeScanner
                expectedEquipmentCode={lucrare?.echipamentCod}
                expectedLocationName={lucrare?.locatie}
                expectedClientName={lucrare?.client}
                onVerificationComplete={handleQRScanSuccess}
                lucrareId={lucrare?.id}
              />
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Se salvează..." : "Salvează"}
        </Button>
        <Button onClick={handleGenerateReport} disabled={!equipmentVerified}>
          Generează raport
        </Button>
      </CardFooter>
    </Card>
  )
}
