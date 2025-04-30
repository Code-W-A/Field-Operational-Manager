"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { addClient, updateClient } from "@/lib/firebase/clients"
import type { Client } from "@/types/client"
import { toast } from "@/components/ui/use-toast"

// Schema de validare pentru client
const clientSchema = z.object({
  name: z.string().min(2, { message: "Numele trebuie să aibă cel puțin 2 caractere" }),
  email: z.string().email({ message: "Adresa de email trebuie să fie validă" }),
  phone: z.string().min(10, { message: "Numărul de telefon trebuie să aibă cel puțin 10 caractere" }),
  address: z.string().min(5, { message: "Adresa trebuie să aibă cel puțin 5 caractere" }),
  city: z.string().min(2, { message: "Orașul trebuie să aibă cel puțin 2 caractere" }),
  county: z.string().min(2, { message: "Județul trebuie să aibă cel puțin 2 caractere" }),
  cif: z.string().min(2, { message: "CIF-ul trebuie să aibă cel puțin 2 caractere" }),
})

type ClientFormProps = {
  client?: Client
  onSuccess?: (client: Client) => void
}

export function ClientFormExtended({ client, onSuccess }: ClientFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Inițializare formular
  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name || "",
      email: client?.email || "",
      phone: client?.phone || "",
      address: client?.address || "",
      city: client?.city || "",
      county: client?.county || "",
      cif: client?.cif || "",
    },
  })

  // Trimitere formular
  const onSubmit = async (data: z.infer<typeof clientSchema>) => {
    setIsLoading(true)
    try {
      let result

      if (client) {
        // Actualizare client existent
        await updateClient(client.id, data)
        result = { ...client, ...data }
        toast({
          title: "Client actualizat",
          description: "Clientul a fost actualizat cu succes.",
        })
      } else {
        // Adăugare client nou
        result = await addClient(data)
        toast({
          title: "Client adăugat",
          description: "Clientul a fost adăugat cu succes.",
        })
        form.reset()
      }

      if (onSuccess) {
        onSuccess(result)
      }
    } catch (error) {
      console.error("Error submitting client form:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{client ? "Editare client" : "Adăugare client nou"}</CardTitle>
        <CardDescription>
          {client ? "Actualizați informațiile clientului" : "Completați informațiile pentru noul client"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nume</FormLabel>
                  <FormControl>
                    <Input placeholder="Nume client" {...field} />
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
                    <Input placeholder="CIF" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      <Input placeholder="Telefon" {...field} />
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
                  <FormLabel>Adresă</FormLabel>
                  <FormControl>
                    <Input placeholder="Adresă" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Oraș</FormLabel>
                    <FormControl>
                      <Input placeholder="Oraș" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="county"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Județ</FormLabel>
                    <FormControl>
                      <Input placeholder="Județ" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" type="button" onClick={() => form.reset()}>
              Resetare
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Se procesează..." : client ? "Actualizare" : "Adăugare"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
