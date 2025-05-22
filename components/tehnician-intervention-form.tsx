"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import SignaturePad from "@/components/ui/signature-pad"

const formSchema = z.object({
  numeBeneficiar: z.string().min(2, {
    message: "Numele beneficiarului trebuie să aibă cel puțin 2 caractere.",
  }),
  telefonBeneficiar: z.string().min(10, {
    message: "Numărul de telefon trebuie să aibă cel puțin 10 caractere.",
  }),
  emailContact: z.string().email({
    message: "Te rugăm să introduci o adresă de email validă.",
  }),
  descriereInterventie: z.string().min(10, {
    message: "Descrierea intervenției trebuie să aibă cel puțin 10 caractere.",
  }),
  tipInterventie: z.string().min(2, {
    message: "Tipul intervenției trebuie să aibă cel puțin 2 caractere.",
  }),
  constatari: z.string().min(10, {
    message: "Constatările trebuie să aibă cel puțin 10 caractere.",
  }),
  recomandari: z.string().min(10, {
    message: "Recomandările trebuie să aibă cel puțin 10 caractere.",
  }),
  signatureBeneficiar: z.string().optional(),
  signatureTechnician: z.string().optional(),
})

export function TehnicianInterventionForm() {
  const [signatureBeneficiar, setSignatureBeneficiar] = useState<string | null>(null)
  const [signatureTechnician, setSignatureTechnician] = useState<string | null>(null)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numeBeneficiar: "",
      telefonBeneficiar: "",
      emailContact: "",
      descriereInterventie: "",
      tipInterventie: "",
      constatari: "",
      recomandari: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="numeBeneficiar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nume beneficiar</FormLabel>
              <FormControl>
                <Input placeholder="Numele beneficiarului" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="telefonBeneficiar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefon beneficiar</FormLabel>
              <FormControl>
                <Input placeholder="Telefonul beneficiarului" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipInterventie"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tip intervenție</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează un tip de intervenție" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventiva">Preventivă</SelectItem>
                    <SelectItem value="corectiva">Corectivă</SelectItem>
                    <SelectItem value="urgenta">Urgență</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="descriereInterventie"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descriere intervenție</FormLabel>
              <FormControl>
                <Textarea placeholder="Descrierea intervenției" className="resize-none" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="constatari"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Constatări</FormLabel>
              <FormControl>
                <Textarea placeholder="Constatări" className="resize-none" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="recomandari"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Recomandări</FormLabel>
              <FormControl>
                <Textarea placeholder="Recomandări" className="resize-none" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Semnătură beneficiar</Label>
              <SignaturePad value={signatureBeneficiar} onChange={setSignatureBeneficiar} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailContact">E-mail semnatar</Label>
              <Input id="emailContact" placeholder="E-mail semnatar" {...form.register("emailContact")} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Semnătură tehnician</Label>
              <SignaturePad value={signatureTechnician} onChange={setSignatureTechnician} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailTechnician">E-mail semnatar</Label>
              <Input id="emailTechnician" placeholder="E-mail semnatar" {...form.register("emailTechnician")} />
            </div>
          </div>
        </div>

        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}
