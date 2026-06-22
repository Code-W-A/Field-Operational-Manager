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
import { toast } from "@/hooks/use-toast"
import { useStableCallback } from "@/lib/utils/hooks"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { logInfo } from "@/lib/utils/logging-service" // Import the logging service

import { Badge } from "@/components/ui/badge"
import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import {
  initialTehnicianGarantieState,
  TEHNICIAN_GARANTIE_DECIZIE_LABELS,
  type TehnicianGarantieDecizie,
} from "@/lib/utils/tehnician-garantie-decizie"
import type { Echipament } from "@/lib/firebase/firestore"
import { ImageDefectUpload } from "@/components/image-defect-upload"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { useAuth } from "@/contexts/AuthContext"
import { useTargetList } from "@/hooks/use-settings"
import { failureCauseOptionsFromSettings, resolveFailureCauseLabel } from "@/lib/utils/failure-causes"


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
    cauzaPrincipalaDefectId?: string
    cauzaPrincipalaDefect?: string
    // Adăugăm câmpurile pentru garanție
    tipLucrare?: string
    echipamentData?: Echipament
    echipamentCod?: string
    // Adăugăm câmpul pentru status finalizare intervenție
    statusFinalizareInterventie?: "FINALIZAT" | "NEFINALIZAT"
    tehnicianConfirmaGarantie?: boolean
    tehnicianGarantieDecizie?: TehnicianGarantieDecizie
    tehnicianGarantieNuIntraMotiv?: string
    // Adăugăm imaginile defectelor
    imaginiDefecte?: Array<{
      url: string
      fileName: string
      uploadedAt: string
      uploadedBy: string
      compressed: boolean
    }>
    // Notă internă tehnician
    notaInternaTehnician?: string
  }
  onUpdate: (preserveActiveTab?: boolean) => void
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
  const { userData } = useAuth()
  const [formData, setFormData] = useState({
    descriereInterventie: initialData.descriereInterventie || "",
    constatareLaLocatie: initialData.constatareLaLocatie || "",
    statusEchipament: initialData.statusEchipament || "Funcțional",
    necesitaOferta: initialData.necesitaOferta || false,
    comentariiOferta: initialData.comentariiOferta || "",
  })

  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [descriereInterventie, setDescriereInterventie] = useState(initialData.descriereInterventie || "")
  const [constatareLaLocatie, setConstatareLaLocatie] = useState(initialData.constatareLaLocatie || "")

  const [statusEchipament, setStatusEchipament] = useState(initialData.statusEchipament || "Funcțional")
  const [cauzaPrincipalaDefectId, setCauzaPrincipalaDefectId] = useState(initialData.cauzaPrincipalaDefectId || "")
  const [cauzaPrincipalaDefect, setCauzaPrincipalaDefect] = useState(initialData.cauzaPrincipalaDefect || "")
  const [necesitaOferta, setNecesitaOferta] = useState(initialData.necesitaOferta || false)
  const [comentariiOferta, setComentariiOferta] = useState(initialData.comentariiOferta || "")
  const [formDisabled, setFormDisabled] = useState(isCompleted || initialData.raportGenerat)
  const [notaInternaTehnician, setNotaInternaTehnician] = useState(initialData.notaInternaTehnician || "")

  // State pentru imaginile selectate local
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [uploadedDefectImages, setUploadedDefectImages] = useState<Array<any>>(initialData.imaginiDefecte || [])
  
  // State pentru imaginile marcate pentru ștergere (pending delete)
  const [imagesToDelete, setImagesToDelete] = useState<number[]>([])



  // Cleanup pentru URL-urile de preview la unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url))
    }
  }, [imagePreviews])

  // Reset imagesToDelete când se schimbă lucrarea
  useEffect(() => {
    setImagesToDelete([])
  }, [lucrareId])

  // Sincronizăm imaginile uploadate local cu datele venite din părinte (refresh/reload).
  useEffect(() => {
    setUploadedDefectImages(initialData.imaginiDefecte || [])
  }, [initialData.imaginiDefecte, lucrareId])

  const clearSelectedImages = () => {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setSelectedImages([])
    setImagePreviews([])
  }

  // Guard UX: dacă avem imagini uploadate și selecție locală rămasă după persistare,
  // curățăm forțat selecția pentru a evita afișarea dublă.
  useEffect(() => {
    if ((isSaving || isGeneratingReport) || selectedImages.length === 0) return
    if (uploadedDefectImages.length === 0) return
    clearSelectedImages()
  }, [uploadedDefectImages, isSaving, isGeneratingReport, selectedImages.length])

  // State pentru funcționalitatea de garanție
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  
  // Verificăm dacă lucrarea este de tip "Intervenție în garanție"
  const isWarrantyWork = initialData.tipLucrare === "Intervenție în garanție"
  const { items: failureCauseSettings } = useTargetList("works.create.failureCauses")
  const failureCauseOptions = failureCauseOptionsFromSettings(failureCauseSettings)

  // Eliminat: status finalizare intervenție este setat automat la generarea raportului

  const _gInit = initialTehnicianGarantieState({
    tehnicianGarantieDecizie: initialData.tehnicianGarantieDecizie,
    tehnicianGarantieNuIntraMotiv: initialData.tehnicianGarantieNuIntraMotiv,
    tehnicianConfirmaGarantie: initialData.tehnicianConfirmaGarantie,
  })
  const [tehnicianGarantieDecizie, setTehnicianGarantieDecizie] = useState<TehnicianGarantieDecizie | "">(
    _gInit.decizie
  )
  const [tehnicianGarantieNuIntraMotiv, setTehnicianGarantieNuIntraMotiv] = useState(_gInit.motiv)

  useEffect(() => {
    const checkWorkOrderStatus = async () => {
      try {
        const lucrare = await getLucrareById(lucrareId)
        if (lucrare && lucrare.statusLucrare === "Finalizat" && lucrare.raportGenerat === true) {
          setFormDisabled(true)
        }
      } catch (error) {
        console.error("Eroare la verificarea stării tichetului:", error)
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

  const validateWarrantyOnSite = (): string | null => {
    if (!isWarrantyWork) return null
    if (!tehnicianGarantieDecizie) {
      return "Selectați confirmarea garanției la fața locului."
    }
    if (
      tehnicianGarantieDecizie === "nu_intra" &&
      !tehnicianGarantieNuIntraMotiv.trim()
    ) {
      return "Introduceți motivul pentru opțiunea „Nu face obiectul garanției”."
    }
    return null
  }

  const validateFailureCause = (): string | null => {
    if (cauzaPrincipalaDefectId && resolveFailureCauseLabel(failureCauseOptions, cauzaPrincipalaDefectId, cauzaPrincipalaDefect)) {
      return null
    }
    return "Selectați cauza principală a defectului."
  }

  const failureCausePayload = () => {
    const label = resolveFailureCauseLabel(failureCauseOptions, cauzaPrincipalaDefectId, cauzaPrincipalaDefect)
    return {
      cauzaPrincipalaDefectId: cauzaPrincipalaDefectId || "",
      cauzaPrincipalaDefect: label || "",
    }
  }

  const warrantyPayload = (): {
    tehnicianGarantieDecizie: TehnicianGarantieDecizie
    tehnicianGarantieNuIntraMotiv: string
    tehnicianConfirmaGarantie: boolean
  } | null => {
    if (!isWarrantyWork || !tehnicianGarantieDecizie) return null
    return {
      tehnicianGarantieDecizie: tehnicianGarantieDecizie,
      tehnicianGarantieNuIntraMotiv:
        tehnicianGarantieDecizie === "nu_intra" ? tehnicianGarantieNuIntraMotiv.trim() : "",
      tehnicianConfirmaGarantie: tehnicianGarantieDecizie === "confirma",
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, statusLucrare: value }))
  }

  const handleSave = async () => {
    try {
      const wErr = validateWarrantyOnSite()
      if (wErr) {
        toast({ title: "Câmpuri obligatorii", description: wErr, variant: "destructive" })
        return
      }

      setIsSaving(true)

      // Aplicăm mai întâi ștergerile imaginilor marcate
      const remainingImages = await applyImageDeletions()

      // Upload imaginile selectate (dacă există)
      const newUploadedImages = await uploadSelectedImages()
      
      // Combinăm imaginile rămase cu cele nou uplodate + deduplicare de siguranță.
      const allImages = dedupeDefectImages([...remainingImages, ...newUploadedImages])

      const updateData: any = {
        constatareLaLocatie,
        descriereInterventie,
        statusEchipament,
        necesitaOferta,
        comentariiOferta: necesitaOferta ? comentariiOferta : "", // Clear comments if necesitaOferta is false
        imaginiDefecte: allImages, // Includem toate imaginile (existente + noi)
        notaInternaTehnician,
      }

      const selectedFailureCause = failureCausePayload()
      if (selectedFailureCause.cauzaPrincipalaDefectId || selectedFailureCause.cauzaPrincipalaDefect) {
        updateData.cauzaPrincipalaDefectId = selectedFailureCause.cauzaPrincipalaDefectId
        updateData.cauzaPrincipalaDefect = selectedFailureCause.cauzaPrincipalaDefect
      }

      const w = warrantyPayload()
      if (w) {
        updateData.tehnicianGarantieDecizie = w.tehnicianGarantieDecizie
        updateData.tehnicianGarantieNuIntraMotiv = w.tehnicianGarantieNuIntraMotiv
        updateData.tehnicianConfirmaGarantie = w.tehnicianConfirmaGarantie
      }

      await updateLucrare(lucrareId, updateData)
      setUploadedDefectImages(allImages)

      // Log upload imaginilor dacă au fost uplodate
      if (newUploadedImages.length > 0) {
        console.log(`📷 Uplodate ${newUploadedImages.length} imagini la salvarea datelor`)
      }

      // Construim mesajul pentru toast
      let description = "Datele au fost salvate cu succes"
      const actions = []
      if (imagesToDelete.length > 0) {
        actions.push(`${imagesToDelete.length} imagine(i) ștearsă(e)`)
      }
      if (newUploadedImages.length > 0) {
        actions.push(`${newUploadedImages.length} imagine(i) încărcată(e)`)
      }
      if (actions.length > 0) {
        description += ` și ${actions.join(', ')}`
      }
      description += "."

      toast({
        title: "Date salvate",
        description: description,
      })

      // Evităm re-upload-ul acelorași fișiere dacă userul apasă apoi "Generează raport".
      clearSelectedImages()

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



  const handleGenerateReport = async () => {
    if (!descriereInterventie) {
      toast({
        title: "Eroare",
        description: "Trebuie să completați descrierea intervenției înainte de a genera raportul.",
        variant: "destructive",
      })
      return
    }

    const wErr = validateWarrantyOnSite()
    if (wErr) {
      toast({ title: "Câmpuri obligatorii", description: wErr, variant: "destructive" })
      return
    }
    const causeErr = validateFailureCause()
    if (causeErr) {
      toast({ title: "Câmpuri obligatorii", description: causeErr, variant: "destructive" })
      return
    }

    try {
      setIsGeneratingReport(true)

      // Aplicăm mai întâi ștergerile imaginilor marcate
      const remainingImages = await applyImageDeletions()

      // Upload imaginile selectate (dacă există)
      const newUploadedImages = await uploadSelectedImages()
      
      // Combinăm imaginile rămase cu cele nou uplodate + deduplicare de siguranță.
      const allImages = dedupeDefectImages([...remainingImages, ...newUploadedImages])

      // Salvăm datele formularului inclusiv statusul finalizării
      const updateData: any = {
        constatareLaLocatie,
        descriereInterventie,
        statusEchipament,
        ...failureCausePayload(),
        necesitaOferta,
        comentariiOferta: necesitaOferta ? comentariiOferta : "", // Clear comments if necesitaOferta is false
        imaginiDefecte: allImages, // Includem toate imaginile (existente + noi)
        notaInternaTehnician,
      }

      const w = warrantyPayload()
      if (w) {
        updateData.tehnicianGarantieDecizie = w.tehnicianGarantieDecizie
        updateData.tehnicianGarantieNuIntraMotiv = w.tehnicianGarantieNuIntraMotiv
        updateData.tehnicianConfirmaGarantie = w.tehnicianConfirmaGarantie
      }

      await updateLucrare(lucrareId, updateData)
      setUploadedDefectImages(allImages)

      // Log upload imaginilor dacă au fost uplodate
      if (newUploadedImages.length > 0) {
        console.log(`📷 Uplodate ${newUploadedImages.length} imagini la generarea raportului`)
      }
      if (imagesToDelete.length > 0) {
        console.log(`🗑️ Șterse ${imagesToDelete.length} imagini la generarea raportului`)
      }

      // Use the safe logging service instead of addLog to avoid database issues
      logInfo(`Navigare către pagina de raport pentru lucrarea ${lucrareId}`, { lucrareId }, { category: "rapoarte" })

      // Construim mesajul pentru toast
      let description = "Datele au fost salvate"
      const actions = []
      if (imagesToDelete.length > 0) {
        actions.push(`${imagesToDelete.length} imagine(i) ștearsă(e)`)
      }
      if (newUploadedImages.length > 0) {
        actions.push(`${newUploadedImages.length} imagine(i) încărcată(e)`)
      }
      if (actions.length > 0) {
        description += ` și ${actions.join(', ')}`
      }
      description += ". Veți fi redirecționat către pagina de semnare și generare raport."

      toast({
        title: "Date salvate",
        description: description,
      })

      // Curățăm selecția locală pentru a preveni upload-uri duplicate la acțiuni consecutive.
      clearSelectedImages()

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

  // Funcție pentru upload-ul imaginilor în Firebase Storage
  const uploadSelectedImages = async (): Promise<Array<any>> => {
    if (selectedImages.length === 0) {
      return []
    }

    const uploadPromises = selectedImages.map(async (file) => {
      const timestamp = Date.now()
      const fileExtension = 'jpg' // Imaginile sunt deja comprimată în format JPG
      const storagePath = `tichete/${lucrareId}/imagini_defecte/img_${timestamp}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`
      
      const { url, fileName } = await uploadFile(file, storagePath)

      return {
        url,
        fileName: file.name, // Păstrăm numele original pentru display
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.displayName || userData?.email || "Unknown",
        compressed: true,
      }
    })

    return await Promise.all(uploadPromises)
  }

  // Guard defensiv pentru cazuri edge: evită dubluri în payload indiferent de fluxul UI.
  const dedupeDefectImages = (images: Array<any>): Array<any> => {
    const seen = new Set<string>()
    return images.filter((image, index) => {
      const url = typeof image?.url === "string" ? image.url.trim() : ""
      const fileName = typeof image?.fileName === "string" ? image.fileName.trim() : ""
      const uploadedAt = typeof image?.uploadedAt === "string" ? image.uploadedAt.trim() : ""
      const key = url || fileName || uploadedAt
        ? (url ? `url:${url}` : `meta:${fileName}|${uploadedAt}`)
        : `index:${index}`

      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const handleStatusEchipamentChange = (value: string) => {
    setStatusEchipament(value)
  }

  // Funcție pentru marcarea imaginilor pentru ștergere (NU ștergere imediată)
  const handleImageMarkedForDeletion = (imageIndex: number) => {
    if (imagesToDelete.includes(imageIndex)) {
      // Dacă e deja marcată, o demarcăm (undo)
      setImagesToDelete(prev => prev.filter(index => index !== imageIndex))
      toast({
        title: "Demarcată",
        description: "Imaginea nu va mai fi ștearsă.",
      })
    } else {
      // O marcăm pentru ștergere
      setImagesToDelete(prev => [...prev, imageIndex])
      toast({
        title: "Marcată pentru ștergere", 
        description: "Imaginea va fi ștearsă la salvarea datelor.",
      })
    }
  }

  // Funcție pentru aplicarea efectivă a ștergerilor în Firebase
  const applyImageDeletions = async (): Promise<any[]> => {
    if (imagesToDelete.length === 0) {
      return uploadedDefectImages
    }

    try {
      const currentImages = uploadedDefectImages
      
      // Ștergem din Firebase Storage imaginile marcate pentru ștergere
      for (const imageIndex of imagesToDelete) {
        const imageToDelete = currentImages[imageIndex]
        if (imageToDelete?.url) {
          try {
            // Extragem path-ul din URL pentru ștergere din Storage
            // Upload-ul folosește `tichete/{id}/imagini_defecte/...`; acceptăm și `lucrari/` ca fallback pt date vechi
            const pathMatch = imageToDelete.url.match(/(?:tichete|lucrari)%2F[^?]+/)
            if (pathMatch) {
              const storagePath = decodeURIComponent(pathMatch[0])
              await deleteFile(storagePath)
              console.log(`🗑️ Șters din Storage: ${imageToDelete.fileName}`)
            }
          } catch (error) {
            console.error(`Eroare la ștergerea imaginii ${imageToDelete.fileName}:`, error)
          }
        }
      }

      // Returnăm lista filtrată (fără imaginile șterse)
      const remainingImages = currentImages.filter((_, index) => !imagesToDelete.includes(index))
      
      // Resetăm lista de imagini pentru ștergere
      setImagesToDelete([])
      setUploadedDefectImages(remainingImages)
      
      return remainingImages
    } catch (error) {
      console.error("Eroare la aplicarea ștergerilor:", error)
      throw error
    }
  }



  return (
    <Card>
      <CardHeader>
        <CardTitle>Formular intervenție tehnician</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => {
          e.preventDefault()
        }}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="constatareLaLocatie">Constatare la locație</Label>
              <Textarea
                id="constatareLaLocatie"
                placeholder="Descrieți ce ați constatat la locație..."
                value={constatareLaLocatie}
                onChange={(e) => setConstatareLaLocatie(e.target.value)}
                onKeyDown={(e) => {
                  // Prevenim propagarea pentru anumite taste care pot declanșa scurtături globale
                  if (e.key === ",") {
                    e.stopPropagation()
                  }
                }}
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
                onKeyDown={(e) => {
                  if (e.key === ",") {
                    e.stopPropagation()
                  }
                }}
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
              <Label htmlFor="cauzaPrincipalaDefect">Cauză principală defect *</Label>
              <Select
                value={cauzaPrincipalaDefectId}
                onValueChange={(value) => {
                  setCauzaPrincipalaDefectId(value)
                  setCauzaPrincipalaDefect(resolveFailureCauseLabel(failureCauseOptions, value))
                }}
                disabled={formDisabled}
              >
                <SelectTrigger id="cauzaPrincipalaDefect" className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}>
                  <SelectValue placeholder="Selectați cauza principală" />
                </SelectTrigger>
                <SelectContent>
                  {failureCauseOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>



            {/* Eliminat: dropdown pentru status finalizare intervenție */}

            {/* Secțiunea pentru informațiile de garanție */}
            {isWarrantyWork && (
              <div className="space-y-3">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-600">Status:</span>
                          <Badge className={warrantyInfo.statusBadgeClass + " ml-1"}>
                            {warrantyInfo.statusText}
                          </Badge>
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

                  {/* Confirmarea garanției de către tehnician */}
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md space-y-3">
                    <Label className="font-medium text-sm text-yellow-800 block" htmlFor="tehnician-garantie-decizie">
                      Confirmarea tehnicianului la fața locului:
                    </Label>
                    <Select
                      value={tehnicianGarantieDecizie || undefined}
                      onValueChange={(v) => {
                        setTehnicianGarantieDecizie(v as TehnicianGarantieDecizie)
                        if (v !== "nu_intra") setTehnicianGarantieNuIntraMotiv("")
                      }}
                      disabled={formDisabled}
                    >
                      <SelectTrigger
                        id="tehnician-garantie-decizie"
                        className={`w-full ${formDisabled ? "opacity-70 cursor-not-allowed" : ""}`}
                      >
                        <SelectValue placeholder="Selectați confirmarea…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirma">{TEHNICIAN_GARANTIE_DECIZIE_LABELS.confirma}</SelectItem>
                        <SelectItem value="nu_intra">{TEHNICIAN_GARANTIE_DECIZIE_LABELS.nu_intra}</SelectItem>
                        <SelectItem value="dupa_atelier">{TEHNICIAN_GARANTIE_DECIZIE_LABELS.dupa_atelier}</SelectItem>
                      </SelectContent>
                    </Select>
                    {tehnicianGarantieDecizie === "nu_intra" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="tehnician-garantie-motiv" className="text-sm text-yellow-900">
                          Motiv / justificare
                        </Label>
                        <Textarea
                          id="tehnician-garantie-motiv"
                          value={tehnicianGarantieNuIntraMotiv}
                          onChange={(e) => setTehnicianGarantieNuIntraMotiv(e.target.value)}
                          disabled={formDisabled}
                          placeholder="Explicați de ce intervenția nu face obiectul garanției…"
                          className={`min-h-[100px] text-base resize-y ${formDisabled ? "opacity-70 cursor-not-allowed" : ""}`}
                          rows={4}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      ✓ Echipament verificat
                    </Badge>
                    <span className="text-xs text-green-700">prin scanare QR</span>
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

            {/* Secțiunea pentru încărcarea imaginilor defectelor - disponibilă oricând */}
            <ImageDefectUpload
              lucrareId={lucrareId}
              lucrare={{ imaginiDefecte: uploadedDefectImages }}
              selectedImages={selectedImages}
              imagePreviews={imagePreviews}
              imagesToDelete={imagesToDelete}
              onImagesChange={(images, previews) => {
                setSelectedImages(images)
                setImagePreviews(previews)
              }}
              onImageDeleted={handleImageMarkedForDeletion}
              isUploading={isGeneratingReport || isSaving} // Loading state din componenta părinte
            />

            {/* Notă internă tehnician */}
            <div className="space-y-2">
              <Label htmlFor="notaInternaTehnician">Notă internă (tehnician)</Label>
              <Textarea
                id="notaInternaTehnician"
                placeholder="Adăugați observații interne pentru dispecer/admin (nu apar în raportul final)"
                value={notaInternaTehnician}
                onChange={(e) => setNotaInternaTehnician(e.target.value)}
                disabled={formDisabled}
                className={formDisabled ? "opacity-70 cursor-not-allowed" : ""}
              />
            </div>

            {formDisabled ? (
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>Tichet finalizată</AlertTitle>
                <AlertDescription>
                  Această lucrare este finalizată și raportul a fost generat. Nu mai puteți face modificări.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || formDisabled}
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
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
                  disabled={isGeneratingReport || formDisabled || !descriereInterventie || !cauzaPrincipalaDefectId}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
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
