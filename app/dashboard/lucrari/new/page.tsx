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

export default function NewLucrarePage() {
  const router = useRouter()
  const [dataEmiterii, setDataEmiterii] = useState<Date | undefined>(new Date())
  const [dataInterventie, setDataInterventie] = useState<Date | undefined>(new Date())
  const [formData, setFormData] = useState({
    tipLucrare: "",
    tehnicieni: [] as string[],
    client: "",
    locatie: "",
    echipament: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "În așteptare",
    statusFacturare: "Nefacturat",
    contract: "",
    contractNumber: "",
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
      // Adăugăm lucrarea în Firestore
      const lucrareId = await addLucrare({
        ...formData,
        dataEmiterii: dataEmiterii ? dataEmiterii.toISOString() : new Date().toISOString(),
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
      })

      // Trimitem notificări către client și tehnicieni
      try {
        const workOrderData = {
          id: lucrareId,
          ...formData,
          dataEmiterii: dataEmiterii ? dataEmiterii.toISOString() : new Date().toISOString(),
          dataInterventie: dataInterventie ? dataInterventie.toISOString() : new Date().toISOString(),
        }

        const notificationResult = await sendWorkOrderNotifications(workOrderData)

        if (notificationResult.success) {
          console.log("Notificări trimise cu succes:", notificationResult)
        } else {
          console.warn("Avertisment: Notificările nu au putut fi trimise:", notificationResult.error)
        }
      } catch (notificationError) {
        console.error("Eroare la trimiterea notificărilor:", notificationError)
        // Nu întrerupem fluxul principal dacă notificările eșuează
      }

      // Redirecționăm către pagina de lucrări
      router.push("/dashboard/lucrari")
    } catch (error) {
      console.error("Eroare la adăugarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la adăugarea lucrării. Vă rugăm să încercați din nou.",
        variant: "destructive",
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
