"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save } from "lucide-react"
import { updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { useStableCallback } from "@/lib/utils/hooks"

interface TehnicianInterventionFormProps {
  lucrareId: string
  initialData: {
    descriereInterventie?: string
    constatareLaLocatie?: string
    statusLucrare: string
  }
  onUpdate: () => void
}

export function TehnicianInterventionForm({ lucrareId, initialData, onUpdate }: TehnicianInterventionFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    descriereInterventie: initialData.descriereInterventie || "",
    constatareLaLocatie: initialData.constatareLaLocatie || "",
    statusLucrare: initialData.statusLucrare,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Add effect to update form data when initialData changes
  useEffect(() => {
    setFormData({
      descriereInterventie: initialData.descriereInterventie || "",
      constatareLaLocatie: initialData.constatareLaLocatie || "",
      statusLucrare: initialData.statusLucrare,
    })
  }, [initialData])

  // Debug logging
  useEffect(() => {
    console.log("Initial data loaded:", initialData)
  }, [initialData])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, statusLucrare: value }))
  }

  // Function to just save the data without navigating
  const handleSave = useStableCallback(async () => {
    try {
      setIsSaving(true)

      // Log what we're saving
      console.log("Saving data:", {
        descriereInterventie: formData.descriereInterventie,
        constatareLaLocatie: formData.constatareLaLocatie,
        statusLucrare: formData.statusLucrare,
      })

      await updateLucrare(lucrareId, {
        descriereInterventie: formData.descriereInterventie,
        constatareLaLocatie: formData.constatareLaLocatie,
        statusLucrare: formData.statusLucrare,
      })

      // Verify the data was saved correctly
      const updatedLucrare = await getLucrareById(lucrareId)
      console.log("Data after save:", {
        descriereInterventie: updatedLucrare?.descriereInterventie,
        constatareLaLocatie: updatedLucrare?.constatareLaLocatie,
      })

      toast({
        title: "Intervenție salvată",
        description: "Detaliile intervenției au fost salvate cu succes.",
      })

      onUpdate()
    } catch (error) {
      console.error("Eroare la salvarea intervenției:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la salvarea intervenției.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  })

  // Use useStableCallback to ensure we have access to the latest state values
  // without causing unnecessary re-renders
  const handleSubmit = useStableCallback(async () => {
    try {
      setIsSubmitting(true)

      await updateLucrare(lucrareId, {
        descriereInterventie: formData.descriereInterventie,
        constatareLaLocatie: formData.constatareLaLocatie,
        statusLucrare: formData.statusLucrare,
      })

      toast({
        title: "Intervenție actualizată",
        description: "Detaliile intervenției au fost actualizate cu succes.",
      })

      onUpdate()

      // Navigate to the report generation page
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Constatare la locație</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="constatareLaLocatie"
            placeholder="Descrieți constatările făcute la locație înainte de intervenție"
            value={formData.constatareLaLocatie}
            onChange={handleInputChange}
            className="min-h-[150px] resize-y"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descriere Intervenție</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="descriereInterventie"
            placeholder="Descrieți acțiunile efectuate în cadrul intervenției"
            value={formData.descriereInterventie}
            onChange={handleInputChange}
            className="min-h-[150px] resize-y"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Lucrare</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={formData.statusLucrare} onValueChange={handleSelectChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selectați statusul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Listată">Listată</SelectItem>
              <SelectItem value="Atribuită">Atribuită</SelectItem>
              <SelectItem value="În lucru">În lucru</SelectItem>
              <SelectItem value="În așteptare">În așteptare</SelectItem>
              <SelectItem value="Finalizat">Finalizat</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se salvează...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> Salvează
            </>
          )}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
            </>
          ) : (
            "Finalizează și emite raport"
          )}
        </Button>
      </div>
    </div>
  )
}
