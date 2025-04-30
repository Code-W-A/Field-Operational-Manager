"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { addClientLocation, updateClientLocation, deleteClientLocation } from "@/lib/firebase/clients"
import type { Client, ClientLocation } from "@/types/client"
import { toast } from "@/components/ui/use-toast"
import { ContactPersonsManager } from "./contact-persons-manager"
import { EquipmentManager } from "./equipment-manager"
import { Trash2, Plus, Edit } from "lucide-react"

// Schema de validare pentru locație
const locationSchema = z.object({
  name: z.string().min(2, { message: "Numele trebuie să aibă cel puțin 2 caractere" }),
  address: z.string().min(5, { message: "Adresa trebuie să aibă cel puțin 5 caractere" }),
  city: z.string().min(2, { message: "Orașul trebuie să aibă cel puțin 2 caractere" }),
  county: z.string().min(2, { message: "Județul trebuie să aibă cel puțin 2 caractere" }),
})

type ClientLocationsManagerProps = {
  client: Client
  onUpdate?: (client: Client) => void
}

export function ClientLocationsManager({ client, onUpdate }: ClientLocationsManagerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<ClientLocation | null>(null)
  const [activeTab, setActiveTab] = useState("locations")

  // Inițializare formular pentru adăugare/editare locație
  const form = useForm<z.infer<typeof locationSchema>>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      county: "",
    },
  })

  // Resetare formular și închidere dialog
  const resetAndCloseDialog = () => {
    form.reset()
    setIsAddDialogOpen(false)
    setIsEditDialogOpen(false)
    setSelectedLocation(null)
  }

  // Deschidere dialog pentru editare locație
  const handleEditLocation = (location: ClientLocation) => {
    setSelectedLocation(location)
    form.reset({
      name: location.name,
      address: location.address,
      city: location.city,
      county: location.county,
    })
    setIsEditDialogOpen(true)
  }

  // Adăugare locație nouă
  const handleAddLocation = async (data: z.infer<typeof locationSchema>) => {
    setIsLoading(true)
    try {
      const newLocation = await addClientLocation(client.id, data)

      // Actualizare client local
      const updatedClient = {
        ...client,
        locations: [...client.locations, newLocation],
      }

      if (onUpdate) {
        onUpdate(updatedClient)
      }

      toast({
        title: "Locație adăugată",
        description: "Locația a fost adăugată cu succes.",
      })

      resetAndCloseDialog()
    } catch (error) {
      console.error("Error adding location:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Actualizare locație
  const handleUpdateLocation = async (data: z.infer<typeof locationSchema>) => {
    if (!selectedLocation) return

    setIsLoading(true)
    try {
      await updateClientLocation(client.id, selectedLocation.id, data)

      // Actualizare client local
      const updatedLocations = client.locations.map((location) => {
        if (location.id === selectedLocation.id) {
          return { ...location, ...data }
        }
        return location
      })

      const updatedClient = {
        ...client,
        locations: updatedLocations,
      }

      if (onUpdate) {
        onUpdate(updatedClient)
      }

      toast({
        title: "Locație actualizată",
        description: "Locația a fost actualizată cu succes.",
      })

      resetAndCloseDialog()
    } catch (error) {
      console.error("Error updating location:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Ștergere locație
  const handleDeleteLocation = async (locationId: string) => {
    if (!confirm("Sunteți sigur că doriți să ștergeți această locație?")) return

    setIsLoading(true)
    try {
      await deleteClientLocation(client.id, locationId)

      // Actualizare client local
      const updatedLocations = client.locations.filter((location) => location.id !== locationId)

      const updatedClient = {
        ...client,
        locations: updatedLocations,
      }

      if (onUpdate) {
        onUpdate(updatedClient)
      }

      toast({
        title: "Locație ștearsă",
        description: "Locația a fost ștearsă cu succes.",
      })
    } catch (error) {
      console.error("Error deleting location:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Actualizare client după modificarea persoanelor de contact
  const handleContactPersonsUpdate = (locationId: string, updatedLocation: ClientLocation) => {
    const updatedLocations = client.locations.map((location) => {
      if (location.id === locationId) {
        return updatedLocation
      }
      return location
    })

    const updatedClient = {
      ...client,
      locations: updatedLocations,
    }

    if (onUpdate) {
      onUpdate(updatedClient)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestionare locații și persoane de contact</CardTitle>
        <CardDescription>
          Adăugați, editați sau ștergeți locațiile clientului și persoanele de contact asociate
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="locations">Locații</TabsTrigger>
            <TabsTrigger value="contacts">Persoane de contact</TabsTrigger>
            <TabsTrigger value="equipment">Echipamente</TabsTrigger>
          </TabsList>

          <TabsContent value="locations">
            <div className="flex justify-end mb-4">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Adaugă locație
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adaugă locație nouă</DialogTitle>
                    <DialogDescription>Completați informațiile pentru noua locație a clientului.</DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleAddLocation)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nume locație</FormLabel>
                            <FormControl>
                              <Input placeholder="Nume locație" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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

                      <div className="grid grid-cols-2 gap-4">
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

                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={resetAndCloseDialog}>
                          Anulare
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                          {isLoading ? "Se procesează..." : "Adaugă"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {client.locations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nu există locații adăugate pentru acest client.
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <Accordion type="single" collapsible className="w-full">
                  {client.locations.map((location) => (
                    <AccordionItem key={location.id} value={location.id}>
                      <AccordionTrigger className="hover:bg-muted px-4 rounded-md">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span>{location.name}</span>
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleEditLocation(location)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteLocation(location.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-2">
                        <div className="space-y-2">
                          <div>
                            <span className="font-medium">Adresă:</span> {location.address}
                          </div>
                          <div>
                            <span className="font-medium">Oraș:</span> {location.city}
                          </div>
                          <div>
                            <span className="font-medium">Județ:</span> {location.county}
                          </div>
                          <div>
                            <span className="font-medium">Persoane de contact:</span>{" "}
                            {location.contactPersons.length > 0
                              ? `${location.contactPersons.length} persoane`
                              : "Nicio persoană de contact"}
                          </div>
                          <div>
                            <span className="font-medium">Echipamente:</span>{" "}
                            {location.equipment.length > 0
                              ? `${location.equipment.length} echipamente`
                              : "Niciun echipament"}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="contacts">
            {client.locations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Adăugați mai întâi locații pentru a putea adăuga persoane de contact.
              </div>
            ) : (
              <Tabs defaultValue={client.locations[0].id} className="w-full">
                <TabsList className="mb-4 flex flex-wrap">
                  {client.locations.map((location) => (
                    <TabsTrigger key={location.id} value={location.id}>
                      {location.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {client.locations.map((location) => (
                  <TabsContent key={location.id} value={location.id}>
                    <ContactPersonsManager
                      clientId={client.id}
                      location={location}
                      onUpdate={(updatedLocation) => handleContactPersonsUpdate(location.id, updatedLocation)}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>

          <TabsContent value="equipment">
            {client.locations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Adăugați mai întâi locații pentru a putea adăuga echipamente.
              </div>
            ) : (
              <Tabs defaultValue={client.locations[0].id} className="w-full">
                <TabsList className="mb-4 flex flex-wrap">
                  {client.locations.map((location) => (
                    <TabsTrigger key={location.id} value={location.id}>
                      {location.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {client.locations.map((location) => (
                  <TabsContent key={location.id} value={location.id}>
                    <EquipmentManager clientId={client.id} locationId={location.id} />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Dialog pentru editare locație */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editare locație</DialogTitle>
            <DialogDescription>Actualizați informațiile pentru locația selectată.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdateLocation)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nume locație</FormLabel>
                    <FormControl>
                      <Input placeholder="Nume locație" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              <div className="grid grid-cols-2 gap-4">
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

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetAndCloseDialog}>
                  Anulare
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Se procesează..." : "Actualizare"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
