"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CustomDatePicker } from "@/components/custom-date-picker"
import { TimeSelector } from "@/components/time-selector"
import { getAllClients, getClientById } from "@/lib/firebase/clients"
import { getEquipmentsByLocation } from "@/lib/firebase/equipment"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"
import type { Equipment } from "@/types/equipment"
import { toast } from "@/components/ui/use-toast"

// Schema de validare pentru lucrare
const workOrderSchema = z.object({
  title: z.string().min(2, { message: "Titlul trebuie să aibă cel puțin 2 caractere" }),
  description: z.string().min(5, { message: "Descrierea trebuie să aibă cel puțin 5 caractere" }),
  clientId: z.string().min(1, { message: "Selectați un client" }),
  locationId: z.string().min(1, { message: "Selectați o locație" }),
  contactPersonId: z.string().min(1, { message: "Selectați o persoană de contact" }),
  equipmentId: z.string().min(1, { message: "Selectați un echipament" }),
  date: z.date({ required_error: "Selectați o dată" }),
  time: z.string().min(1, { message: "Selectați o oră" }),
  priority: z.enum(["low", "medium", "high"], {
    required_error: "Selectați o prioritate",
  }),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"], {
    required_error: "Selectați un status",
  }),
  notes: z.string().optional(),
})

type LucrareFormExtendedProps = {
  onSubmit: (data: z.infer<typeof workOrderSchema>) => void
  defaultValues?: Partial<z.infer<typeof workOrderSchema>>
  isLoading?: boolean
}

export function LucrareFormExtended({ onSubmit, defaultValues, isLoading = false }: LucrareFormExtendedProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(false)

  // Inițializare formular
  const form = useForm<z.infer<typeof workOrderSchema>>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      title: defaultValues?.title || "",
      description: defaultValues?.description || "",
      clientId: defaultValues?.clientId || "",
      locationId: defaultValues?.locationId || "",
      contactPersonId: defaultValues?.contactPersonId || "",
      equipmentId: defaultValues?.equipmentId || "",
      date: defaultValues?.date || new Date(),
      time: defaultValues?.time || "09:00",
      priority: defaultValues?.priority || "medium",
      status: defaultValues?.status || "pending",
      notes: defaultValues?.notes || "",
    },
  })

  // Încărcare clienți
  useEffect(() => {
    const loadClients = async () => {
      setIsLoadingClients(true)
      try {
        const clientsData = await getAllClients()
        setClients(clientsData)

        // Dacă există un client selectat implicit, încarcă datele acestuia
        if (defaultValues?.clientId) {
          const client = clientsData.find((c) => c.id === defaultValues.clientId)
          if (client) {
            setSelectedClient(client)
            setLocations(client.locations)

            // Dacă există o locație selectată implicit, încarcă persoanele de contact și echipamentele
            if (defaultValues.locationId) {
              const location = client.locations.find((l) => l.id === defaultValues.locationId)
              if (location) {
                setContactPersons(location.contactPersons)

                // Încarcă echipamentele pentru locația selectată
                const equipmentData = await getEquipmentsByLocation(defaultValues.locationId)
                setEquipment(equipmentData)
              }
            }
          }
        }
      } catch (error) {
        console.error("Error loading clients:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca clienții.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingClients(false)
      }
    }

    loadClients()
  }, [defaultValues])

  // Handler pentru schimbarea clientului
  const handleClientChange = async (clientId: string) => {
    form.setValue("locationId", "")
    form.setValue("contactPersonId", "")
    form.setValue("equipmentId", "")

    setLocations([])
    setContactPersons([])
    setEquipment([])

    if (!clientId) {
      setSelectedClient(null)
      return
    }

    try {
      const client = await getClientById(clientId)
      if (client) {
        setSelectedClient(client)
        setLocations(client.locations)
      }
    } catch (error) {
      console.error("Error loading client:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca datele clientului.",
        variant: "destructive",
      })
    }
  }

  // Handler pentru schimbarea locației
  const handleLocationChange = async (locationId: string) => {
    form.setValue("contactPersonId", "")
    form.setValue("equipmentId", "")

    setContactPersons([])
    setEquipment([])

    if (!locationId || !selectedClient) return

    const location = selectedClient.locations.find((l) => l.id === locationId)
    if (location) {
      setContactPersons(location.contactPersons)

      try {
        const equipmentData = await getEquipmentsByLocation(locationId)
        setEquipment(equipmentData)
      } catch (error) {
        console.error("Error loading equipment:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca echipamentele.",
          variant: "destructive",
        })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{defaultValues ? "Editare lucrare" : "Adăugare lucrare nouă"}</CardTitle>
        <CardDescription>
          {defaultValues ? "Actualizați informațiile lucrării" : "Completați informațiile pentru noua lucrare"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titlu</FormLabel>
                  <FormControl>
                    <Input placeholder="Titlu lucrare" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descriere</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descriere lucrare" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value)
                      handleClientChange(value)
                    }}
                    defaultValue={field.value}
                    disabled={isLoadingClients}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectați un client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} {client.cif ? `(CIF: ${client.cif})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Locație</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value)
                      handleLocationChange(value)
                    }}
                    defaultValue={field.value}
                    disabled={!selectedClient || locations.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectați o locație" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} ({location.address}, {location.city})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contactPersonId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Persoană de contact</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={contactPersons.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectați o persoană de contact" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contactPersons.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name} ({person.position}) - {person.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="equipmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Echipament</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={equipment.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectați un echipament" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {equipment.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (Cod: {item.code}) - {item.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data</FormLabel>
                    <CustomDatePicker date={field.value} setDate={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ora</FormLabel>
                    <TimeSelector value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioritate</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selectați prioritatea" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Scăzută</SelectItem>
                        <SelectItem value="medium">Medie</SelectItem>
                        <SelectItem value="high">Ridicată</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selectați statusul" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">În așteptare</SelectItem>
                        <SelectItem value="in_progress">În progres</SelectItem>
                        <SelectItem value="completed">Finalizată</SelectItem>
                        <SelectItem value="cancelled">Anulată</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note adiționale</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Note adiționale" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" type="button" onClick={() => form.reset()}>
              Resetare
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Se procesează..." : defaultValues ? "Actualizare" : "Adăugare"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}
