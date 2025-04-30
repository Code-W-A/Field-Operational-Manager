"use client"

import { useState, useEffect } from "react"
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
import {
  addEquipment,
  updateEquipment,
  deleteEquipment,
  getEquipmentsByLocation,
  getEquipmentStats,
} from "@/lib/firebase/equipment"
import type { Equipment } from "@/types/equipment"
import { toast } from "@/components/ui/use-toast"
import { Trash2, Plus, Edit, QrCode, BarChart } from "lucide-react"
import Image from "next/image"

// Schema de validare pentru echipament
const equipmentSchema = z.object({
  name: z.string().min(2, { message: "Numele trebuie să aibă cel puțin 2 caractere" }),
  model: z.string().min(2, { message: "Modelul trebuie să aibă cel puțin 2 caractere" }),
  serialNumber: z.string().min(2, { message: "Numărul de serie trebuie să aibă cel puțin 2 caractere" }),
  installationDate: z.string().min(2, { message: "Data instalării este obligatorie" }),
  status: z.enum(["active", "inactive", "maintenance"], {
    required_error: "Statusul este obligatoriu",
  }),
  notes: z.string().optional(),
})

type EquipmentManagerProps = {
  clientId: string
  locationId: string
}

export function EquipmentManager({ clientId, locationId }: EquipmentManagerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false)
  const [isStatsDialogOpen, setIsStatsDialogOpen] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [equipmentStats, setEquipmentStats] = useState<{
    totalInterventions: number
    interventionDates: string[]
  } | null>(null)
  const [statsYear, setStatsYear] = useState<number>(new Date().getFullYear())

  // Inițializare formular pentru adăugare/editare echipament
  const form = useForm<z.infer<typeof equipmentSchema>>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: {
      name: "",
      model: "",
      serialNumber: "",
      installationDate: new Date().toISOString().split("T")[0],
      status: "active",
      notes: "",
    },
  })

  // Încărcare echipamente pentru locația curentă
  useEffect(() => {
    const loadEquipment = async () => {
      try {
        const equipment = await getEquipmentsByLocation(locationId)
        setEquipmentList(equipment)
      } catch (error) {
        console.error("Error loading equipment:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca echipamentele.",
          variant: "destructive",
        })
      }
    }

    loadEquipment()
  }, [locationId])

  // Resetare formular și închidere dialog
  const resetAndCloseDialog = () => {
    form.reset()
    setIsAddDialogOpen(false)
    setIsEditDialogOpen(false)
    setIsQrDialogOpen(false)
    setIsStatsDialogOpen(false)
    setSelectedEquipment(null)
    setEquipmentStats(null)
  }

  // Deschidere dialog pentru editare echipament
  const handleEditEquipment = (equipment: Equipment) => {
    setSelectedEquipment(equipment)
    form.reset({
      name: equipment.name,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      installationDate: equipment.installationDate.split("T")[0],
      status: equipment.status,
      notes: equipment.notes,
    })
    setIsEditDialogOpen(true)
  }

  // Deschidere dialog pentru afișare cod QR
  const handleShowQrCode = (equipment: Equipment) => {
    setSelectedEquipment(equipment)
    setIsQrDialogOpen(true)
  }

  // Deschidere dialog pentru afișare statistici
  const handleShowStats = async (equipment: Equipment) => {
    setSelectedEquipment(equipment)
    setIsStatsDialogOpen(true)

    try {
      const stats = await getEquipmentStats(equipment.id, statsYear)
      setEquipmentStats(stats)
    } catch (error) {
      console.error("Error loading equipment stats:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca statisticile echipamentului.",
        variant: "destructive",
      })
    }
  }

  // Adăugare echipament nou
  const handleAddEquipment = async (data: z.infer<typeof equipmentSchema>) => {
    setIsLoading(true)
    try {
      const newEquipment = await addEquipment({
        ...data,
        clientId,
        locationId,
        lastMaintenanceDate: data.installationDate,
      })

      setEquipmentList([...equipmentList, newEquipment])

      toast({
        title: "Echipament adăugat",
        description: "Echipamentul a fost adăugat cu succes.",
      })

      resetAndCloseDialog()
    } catch (error) {
      console.error("Error adding equipment:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Actualizare echipament
  const handleUpdateEquipment = async (data: z.infer<typeof equipmentSchema>) => {
    if (!selectedEquipment) return

    setIsLoading(true)
    try {
      await updateEquipment(selectedEquipment.id, data)

      // Actualizare listă locală
      const updatedList = equipmentList.map((equipment) => {
        if (equipment.id === selectedEquipment.id) {
          return { ...equipment, ...data }
        }
        return equipment
      })

      setEquipmentList(updatedList)

      toast({
        title: "Echipament actualizat",
        description: "Echipamentul a fost actualizat cu succes.",
      })

      resetAndCloseDialog()
    } catch (error) {
      console.error("Error updating equipment:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Ștergere echipament
  const handleDeleteEquipment = async (equipmentId: string) => {
    if (!confirm("Sunteți sigur că doriți să ștergeți acest echipament?")) return

    setIsLoading(true)
    try {
      await deleteEquipment(equipmentId)

      // Actualizare listă locală
      const updatedList = equipmentList.filter((equipment) => equipment.id !== equipmentId)
      setEquipmentList(updatedList)

      toast({
        title: "Echipament șters",
        description: "Echipamentul a fost șters cu succes.",
      })
    } catch (error) {
      console.error("Error deleting equipment:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Actualizare an pentru statistici
  const handleYearChange = async (year: number) => {
    if (!selectedEquipment) return

    setStatsYear(year)

    try {
      const stats = await getEquipmentStats(selectedEquipment.id, year)
      setEquipmentStats(stats)
    } catch (error) {
      console.error("Error loading equipment stats:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca statisticile echipamentului.",
        variant: "destructive",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestionare echipamente</CardTitle>
        <CardDescription>Adăugați, editați sau ștergeți echipamentele pentru această locație</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-4">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Adaugă echipament
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adaugă echipament nou</DialogTitle>
                <DialogDescription>Completați informațiile pentru noul echipament.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddEquipment)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nume echipament</FormLabel>
                        <FormControl>
                          <Input placeholder="Nume echipament" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <FormControl>
                            <Input placeholder="Model" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="serialNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Număr serie</FormLabel>
                          <FormControl>
                            <Input placeholder="Număr serie" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="installationDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data instalării</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
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
                          <FormControl>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              {...field}
                            >
                              <option value="active">Activ</option>
                              <option value="inactive">Inactiv</option>
                              <option value="maintenance">În mentenanță</option>
                            </select>
                          </FormControl>
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
                        <FormLabel>Note</FormLabel>
                        <FormControl>
                          <Input placeholder="Note adiționale" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

        {equipmentList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nu există echipamente adăugate pentru această locație.
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cod</TableHead>
                  <TableHead>Nume</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Număr serie</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentList.map((equipment) => (
                  <TableRow key={equipment.id}>
                    <TableCell>{equipment.code}</TableCell>
                    <TableCell>{equipment.name}</TableCell>
                    <TableCell>{equipment.model}</TableCell>
                    <TableCell>{equipment.serialNumber}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          equipment.status === "active"
                            ? "bg-green-100 text-green-800"
                            : equipment.status === "inactive"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {equipment.status === "active"
                          ? "Activ"
                          : equipment.status === "inactive"
                            ? "Inactiv"
                            : "În mentenanță"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handleShowQrCode(equipment)}>
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleShowStats(equipment)}>
                          <BarChart className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditEquipment(equipment)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteEquipment(equipment.id)}>
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

      {/* Dialog pentru editare echipament */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editare echipament</DialogTitle>
            <DialogDescription>Actualizați informațiile pentru echipamentul selectat.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdateEquipment)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nume echipament</FormLabel>
                    <FormControl>
                      <Input placeholder="Nume echipament" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <FormControl>
                        <Input placeholder="Model" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serialNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Număr serie</FormLabel>
                      <FormControl>
                        <Input placeholder="Număr serie" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="installationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data instalării</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          {...field}
                        >
                          <option value="active">Activ</option>
                          <option value="inactive">Inactiv</option>
                          <option value="maintenance">În mentenanță</option>
                        </select>
                      </FormControl>
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
                    <FormLabel>Note</FormLabel>
                    <FormControl>
                      <Input placeholder="Note adiționale" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

      {/* Dialog pentru afișare cod QR */}
      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cod QR pentru echipament</DialogTitle>
            <DialogDescription>Scanați acest cod QR pentru a accesa informațiile echipamentului.</DialogDescription>
          </DialogHeader>

          {selectedEquipment && (
            <div className="flex flex-col items-center justify-center py-4">
              <div className="mb-4 text-center">
                <h3 className="text-lg font-semibold">{selectedEquipment.name}</h3>
                <p className="text-sm text-muted-foreground">Cod: {selectedEquipment.code}</p>
              </div>

              <div className="border p-4 rounded-md bg-white">
                <Image
                  src={selectedEquipment.qrCode || "/placeholder.svg"}
                  alt={`QR Code pentru ${selectedEquipment.name}`}
                  width={200}
                  height={200}
                />
              </div>

              <p className="mt-4 text-sm text-center text-muted-foreground">
                Acest cod QR poate fi scanat de tehnician pentru a verifica echipamentul.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={resetAndCloseDialog}>Închide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru afișare statistici */}
      <Dialog open={isStatsDialogOpen} onOpenChange={setIsStatsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Statistici echipament</DialogTitle>
            <DialogDescription>Vizualizați statisticile intervențiilor pentru acest echipament.</DialogDescription>
          </DialogHeader>

          {selectedEquipment && (
            <div className="py-4">
              <div className="mb-6 text-center">
                <h3 className="text-lg font-semibold">{selectedEquipment.name}</h3>
                <p className="text-sm text-muted-foreground">Cod: {selectedEquipment.code}</p>
              </div>

              <div className="mb-4 flex justify-center space-x-2">
                <Button
                  variant={statsYear === new Date().getFullYear() - 1 ? "default" : "outline"}
                  onClick={() => handleYearChange(new Date().getFullYear() - 1)}
                >
                  {new Date().getFullYear() - 1}
                </Button>
                <Button
                  variant={statsYear === new Date().getFullYear() ? "default" : "outline"}
                  onClick={() => handleYearChange(new Date().getFullYear())}
                >
                  {new Date().getFullYear()}
                </Button>
              </div>

              {equipmentStats ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Total intervenții</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-4xl font-bold">{equipmentStats.totalInterventions}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Ultima intervenție</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-lg">
                          {equipmentStats.interventionDates.length > 0
                            ? new Date(
                                equipmentStats.interventionDates[equipmentStats.interventionDates.length - 1],
                              ).toLocaleDateString("ro-RO")
                            : "Nicio intervenție"}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Istoric intervenții în {statsYear}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {equipmentStats.interventionDates.length > 0 ? (
                        <ScrollArea className="h-[200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nr.</TableHead>
                                <TableHead>Data</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {equipmentStats.interventionDates.map((date, index) => (
                                <TableRow key={index}>
                                  <TableCell>{index + 1}</TableCell>
                                  <TableCell>{new Date(date).toLocaleDateString("ro-RO")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          Nu există intervenții înregistrate pentru anul {statsYear}.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Se încarcă statisticile...</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={resetAndCloseDialog}>Închide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
