"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getEquipmentByCode } from "@/lib/firebase/equipment"
import { getClientById } from "@/lib/firebase/clients"
import type { Equipment } from "@/types/equipment"
import type { Client, ClientLocation } from "@/types/client"
import { toast } from "@/components/ui/use-toast"
import { ArrowLeft, Wrench, Calendar, Info, MapPin } from "lucide-react"
import Link from "next/link"

export default function EquipmentPage() {
  const { code } = useParams()
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [location, setLocation] = useState<ClientLocation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadEquipment = async () => {
      setIsLoading(true)
      setError(null)

      try {
        if (!code || typeof code !== "string") {
          throw new Error("Cod echipament invalid")
        }

        const equipmentData = await getEquipmentByCode(code)

        if (!equipmentData) {
          throw new Error("Echipamentul nu a fost găsit")
        }

        setEquipment(equipmentData)

        // Încărcare client și locație
        if (equipmentData.clientId) {
          const clientData = await getClientById(equipmentData.clientId)

          if (clientData) {
            setClient(clientData)

            const locationData = clientData.locations.find((loc) => loc.id === equipmentData.locationId)
            if (locationData) {
              setLocation(locationData)
            }
          }
        }
      } catch (error) {
        console.error("Error loading equipment:", error)
        setError(error instanceof Error ? error.message : "A apărut o eroare la încărcarea echipamentului")
        toast({
          title: "Eroare",
          description: error instanceof Error ? error.message : "A apărut o eroare la încărcarea echipamentului",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadEquipment()
  }, [code])

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

  if (error || !equipment) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Eroare</CardTitle>
            <CardDescription>Nu s-a putut încărca echipamentul</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error || "Echipamentul nu a fost găsit"}</p>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Înapoi la dashboard
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{equipment.name}</CardTitle>
              <CardDescription>Cod: {equipment.code}</CardDescription>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-sm ${
                equipment.status === "active"
                  ? "bg-green-100 text-green-800"
                  : equipment.status === "inactive"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {equipment.status === "active" ? "Activ" : equipment.status === "inactive" ? "Inactiv" : "În mentenanță"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-2">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <h3 className="font-medium">Informații echipament</h3>
                  <p className="text-sm text-muted-foreground">Model: {equipment.model}</p>
                  <p className="text-sm text-muted-foreground">Serie: {equipment.serialNumber}</p>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <h3 className="font-medium">Date importante</h3>
                  <p className="text-sm text-muted-foreground">
                    Instalat: {new Date(equipment.installationDate).toLocaleDateString("ro-RO")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ultima mentenanță: {new Date(equipment.lastMaintenanceDate).toLocaleDateString("ro-RO")}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start space-x-2">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <h3 className="font-medium">Locație</h3>
                  {client && location ? (
                    <>
                      <p className="text-sm font-medium">{client.name}</p>
                      <p className="text-sm text-muted-foreground">{location.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {location.address}, {location.city}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Informații indisponibile</p>
                  )}
                </div>
              </div>

              {equipment.notes && (
                <div className="flex items-start space-x-2">
                  <Wrench className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h3 className="font-medium">Note tehnice</h3>
                    <p className="text-sm text-muted-foreground">{equipment.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Înapoi la dashboard
            </Link>
          </Button>

          {client && (
            <Button asChild>
              <Link href={`/dashboard/clienti/${client.id}`}>Vezi detalii client</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
