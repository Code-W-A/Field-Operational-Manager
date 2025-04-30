"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { addContactPerson, updateContactPerson, deleteContactPerson } from "@/lib/firebase/clients"
import type { ClientLocation, ContactPerson } from "@/types/client"
import { toast } from "@/components/ui/use-toast"
import { Trash2, Plus, Edit } from "lucide-react"

// Schema de validare pentru persoana de contact
const contactPersonSchema = z.object({
  name: z.string().min(2, { message: "Numele trebuie să aibă cel puțin 2 caractere" }),
  phone: z.string().min(10, { message: "Numărul de telefon trebuie să aibă cel puțin 10 caractere" }),
  email: z.string().email({ message: "Adresa de email trebuie să fie validă" }),
  position: z.string().min(2, { message: "Funcția trebuie să aibă cel puțin 2 caractere" }),
})

type ContactPersonsManagerProps = {
  clientId: string
  location: ClientLocation
  onUpdate?: (updatedLocation: ClientLocation) => void
}

export function ContactPersonsManager({ clientId, location, onUpdate }: ContactPersonsManagerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<ContactPerson | null>(null)

  // Inițializare formular pentru adăugare/editare persoană de contact
  const form = useForm<z.infer<typeof contactPersonSchema>>({
    resolver: zodResolver(contactPersonSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      position: "",
    },
  })

  // Resetare formular și închidere dialog
  const resetAndCloseDialog = () => {
    form.reset()
    setIsAddDialogOpen(false)
    setIsEditDialogOpen(false)
    setSelectedPerson(null)
  }

  // Deschidere dialog pentru editare persoană de contact
  const handleEditPerson = (person: ContactPerson) => {
    setSelectedPerson(person)
    form.reset({
      name: person.name,
      phone: person.phone,
      email: person.email,
      position: person.position,
    })
    setIsEditDialogOpen(true)
  }

  // Adăugare persoană de contact nouă
  const handleAddPerson = async (data: z.infer<typeof contactPersonSchema>) => {
    setIsLoading(true)
    try {
      const newPerson = await addContactPerson(clientId, location.id, data)

      // Actualizare locație local
      const updatedLocation = {
        ...location,
        contactPersons: [...location.contactPersons, newPerson],
      }

      if (onUpdate) {
        onUpdate(updatedLocation)
      }

      toast({
        title: "Persoană de contact adăugată",
        description: "Persoana de contact a fost adăugată cu succes.",
      })

      resetAndCloseDialog()
    } catch (error) {
      console.error("Error adding contact person:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Actualizare persoană de contact
  const handleUpdatePerson = async (data: z.infer<typeof contactPersonSchema>) => {
    if (!selectedPerson) return

    setIsLoading(true)
    try {
      await updateContactPerson(clientId, location.id, selectedPerson.id, data)

      // Actualizare locație local
      const updatedContactPersons = location.contactPersons.map((person) => {
        if (person.id === selectedPerson.id) {
          return { ...person, ...data }
        }
        return person
      })

      const updatedLocation = {
        ...location,
        contactPersons: updatedContactPersons,
      }

      if (onUpdate) {
        onUpdate(updatedLocation)
      }

      toast({
        title: "Persoană de contact actualizată",
        description: "Persoana de contact a fost actualizată cu succes.",
      })

      resetAndCloseDialog()
    } catch (error) {
      console.error("Error updating contact person:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Ștergere persoană de contact
  const handleDeletePerson = async (personId: string) => {
    if (!confirm("Sunteți sigur că doriți să ștergeți această persoană de contact?")) return

    setIsLoading(true)
    try {
      await deleteContactPerson(clientId, location.id, personId)

      // Actualizare locație local
      const updatedContactPersons = location.contactPersons.filter((person) => person.id !== personId)

      const updatedLocation = {
        ...location,
        contactPersons: updatedContactPersons,
      }

      if (onUpdate) {
        onUpdate(updatedLocation)
      }

      toast({
        title: "Persoană de contact ștearsă",
        description: "Persoana de contact a fost ștearsă cu succes.",
      })
    } catch (error) {
      console.error("Error deleting contact person:", error)
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
        <CardTitle>Persoane de contact pentru {location.name}</CardTitle>
        <CardDescription>Adăugați, editați sau ștergeți persoanele de contact pentru această locație</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-4">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Adaugă persoană de contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adaugă persoană de contact nouă</DialogTitle>
                <DialogDescription>Completați informațiile pentru noua persoană de contact.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddPerson)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nume</FormLabel>
                        <FormControl>
                          <Input placeholder="Nume complet" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Funcție</FormLabel>
                        <FormControl>
                          <Input placeholder="Funcție" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
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

        {location.contactPersons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nu există persoane de contact adăugate pentru această locație.
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nume</TableHead>
                  <TableHead>Funcție</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {location.contactPersons.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>{person.name}</TableCell>
                    <TableCell>{person.position}</TableCell>
                    <TableCell>{person.phone}</TableCell>
                    <TableCell>{person.email}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEditPerson(person)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeletePerson(person.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>

      {/* Dialog pentru editare persoană de contact */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editare persoană de contact</DialogTitle>
            <DialogDescription>Actualizați informațiile pentru persoana de contact selectată.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdatePerson)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nume</FormLabel>
                    <FormControl>
                      <Input placeholder="Nume complet" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Funcție</FormLabel>
                    <FormControl>
                      <Input placeholder="Funcție" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
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
