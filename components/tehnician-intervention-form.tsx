"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Loader2, Save } from "lucide-react"
import { SignaturePad } from "@/components/signature-pad"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useNavigationPrompt } from "@/hooks/use-navigation-prompt"
import { NavigationPromptDialog } from "@/components/navigation-prompt-dialog"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"

interface TehnicianInterventionFormProps {
  lucrareId: string
  initialData: {
    descriereInterventie?: string
    statusLucrare?: string
  }
  onUpdate?: () => void
}

export function TehnicianInterventionForm({ lucrareId, initialData, onUpdate }: TehnicianInterventionFormProps) {
  const [descriereInterventie, setDescriereInterventie] = useState(initialData.descriereInterventie || "")
  const [statusLucrare, setStatusLucrare] = useState(initialData.statusLucrare || "În așteptare")
  const [oraPlecare, setOraPlecare] = useState("")
  const [semnaturaTehnician, setSignaturaTehnician] = useState<string | null>(null)
  const [semnaturaBeneficiar, setSemnaturaBeneficiar] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [initialFormState, setInitialFormState] = useState({
    descriereInterventie: initialData.descriereInterventie || "",
    statusLucrare: initialData.statusLucrare || "În așteptare",
    oraPlecare: "",
    semnaturaTehnician: null,
    semnaturaBeneficiar: null,
  })

  // Inițializăm starea formularului
  useEffect(() => {
    setInitialFormState({
      descriereInterventie: initialData.descriereInterventie || "",
      statusLucrare: initialData.statusLucrare || "În așteptare",
      oraPlecare: "",
      semnaturaTehnician: null,
      semnaturaBeneficiar: null,
    })
  }, [initialData])

  // Setăm ora curentă ca oră de plecare implicită
  useEffect(() => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, "0")
    const minutes = now.getMinutes().toString().padStart(2, "0")
    setOraPlecare(`${hours}:${minutes}`)
  }, [])

  // Verificăm dacă există modificări nesalvate
  const currentFormState = {
    descriereInterventie,
    statusLucrare,
    oraPlecare,
    semnaturaTehnician,
    semnaturaBeneficiar,
  }

  const { hasUnsavedChanges, showUnsavedChangesDialog, setShowUnsavedChangesDialog } = useUnsavedChanges(
    initialFormState,
    currentFormState,
  )

  // Adăugăm prompt de navigare
  const { showPrompt, targetHref, confirmNavigation, cancelNavigation } = useNavigationPrompt(hasUnsavedChanges)

  const handleSubmit = async () => {
    if (!descriereInterventie.trim()) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați descrierea intervenției.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const updateData: any = {
        descriereInterventie,
        statusLucrare,
        oraPlecare,
      }

      // Adăugăm semnăturile doar dacă există
      if (semnaturaTehnician) {
        updateData.semnaturaTehnician = semnaturaTehnician
      }

      if (semnaturaBeneficiar) {
        updateData.semnaturaBeneficiar = semnaturaBeneficiar
      }

      await updateLucrare(lucrareId, updateData)

      toast({
        title: "Succes",
        description: "Intervenția a fost actualizată cu succes.",
      })

      // Actualizăm starea inițială a formularului
      setInitialFormState({
        descriereInterventie,
        statusLucrare,
        oraPlecare,
        semnaturaTehnician,
        semnaturaBeneficiar,
      })

      // Apelăm callback-ul de actualizare dacă există
      if (onUpdate) {
        onUpdate()
      }
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
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Intervenție tehnician</CardTitle>
          <CardDescription>Completați detaliile intervenției și colectați semnăturile necesare</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="descriereInterventie">Descriere intervenție</Label>
            <Textarea
              id="descriereInterventie"
              placeholder="Descrieți intervenția efectuată..."
              value={descriereInterventie}
              onChange={(e) => setDescriereInterventie(e.target.value)}
              className="min-h-[150px]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="statusLucrare">Status lucrare</Label>
              <Select value={statusLucrare} onValueChange={setStatusLucrare}>
                <SelectTrigger id="statusLucrare">
                  <SelectValue placeholder="Selectați statusul" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="În așteptare">În așteptare</SelectItem>
                  <SelectItem value="În curs">În curs</SelectItem>
                  <SelectItem value="Finalizată">Finalizată</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oraPlecare">Ora plecare</Label>
              <input
                type="time"
                id="oraPlecare"
                value={oraPlecare}
                onChange={(e) => setOraPlecare(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Semnătură tehnician</Label>
              <SignaturePad
                onSign={setSignaturaTehnician}
                initialSignature={semnaturaTehnician}
                className="border rounded-md"
              />
            </div>

            <div className="space-y-2">
              <Label>Semnătură beneficiar</Label>
              <SignaturePad
                onSign={setSemnaturaBeneficiar}
                initialSignature={semnaturaBeneficiar}
                className="border rounded-md"
              />
            </div>
          </div>

          <Alert variant="info" className="mt-4">
            <AlertTitle>Informație</AlertTitle>
            <AlertDescription>
              Puteți genera raportul chiar dacă lucrarea nu este finalizată sau nu aveți toate semnăturile. Raportul va
              conține un avertisment în acest caz.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSubmitting ? "Se salvează..." : "Salvează"}
          </Button>
        </CardFooter>
      </Card>

      {/* Dialog pentru confirmarea navigării */}
      <NavigationPromptDialog
        isOpen={showPrompt}
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
        targetHref={targetHref}
      />

      {/* Dialog pentru modificări nesalvate */}
      <UnsavedChangesDialog
        isOpen={showUnsavedChangesDialog}
        onClose={() => setShowUnsavedChangesDialog(false)}
        onConfirm={handleSubmit}
      />
    </>
  )
}
