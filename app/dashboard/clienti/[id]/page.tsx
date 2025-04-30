"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { getClientById } from "@/lib/firebase/clients"
import type { Client } from "@/types/client"
import { toast } from "@/components/ui/use-toast"
import { ClientFormExtended } from "@/components/client-form-extended"
import { ClientLocationsManager } from "@/components/client-locations-manager"
import { ArrowLeft, Building, MapPin, Phone, Mail, User, FileText } from "lucide-react"
import { useClientLucrari } from "@/hooks/use-client-lucrari"
import { DataTable } from "@/components/data-table/data-table"
import { workOrderColumns } from "@/app/dashboard/lucrari/columns"
import Link from "next/link"

export default function ClientDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("details")
  const { workOrders, isLoading: isLoadingWorkOrders } = useClientLucrari(id as string)

  useEffect(() => {
    const loadClient = async () => {
      setIsLoading(true)
      try {
        if (!id || typeof id !== "string") {
          throw new Error("ID client invalid")
        }

        const clientData = await getClientById(id)

        if (!clientData) {
          throw new Error("Clientul nu a fost găsit")
        }

        setClient(clientData)
      } catch (error) {
        console.error("Error loading client:", error)
        toast({
          title: "Eroare",
          description: error instanceof Error ? error.message : "A apărut o eroare la încărcarea clientului",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadClient()
  }, [id])

  const handleClientUpdate = (updatedClient: Client) => {
    setClient(updatedClient)
    toast({
      title: "Client actualizat",
      description: "Informațiile clientului au fost actualizate cu succes.",
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

  if (!client) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Eroare</CardTitle>
            <CardDescription>Nu s-a putut încărca clientul</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">Clientul nu a fost găsit</p>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/dashboard/clienti">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Înapoi la lista de clienți
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
          <h1 className="text-3xl font-bold">{client.name}</h1>
          <p className="text-muted-foreground">CIF: {client.cif || "Nedefinit"}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/clienti">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi la lista de clienți
          </Link>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Detalii</TabsTrigger>
          <TabsTrigger value="locations">Locații și persoane de contact</TabsTrigger>
          <TabsTrigger value="workOrders">Lucrări</TabsTrigger>
          <TabsTrigger value="edit">Editare</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Informații client</CardTitle>
              <CardDescription>Detalii despre client și datele de contact</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Informații companie</h3>
                      <p className="text-sm text-muted-foreground">Nume: {client.name}</p>
                      <p className="text-sm text-muted-foreground">CIF: {client.cif || "Nedefinit"}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Adresă sediu principal</h3>
                      <p className="text-sm text-muted-foreground">{client.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {client.city}, {client.county}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-2">
                    <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Telefon</h3>
                      <p className="text-sm text-muted-foreground">{client.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Email</h3>
                      <p className="text-sm text-muted-foreground">{client.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium">Locații și persoane de contact</h3>
                      <p className="text-sm text-muted-foreground">{client.locations.length} locații</p>
                      <p className="text-sm text-muted-foreground">
                        {client.locations.reduce((total, location) => total + location.contactPersons.length, 0)}{" "}
                        persoane de contact
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2 pt-4 border-t">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <h3 className="font-medium">Lucrări</h3>
                  <p className="text-sm text-muted-foreground">
                    {isLoadingWorkOrders ? "Se încarcă..." : `${workOrders.length} lucrări înregistrate`}
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => setActiveTab("edit")}>Editare client</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <ClientLocationsManager client={client} onUpdate={handleClientUpdate} />
        </TabsContent>

        <TabsContent value="workOrders">
          <Card>
            <CardHeader>
              <CardTitle>Lucrări</CardTitle>
              <CardDescription>Toate lucrările asociate acestui client</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingWorkOrders ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">Se încarcă lucrările...</p>
                </div>
              ) : workOrders.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-muted-foreground">Nu există lucrări înregistrate pentru acest client.</p>
                  <Button className="mt-4" asChild>
                    <Link href="/dashboard/lucrari/new">Adaugă lucrare nouă</Link>
                  </Button>
                </div>
              ) : (
                <DataTable columns={workOrderColumns} data={workOrders} />
              )}
            </CardContent>
            <CardFooter>
              <Button asChild>
                <Link href="/dashboard/lucrari/new">Adaugă lucrare nouă</Link>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="edit">
          <ClientFormExtended client={client} onSuccess={handleClientUpdate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
