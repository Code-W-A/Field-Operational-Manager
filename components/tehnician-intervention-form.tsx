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

import { Badge } from "@/components/ui/badge"
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"
import { Checkbox } from "@/components/ui/checkbox"

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
    // Adăugăm câmpurile pentru garanție
    tipLucrare?: string
    echipamentData?: Echipament
    echipamentCod?: string
    // Adăugăm câmpul pentru status finalizare intervenție
    statusFinalizareInterventie?: "FINALIZAT" | "NEFINALIZAT"
    // Adăugăm bifa pentru confirmarea garanției de către tehnician
    tehnicianConfirmaGarantie?: boolean
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
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [descriereInterventie, setDescriereInterventie] = useState(initialData.descriereInterventie || "")
  const [constatareLaLocatie, setConstatareLaLocatie] = useState(initialData.constatareLaLocatie || "")

  const [statusEchipament, setStatusEchipament] = useState(initialData.statusEchipament || "Funcțional")
  const [necesitaOferta, setNecesitaOferta] = useState(initialData.necesitaOferta || false)
  const [comentariiOferta, setComentariiOferta] = useState(initialData.comentariiOferta || "")
  const [formDisabled, setFormDisabled] = useState(isCompleted || initialData.raportGenerat)

  // State pentru funcționalitatea de garanție
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  
  // Verificăm dacă lucrarea este de tip "Intervenție în garanție"
  const isWarrantyWork = initialData.tipLucrare === "Intervenție în garanție"

  // State pentru status finalizare intervenție
  const [statusFinalizareInterventie, setStatusFinalizareInterventie] = useState<"FINALIZAT" | "NEFINALIZAT">(
    initialData.statusFinalizareInterventie || "NEFINALIZAT"
  )

  // State pentru confirmarea garanției de către tehnician  
  const [tehnicianConfirmaGarantie, setTehnicianConfirmaGarantie] = useState<boolean>(
    initialData.tehnicianConfirmaGarantie || false
  )

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

  // Am eliminat useEffect-ul care resetează câmpurile pentru a preveni ștergerea textului introdus de utilizator

  // Efect pentru calcularea informațiilor de garanție
  useEffect(() => {
    if (isWarrantyWork && initialData.echipamentData) {
      const warranty = getWarrantyDisplayInfo(initialData.echipamentData)
      setWarrantyInfo(warranty)
    }
  }, [isWarrantyWork, initialData.echipamentData])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, statusLucrare: value }))
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)

      const updateData: any = {
        constatareLaLocatie,
        descriereInterventie,
        statusEchipament,
        necesitaOferta,
        comentariiOferta: necesitaOferta ? comentariiOferta : "", // Clear comments if necesitaOferta is false
        statusFinalizareInterventie,
      }

      // Adăugăm tehnicianConfirmaGarantie doar pentru lucrările în garanție
      if (isWarrantyWork) {
        updateData.tehnicianConfirmaGarantie = tehnicianConfirmaGarantie
      }

      await updateLucrare(lucrareId, updateData)

      toast({
        title: "Date salvate",
        description: "Datele au fost salvate cu succes.",
      })

      onUpdate()
    } catch (error) {
      console.error("Eroare la salvarea datelor:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea datelor.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

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

    try {
      setIsGeneratingReport(true)

      // Salvăm datele formularului inclusiv statusul finalizării
      const updateData: any = {
        constatareLaLocatie,
        descriereInterventie,
        statusEchipament,
        necesitaOferta,
        comentariiOferta: necesitaOferta ? comentariiOferta : "", // Clear comments if necesitaOferta is false
        statusFinalizareInterventie,
      }

      // Adăugăm tehnicianConfirmaGarantie doar pentru lucrările în garanție
      if (isWarrantyWork) {
        updateData.tehnicianConfirmaGarantie = tehnicianConfirmaGarantie
      }

      await updateLucrare(lucrareId, updateData)

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



            <div className="space-y-2">
              <Label htmlFor="statusFinalizareInterventie">Status finalizare intervenție</Label>
              <Select value={statusFinalizareInterventie} onValueChange={(value) => setStatusFinalizareInterventie(value as "FINALIZAT" | "NEFINALIZAT")} disabled={formDisabled}>
                <SelectTrigger id="statusFinalizareInterventie" className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}>
                  <SelectValue placeholder="Selectați statusul finalizării intervenției" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FINALIZAT">FINALIZAT</SelectItem>
                  <SelectItem value="NEFINALIZAT">NEFINALIZAT</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Acest status determină culoarea rândului în lista de lucrări și nu apare în raport.
              </p>
            </div>

            {/* Secțiunea pentru informațiile de garanție */}
            {isWarrantyWork && (
              <div className="border p-4 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  <Label className="font-medium text-blue-900">Informații Garanție Echipament</Label>
                </div>

                {/* Informații despre garanție calculate automat */}
                {warrantyInfo && (
                  <div className="p-3 bg-white rounded-md border mb-3">
                    <h4 className="font-medium text-sm mb-2">Calculul automat al garanției:</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <Badge className={warrantyInfo.statusBadgeClass + " ml-1"}>
                          {warrantyInfo.statusText}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-600">Zile rămase:</span>
                        <span className={`ml-1 font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                          {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Data instalării:</span>
                        <span className="ml-1">{warrantyInfo.installationDate || "Nedefinită"}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Expiră la:</span>
                        <span className="ml-1">{warrantyInfo.warrantyExpires || "Nedefinită"}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{warrantyInfo.warrantyMessage}</p>
                  </div>
                )}

                {/* Informații despre echipamentul verificat */}
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        ✓ Echipament verificat
                      </Badge>
                      <span className="text-xs text-gray-600">prin scanarea QR code</span>
                    </div>
                    <p className="text-xs text-green-700">
                      Echipamentul a fost verificat în tabul "Verificare Echipament". 
                      Informațiile de garanție de mai sus sunt calculate automat pe baza datelor echipamentului.
                    </p>
                  </div>

                  {/* Confirmarea garanției de către tehnician */}
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <Label className="font-medium text-sm text-yellow-800 mb-3 block">
                      Confirmarea tehnicianului la fața locului:
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="tehnicianConfirmaGarantie"
                        checked={tehnicianConfirmaGarantie}
                        onCheckedChange={(checked) => setTehnicianConfirmaGarantie(checked === true)}
                        disabled={formDisabled}
                      />
                      <Label
                        htmlFor="tehnicianConfirmaGarantie"
                        className="text-sm font-medium text-yellow-800 cursor-pointer"
                      >
                        Confirm că intervenția face obiectul garanției
                      </Label>
                    </div>
                    {/* <p className="text-xs text-yellow-700 mt-2">
                      Această bifă reprezintă confirmarea dvs. ca tehnician despre starea garanției echipamentului după verificarea fizică.
                      Nu se suprapune peste calculul automat de mai sus.
                    </p> */}
                  </div>
                </div>
              </div>
            )}

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
                <Alert variant="default" className="mt-3">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Dispecerul va fi notificat că această lucrare necesită o ofertă pentru client.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {formDisabled ? (
              <Alert variant="default">
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
