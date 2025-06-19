"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { getClientById, deleteClient, type Client } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import type { Lucrare } from "@/lib/firebase/firestore"
import { orderBy } from "firebase/firestore"

// Importăm hook-ul useClientLucrari pentru a putea actualiza datele
import { useClientLucrari } from "@/hooks/use-client-lucrari"

// Funcție utilitar pentru a extrage CUI-ul indiferent de cum este salvat
const extractCUI = (client: any) => {
  return client?.cui || client?.cif || client?.CIF || client?.CUI || "N/A"
}

export default function ClientPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { userData } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Obținem lucrările pentru acest client
  const { data: toateLucrarile } = useFirebaseCollection<Lucrare>("lucrari", [orderBy("dataEmiterii", "desc")])
  const [lucrariClient, setLucrariClient] = useState<Lucrare[]>([])

  // Adăugăm hook-ul în componenta ClientPage
  const { refreshData } = useClientLucrari()

  useEffect(() => {
    const fetchClient = async () => {
      try {
        setLoading(true)
        const data = await getClientById(params.id)
        if (data) {
          console.log("DEBUG - Client data from database:", data)
          console.log("DEBUG - client.cui:", data.cui)
          console.log("DEBUG - client.cif:", (data as any).cif)
          setClient(data)
        } else {
          setError("Clientul nu a fost găsit")
        }
      } catch (err) {
        console.error("Eroare la încărcarea clientului:", err)
        setError("A apărut o eroare la încărcarea clientului")
      } finally {
        setLoading(false)
      }
    }

    fetchClient()
  }, [params.id])

  // Filtrăm lucrările pentru acest client
  useEffect(() => {
    if (client && toateLucrarile.length > 0) {
      const lucrari = toateLucrarile.filter((lucrare) => lucrare.client === client.nume)
      setLucrariClient(lucrari)
    }
  }, [client, toateLucrarile])

  // Modificăm funcția handleEdit pentru a reîmprospăta datele
  const handleEdit = () => {
    router.push(`/dashboard/clienti?edit=${params.id}`)
  }

  // Modificăm funcția handleDelete pentru a reîmprospăta datele
  const handleDelete = async () => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți acest client?")) {
      try {
        await deleteClient(params.id)
        refreshData() // Adăugăm apelul către refreshData
        router.push("/dashboard/clienti")
      } catch (err) {
        console.error("Eroare la ștergerea clientului:", err)
        alert("A apărut o eroare la ștergerea clientului.")
      }
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="absolute left-4" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-full text-center">
              <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700">Detalii Client</CardTitle>
              <CardDescription>Informații complete despre client</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{client?.nume}</h2>
              <p className="text-muted-foreground">{client?.adresa}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">
                Număr lucrări: <span className="font-bold">{lucrariClient.length}</span>
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-medium text-gray-500">Telefon Principal</h3>
              <p>{client?.telefon || "N/A"}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-500">Reprezentant Firmă</h3>
              <p>{client?.reprezentantFirma || "N/A"}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-500">Email</h3>
              <p>{client?.email || "N/A"}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-500">CUI/CIF</h3>
              <p>{(client as any)?.cif || "N/A"}</p>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-medium text-gray-500 mb-2">Lucrări recente</h3>
            {lucrariClient.length > 0 ? (
              <div className="space-y-2">
                {lucrariClient.slice(0, 5).map((lucrare) => (
                  <div key={lucrare.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{lucrare.tipLucrare}</p>
                      <p className="text-sm text-gray-500">Data: {lucrare.dataInterventie}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/lucrari/${lucrare.id}`)}>
                      Detalii
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Nu există lucrări pentru acest client.</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Înapoi
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={handleEdit}>
              <Pencil className="h-4 w-4" /> Editează
            </Button>
            {userData?.role === "admin" && (
              <Button variant="destructive" className="gap-2" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" /> Șterge
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
