"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { updateLucrare, type Lucrare } from "@/lib/firebase/firestore"
import { useToast } from "@/components/ui/use-toast"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock } from "lucide-react"

interface TehnicianInterventionFormProps {
  lucrare: Lucrare
  onUpdate?: (updatedLucrare: Lucrare) => void
}

export function TehnicianInterventionForm({ lucrare, onUpdate }: TehnicianInterventionFormProps) {
  const [descriereInterventie, setDescriereInterventie] = useState(lucrare.descriereInterventie || "")
  const [constatareLaLocatie, setConstatareLaLocatie] = useState(lucrare.constatareLaLocatie || "")
  const [statusEchipament, setStatusEchipament] = useState(lucrare.statusEchipament || "")
  const [necesitaOferta, setNecesitaOferta] = useState(lucrare.necesitaOferta || false)
  const [comentariiOferta, setComentariiOferta] = useState(lucrare.comentariiOferta || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [equipmentVerified, setEquipmentVerified] = useState(lucrare.equipmentVerified || false)
  const { toast } = useToast()

  // Update local state when lucrare prop changes
  useEffect(() => {
    setDescriereInterventie(lucrare.descriereInterventie || "")
    setConstatareLaLocatie(lucrare.constatareLaLocatie || "")
    setStatusEchipament(lucrare.statusEchipament || "")
    setNecesitaOferta(lucrare.necesitaOferta || false)
    setComentariiOferta(lucrare.comentariiOferta || "")
    setEquipmentVerified(lucrare.equipmentVerified || false)
  }, [lucrare])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const updatedLucrare = {
        ...lucrare,
        descriereInterventie,
        constatareLaLocatie,
        statusEchipament,
        necesitaOferta,
        comentariiOferta,
      }

      await updateLucrare(lucrare.id!, updatedLucrare)
      toast({
        title: "Intervenție actualizată",
        description: "Detaliile intervenției au fost salvate cu succes.",
      })

      if (onUpdate) {
        onUpdate(updatedLucrare as Lucrare)
      }
    } catch (error) {
      console.error("Error updating intervention:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza intervenția. Încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQRScanSuccess = () => {
    setEquipmentVerified(true)
    toast({
      title: "Echipament verificat",
      description: "Codul QR al echipamentului a fost verificat cu succes.",
    })
  }

  const handleQRScanError = (error: string) => {
    toast({
      title: "Eroare la verificarea echipamentului",
      description: error,
      variant: "destructive",
    })
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Detalii intervenție</CardTitle>
        <CardDescription>Completați detaliile intervenției pentru lucrarea curentă.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="equipment-verification">Verificare echipament</Label>
            <div className="flex items-center gap-2">
              {equipmentVerified ? (
                <Badge
                  variant="outline"
                  className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Verificat
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Neverificat
                </Badge>
              )}
              <QRCodeScanner
                expectedEquipmentCode={lucrare.echipamentCod}
                expectedLocationName={lucrare.locatie}
                expectedClientName={lucrare.client}
                onScanSuccess={handleQRScanSuccess}
                onScanError={handleQRScanError}
                lucrareId={lucrare.id} // Pass the lucrareId to the QRCodeScanner
              />
            </div>
          </div>

          {lucrare.dataSosire && lucrare.oraSosire && (
            <div className="text-sm text-muted-foreground mt-1">
              Timp sosire: {lucrare.dataSosire} {lucrare.oraSosire}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="constatare">Constatare la locație</Label>
          <Textarea
            id="constatare"
            placeholder="Descrieți ce ați constatat la locație..."
            value={constatareLaLocatie}
            onChange={(e) => setConstatareLaLocatie(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="interventie">Descriere intervenție</Label>
          <Textarea
            id="interventie"
            placeholder="Descrieți intervenția efectuată..."
            value={descriereInterventie}
            onChange={(e) => setDescriereInterventie(e.target.value)}
            rows={5}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status-echipament">Status echipament</Label>
          <select
            id="status-echipament"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={statusEchipament}
            onChange={(e) => setStatusEchipament(e.target.value)}
          >
            <option value="">Selectați status...</option>
            <option value="Funcțional">Funcțional</option>
            <option value="Funcțional cu probleme">Funcțional cu probleme</option>
            <option value="Nefuncțional">Nefuncțional</option>
            <option value="Necesită piese">Necesită piese</option>
            <option value="Necesită intervenție specializată">Necesită intervenție specializată</option>
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="necesita-oferta"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={necesitaOferta}
              onChange={(e) => setNecesitaOferta(e.target.checked)}
            />
            <Label htmlFor="necesita-oferta">Necesită ofertă</Label>
          </div>
        </div>

        {necesitaOferta && (
          <div className="space-y-2">
            <Label htmlFor="comentarii-oferta">Comentarii ofertă</Label>
            <Textarea
              id="comentarii-oferta"
              placeholder="Adăugați detalii despre oferta necesară..."
              value={comentariiOferta}
              onChange={(e) => setComentariiOferta(e.target.value)}
              rows={3}
            />
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Se salvează..." : "Salvează intervenția"}
        </Button>
      </CardFooter>
    </Card>
  )
}
