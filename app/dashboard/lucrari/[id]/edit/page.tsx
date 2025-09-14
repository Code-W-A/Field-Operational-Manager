"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm, type LucrareFormRef } from "@/components/lucrare-form"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { addLog } from "@/lib/firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import type { PersoanaContact } from "@/lib/firebase/firestore"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"
import { serverTimestamp } from "firebase/firestore"
import type { Lucrare } from "@/lib/firebase/firestore"
import { Mail, AlertCircle } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/components/ui/use-toast"
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

export default function EditLucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params
  const { userData } = useAuth()
  const { toast } = useToast()
  const formRef = useRef<LucrareFormRef>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  // Verificăm dacă utilizatorul este tehnician și redirecționăm dacă este
  useEffect(() => {
    if (userData?.role === "tehnician") {
      toast({
        title: "Acces restricționat",
        description: "Nu aveți permisiunea de a edita lucrări.",
        variant: "destructive",
      })
      router.push("/dashboard/lucrari")
    }
  }, [userData, router, toast])

  const [loading, setLoading] = useState(true)
  const [dataEmiterii, setDataEmiterii] = useState<Date | undefined>(undefined)
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(undefined)
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [] as string[],
    client: "",
    locatie: "",
    echipament: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "",
    statusFacturare: "",
    contract: "",
    contractNumber: "",
    contractType: "", // Adăugăm tipul contractului
    defectReclamat: "",
    persoaneContact: [] as PersoanaContact[],
    echipamentId: "",
    echipamentCod: "",
  })
  const [initialData, setInitialData] = useState<any>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setIsLoading(true)
        const lucrare = await getLucrareById(id)
        if (lucrare) {
          console.log("Lucrare încărcată pentru editare:", lucrare)
          setInitialData(lucrare)

          // Set dates
          if (lucrare.dataEmiterii) {
            setDataEmiterii(new Date(lucrare.dataEmiterii))
          }
          if (lucrare.dataInterventie) {
            setDataInterventie(new Date(lucrare.dataInterventie))
          }

          // Set form data
          setFormData({
            tipLucrare: lucrare.tipLucrare || "",
            tehnicieni: lucrare.tehnicieni || [],
            client: lucrare.client || "",
            locatie: lucrare.locatie || "",
            echipament: lucrare.echipament || "",
            descriere: lucrare.descriere || "",
            persoanaContact: lucrare.persoanaContact || "",
            telefon: lucrare.telefon || "",
            statusLucrare: lucrare.statusLucrare || "În așteptare",
            statusFacturare: lucrare.statusFacturare || "Nefacturat",
            contract: lucrare.contract || "",
            contractNumber: lucrare.contractNumber || "",
            contractType: lucrare.contractType || "",
            defectReclamat: lucrare.defectReclamat || "",
            persoaneContact: lucrare.persoaneContact || [],
            echipamentId: lucrare.echipamentId || "",
            echipamentCod: lucrare.echipamentCod || "",
          })

          // Adăugăm un log pentru debugging
          console.log("Persoane de contact încărcate:", lucrare.persoaneContact)
          console.log("Persoană de contact principală:", lucrare.persoanaContact)
          console.log("Telefon:", lucrare.telefon)
        }
        setLoading(false)
        setIsLoading(false)
      } catch (error) {
        console.error("Eroare la încărcarea lucrării:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la încărcarea lucrării. Vă rugăm să încercați din nou.",
          variant: "destructive",
        })
        setLoading(false)
        setIsLoading(false)
      }
    }

    fetchLucrare()
  }, [id, toast])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id: string, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleTehnicieniChange = (value: string) => {
    setFormData((prev) => {
      // Calculăm noua listă de tehnicieni (toggle)
      const isAlreadyAssigned = prev.tehnicieni.includes(value)
      const newTehnicieni = isAlreadyAssigned
        ? prev.tehnicieni.filter((tech) => tech !== value)
        : [...prev.tehnicieni, value]

      // Recalculăm statusul automat în funcție de lista de tehnicieni
      // Regula: dacă există tehnicieni -> "Atribuită"; dacă lista e goală -> "Listată"
      // Nu suprascriem statusuri terminale (ex: Finalizat, Arhivată)
      const hasTechnicians = newTehnicieni.length > 0
      let recalculatedStatus = prev.statusLucrare
      if (recalculatedStatus !== "Finalizat" && recalculatedStatus !== "Arhivată") {
        recalculatedStatus = hasTechnicians ? "Atribuită" : "Listată"
      }

      return {
        ...prev,
        tehnicieni: newTehnicieni,
        statusLucrare: recalculatedStatus,
      }
    })
  }

  // Add a handler for custom field changes (like arrays and objects)
  const handleCustomChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    const errors: string[] = []

    if (!dataEmiterii) errors.push("dataEmiterii")
    if (!dataInterventie) errors.push("dataInterventie")
    if (!formData.tipLucrare) errors.push("tipLucrare")
    if (!formData.client) errors.push("client")
    if (!formData.persoanaContact) errors.push("persoanaContact")
    if (!formData.telefon) errors.push("telefon")
    if (formData.tipLucrare === "Intervenție în contract" && !formData.contract) errors.push("contract")

    setFieldErrors(errors)
    return errors.length === 0
  }

  const handleSubmit = async (data: Partial<Lucrare>) => {
    try {
      setIsSubmitting(true)

      // Păstrăm dataEmiterii originală, nu permitem modificarea ei
      const originalEmiterii = initialData?.dataEmiterii || new Date().toISOString()

      // Recalculăm statusul automat în funcție de lista de tehnicieni, cu protecție pentru statusuri terminale
      let statusLucrare = data.statusLucrare
      const hasTechnicians = Array.isArray(data.tehnicieni) && data.tehnicieni.length > 0
      if (statusLucrare !== "Finalizat" && statusLucrare !== "Arhivată") {
        statusLucrare = hasTechnicians ? "Atribuită" : "Listată"
      }

      // Actualizăm lucrarea în Firestore
      await updateLucrare(id, {
        ...data,
        statusLucrare: statusLucrare, // Folosim statusul calculat
        // Forțăm păstrarea datei emiterii originale
        dataEmiterii: originalEmiterii,
        updatedAt: serverTimestamp(),
      })

      // Restul codului rămâne neschimbat...

      // Adăugăm un log pentru actualizarea lucrării
      await addLog(
        "Actualizare",
        `A fost actualizată lucrarea pentru clientul "${data.client}" cu ID-ul ${id}`,
        "Informație",
        "Lucrări",
      )

      // Afișăm un mesaj de succes
      toast({
        title: "Lucrare actualizată",
        description: "Lucrarea a fost actualizată cu succes.",
      })

      // Trimitem notificări dacă s-a schimbat data intervenției, tehnicienii, locația sau statusul
      if (
        initialData &&
        (
          data.dataInterventie !== initialData.dataInterventie ||
          JSON.stringify(data.tehnicieni) !== JSON.stringify(initialData.tehnicieni) ||
          data.locatie !== initialData.locatie ||
          statusLucrare !== initialData.statusLucrare
        )
      ) {
        try {
          const workOrderData = {
            id,
            ...initialData,
            ...data,
            // Asigurăm că trimitem statusul recalculat și locația curentă
            statusLucrare,
            locatie: data.locatie ?? initialData.locatie,
          }

          console.log("Sending notifications for updated work order:", id)

          const notificationResult = await sendWorkOrderNotifications(workOrderData)

          if (notificationResult.success) {
            // Extragem email-urile tehnicienilor
            const techEmails = notificationResult.result?.technicianEmails || []
            const successfulTechEmails = techEmails.filter((t) => t.success).map((t) => t.email)

            // Construim mesajul pentru toast
            let emailMessage = "Email-uri trimise către:\n"

            // Verificăm dacă clientul are email
            const clientEmailResult = notificationResult.result?.clientEmail

            if (clientEmailResult?.success) {
              emailMessage += `Client: ${clientEmailResult.recipient || "Email trimis"}\n`
            } else {
              emailMessage += "Client: Email indisponibil sau netrimis\n"
            }

            if (successfulTechEmails.length > 0) {
              emailMessage += `Tehnicieni: ${successfulTechEmails.join(", ")}`
            } else {
              emailMessage += "Tehnicieni: Email-uri indisponibile sau netrimise"
            }

            // Afișăm toast de succes pentru email-uri
            toast({
              title: "Notificări trimise",
              description: emailMessage,
              variant: "default",
              className: "whitespace-pre-line",
              icon: <Mail className="h-4 w-4" />,
            })
          } else {
            console.warn("Avertisment: Notificările de actualizare nu au putut fi trimise:", notificationResult.error)

            // Afișăm toast de eroare pentru email-uri
            toast({
              title: "Eroare la trimiterea notificărilor",
              description: `Nu s-au putut trimite email-urile: ${notificationResult.error || "Eroare necunoscută"}`,
              variant: "destructive",
              icon: <AlertCircle className="h-4 w-4" />,
            })
          }
        } catch (notificationError) {
          console.error("Eroare la trimiterea notificărilor de actualizare:", notificationError)

          // Afișăm toast de eroare pentru email-uri
          toast({
            title: "Eroare la trimiterea notificărilor",
            description: `A apărut o excepție: ${notificationError.message || "Eroare necunoscută"}`,
            variant: "destructive",
            icon: <AlertCircle className="h-4 w-4" />,
          })
        }
      }

      // Redirecționăm către pagina de lucrări
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la actualizarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea lucrării. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle cancel with confirmation if form is modified
  const handleCancel = () => {
    // Check if there are unsaved changes
    if (formRef.current && formRef.current.hasUnsavedChanges()) {
      // Show confirmation dialog
      setShowConfirmDialog(true)
    } else {
      // No unsaved changes, navigate directly
      router.push(`/dashboard/lucrari/${id}`)
    }
  }

  // Confirm navigation
  const confirmNavigation = () => {
    setShowConfirmDialog(false)
    router.push(`/dashboard/lucrari/${id}`)
  }

  // Cancel navigation
  const cancelNavigation = () => {
    setShowConfirmDialog(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
          <div className="w-full mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Editare Lucrare</CardTitle>
          <CardDescription>Actualizați detaliile lucrării</CardDescription>
        </CardHeader>
        <CardContent>
          <LucrareForm
            ref={formRef}
            isEdit
            dataEmiterii={dataEmiterii}
            setDataEmiterii={setDataEmiterii}
            dataInterventie={dataInterventie}
            setDataInterventie={setDataInterventie}
            formData={formData}
            handleInputChange={handleInputChange}
            handleSelectChange={handleSelectChange}
            handleTehnicieniChange={handleTehnicieniChange}
            handleCustomChange={handleCustomChange}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            initialData={initialData}
            fieldErrors={fieldErrors}
          />
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi
              pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelNavigation}>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={confirmNavigation}>Închide</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
