"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm } from "@/components/lucrare-form"
import { DashboardShell } from "@/components/dashboard-shell"
import { addLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getClientById } from "@/lib/firebase/firestore"
import { collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"

export default function NewLucrarePage() {
  const router = useRouter()
  const [dataEmiterii, setDataEmiterii] = useState<Date | undefined>(new Date())
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(new Date())
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [] as string[],
    client: "",
    locatie: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "În așteptare",
    statusFacturare: "Nefacturat",
    contract: "",
    contractNumber: "",
    defectReclamat: "",
  })
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id: string, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleTehnicieniChange = (value: string) => {
    // Dacă tehnicianul există deja, îl eliminăm, altfel îl adăugăm
    setFormData((prev) => {
      if (prev.tehnicieni.includes(value)) {
        return { ...prev, tehnicieni: prev.tehnicieni.filter((tech) => tech !== value) }
      } else {
        return { ...prev, tehnicieni: [...prev.tehnicieni, value] }
      }
    })
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

  const handleSubmit = async () => {
    if (!validateForm() || isSubmitting) return

    try {
      setIsSubmitting(true)

      // Format dates
      const formattedDataEmiterii = dataEmiterii
        ? `${dataEmiterii.toLocaleDateString("ro-RO", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })} ${dataEmiterii.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`
        : ""

      const formattedDataInterventie = dataInterventie
        ? `${dataInterventie.toLocaleDateString("ro-RO", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })} ${dataInterventie.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`
        : ""

      // Create work order data
      const lucrareData = {
        dataEmiterii: formattedDataEmiterii,
        dataInterventie: formattedDataInterventie,
        tipLucrare: formData.tipLucrare,
        tehnicieni: formData.tehnicieni,
        client: formData.client,
        locatie: formData.locatie,
        descriere: formData.descriere,
        persoanaContact: formData.persoanaContact,
        telefon: formData.telefon,
        statusLucrare: formData.statusLucrare,
        statusFacturare: formData.statusFacturare,
        contract: formData.contract,
        contractNumber: formData.contractNumber,
        defectReclamat: formData.defectReclamat,
      }

      // Add work order to Firestore
      const workOrderId = await addLucrare(lucrareData)

      // Get the client data
      const client = await getClientById(formData.client)

      // Get technician data (email addresses)
      const technicianEmails = await Promise.all(
        formData.tehnicieni.map(async (techName) => {
          const techQuery = query(collection(db, "users"), where("displayName", "==", techName))

          const querySnapshot = await getDocs(techQuery)
          if (!querySnapshot.empty) {
            const techDoc = querySnapshot.docs[0]
            return {
              displayName: techDoc.data().displayName,
              email: techDoc.data().email,
            }
          }
          return { displayName: techName, email: "" }
        }),
      )

      // Send notifications
      if (client && workOrderId) {
        const lucrareWithId = { ...lucrareData, id: workOrderId }
        const notificationResult = await sendWorkOrderNotifications(
          lucrareWithId,
          client,
          technicianEmails.filter((tech) => tech.email), // Filter out technicians without email
        )

        if (!notificationResult.success) {
          console.warn("Notificare eșuată:", notificationResult.message)
          // We continue even if notifications fail
        }
      }

      toast({
        title: "Lucrare adăugată",
        description: "Lucrarea a fost adăugată cu succes",
      })

      // Redirect to work orders list
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la adăugarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la adăugarea lucrării",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardShell>
      <Card>
        <CardHeader>
          <CardTitle>Adaugă Lucrare Nouă</CardTitle>
          <CardDescription>Completați detaliile pentru a crea o lucrare nouă</CardDescription>
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
            fieldErrors={fieldErrors}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/dashboard/lucrari")}
          />
        </CardContent>
      </Card>
    </DashboardShell>
  )
}
