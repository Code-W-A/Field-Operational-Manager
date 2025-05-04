"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Lock } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

// Definim schema de validare pentru formular
const formSchema = z.object({
  descriereInterventie: z.string().min(10, {
    message: "Descrierea intervenției trebuie să aibă cel puțin 10 caractere.",
  }),
  statusLucrare: z.string({
    required_error: "Vă rugăm să selectați statusul lucrării.",
  }),
})

type FormValues = z.infer<typeof formSchema>

interface TehnicianInterventionFormProps {
  lucrareId: string
  initialData: {
    descriereInterventie?: string
    statusLucrare: string
  }
  onUpdate?: () => void
}

export function TehnicianInterventionForm({ lucrareId, initialData, onUpdate }: TehnicianInterventionFormProps) {
  const [loading, setLoading] = useState(false)
  const [isFinalized, setIsFinalized] = useState(false)
  const { userData } = useAuth()

  // Inițializăm formularul cu valorile inițiale
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      descriereInterventie: initialData.descriereInterventie || "",
      statusLucrare: initialData.statusLucrare || "În așteptare",
    },
  })

  // Verificăm dacă lucrarea este deja finalizată
  useEffect(() => {
    const checkIfFinalized = async () => {
      try {
        const lucrare = await getLucrareById(lucrareId)
        if (lucrare.statusLucrare === "Finalizat") {
          setIsFinalized(true)
        }
      } catch (error) {
        console.error("Eroare la verificarea statusului lucrării:", error)
      }
    }

    checkIfFinalized()
  }, [lucrareId])

  // Funcție pentru a trimite datele formularului
  async function onSubmit(data: FormValues) {
    if (isFinalized) {
      toast({
        title: "Acțiune restricționată",
        description: "Această lucrare este finalizată și nu mai poate fi modificată.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      // Actualizăm lucrarea în baza de date
      await updateLucrare(lucrareId, {
        descriereInterventie: data.descriereInterventie,
        statusLucrare: data.statusLucrare,
        lastUpdatedBy: userData?.displayName || "Tehnician necunoscut",
        lastUpdatedAt: new Date().toISOString(),
      })

      // Verificăm dacă lucrarea tocmai a fost finalizată
      if (data.statusLucrare === "Finalizat") {
        setIsFinalized(true)
      }

      toast({
        title: "Intervenție actualizată",
        description: "Detaliile intervenției au fost actualizate cu succes.",
      })

      // Apelăm callback-ul pentru a reîncărca datele lucrării
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
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalii intervenție</CardTitle>
        <CardDescription>Completați detaliile intervenției și actualizați statusul lucrării.</CardDescription>
      </CardHeader>
      <CardContent>
        {isFinalized && (
          <Alert variant="warning" className="mb-4">
            <Lock className="h-4 w-4" />
            <AlertTitle>Lucrare finalizată</AlertTitle>
            <AlertDescription>
              Această lucrare este finalizată și nu mai poate fi modificată. Dacă este necesară o modificare, contactați
              un administrator.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="descriereInterventie"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descriere intervenție</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descrieți intervenția efectuată..."
                      className="min-h-[150px]"
                      disabled={loading || isFinalized}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Descrieți în detaliu intervenția efectuată, piesele înlocuite și soluțiile aplicate.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="statusLucrare"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status lucrare</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loading || isFinalized}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectați statusul lucrării" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="În așteptare">În așteptare</SelectItem>
                      <SelectItem value="În curs">În curs</SelectItem>
                      <SelectItem value="Finalizat">Finalizat</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Actualizați statusul lucrării în funcție de stadiul intervenției.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={loading || isFinalized}>
              {loading ? "Se salvează..." : "Salvează intervenția"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          {isFinalized
            ? "Lucrarea este finalizată și nu mai poate fi modificată."
            : "Asigurați-vă că toate informațiile sunt corecte înainte de a marca lucrarea ca finalizată."}
        </p>
      </CardFooter>
    </Card>
  )
}
