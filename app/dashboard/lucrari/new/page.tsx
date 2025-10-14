"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm } from "@/components/lucrare-form"
import { addLucrare, getNextReportNumber } from "@/lib/firebase/firestore"
import { addLog } from "@/lib/firebase/firestore"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import type { PersoanaContact } from "@/lib/firebase/firestore"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"
import { useAuth } from "@/contexts/AuthContext"
import { Check, Mail, AlertCircle, RefreshCw } from "lucide-react"
import { WORK_STATUS, INVOICE_STATUS } from "@/lib/utils/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function NewLucrarePage() {
  const router = useRouter()
  const { userData } = useAuth()
  const [dataEmiterii, setDataEmiterii] = useState<Date>(new Date())
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(new Date())
  
  // Verificăm dacă suntem în modul de reatribuire
  const [isReassignment, setIsReassignment] = useState(false)
  const [originalWorkOrderId, setOriginalWorkOrderId] = useState<string>("")
  
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

  // Efect pentru a citi parametrii din URL și precompletat formularul
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const isReassign = urlParams.get('reassign') === 'true'
    
    if (isReassign) {
      setIsReassignment(true)
      const originalId = urlParams.get('originalId') || ""
      setOriginalWorkOrderId(originalId)
      
      // Precompletăm formularul cu datele din URL
      const prefilledData = {
        tipLucrare: urlParams.get('tipLucrare') || "",
        tehnicieni: [] as string[],
        client: urlParams.get('client') || "",
        locatie: urlParams.get('locatie') || "",
        echipament: urlParams.get('echipament') || "",
        echipamentCod: urlParams.get('echipamentCod') || "",
        descriere: urlParams.get('descriere') || "",
        persoanaContact: urlParams.get('persoanaContact') || "",
        telefon: urlParams.get('telefon') || "",
        defectReclamat: urlParams.get('defectReclamat') || "",
        contract: urlParams.get('contract') || "",
        contractNumber: urlParams.get('contractNumber') || "",
        contractType: urlParams.get('contractType') || "",
        statusLucrare: WORK_STATUS.WAITING,
        statusFacturare: INVOICE_STATUS.NOT_INVOICED,
        persoaneContact: [] as PersoanaContact[],
        echipamentId: "",
      }
      
      // Parsăm tehnicienii din JSON
      const tehnicieniString = urlParams.get('tehnicieni')
      if (tehnicieniString) {
        try {
          prefilledData.tehnicieni = JSON.parse(tehnicieniString)
        } catch (e) {
          prefilledData.tehnicieni = []
        }
      } else {
        prefilledData.tehnicieni = []
      }
      
      setFormData(prefilledData)
    }
  }, [])

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

      // Pregătim datele pentru noua lucrare
      const newWorkOrderData: any = {
        ...formData,
        dataEmiterii: currentDateTime.toISOString(),
        dataInterventie: dataInterventie ? dataInterventie.toISOString() : new Date().toISOString(),
      }

      // Dacă este re-intervenție, adăugăm câmpurile specifice
      if (isReassignment && originalWorkOrderId) {
        newWorkOrderData.lucrareOriginala = originalWorkOrderId
        newWorkOrderData.mesajReatribuire = `Re-intervenție de la lucrarea ${originalWorkOrderId}`
      }

      // Generăm nrLucrare din sistemul centralizat (egal ulterior cu numărul de raport)
      let nrLucrareGenerated = ""
      try {
        nrLucrareGenerated = await getNextReportNumber()
      } catch (e) {
        nrLucrareGenerated = `#${Date.now().toString().slice(-6)}`
      }

      // Adăugăm lucrarea în Firestore cu nrLucrare
      const lucrareId = await addLucrare({
        ...newWorkOrderData,
        nrLucrare: nrLucrareGenerated,
        createdBy: userData?.uid || "",
        createdByName: userData?.displayName || userData?.email || "Utilizator necunoscut",
      })

      // Adăugăm un log pentru crearea lucrării
      const logMessage = isReassignment 
        ? `A fost adăugată o re-intervenție pentru clientul "${formData.client}" cu ID-ul ${lucrareId} (din lucrarea originală ${originalWorkOrderId})`
        : `A fost adăugată o nouă lucrare pentru clientul "${formData.client}" cu ID-ul ${lucrareId}`
      
      await addLog("Adăugare", logMessage, "Informație", "Lucrări")

      // Afișăm un mesaj de succes
      const successMessage = isReassignment 
        ? "Re-intervenția a fost adăugată cu succes."
        : "Lucrarea a fost adăugată cu succes."
      
      toast({
        title: isReassignment ? "Re-intervenție adăugată" : "Lucrare adăugată",
        description: successMessage,
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
    <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
        <CardTitle>{isReassignment ? "Re-intervenție" : "Adaugă lucrare nouă"}</CardTitle>
        <CardDescription>
          {isReassignment 
            ? `Crearea unei re-intervenții bazate pe lucrarea ${originalWorkOrderId}` 
            : "Completați informațiile pentru a adăuga o lucrare nouă în sistem"
          }
        </CardDescription>
        </CardHeader>
        <CardContent>
        {/* Banner pentru re-intervenție */}
        {isReassignment && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Re-intervenție:</strong> Acest formular este precompletat cu datele din lucrarea originală <strong>{originalWorkOrderId}</strong>. 
              Puteți modifica orice informație necesară înainte de a salva noua lucrare.
            </AlertDescription>
          </Alert>
        )}

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
  )
}
