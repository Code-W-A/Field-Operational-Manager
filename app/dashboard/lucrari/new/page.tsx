"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm } from "@/components/lucrare-form"
import { addLucrare } from "@/lib/firebase/firestore"
import { addLog } from "@/lib/firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import type { PersoanaContact } from "@/lib/firebase/firestore"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"
import { Check, Mail, AlertCircle } from "lucide-react"
import { WORK_STATUS, INVOICE_STATUS } from "@/lib/utils/constants"

export default function NewLucrarePage() {
  const router = useRouter()
  const [dataEmiterii, setDataEmiterii] = useState<Date>(new Date())
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(new Date())
  // Actualizăm starea formData pentru a include contractType
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [] as string[],
    client: "",
    locatie: "",
    echipament: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: WORK_STATUS.WAITING,
    statusFacturare: INVOICE_STATUS.NOT_INVOICED,
    contract: "",
    contractNumber: "",
    contractType: "", // Adăugăm tipul contractului
    defectReclamat: "",
    persoaneContact: [] as PersoanaContact[],
    echipamentId: "",
    echipamentCod: "",
  })

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

  const handleSubmit = async () => {
    try {
      // Asigurăm că folosim data și ora curentă pentru dataEmiterii
      const currentDateTime = new Date()

      // Adăugăm lucrarea în Firestore
      const lucrareId = await addLucrare({
        ...formData,
        dataEmiterii: currentDateTime.toISOString(),
        dataInterventie: dataInterventie ? dataInterventie.toISOString() : new Date().toISOString(),
      })

      // Adăugăm un log pentru crearea lucrării
      await addLog(
        "Adăugare",
        `A fost adăugată o nouă lucrare pentru clientul "${formData.client}" cu ID-ul ${lucrareId}`,
        "Informație",
        "Lucrări",
      )

      // Afișăm un mesaj de succes
      toast({
        title: "Lucrare adăugată",
        description: "Lucrarea a fost adăugată cu succes.",
        icon: <Check className="h-4 w-4" />,
      })

      // Trimitem notificări către client și tehnicieni
      try {
        const workOrderData = {
          id: lucrareId,
          ...formData,
          dataEmiterii: currentDateTime.toISOString(),
          dataInterventie: dataInterventie ? dataInterventie.toISOString() : new Date().toISOString(),
        }

        const notificationResult = await sendWorkOrderNotifications(workOrderData)

        // Extragem adresele de email pentru afișare în toast
        let clientEmail = ""
        // Verificăm mai multe posibile locații pentru email-ul clientului
        if (workOrderData.client?.email) {
          clientEmail = workOrderData.client.email
        } else if (workOrderData.clientEmail) {
          clientEmail = workOrderData.clientEmail
        } else if (workOrderData.persoaneContact && workOrderData.persoaneContact.length > 0) {
          // Încercăm să găsim un email în lista de persoane de contact
          const contactWithEmail = workOrderData.persoaneContact.find((p: any) => p.email)
          if (contactWithEmail) {
            clientEmail = contactWithEmail.email
          }
        }

        // Extragem email-urile tehnicienilor
        const techEmails = Array.isArray(workOrderData.tehnicieni)
          ? workOrderData.tehnicieni
              .map((tech: any) => {
                if (typeof tech === "object" && tech.email) {
                  return tech.email
                }
                return null
              })
              .filter(Boolean)
          : []

        if (notificationResult.success) {
          // Construim mesajul pentru toast
          let emailMessage = "Emailuri trimise la:\n"

          if (clientEmail) {
            emailMessage += `Client: ${clientEmail}\n`
          } else {
            emailMessage += "Client: Email indisponibil\n"
          }

          if (techEmails.length > 0) {
            emailMessage += `Tehnicieni: ${techEmails.join(", ")}`
          } else {
            emailMessage += "Tehnicieni: Email-uri indisponibile"
          }

          // Afișăm toast cu informații despre email-urile trimise
          toast({
            title: "Notificări trimise",
            description: <div className="whitespace-pre-line">{emailMessage}</div>,
            icon: <Mail className="h-4 w-4" />,
          })
        } else {
          // Afișăm toast de avertizare dacă notificările nu au putut fi trimise
          toast({
            title: "Notificări netrimise",
            description: `Nu s-au putut trimite notificările: ${notificationResult.error || "Eroare necunoscută"}`,
            variant: "destructive",
            icon: <AlertCircle className="h-4 w-4" />,
          })
        }
      } catch (notificationError) {
        console.error("Eroare la trimiterea notificărilor:", notificationError)
        // Afișăm toast de eroare pentru notificări
        toast({
          title: "Eroare notificări",
          description: `A apărut o eroare la trimiterea notificărilor: ${
            (notificationError as Error)?.message || "Eroare necunoscută"
          }`,
          variant: "destructive",
          icon: <AlertCircle className="h-4 w-4" />,
        })
      }

      // Redirecționăm către pagina de lucrări
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la adăugarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la adăugarea lucrării. Vă rugăm să încercați din nou.",
        variant: "destructive",
        icon: <AlertCircle className="h-4 w-4" />,
      })
    }
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Adaugă Lucrare Nouă</CardTitle>
          <CardDescription>Completați detaliile pentru a crea o nouă lucrare</CardDescription>
        </CardHeader>
        <CardContent>
          <LucrareForm
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
            onCancel={() => router.push("/dashboard/lucrari")}
          />
        </CardContent>
      </Card>
    </div>
  )
}
