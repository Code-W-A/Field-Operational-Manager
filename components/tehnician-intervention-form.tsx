"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"

interface TehnicianInterventionFormProps {
  lucrareId: string
  initialData: {
    descriereInterventie?: string
    statusLucrare: string
  }
  onUpdate: () => void
}

export function TehnicianInterventionForm({ lucrareId, initialData, onUpdate }: TehnicianInterventionFormProps) {
  const [formData, setFormData] = useState({
    descriereInterventie: initialData.descriereInterventie || "",
    statusLucrare: initialData.statusLucrare,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleSelectChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, statusLucrare: value }))
  }, [])

  const handleSubmit = useCallback(async () => {
    try {
      setIsSubmitting(true)

      await updateLucrare(lucrareId, {
        descriereInterventie: formData.descriereInterventie,
        statusLucrare: formData.statusLucrare,
      })

      toast({
        title: "Intervenție actualizată",
        description: "Detaliile intervenției au fost actualizate cu succes.",
      })

      onUpdate()
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
  }, [lucrareId, formData, onUpdate])

  return (
    <div className="space-y-6">
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
              <SelectItem value="În așteptare">În așteptare</SelectItem>
              <SelectItem value="În curs">În curs</SelectItem>
              <SelectItem value="Finalizat">Finalizat</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
            </>
          ) : (
            "Salvează Intervenția"
          )}
        </Button>
      </div>
    </div>
  )
}
