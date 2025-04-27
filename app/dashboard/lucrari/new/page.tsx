"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LucrareForm } from "@/components/lucrare-form"
import { DashboardShell } from "@/components/dashboard-shell"
import { addLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { format } from "date-fns"

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

      // Format dates using 24-hour format
      const formattedDataEmiterii = dataEmiterii ? format(dataEmiterii, "dd.MM.yyyy HH:mm") : ""

      const formattedDataInterventie = dataInterventie ? format(dataInterventie, "dd.MM.yyyy HH:mm") : ""

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
      await addLucrare(lucrareData)

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
