"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ClientLocationsManager } from "./client-locations-manager"
import type { Client, ClientLocation } from "@/types/client"
import { toast } from "@/components/ui/use-toast"

// Schema de validare pentru client
const clientSchema = z.object({
  name: z.string().min(2, { message: "Numele trebuie să aibă cel puțin 2 caractere" }),
  cif: z.string().min(1, { message: "CIF-ul este obligatoriu" }),
  email: z.string().email({ message: "Adresa de email nu este validă" }),
  phone: z.string().min(10, { message: "Numărul de telefon trebuie să aibă cel puțin 10 caractere" }),
  address: z.string().min(5, { message: "Adresa trebuie să aibă cel puțin 5 caractere" }),
})

type ClientFormExtendedProps = {
  onSubmit: (data: Client) => void
  defaultValues?: Partial<Client>
  isLoading?: boolean
}

export function ClientFormExtended({ onSubmit, defaultValues, isLoading = false }: ClientFormExtendedProps) {
  const [locations, setLocations] = useState<ClientLocation[]>(defaultValues?.locations || [])

  // Inițializare formular
  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      cif: defaultValues?.cif || "",
      email: defaultValues?.email || "",
      phone: defaultValues?.phone || "",
      address: defaultValues?.address || "",
    },
  })

  const handleSubmit = (values: z.infer<typeof clientSchema>) => {
    // Validare locații
    if (locations.length === 0) {
      toast({
        title: "Eroare",
        description: "Trebuie să adăugați cel puțin o locație",
        variant: "destructive",
      })
      return
    }

    // Verifică dacă toate locațiile au nume și adresă
    const invalidLocations = locations.filter((loc) => !loc.name || !loc.address || !loc.city)
    if (invalidLocations.length > 0) {
      toast({
        title: "Eroare",
        description: "Toate locațiile trebuie să aibă nume, adresă și oraș",
        variant: "destructive",
      })
      return
    }

    // Verifică dacă toate locațiile au cel puțin o persoană de contact
    const locationsWithoutContacts = locations.filter((loc) => loc.contactPersons.length === 0)
    if (locationsWithoutContacts.length > 0) {
      toast({
        title: "Eroare",
        description: "Fiecare locație trebuie să aibă cel puțin o persoană de contact",
        variant: "destructive",
      })
      return
    }

    // Verifică dacă toate persoanele de contact au nume și telefon
    const hasInvalidContactPersons = locations.some((loc) =>
      loc.contactPersons.some((person) => !person.name || !person.phone),
    )
    if (hasInvalidContactPersons) {
      toast({
        title: "Eroare",
        description: "Toate persoanele de contact trebuie să aibă nume și telefon",
        variant: "destructive",
      })
      return
    }

    // Trimite datele complete
    onSubmit({
      ...values,
      locations,
      ...(defaultValues?.id ? { id: defaultValues.id } : {}),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{defaultValues?.id ? "Editare client" : "Adăugare client nou"}</CardTitle>
        <CardDescription>
          {defaultValues?.id
            ? "Actualizați informațiile clientului și locațiile acestuia"
            : "Completați informațiile pentru noul client și adăugați locațiile acestuia"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Informații generale</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nume client</FormLabel>
                      <FormControl>
                        <Input placeholder="Nume companie" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CIF</FormLabel>
                      <FormControl>
                        <Input placeholder="Cod de Identificare Fiscală" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="Email" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input placeholder="Număr de telefon" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresă sediu principal</FormLabel>
                    <FormControl>
                      <Input placeholder="Adresă sediu principal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-4 border-t">
              <ClientLocationsManager locations={locations} onChange={setLocations} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" type="button" onClick={() => form.reset()}>
              Resetare
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Se procesează..." : defaultValues?.id ? "Actualizare" : "Adăugare"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
