"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm } from "@/components/lucrare-form"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { addLog } from "@/lib/firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { Loader2 } from "lucide-react"
import type { PersoanaContact } from "@/lib/firebase/firestore"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"
import { serverTimestamp } from "firebase/firestore"
import type { Lucrare } from "@/lib/firebase/firestore"
import { Mail, AlertCircle } from "lucide-react"

export default function EditLucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params
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
        const lucrare = await getLucrareById(id)
        if (lucrare) {
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
            defectReclamat: lucrare.defectReclamat || "",
            persoaneContact: lucrare.persoaneContact || [],
            echipamentId: lucrare.echipamentId || "",
            echipamentCod: lucrare.echipamentCod || "",
          })
        }
        setLoading(false)
      } catch (error) {
        console.error("Eroare la încărcarea lucrării:", error)
        toast({
          title: "Eroare",
          description: "A apărut o eroare la încărcarea lucrării. Vă rugăm să încercați din nou.",
          variant: "destructive",
        })
        setLoading(false)
      }
    }

    fetchLucrare()
  }, [id])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id: string, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleTehnicieniChange = (value: string) => {
    setFormData((prev) => {
      // Dacă tehnicianul este deja în listă, îl eliminăm
      if (prev.tehnicieni.includes(value)) {
        return {
          ...prev,
          tehnicieni: prev.tehnicieni.filter((tech) => tech !== value),
        }
      }
      // Altfel, îl adăugăm
      return {
        ...prev,
        tehnicieni: [...prev.tehnicieni, value],
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

      // Actualizăm lucrarea în Firestore
      await updateLucrare(id, {
        ...data,
        updatedAt: serverTimestamp(),
      })

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

      // Trimitem notificări dacă s-a schimbat data intervenției sau tehnicienii
      if (
        initialData &&
        (data.dataInterventie !== initialData.dataInterventie ||
          JSON.stringify(data.tehnicieni) !== JSON.stringify(initialData.tehnicieni))
      ) {
        try {
          const workOrderData = {
            id,
            ...initialData,
            ...data,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Editare Lucrare</CardTitle>
          <CardDescription>Actualizați detaliile lucrării</CardDescription>
        </CardHeader>
        <CardContent>
          <LucrareForm
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
            onCancel={() => router.push(`/dashboard/lucrari/${id}`)}
            initialData={initialData}
            fieldErrors={fieldErrors}
          />
        </CardContent>
      </Card>
    </div>
  )
}
