"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Pencil, Trash2, Plus, User } from "lucide-react"
import type { ContactPerson } from "@/types/client"
import { toast } from "@/components/ui/use-toast"

interface ContactPersonsManagerProps {
  contactPersons: ContactPerson[]
  onAdd: (person: Omit<ContactPerson, "id">) => void
  onUpdate: (id: string, person: Partial<ContactPerson>) => void
  onDelete: (id: string) => void
}

export function ContactPersonsManager({ contactPersons, onAdd, onUpdate, onDelete }: ContactPersonsManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [currentPerson, setCurrentPerson] = useState<ContactPerson | null>(null)
  const [formData, setFormData] = useState<Omit<ContactPerson, "id">>({
    name: "",
    phone: "",
    email: "",
    position: "",
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handleAddPerson = () => {
    if (!formData.name || !formData.phone) {
      toast({
        title: "Eroare",
        description: "Numele și telefonul sunt obligatorii",
        variant: "destructive",
      })
      return
    }

    onAdd(formData)
    setFormData({
      name: "",
      phone: "",
      email: "",
      position: "",
    })
    setIsAddDialogOpen(false)
  }

  const handleEditPerson = () => {
    if (!currentPerson || !currentPerson.id) return
    if (!formData.name || !formData.phone) {
      toast({
        title: "Eroare",
        description: "Numele și telefonul sunt obligatorii",
        variant: "destructive",
      })
      return
    }

    onUpdate(currentPerson.id, formData)
    setIsEditDialogOpen(false)
  }

  const handleDeletePerson = (id: string) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți această persoană de contact?")) {
      onDelete(id)
    }
  }

  const openEditDialog = (person: ContactPerson) => {
    setCurrentPerson(person)
    setFormData({
      name: person.name,
      phone: person.phone,
      email: person.email || "",
      position: person.position || "",
    })
    setIsEditDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Persoane de contact</h3>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Adaugă persoană
        </Button>
      </div>

      {contactPersons.length === 0 ? (
        <div className="text-center p-4 border rounded-md bg-muted/50">
          <p className="text-muted-foreground">Nu există persoane de contact adăugate</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {contactPersons.map((person) => (
            <Card key={person.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  {person.name}
                  {person.position && <span className="ml-2 text-sm text-muted-foreground">({person.position})</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="space-y-1 text-sm">
                  <p>Telefon: {person.phone}</p>
                  {person.email && <p>Email: {person.email}</p>}
                </div>
              </CardContent>
              <CardFooter className="pt-0 flex justify-end gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEditDialog(person)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDeletePerson(person.id!)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog pentru adăugare persoană de contact */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă persoană de contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nume *</Label>
              <Input id="name" value={formData.name} onChange={handleInputChange} placeholder="Nume complet" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon *</Label>
              <Input id="phone" value={formData.phone} onChange={handleInputChange} placeholder="Număr de telefon" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={formData.email} onChange={handleInputChange} placeholder="Adresă de email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Funcție</Label>
              <Input id="position" value={formData.position} onChange={handleInputChange} placeholder="Funcție" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleAddPerson}>Adaugă</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru editare persoană de contact */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează persoană de contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nume *</Label>
              <Input id="name" value={formData.name} onChange={handleInputChange} placeholder="Nume complet" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon *</Label>
              <Input id="phone" value={formData.phone} onChange={handleInputChange} placeholder="Număr de telefon" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={formData.email} onChange={handleInputChange} placeholder="Adresă de email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Funcție</Label>
              <Input id="position" value={formData.position} onChange={handleInputChange} placeholder="Funcție" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleEditPerson}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
