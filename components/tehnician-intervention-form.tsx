"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Info, FileText, Check } from "lucide-react"
import { updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { useStableCallback } from "@/lib/utils/hooks"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { logInfo } from "@/lib/utils/logging-service" // Import the logging service
import { Input } from "@/components/ui/input"
import { parseRomanianDateTime, isValid, differenceInMinutes } from "@/lib/utils/date-utils"

// First, let's update the interface to include statusEchipament
interface TehnicianInterventionFormProps {
  lucrareId: string
  initialData: {
    descriereInterventie?: string
    constatareLaLocatie?: string
    statusLucrare: string
    raportGenerat?: boolean
    necesitaOferta?: boolean
    comentariiOferta?: string
    statusEchipament?: string
    oraPlecare?: string
    observatiiDurata?: string
  }
  onUpdate: () => void
  isCompleted?: boolean
}

// Then, let's update the component to use this prop and add the statusEchipament state
export function TehnicianInterventionForm({
  lucrareId,
  initialData,
  onUpdate,
  isCompleted = false,
}: TehnicianInterventionFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    descriereInterventie: initialData.descriereInterventie || "",
    constatareLaLocatie: initialData.constatareLaLocatie || "",
    statusEchipament: initialData.statusEchipament || "Funcțional",
    necesitaOferta: initialData.necesitaOferta || false,
    comentariiOferta: initialData.comentariiOferta || "",
    statusLucrare: initialData.statusLucrare || "",
    oraPlecare: initialData.oraPlecare || "",
    observatiiDurata: initialData.observatiiDurata || "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [descriereInterventie, setDescriereInterventie] = useState(initialData.descriereInterventie || "")
  const [constatareLaLocatie, setConstatareLaLocatie] = useState(initialData.constatareLaLocatie || "")
  const [statusLucrare, setStatusLucrare] = useState(initialData.statusLucrare || "")
  const [statusEchipament, setStatusEchipament] = useState(initialData.statusEchipament || "Funcțional")
  const [necesitaOferta, setNecesitaOferta] = useState(initialData.necesitaOferta || false)
  const [comentariiOferta, setComentariiOferta] = useState(initialData.comentariiOferta || "")
  const [formDisabled, setFormDisabled] = useState(isCompleted || initialData.raportGenerat)
  const [oraPlecare, setOraPlecare] = useState(initialData.oraPlecare || "")
  const [observatiiDurata, setObservatiiDurata] = useState(initialData.observatiiDurata || "")

  useEffect(() => {
    const checkWorkOrderStatus = async () => {
      try {
        const lucrare = await getLucrareById(lucrareId)
        if (lucrare && lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true) {
          setFormDisabled(true)
        }
      } catch (error) {
        console.error("Eroare la verificarea stării lucrării:", error)
      }
    }

    checkWorkOrderStatus()
  }, [lucrareId])

  useEffect(() => {
    setFormData({
      descriereInterventie: initialData.descriereInterventie || "",
      constatareLaLocatie: initialData.constatareLaLocatie || "",
      statusEchipament: initialData.statusEchipament || "Funcțional",
      necesitaOferta: initialData.necesitaOferta || false,
      comentariiOferta: initialData.comentariiOferta || "",
      statusLucrare: initialData.statusLucrare || "",
      oraPlecare: initialData.oraPlecare || "",
      observatiiDurata: initialData.observatiiDurata || "",
    })
    setDescriereInterventie(initialData.descriereInterventie || "")
    setConstatareLaLocatie(initialData.constatareLaLocatie || "")
    setStatusEchipament(initialData.statusEchipament || "Funcțional")
    setStatusLucrare(initialData.statusLucrare || "")
    setNecesitaOferta(initialData.necesitaOferta || false)
    setComentariiOferta(initialData.comentariiOferta || "")
    setOraPlecare(initialData.oraPlecare || "")
    setObservatiiDurata(initialData.observatiiDurata || "")

    console.log("Initial data loaded:", initialData)
  }, [initialData])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, statusLucrare: value }))
  }

  const handleSave = useStableCallback(async () => {
    try {
      setIsSaving(true)

      // Actualizăm datele din formData cu valorile curente din state
      const updatedData = {
        descriereInterventie,
        constatareLaLocatie,
        statusEchipament,
        necesitaOferta,
        comentariiOferta: necesitaOferta ? comentariiOferta : "", // Clear comments if necesitaOferta is false
        statusLucrare, // Make sure we're also saving the status lucrare
      }

      console.log("Saving data:", updatedData)

      await updateLucrare(lucrareId, updatedData)

      const updatedLucrare = await getLucrareById(lucrareId)
      console.log("Data after save:", {
        descriereInterventie: updatedLucrare?.descriereInterventie,
        constatareLaLocatie: updatedLucrare?.constatareLaLocatie,
        statusEchipament: updatedLucrare?.statusEchipament,
        necesitaOferta: updatedLucrare?.necesitaOferta,
        comentariiOferta: updatedLucrare?.comentariiOferta,
      })

      toast({
        title: "Intervenție salvată",
        description: "Detaliile intervenției au fost salvate cu succes.",
      })

      onUpdate()
    } catch (error) {
      console.error("Eroare la salvarea intervenției:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea intervenției.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  })

  const handleSubmit = useStableCallback(async () => {
    try {
      setIsSubmitting(true)

      await updateLucrare(lucrareId, {
        descriereInterventie: formData.descriereInterventie,
        constatareLaLocatie: formData.constatareLaLocatie,
        statusEchipament: formData.statusEchipament,
        necesitaOferta: formData.necesitaOferta,
        comentariiOferta: formData.necesitaOferta ? formData.comentariiOferta : "", // Clear comments if necesitaOferta is false
      })

      toast({
        title: "Intervenție actualizată",
        description: "Detaliile intervenției au fost actualizate cu succes.",
      })

      onUpdate()

      router.push(`/raport/${lucrareId}`)
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
  })

  const handleGenerateReport = async () => {
    if (!descriereInterventie) {
      toast({
        title: "Eroare",
        description: "Trebuie să completați descrierea intervenției înainte de a genera raportul.",
        variant: "destructive",
      })
      return
    }

    if (!oraPlecare) {
      toast({
        title: "Eroare",
        description: "Trebuie să completați ora plecării înainte de a genera raportul.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsGeneratingReport(true)

      // Calculăm durata serviciului
      let durataServiciu: number | undefined
      if (initialData?.oraSosire && oraPlecare) {
        const arrivalDate = parseRomanianDateTime(`${initialData.dataInterventie.split(" ")[0]} ${initialData.oraSosire}`)
        const departureDate = parseRomanianDateTime(`${initialData.dataInterventie.split(" ")[0]} ${oraPlecare}`)
        
        if (arrivalDate && departureDate && isValid(arrivalDate) && isValid(departureDate)) {
          const minutes = differenceInMinutes(departureDate, arrivalDate)
          if (minutes > 0 && minutes < 24 * 60) {
            durataServiciu = minutes
          }
        }
      }

      // Salvăm datele formularului
      await updateLucrare(lucrareId, {
        constatareLaLocatie,
        descriereInterventie,
        statusEchipament,
        necesitaOferta,
        comentariiOferta: necesitaOferta ? comentariiOferta : "",
        statusLucrare,
        oraPlecare,
        durataServiciu,
        observatiiDurata,
      })

      // Use the safe logging service instead of addLog to avoid database issues
      logInfo(`Navigare către pagina de raport pentru lucrarea ${lucrareId}`, { lucrareId }, { category: "rapoarte" })

      toast({
        title: "Date salvate",
        description: "Datele au fost salvate. Veți fi redirecționat către pagina de semnare și generare raport.",
      })

      // Navigate to the report page
      router.push(`/raport/${lucrareId}`)
    } catch (error) {
      console.error("Eroare la salvarea datelor:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea datelor. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleToggleOferta = (checked: boolean) => {
    setNecesitaOferta(checked)
    // If turning off the offer requirement, clear the comments
    if (!checked) {
      setComentariiOferta("")
    }
    setFormData((prev) => ({
      ...prev,
      necesitaOferta: checked,
      comentariiOferta: checked ? prev.comentariiOferta : "", // Clear comments if necesitaOferta is false
    }))
  }

  const handleStatusEchipamentChange = (value: string) => {
    setStatusEchipament(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formular intervenție tehnician</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="constatareLaLocatie">Constatare la locație</Label>
              <Textarea
                id="constatareLaLocatie"
                placeholder="Descrieți ce ați constatat la locație..."
                value={constatareLaLocatie}
                onChange={(e) => setConstatareLaLocatie(e.target.value)}
                disabled={formDisabled}
                className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descriereInterventie">Descriere intervenție</Label>
              <Textarea
                id="descriereInterventie"
                placeholder="Descrieți intervenția efectuată..."
                value={descriereInterventie}
                onChange={(e) => setDescriereInterventie(e.target.value)}
                disabled={formDisabled}
                className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="statusEchipament">Status echipament</Label>
              <Select value={statusEchipament} onValueChange={setStatusEchipament} disabled={formDisabled}>
                <SelectTrigger id="statusEchipament" className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}>
                  <SelectValue placeholder="Selectați statusul echipamentului" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Funcțional">Funcțional</SelectItem>
                  <SelectItem value="Parțial funcțional">Parțial funcțional</SelectItem>
                  <SelectItem value="Nefuncțional">Nefuncțional</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Adăugăm secțiunea pentru necesitatea ofertei */}
            <div className="border p-4 rounded-md bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="necesitaOferta" className="font-medium">
                  Necesită ofertă
                </Label>
                <Switch
                  id="necesitaOferta"
                  checked={necesitaOferta}
                  onCheckedChange={handleToggleOferta}
                  disabled={formDisabled}
                />
              </div>

              {necesitaOferta && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="comentariiOferta">Comentarii ofertă</Label>
                  <Textarea
                    id="comentariiOferta"
                    placeholder="Descrieți ce trebuie inclus în ofertă..."
                    value={comentariiOferta}
                    onChange={(e) => setComentariiOferta(e.target.value)}
                    disabled={formDisabled}
                    className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}
                  />
                </div>
              )}

              {necesitaOferta && (
                <Alert variant="info" className="mt-3">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Dispecerul va fi notificat că această lucrare necesită o ofertă pentru client.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Adăugăm câmpurile pentru ora plecării și observații */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="oraPlecare">Ora plecării</Label>
                <Input
                  id="oraPlecare"
                  type="time"
                  value={oraPlecare}
                  onChange={(e) => {
                    setOraPlecare(e.target.value)
                    setFormData((prev) => ({ ...prev, oraPlecare: e.target.value }))
                  }}
                  required
                />
              </div>

              <div>
                <Label htmlFor="observatiiDurata">Observații legate de durata serviciului</Label>
                <Textarea
                  id="observatiiDurata"
                  value={observatiiDurata}
                  onChange={(e) => {
                    setObservatiiDurata(e.target.value)
                    setFormData((prev) => ({ ...prev, observatiiDurata: e.target.value }))
                  }}
                  placeholder="Ex: Întârziere din cauza traficului, pauză de masă, etc."
                />
              </div>
            </div>

            {formDisabled ? (
              <Alert variant="info">
                <Info className="h-4 w-4" />
                <AlertTitle>Lucrare finalizată</AlertTitle>
                <AlertDescription>
                  Această lucrare este finalizată și raportul a fost generat. Nu mai puteți face modificări.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || formDisabled}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Se salvează...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Salvează
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport || formDisabled || !descriereInterventie}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isGeneratingReport ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Se procesează...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Generează raport
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
