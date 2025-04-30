"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { db } from "@/lib/firebase/firebase"
import { doc, getDoc } from "firebase/firestore"
import { getClientById } from "@/lib/firebase/clients"
import { getEquipmentById } from "@/lib/firebase/equipment"
import type { Client, ClientLocation, ContactPerson } from "@/types/client"
import type { Equipment } from "@/types/equipment"
import { toast } from "@/components/ui/use-toast"
import { TehniciInterventionForm } from "@/components/tehnician-intervention-form"
import { EquipmentVerification } from "@/components/equipment-verification"
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  MapPin,
  PenToolIcon as Tool,
  FileText,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils/date-formatter"

interface WorkOrder {
  id: string
  title: string
  description: string
  clientId: string
  locationId: string
  contactPersonId: string
  equipmentId: string
  date: string
  time: string
  priority: "low" | "medium" | "high"
  status: "pending" | "in_progress" | "completed" | "cancelled"
  notes?: string
  technician?: string
  technicianNotes?: string
  equipmentVerified?: boolean
  createdAt: string
  updatedAt: string
}

export default function WorkOrderDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [location, setLocation] = useState<ClientLocation | null>(null)
  const [contactPerson, setContactPerson] = useState<ContactPerson | null>(null)
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("details")

  useEffect(() => {
    const loadWorkOrder = async () => {
      setIsLoading(true)
      try {
        if (!id || typeof id !== "string") {
          throw new Error("ID lucrare invalid")
        }

        const workOrderRef = doc(db, "workOrders", id)
        const workOrderSnap = await getDoc(workOrderRef)

        if (!workOrderSnap.exists()) {
          throw new Error("Lucrarea nu a fost găsită")
        }

        const workOrderData = { id: workOrderSnap.id, ...workOrderSnap.data() } as WorkOrder
        setWorkOrder(workOrderData)

        // Încărcare client, locație, persoană de contact și echipament
        if (workOrderData.clientId) {
          const clientData = await getClientById(workOrderData.clientId)

          if (clientData) {
            setClient(clientData)

            const locationData = clientData.locations.find((loc) => loc.id === workOrderData.locationId)
            if (locationData) {
              setLocation(locationData)

              const contactPersonData = locationData.contactPersons.find(
                (person) => person.id === workOrderData.contactPersonId,
              )
              if (contactPersonData) {
                setContactPerson(contactPersonData)
              }
            }
          }
        }

        if (workOrderData.equipmentId) {
          const equipmentData = await getEquipmentById(workOrderData.equipmentId)
          if (equipmentData) {
            setEquipment(equipmentData)
          }
        }
      } catch (error) {
        console.error("Error loading work order:", error)
        toast({
          title: "Eroare",
          description: error instanceof Error ? error.message : "A apărut o eroare la încărcarea lucrării",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkOrder()
  }, [id])

  const handleEquipmentVerification = (verifiedEquipment: Equipment) => {
    // Actualizare status verificare echipament
    setWorkOrder((prev) => {
      if (!prev) return null
      return {
        ...prev,
        equipmentVerified: true,
      }
    })

    toast({
      title: "Echipament verificat",
      description: "Echipamentul a fost verificat cu succes.",
    })
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!workOrder) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Eroare</CardTitle>
            <CardDescription>Nu s-a putut încărca lucrarea</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">Lucrarea nu a fost găsită</p>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/dashboard/lucrari">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Înapoi la lista de lucrări
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{workOrder.title}</h1>
            <Badge
              variant={
                workOrder.status === "completed"
                  ? "default"
                  : workOrder.status === "in_progress"
                    ? "secondary"
                    : workOrder.status === "cancelled"
                      ? "destructive"
                      : "outline"
              }
            >
              {workOrder.status === "pending"
                ? "În așteptare"
                : workOrder.status === "in_progress"
                  ? "În progres"
                  : workOrder.status === "completed"
                    ? "Finalizată"
                    : "Anulată"}
            </Badge>
            <Badge
              variant={
                workOrder.priority === "high"
                  ? "destructive"
                  : workOrder.priority === "medium"
                    ? "secondary"
                    : "outline"
              }
            >
              {workOrder.priority === "high"
                ? "Prioritate ridicată"
                : workOrder.priority === "medium"
                  ? "Prioritate medie"
                  : "Prioritate scăzută"}
            </Badge>
          </div>
          <p className="text-muted-foreground">Creată la: {formatDate(workOrder.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/lucrari">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Înapoi la lista de lucrări
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/lucrari/${id}/edit`}>Editare</Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Detalii</TabsTrigger>
          <TabsTrigger value="equipment">Echipament</TabsTrigger>
          <TabsTrigger value="intervention">Intervenție</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Informații lucrare</CardTitle>
              <CardDescription>Detalii despre lucrare și client</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Data și ora</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(workOrder.date)}</p>
                      <p className="text-sm text-muted-foreground">Ora: {workOrder.time}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Client</h3>
                      {client ? (
                        <p className="text-sm text-muted-foreground">
                          {client.name} {client.cif ? `(CIF: ${client.cif})` : ""}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Client necunoscut</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Locație</h3>
                      {location ? (
                        <>
                          <p className="text-sm text-muted-foreground">{location.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {location.address}, {location.city}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Locație necunoscută</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Persoană de contact</h3>
                      {contactPerson ? (
                        <>
                          <p className="text-sm text-muted-foreground">{contactPerson.name}</p>
                          <p className="text-sm text-muted-foreground">{contactPerson.position}</p>
                          <p className="text-sm text-muted-foreground">{contactPerson.phone}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Persoană de contact necunoscută</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Tool className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Echipament</h3>
                      {equipment ? (
                        <>
                          <p className="text-sm text-muted-foreground">{equipment.name}</p>
                          <p className="text-sm text-muted-foreground">Cod: {equipment.code}</p>
                          <p className="text-sm text-muted-foreground">Model: {equipment.model}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Echipament necunoscut</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Status verificare</h3>
                      {workOrder.equipmentVerified ? (
                        <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                          <p className="text-sm text-green-600">Echipament verificat</p>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mr-1" />
                          <p className="text-sm text-yellow-600">Echipament neverificat</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-start space-x-2">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h3 className="font-medium">Descriere</h3>
                    <p className="text-sm text-muted-foreground">{workOrder.description}</p>
                  </div>
                </div>
              </div>

              {workOrder.notes && (
                <div className="pt-4 border-t">
                  <div className="flex items-start space-x-2">
                    <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Note adiționale</h3>
                      <p className="text-sm text-muted-foreground">{workOrder.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipment">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Detalii echipament</CardTitle>
                <CardDescription>Informații despre echipamentul asociat lucrării</CardDescription>
              </CardHeader>
              <CardContent>
                {equipment ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{equipment.name}</h3>
                      <div
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
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Cod</p>
                        <p className="text-sm text-muted-foreground">{equipment.code}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Model</p>
                        <p className="text-sm text-muted-foreground">{equipment.model}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Serie</p>
                        <p className="text-sm text-muted-foreground">{equipment.serialNumber}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Data instalării</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(equipment.installationDate).toLocaleDateString("ro-RO")}
                        </p>
                      </div>
                    </div>

                    {equipment.notes && (
                      <div>
                        <p className="text-sm font-medium">Note tehnice</p>
                        <p className="text-sm text-muted-foreground">{equipment.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-muted-foreground">Nu există informații despre echipament.</p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                {equipment && (
                  <Button asChild>
                    <Link href={`/equipment/${equipment.code}`} target="_blank">
                      Vezi
                    </Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
            {equipment && <EquipmentVerification equipment={equipment} onVerification={handleEquipmentVerification} />}
          </div>
        </TabsContent>

        <TabsContent value="intervention">
          <Card>
            <CardHeader>
              <CardTitle>Intervenție tehnică</CardTitle>
              <CardDescription>Înregistrează detaliile intervenției tehnice</CardDescription>
            </CardHeader>
            <CardContent>
              <TehniciInterventionForm workOrderId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
