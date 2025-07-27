"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { WorkNotificationsBell } from "@/components/work-notifications-bell"
import { ClipboardList, Users, Settings, FileText, BarChart, Loader2 } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { where, Timestamp } from "firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import type { Lucrare, Client, Log } from "@/lib/firebase/firestore"
import type { UserData } from "@/lib/firebase/auth"
import { WORK_STATUS } from "@/lib/utils/constants"
import { getCollectionCount } from "@/lib/firebase/firestore"

export default function Dashboard() {
  const router = useRouter()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"

  // Obținem datele din Firestore
  const { data: toateLucrarile, loading: loadingLucrari } = useFirebaseCollection<Lucrare>("lucrari")
  const { data: clienti, loading: loadingClienti } = useFirebaseCollection<Client>("clienti")
  const { data: utilizatori, loading: loadingUtilizatori } = useFirebaseCollection<UserData>("users")

  // Pentru loguri, obținem toate logurile și logurile de astăzi
  const { data: toateLogurile, loading: loadingToateLogurile } = useFirebaseCollection<Log>("logs")

  // Calculăm data de început a zilei curente
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data: loguriAstazi, loading: loadingLoguriAstazi } = useFirebaseCollection<Log>("logs", [
    where("timestamp", ">=", Timestamp.fromDate(startOfToday)),
  ])

  // Filtrăm lucrările în funcție de rolul utilizatorului
  const lucrari = useMemo(() => {
    if (role === "tehnician" && userData?.displayName) {
      // Tehnicienii văd doar lucrările la care sunt asignați și care sunt active
      return toateLucrarile.filter(
        (lucrare) =>
          lucrare.tehnicieni.includes(userData.displayName) &&
          (lucrare.statusLucrare.toLowerCase() === WORK_STATUS.WAITING.toLowerCase() ||
            lucrare.statusLucrare.toLowerCase() === WORK_STATUS.IN_PROGRESS.toLowerCase()),
      )
    }
    // Administratorii și dispecerii văd toate lucrările
    return toateLucrarile
  }, [toateLucrarile, role, userData?.displayName])

  // State pentru statistici
  const [stats, setStats] = useState({
    lucrariTotal: 0,
    lucrariAsteptare: 0,
    lucrariInCurs: 0,
    lucrariFinalizate: 0,
    clientiTotal: 0,
    clientiNoi: 0,
    utilizatoriTotal: 0,
    admini: 0,
    dispeceri: 0,
    tehnicieni: 0,
    loguriTotal: 0,
    loguriAstazi: 0,
    rapoarteGenerate: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    async function fetchCounts() {
      setLoadingStats(true)
      const [lucrariTotal, clientiTotal, utilizatoriTotal, loguriTotal] = await Promise.all([
        getCollectionCount("lucrari"),
        getCollectionCount("clienti"),
        getCollectionCount("users"),
        getCollectionCount("logs"),
      ])
      setStats((s) => ({
        ...s,
        lucrariTotal,
        clientiTotal,
        utilizatoriTotal,
        loguriTotal,
      }))
      setLoadingStats(false)
    }
    fetchCounts()
  }, [])

  // Calculăm statisticile când datele sunt încărcate
  useEffect(() => {
    if (!loadingLucrari && !loadingClienti && !loadingUtilizatori && !loadingToateLogurile && !loadingLoguriAstazi) {
      // Calculăm statisticile pentru lucrări
      const lucrariAsteptare = lucrari.filter(
        (l) => l.statusLucrare.toLowerCase() === WORK_STATUS.WAITING.toLowerCase(),
      ).length
      const lucrariInCurs = lucrari.filter(
        (l) => l.statusLucrare.toLowerCase() === WORK_STATUS.IN_PROGRESS.toLowerCase(),
      ).length
      const lucrariFinalizate = lucrari.filter(
        (l) => l.statusLucrare.toLowerCase() === WORK_STATUS.COMPLETED.toLowerCase(),
      ).length

      // Calculăm statisticile pentru utilizatori
      const admini = utilizatori.filter((u) => u.role === "admin").length
      const dispeceri = utilizatori.filter((u) => u.role === "dispecer").length
      const tehnicieni = utilizatori.filter((u) => u.role === "tehnician").length

      // Calculăm numărul de clienți noi (adăugați în ultima săptămână)
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      const clientiNoi = clienti.filter((client) => {
        if (!client.createdAt) return false
        const createdAtDate = client.createdAt.toDate ? client.createdAt.toDate() : new Date(client.createdAt)
        return createdAtDate > oneWeekAgo
      }).length

      // Calculăm numărul de rapoarte generate (lucrări finalizate)
      const rapoarteGenerate = lucrariFinalizate

      // Actualizăm statisticile
      setStats({
        lucrariTotal: lucrari.length,
        lucrariAsteptare,
        lucrariInCurs,
        lucrariFinalizate,
        clientiTotal: clienti.length,
        clientiNoi,
        utilizatoriTotal: utilizatori.length,
        admini,
        dispeceri,
        tehnicieni,
        loguriTotal: toateLogurile.length,
        loguriAstazi: loguriAstazi.length,
        rapoarteGenerate,
      })
    }
  }, [
    lucrari,
    clienti,
    utilizatori,
    toateLogurile,
    loguriAstazi,
    loadingLucrari,
    loadingClienti,
    loadingUtilizatori,
    loadingToateLogurile,
    loadingLoguriAstazi,
  ])

  // Verificăm dacă datele sunt încă în curs de încărcare
  const isLoading = loadingStats

  // Funcție pentru a obține lucrările recente pentru afișare în taburi
  const getLucrariRecente = () => {
    // Dacă utilizatorul este tehnician, filtrăm lucrările la care este alocat
    if (role === "tehnician" && userData?.displayName) {
      return [...lucrari]
        .filter((l) => l.tehnicieni.includes(userData.displayName!))
        .sort((a, b) => {
          const dateA = a.dataEmiterii.split(".").reverse().join("")
          const dateB = b.dataEmiterii.split(".").reverse().join("")
          return dateB.localeCompare(dateA)
        })
        .slice(0, 5)
    }

    // Pentru admin și dispecer, afișăm toate lucrările
    return [...lucrari]
      .sort((a, b) => {
        const dateA = a.dataEmiterii.split(".").reverse().join("")
        const dateB = b.dataEmiterii.split(".").reverse().join("")
        return dateB.localeCompare(dateA)
      })
      .slice(0, 5)
  }

  // Modificăm și funcțiile pentru lucrările în așteptare și în curs
  const getLucrariAsteptare = () => {
    // Filtrăm lucrările în așteptare
    const filteredLucrari =
      role === "tehnician" && userData?.displayName
        ? lucrari.filter(
            (l) =>
              l.statusLucrare.toLowerCase() === WORK_STATUS.WAITING.toLowerCase() &&
              l.tehnicieni.includes(userData.displayName!),
          )
        : lucrari.filter((l) => l.statusLucrare.toLowerCase() === WORK_STATUS.WAITING.toLowerCase())

    return filteredLucrari.slice(0, 5)
  }

  const getLucrariInCurs = () => {
    // Filtrăm lucrările în curs
    const filteredLucrari =
      role === "tehnician" && userData?.displayName
        ? lucrari.filter(
            (l) =>
              l.statusLucrare.toLowerCase() === WORK_STATUS.IN_PROGRESS.toLowerCase() &&
              l.tehnicieni.includes(userData.displayName!),
          )
        : lucrari.filter((l) => l.statusLucrare.toLowerCase() === WORK_STATUS.IN_PROGRESS.toLowerCase())

    return filteredLucrari.slice(0, 5)
  }

  return (
    <DashboardShell>
      <DashboardHeader 
        heading="Dashboard" 
        text="Bine ați venit în sistemul de management al lucrărilor"
      />

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă datele...</span>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="cursor-pointer" onClick={() => router.push("/dashboard/lucrari")}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lucrări</CardTitle>
                <ClipboardList className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.lucrariTotal}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.lucrariAsteptare} în așteptare, {stats.lucrariInCurs} în curs
                  {role !== "tehnician" && `, ${stats.lucrariFinalizate} finalizate`}
                </p>
              </CardContent>
            </Card>

            {role !== "tehnician" && (
              <Card className="cursor-pointer" onClick={() => router.push("/dashboard/clienti")}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Clienți</CardTitle>
                  <Users className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.clientiTotal}</div>
                  <p className="text-xs text-muted-foreground">+{stats.clientiNoi} în ultima săptămână</p>
                </CardContent>
              </Card>
            )}

            {role === "admin" && (
              <Card className="cursor-pointer" onClick={() => router.push("/dashboard/utilizatori")}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Utilizatori</CardTitle>
                  <Settings className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.utilizatoriTotal}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.admini} administratori, {stats.dispeceri} dispeceri, {stats.tehnicieni} tehnicieni
                  </p>
                </CardContent>
              </Card>
            )}

            {role === "admin" && (
              <Card className="cursor-pointer" onClick={() => router.push("/dashboard/loguri")}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Loguri</CardTitle>
                  <FileText className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.loguriTotal}</div>
                  <p className="text-xs text-muted-foreground">+{stats.loguriAstazi} astăzi</p>
                </CardContent>
              </Card>
            )}

            {role !== "tehnician" && (
              <Card className="cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rapoarte</CardTitle>
                  <BarChart className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.rapoarteGenerate}</div>
                  <p className="text-xs text-muted-foreground">Rapoarte generate luna aceasta</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Tabs defaultValue="recent" className="mt-6">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="recent" className="flex-1 sm:flex-none">
                Lucrări Recente
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 sm:flex-none">
                În Așteptare
              </TabsTrigger>
              <TabsTrigger value="progress" className="flex-1 sm:flex-none">
                În Curs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="recent" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lucrări Recente</CardTitle>
                  <CardDescription>Ultimele 5 lucrări adăugate în sistem</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getLucrariRecente().map((lucrare) => (
                      <div key={lucrare.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{lucrare.tipLucrare}</p>
                          <p className="text-sm text-gray-500">Client: {lucrare.client}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${
                              lucrare.statusLucrare.toLowerCase() === "în așteptare"
                                ? "bg-yellow-500"
                                : lucrare.statusLucrare.toLowerCase() === "în curs"
                                  ? "bg-blue-500"
                                  : "bg-green-500"
                            }`}
                          ></div>
                          <span className="text-sm">{lucrare.statusLucrare}</span>
                        </div>
                      </div>
                    ))}
                    {getLucrariRecente().length === 0 && (
                      <p className="text-center text-gray-500 py-4">Nu există lucrări recente.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="pending" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lucrări În Așteptare</CardTitle>
                  <CardDescription>Lucrări care necesită atenție</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getLucrariAsteptare().map((lucrare) => (
                      <div key={lucrare.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{lucrare.tipLucrare}</p>
                          <p className="text-sm text-gray-500">Client: {lucrare.client}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                          <span className="text-sm">În așteptare</span>
                        </div>
                      </div>
                    ))}
                    {getLucrariAsteptare().length === 0 && (
                      <p className="text-center text-gray-500 py-4">Nu există lucrări în așteptare.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="progress" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lucrări În Curs</CardTitle>
                  <CardDescription>Lucrări în desfășurare</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {getLucrariInCurs().map((lucrare) => (
                      <div key={lucrare.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{lucrare.tipLucrare}</p>
                          <p className="text-sm text-gray-500">Client: {lucrare.client}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                          <span className="text-sm">În curs</span>
                        </div>
                      </div>
                    ))}
                    {getLucrariInCurs().length === 0 && (
                      <p className="text-center text-gray-500 py-4">Nu există lucrări în curs.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </DashboardShell>
  )
}
