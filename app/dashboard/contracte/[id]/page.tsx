"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  ArrowLeft, 
  Pencil, 
  Calendar, 
  MapPin, 
  Wrench,
  Building2,
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  Users,
  DollarSign
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getClienti, type Client } from "@/lib/firebase/firestore"
import { formatUiDate, toDateSafe } from "@/lib/utils/time-format"

interface Contract {
  id: string
  name: string
  number: string
  type?: string
  clientId?: string
  locationId?: string
  locationName?: string
  locationNames?: string[]
  equipmentIds?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: 'zile' | 'luni'
  recurrenceDayOfMonth?: number
  daysBeforeWork?: number
  pricing?: Record<string, number>
  lastAutoWorkGenerated?: string
  customFields?: Record<string, any>
  createdAt: any
  updatedAt?: any
}

export default function ContractDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const contractId = params.id as string

  const [contract, setContract] = useState<Contract | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchContractDetails = async () => {
      if (!contractId) return

      try {
        setLoading(true)
        setError(null)

        // Fetch contract
        const contractRef = doc(db, "contracts", contractId)
        const contractSnap = await getDoc(contractRef)

        if (!contractSnap.exists()) {
          setError("Contractul nu a fost găsit")
          setLoading(false)
          return
        }

        const contractData = {
          id: contractSnap.id,
          ...contractSnap.data()
        } as Contract

        setContract(contractData)

        // Fetch client if assigned
        if (contractData.clientId) {
          const clients = await getClienti()
          const foundClient = clients.find(c => c.id === contractData.clientId)
          if (foundClient) {
            setClient(foundClient)
          }
        }

        setLoading(false)
      } catch (error) {
        console.error("Eroare la încărcarea contractului:", error)
        setError("Nu s-a putut încărca contractul")
        setLoading(false)
      }
    }

    fetchContractDetails()
  }, [contractId])

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return formatUiDate(toDateSafe(date))
    } catch {
      return "N/A"
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii Contract" text="Se încarcă..." />
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă detaliile contractului...</span>
        </div>
      </DashboardShell>
    )
  }

  if (error || !contract) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Detalii Contract" text="Eroare" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Contractul nu a fost găsit"}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push("/dashboard/contracte")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Înapoi la contracte
        </Button>
      </DashboardShell>
    )
  }

  const equipmentCount = contract.equipmentIds?.length || 0
  const hasRecurrence = contract.recurrenceInterval && contract.recurrenceInterval > 0

  return (
    <DashboardShell>
      <DashboardHeader 
        heading={contract.name}
        text={`Contract ${contract.number}`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/contracte")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi
          </Button>
          <Button
            onClick={() => router.push(`/dashboard/contracte?edit=${contractId}`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Editează
          </Button>
        </div>
      </DashboardHeader>

      <div className="grid gap-6">
        {/* Informații generale */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informații Generale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Nume Contract</p>
                <p className="text-lg font-semibold">{contract.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Număr Contract</p>
                <p className="text-lg font-mono font-semibold">{contract.number}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Data Adăugării</p>
                <p className="text-base">{formatDate(contract.createdAt)}</p>
              </div>
              {contract.updatedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Ultima Actualizare</p>
                  <p className="text-base">{formatDate(contract.updatedAt)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Client și Locații */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Client și Locații
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Client Asignat</p>
              {client ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-base py-1 px-3">
                    {client.nume}
                  </Badge>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => router.push(`/dashboard/clienti/${client.id}`)}
                  >
                    Vezi detalii client
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                  Neasignat
                </Badge>
              )}
            </div>

            {contract.locationNames && contract.locationNames.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">
                  <MapPin className="inline h-4 w-4 mr-1" />
                  Locații ({contract.locationNames.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {contract.locationNames.map((loc, index) => (
                    <Badge key={index} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {loc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {equipmentCount > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">
                  <Wrench className="inline h-4 w-4 mr-1" />
                  Echipamente
                </p>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-base py-1 px-3">
                  {equipmentCount} {equipmentCount === 1 ? "echipament" : "echipamente"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recurență */}
        {hasRecurrence && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recurența Reviziilor
              </CardTitle>
              <CardDescription>
                Configurarea automată a reviziilor programate
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contract.startDate && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Data de început (Prima revizie)</p>
                    <p className="text-base font-semibold">{formatDate(contract.startDate)}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-500">Interval Recurență</p>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-base py-1 px-3">
                    {contract.recurrenceInterval} {contract.recurrenceUnit}
                    {contract.recurrenceUnit === 'luni' && contract.recurrenceDayOfMonth && ` (ziua ${contract.recurrenceDayOfMonth})`}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Zile înainte de revizie</p>
                  <p className="text-base">{contract.daysBeforeWork || 10} zile</p>
                </div>
                {contract.lastAutoWorkGenerated && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">Ultima generare automată</p>
                    <p className="text-base">{formatDate(contract.lastAutoWorkGenerated)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prețuri */}
        {contract.pricing && Object.keys(contract.pricing).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Prețuri Contract
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(contract.pricing).map(([name, value]) => (
                  <div key={name} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                    <span className="font-medium text-gray-700">{name}</span>
                    <span className="font-mono font-semibold text-lg">{Number(value).toFixed(2)} LEI</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Câmpuri custom */}
        {contract.customFields && Object.keys(contract.customFields).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Informații Suplimentare</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(contract.customFields).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-500 capitalize">{key.replace(/_/g, ' ')}</p>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 mt-1">
                      {String(value)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}

