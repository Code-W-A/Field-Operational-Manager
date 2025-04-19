"use client"

import { useState, useEffect } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Loader2, AlertCircle } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { Log } from "@/lib/firebase/firestore"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { orderBy, query, collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { DataTable } from "@/components/data-table/data-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Loguri() {
  const [activeTab, setActiveTab] = useState("tabel")
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [table, setTable] = useState<any>(null)
  const [globalFilter, setGlobalFilter] = useState("")
  const [filtersVisible, setFiltersVisible] = useState(false)

  // Detectăm dacă suntem pe un dispozitiv mobil
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Setăm automat vizualizarea cu carduri pe mobil
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

  // Încărcăm logurile din Firebase
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)

        const logsQuery = query(collection(db, "logs"), orderBy("timestamp", "desc"))
        const querySnapshot = await getDocs(logsQuery)

        const logsData: Log[] = []
        querySnapshot.forEach((doc) => {
          logsData.push({ id: doc.id, ...doc.data() } as Log)
        })

        setLogs(logsData)
        setError(null)
      } catch (err) {
        console.error("Eroare la încărcarea logurilor:", err)
        setError("A apărut o eroare la încărcarea logurilor.")
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [])

  const getTipColor = (tip: string) => {
    switch (tip.toLowerCase()) {
      case "informație":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200"
      case "avertisment":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
      case "eroare":
        return "bg-red-100 text-red-800 hover:bg-red-200"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString("ro-RO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch (err) {
      console.error("Eroare la formatarea datei:", err)
      return "N/A"
    }
  }

  // Definim coloanele pentru DataTable
  const columns = [
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      cell: ({ row }: any) => <span className="font-mono text-sm">{formatDate(row.original.timestamp)}</span>,
    },
    {
      accessorKey: "utilizator",
      header: "Utilizator",
    },
    {
      accessorKey: "actiune",
      header: "Acțiune",
    },
    {
      accessorKey: "detalii",
      header: "Detalii",
      cell: ({ row }: any) => <div className="max-w-[300px]">{row.original.detalii}</div>,
    },
    {
      accessorKey: "tip",
      header: "Tip",
      cell: ({ row }: any) => <Badge className={getTipColor(row.original.tip)}>{row.original.tip}</Badge>,
    },
    {
      accessorKey: "categorie",
      header: "Categorie",
    },
  ]

  // Definim opțiunile de filtrare pentru DataTable
  const filterableColumns = [
    {
      id: "tip",
      title: "Tip Log",
      options: [
        { label: "Informație", value: "informație" },
        { label: "Avertisment", value: "avertisment" },
        { label: "Eroare", value: "eroare" },
      ],
    },
    {
      id: "actiune",
      title: "Acțiune",
      options: [
        { label: "Adăugare", value: "Adăugare" },
        { label: "Actualizare", value: "Actualizare" },
        { label: "Ștergere", value: "Ștergere" },
        { label: "Autentificare", value: "Autentificare" },
      ],
    },
    {
      id: "categorie",
      title: "Categorie",
      options: [
        { label: "Date", value: "Date" },
        { label: "Autentificare", value: "Autentificare" },
        { label: "Sistem", value: "Sistem" },
        { label: "Fișiere", value: "Fișiere" },
      ],
    },
  ]

  // Adăugăm filtre avansate
  const advancedFilters = [
    {
      id: "utilizator",
      title: "Utilizator",
      type: "text",
    },
    {
      id: "detalii",
      title: "Detalii",
      type: "text",
    },
  ]

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Loguri Sistem"
        text="Monitorizați activitatea utilizatorilor și evenimentele sistemului"
      />

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[200px]">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tabel">Tabel</TabsTrigger>
                <TabsTrigger value="carduri">Carduri</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {!loading && !error && (
            <div className="flex flex-wrap gap-2">
              <DataTable.Filters
                columns={columns}
                data={logs}
                searchColumn="detalii"
                searchPlaceholder="Caută în loguri..."
                filterableColumns={filterableColumns}
                dateRangeColumn="timestamp"
                advancedFilters={advancedFilters}
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Se încarcă logurile...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : activeTab === "tabel" ? (
          <DataTable
            columns={columns}
            data={logs}
            searchColumn="detalii"
            searchPlaceholder="Caută în loguri..."
            filterableColumns={filterableColumns}
            dateRangeColumn="timestamp"
            advancedFilters={advancedFilters}
            defaultSort={{ id: "timestamp", desc: true }}
            showFilters={false}
            table={table}
            setTable={setTable}
          />
        ) : (
          <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-mono text-sm text-muted-foreground">{formatDate(log.timestamp)}</p>
                    </div>
                    <Badge className={getTipColor(log.tip)}>{log.tip}</Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium">{log.actiune}</h3>
                      <p className="text-sm mt-1 text-muted-foreground line-clamp-2" title={log.detalii}>
                        {log.detalii}
                      </p>
                    </div>

                    <div className="pt-2 border-t space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Utilizator:</span>
                        <span className="text-sm">{log.utilizator}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Categorie:</span>
                        <span className="text-sm">{log.categorie}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
