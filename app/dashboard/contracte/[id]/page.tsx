"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { doc, getDoc, getDocs, collection, query, where, orderBy, limit, Timestamp } from "firebase/firestore"
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

const SCHEDULE_COLLECTION = "contractRevisionSchedule"

type UpcomingGeneration = {
  generateAt: Date
  scheduledAt: Date
  locationName?: string
}

const addMonths = (date: Date, months: number) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

const addDays = (date: Date, days: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const computeFallbackUpcoming = (contract: Contract, count = 3): UpcomingGeneration[] => {
  if (!contract.startDate || !contract.recurrenceInterval || !contract.recurrenceUnit) return []
  const interval = Math.max(1, contract.recurrenceInterval)
  const lead = contract.daysBeforeWork ?? 0
  const now = new Date()
  let occ = new Date(contract.startDate)
  if (Number.isNaN(occ.getTime())) return []

  const upcoming: UpcomingGeneration[] = []
  let safety = 0
  while (upcoming.length < count && safety < 500) {
    if (occ >= now) {
      const scheduledAt = new Date(occ)
      const generateAt = addDays(scheduledAt, -lead)
      upcoming.push({ generateAt, scheduledAt })
    }
    occ = contract.recurrenceUnit === "luni" ? addMonths(occ, interval) : addDays(occ, interval)
    safety += 1
  }
  return upcoming
}

export default function ContractDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const contractId = params.id as string

  const [contract, setContract] = useState<Contract | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [upcomingGenerations, setUpcomingGenerations] = useState<UpcomingGeneration[]>([])
  const [loadingGenerations, setLoadingGenerations] = useState(false)

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

  useEffect(() => {
    const fetchUpcomingGenerations = async () => {
      if (!contractId || !contract) return
      try {
        setLoadingGenerations(true)
        const nowTs = Timestamp.fromDate(new Date())
        const q = query(
          collection(db, SCHEDULE_COLLECTION),
          where("contractId", "==", contractId),
          where("generateAt", ">=", nowTs),
          orderBy("generateAt", "asc"),
          limit(3)
        )
        const snap = await getDocs(q)
        const items: UpcomingGeneration[] = snap.docs
          .map((doc) => doc.data())
          .map((data: any) => {
            const generateAt: Date | undefined = data.generateAt?.toDate?.()
            const scheduledAt: Date | undefined = data.scheduledAt?.toDate?.()
            if (!generateAt || !scheduledAt) return null
            return {
              generateAt,
              scheduledAt,
              locationName: data.locationName || data.locationId || undefined,
            }
          })
          .filter((v): v is UpcomingGeneration => Boolean(v))
        if (items.length > 0) {
          setUpcomingGenerations(items)
        } else {
          setUpcomingGenerations(computeFallbackUpcoming(contract))
        }
      } catch (err) {
        console.error("Eroare la încărcarea următoarelor generări:", err)
      } finally {
        setLoadingGenerations(false)
      }
    }

    fetchUpcomingGenerations()
  }, [contractId, contract])

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
  const equipmentLabels = (() => {
    if (!Array.isArray(contract.equipmentIds) || contract.equipmentIds.length === 0) return []
    const ids = contract.equipmentIds.map((id) => String(id))
    const fromClient = client?.locatii?.flatMap((loc) => Array.isArray(loc?.echipamente) ? loc.echipamente : []) || []
    const byIdOrCode = (eid: string) =>
      fromClient.find((eq) => String(eq?.id || "") === eid || String(eq?.cod || "") === eid)
    return ids.map((eid) => {
      const eq = byIdOrCode(eid)
      return eq?.nume || eq?.cod || eid
    })
  })()
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* Card mare stânga - Informații generale și Client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalii Contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Informații generale */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500">Nume Contract</p>
                <p className="text-base font-semibold mt-1">{contract.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Număr Contract</p>
                <p className="text-base font-mono font-semibold mt-1">{contract.number}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Data Adăugării</p>
                <p className="text-sm mt-1">{formatDate(contract.createdAt)}</p>
              </div>
              {contract.updatedAt && (
                <div>
                  <p className="text-xs font-medium text-gray-500">Ultima Actualizare</p>
                  <p className="text-sm mt-1">{formatDate(contract.updatedAt)}</p>
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Client și Locații */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Client și Locații
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Client Asignat</p>
                  {client ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-sm py-1 px-3">
                        {client.nume}
                      </Badge>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-sm"
                        onClick={() => router.push(`/dashboard/clienti/${client.id}`)}
                      >
                        Vezi detalii →
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
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      <MapPin className="inline h-3 w-3 mr-1" />
                      Locații ({contract.locationNames.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {contract.locationNames.map((loc, index) => (
                        <Badge key={index} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-sm">
                          {loc}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {equipmentCount > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      <Wrench className="inline h-3 w-3 mr-1" />
                      Echipamente
                    </p>
                    <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-sm py-1 px-3">
                      {equipmentCount} {equipmentCount === 1 ? "echipament" : "echipamente"}
                    </Badge>
                      {equipmentLabels.map((label, index) => (
                        <Badge key={`${label}-${index}`} variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 text-sm">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card mare dreapta - Recurență, Prețuri și Câmpuri custom */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Configurare Contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Recurență */}
            {hasRecurrence && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Recurența Reviziilor</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {contract.startDate && (
                      <div>
                        <p className="text-xs font-medium text-gray-500">Prima revizie</p>
                        <p className="text-sm font-semibold mt-1">{formatDate(contract.startDate)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-500">Interval</p>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-sm py-1 px-3 mt-1">
                        {contract.recurrenceInterval} {contract.recurrenceUnit}
                        {contract.recurrenceUnit === 'luni' && contract.recurrenceDayOfMonth && ` (ziua ${contract.recurrenceDayOfMonth})`}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Zile înainte</p>
                      <p className="text-sm mt-1">{contract.daysBeforeWork || 10} zile</p>
                    </div>
                    {contract.lastAutoWorkGenerated && (
                      <div>
                        <p className="text-xs font-medium text-gray-500">Ultima generare</p>
                        <p className="text-sm mt-1">{formatDate(contract.lastAutoWorkGenerated)}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium text-gray-500 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Următoarele 3 date de generare
                    </p>
                    {loadingGenerations ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Se încarcă...
                      </div>
                    ) : upcomingGenerations.length > 0 ? (
                      <div className="space-y-2">
                        {upcomingGenerations.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between rounded-md border px-3 py-2 bg-gray-50">
                            <div>
                              <p className="text-sm font-semibold">{formatDate(item.generateAt)}</p>
                              <p className="text-xs text-gray-500">
                                Generează revizie pentru {formatDate(item.scheduledAt)}
                              </p>
                            </div>
                            {item.locationName && (
                              <Badge variant="outline" className="text-xs">
                                {item.locationName}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Nu există generări programate în perioada următoare.</p>
                    )}
                  </div>
                </div>
                {(contract.pricing && Object.keys(contract.pricing).length > 0) || (contract.customFields && Object.keys(contract.customFields).length > 0) ? (
                  <Separator className="my-4" />
                ) : null}
              </>
            )}

            {/* Prețuri */}
            {contract.pricing && Object.keys(contract.pricing).length > 0 && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Prețuri Contract
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(contract.pricing).map(([name, value]) => (
                      <div key={name} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                        <span className="text-sm font-medium text-gray-700">{name}</span>
                        <span className="font-mono font-semibold text-base">{Number(value).toFixed(2)} LEI</span>
                      </div>
                    ))}
                  </div>
                </div>
                {contract.customFields && Object.keys(contract.customFields).length > 0 && (
                  <Separator className="my-4" />
                )}
              </>
            )}

            {/* Câmpuri custom */}
            {contract.customFields && Object.keys(contract.customFields).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Informații Suplimentare</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(contract.customFields).map(([key, value]) => (
                    <div key={key}>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 mt-1 text-sm">
                        {String(value)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Placeholder dacă nu există recurență, prețuri sau câmpuri custom */}
            {!hasRecurrence && (!contract.pricing || Object.keys(contract.pricing).length === 0) && (!contract.customFields || Object.keys(contract.customFields).length === 0) && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">Nu există configurații suplimentare pentru acest contract.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}

