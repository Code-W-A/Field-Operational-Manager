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
import { addLog } from "@/lib/firebase/firestore"

// First, let's add a new prop to the component to check if the work order is completed and the report is generated
interface TehnicianInterventionFormProps {
  lucrareId: string
  initialData: {
    descriereInterventie?: string
    constatareLaLocatie?: string
    statusLucrare: string
    raportGenerat?: boolean
  }
  onUpdate: () => void
  isCompleted?: boolean
}

// Then, let's update the component to use this prop
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
    statusLucrare: initialData.statusLucrare,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [descriereInterventie, setDescriereInterventie] = useState(initialData.descriereInterventie || "")
  const [constatareLaLocatie, setConstatareLaLocatie] = useState(initialData.constatareLaLocatie || "")
  const [statusLucrare, setStatusLucrare] = useState(initialData.statusLucrare)
  const [formDisabled, setFormDisabled] = useState(isCompleted || initialData.raportGenerat)

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
      statusLucrare: initialData.statusLucrare,
    })
    setDescriereInterventie(initialData.descriereInterventie || "")
    setConstatareLaLocatie(initialData.constatareLaLocatie || "")
    setStatusLucrare(initialData.statusLucrare)
  }, [initialData])

  useEffect(() => {
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
        statusLucrare,
      }

      console.log("Saving data:", updatedData)

      await updateLucrare(lucrareId, updatedData)

      const updatedLucrare = await getLucrareById(lucrareId)
      console.log("Data after save:", {
        descriereInterventie: updatedLucrare?.descriereInterventie,
        constatareLaLocatie: updatedLucrare?.constatareLaLocatie,
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
        statusLucrare: formData.statusLucrare,
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

    try {
      setIsGeneratingReport(true)

      // Salvăm mai întâi datele formularului
      await updateLucrare(lucrareId, {
        constatareLaLocatie,
        descriereInterventie,
        statusLucrare,
      })

      // Adăugăm un log pentru generarea raportului
      await addLog(
        "Generare raport",
        `A fost inițiată generarea raportului pentru lucrarea cu ID-ul ${lucrareId}`,
        "Informație",
        "Rapoarte",
      )

      // Redirecționăm către pagina de raport
      router.push(`/raport/${lucrareId}`)
    } catch (error) {
      console.error("Eroare la generarea raportului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la generarea raportului. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingReport(false)
    }
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
              <Label htmlFor="statusLucrare">Status lucrare</Label>
              <Select value={statusLucrare} onValueChange={setStatusLucrare} disabled={formDisabled}>
                <SelectTrigger id="statusLucrare" className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}>
                  <SelectValue placeholder="Selectați statusul lucrării" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="În așteptare">În așteptare</SelectItem>
                  <SelectItem value="În lucru">În lucru</SelectItem>
                  <SelectItem value="Finalizat">Finalizat</SelectItem>
                </SelectContent>
              </Select>
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
                      Se generează...
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
