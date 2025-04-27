"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm } from "@/components/lucrare-form"
import { DashboardShell } from "@/components/dashboard-shell"
import { getLucrareById, updateLucrare, getClientById } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { sendWorkOrderNotifications } from "@/components/work-order-notification-service"

export default function EditLucrarePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params
  const [dataEmiterii, setDataEmiterii] = useState<Date | undefined>(undefined)
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(undefined)
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [] as string[],
    client: "",
    locatie: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "",
    statusFacturare: "",
    contract: "",
    contractNumber: "",
    defectReclamat: "",
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

          // Parse dates
          if (lucrare.dataEmiterii) {
            const [datePart, timePart] = lucrare.dataEmiterii.split(" ")
            const [day, month, year] = datePart.split(".")
            const [hour, minute] = timePart ? timePart.split(":") : ["00", "00"]
            const date = new Date(
              Number.parseInt(year),
              Number.parseInt(month) - 1,
              Number.parseInt(day),
              Number.parseInt(hour),
              Number.parseInt(minute),
            )
            setDataEmiterii(date)
          }

          if (lucrare.dataInterventie) {
            const [datePart, timePart] = lucrare.dataInterventie.split(" ")
            const [day, month, year] = datePart.split(".")
            const [hour, minute] = timePart ? timePart.split(":") : ["00", "00"]
            const date = new Date(
              Number.parseInt(year),
              Number.parseInt(month) - 1,
              Number.parseInt(day),
              Number.parseInt(hour),
              Number.parseInt(minute),
            )
            setDataInterventie(date)
          }

          // Set form data
          setFormData({
            tipLucrare: lucrare.tipLucrare || "",
            tehnicieni: lucrare.tehnicieni || [],
            client: lucrare.client || "",
            locatie: lucrare.locatie || "",
            descriere: lucrare.descriere || "",
            persoanaContact: lucrare.persoanaContact || "",
            telefon: lucrare.telefon || "",
            statusLucrare: lucrare.statusLucrare || "În așteptare",
            statusFacturare: lucrare.statusFacturare || "Nefacturat",
            contract: lucrare.contract || "",
            contractNumber: lucrare.contractNumber || "",
            defectReclamat: lucrare.defectReclamat || "",
          })
        }
      } catch (error) {
        console.error("Eroare la încărcarea lucrării:", error)
        toast({
          title: "Eroare",
          description: "Nu s-a putut încărca lucrarea",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
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

      // Create update data
      const updateData = {
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

      // Update work order
      await updateLucrare(id, updateData)

      // Check if status has changed - if so, send notifications
      if (initialData && initialData.statusLucrare !== formData.statusLucrare) {
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

        // Send status update notifications
        if (client) {
          const lucrareWithId = { ...updateData, id }
          await sendWorkOrderNotifications(
            lucrareWithId,
            client,
            technicianEmails.filter((tech) => tech.email), // Filter out technicians without email
          )
        }
      }

      toast({
        title: "Lucrare actualizată",
        description: "Lucrarea a fost actualizată cu succes",
      })

      // Redirect to work order details
      router.push(`/dashboard/lucrari/${id}`)
    } catch (error) {
      console.error("Eroare la actualizarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea lucrării",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardShell>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center h-40">
              <p>Se încarcă...</p>
            </div>
          </CardContent>
        </Card>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <Card>
        <CardHeader>
          <CardTitle>Editare Lucrare</CardTitle>
          <CardDescription>Modificați detaliile lucrării</CardDescription>
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
            fieldErrors={fieldErrors}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/dashboard/lucrari/${id}`)}
            initialData={initialData}
          />
        </CardContent>
      </Card>
    </DashboardShell>
  )
}
