"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/protected-route"
import { getLucrari, getClienti } from "@/lib/firebase/firestore"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, Table as TableIcon, Calendar, MapPin } from "lucide-react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserNav } from "@/components/user-nav"
import { useTablePersistence } from "@/hooks/use-table-persistence"

export default function ClientPortalPage() {
  const { userData } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [activeOnly, setActiveOnly] = useState<boolean>(false)
  const [search, setSearch] = useState("")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [clientFilter, setClientFilter] = useState<string>("all")
  const [clients, setClients] = useState<any[]>([])
  const [sortField, setSortField] = useState<string>("dataInterventie")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards")

  // Persist filters/search for client portal
  const { loadSettings, saveFilters, saveSearchText } = useTablePersistence("portal")

  // Load saved filters/search on mount
  useEffect(() => {
    const saved = loadSettings()
    if (saved?.searchText) setSearch(saved.searchText)
    const getFilterVal = (id: string) => {
      const list = Array.isArray(saved?.activeFilters) ? saved.activeFilters : []
      return list.find((f: any) => f?.id === id)?.value
    }
    const s = getFilterVal("status"); if (typeof s === "string") setStatusFilter(s)
    const a = getFilterVal("activeOnly"); if (typeof a === "boolean") setActiveOnly(a)
    const l = getFilterVal("location"); if (typeof l === "string") setLocationFilter(l)
    const c = getFilterVal("client"); if (typeof c === "string") setClientFilter(c)
    const sf = getFilterVal("sortField"); if (typeof sf === "string") setSortField(sf)
    const sd = getFilterVal("sortDirection"); if (sd === "asc" || sd === "desc") setSortDirection(sd)
    const vm = getFilterVal("viewMode"); if (vm === "cards" || vm === "table") setViewMode(vm)
  }, [loadSettings])

  // Save filters whenever they change
  useEffect(() => {
    saveFilters([
      { id: "status", value: statusFilter },
      { id: "activeOnly", value: activeOnly },
      { id: "location", value: locationFilter },
      { id: "client", value: clientFilter },
      { id: "sortField", value: sortField },
      { id: "sortDirection", value: sortDirection },
      { id: "viewMode", value: viewMode },
    ])
  }, [statusFilter, activeOnly, locationFilter, clientFilter, sortField, sortDirection, viewMode, saveFilters])

  // Save search text whenever it changes
  useEffect(() => {
    saveSearchText(search)
  }, [search, saveSearchText])

  useEffect(() => {
    const load = async () => {
      try {
        const [all, allClients] = await Promise.all([
          getLucrari(),
          getClienti(),
        ])
        setClients(allClients)
        // Derivăm lista de locații permise din toate intrările clientAccess
        const allowedLocations: string[] = ([] as string[]).concat(
          ...((userData as any)?.clientAccess || []).map((e: any) => e?.locationNames || [])
        )
        const filtered = all.filter((w: any) => {
          // Backward compatibility: match by client name string and location name string
          const byLocation = !allowedLocations?.length || allowedLocations.includes(w.locatie)
          return byLocation
        })
        setItems(filtered)
      } finally {
        setLoading(false)
      }
    }
    if (userData?.role === "client") {
      load()
    }
  }, [userData])

  const isActiveStatus = (status?: string) => {
    const s = (status || "").toLowerCase()
    const actives = [
      "listată",
      "listata",
      "atribuită",
      "atribuita",
      "în lucru",
      "in lucru",
      "în așteptare",
      "in asteptare",
      "amânată",
      "amanata",
      "programat",
      "programată",
      "programata",
    ]
    return actives.some((v) => s.includes(v))
  }

  const visible = useMemo(() => {
    return items.filter((w) => {
      if (statusFilter !== "all" && (w.statusLucrare || "").toLowerCase() !== statusFilter) return false
      if (clientFilter !== "all") {
        const c = clients.find((cx: any) => cx.id === clientFilter)
        const byClientId = (w as any)?.clientInfo?.id && (w as any).clientInfo.id === clientFilter
        const byClientName = c?.nume && String(w.client || "").toLowerCase().trim() === String(c.nume).toLowerCase().trim()
        if (!byClientId && !byClientName) return false
      }
      if (locationFilter !== "all" && w.locatie !== locationFilter) return false
      if (activeOnly && !isActiveStatus(w.statusLucrare)) return false
      if (search && !(`${w.client} ${w.locatie} ${w.tipLucrare}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
  }, [items, statusFilter, clientFilter, locationFilter, search, activeOnly, clients])

  const visibleSorted = useMemo(() => {
    const asDate = (v: any): number => {
      if (!v) return 0
      try {
        if (v?.toDate) return v.toDate().getTime()
        return new Date(v).getTime() || 0
      } catch { return 0 }
    }
    const list = [...visible]
    const mult = sortDirection === "asc" ? 1 : -1
    switch (sortField) {
      case "dataInterventie":
        return list.sort((a: any, b: any) => mult * (asDate(a.dataInterventie) - asDate(b.dataInterventie)))
      case "statusLucrare":
        return list.sort((a: any, b: any) => mult * String(a.statusLucrare||"").localeCompare(String(b.statusLucrare||""), "ro", { sensitivity: "base" }))
      case "client":
        return list.sort((a: any, b: any) => mult * String(a.client||"").localeCompare(String(b.client||""), "ro", { sensitivity: "base" }))
      case "locatie":
        return list.sort((a: any, b: any) => mult * String(a.locatie||"").localeCompare(String(b.locatie||""), "ro", { sensitivity: "base" }))
      case "tipLucrare":
        return list.sort((a: any, b: any) => mult * String(a.tipLucrare||"").localeCompare(String(b.tipLucrare||""), "ro", { sensitivity: "base" }))
      default:
        return list.sort((a: any, b: any) => mult * (asDate(a.dataInterventie) - asDate(b.dataInterventie)))
    }
  }, [visible, sortField, sortDirection])

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
  }

  const formatDate = (dateStr: any) => {
    if (!dateStr) return "-"
    try {
      const d = dateStr?.toDate ? dateStr.toDate() : new Date(dateStr)
      return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return String(dateStr)
    }
  }

  // Compute filter options for clients and their locations based on access
  const clientAccess: Array<{ clientId: string; locationNames: string[] }> = ((userData as any)?.clientAccess || [])
  const allowedClientIds = new Set(clientAccess.map((e) => e.clientId))
  const clientsForFilter = useMemo(() => {
    const list = clients.filter((c: any) => allowedClientIds.has(c.id))
    return list.sort((a: any, b: any) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" }))
  }, [clients, userData])

  const locationOptionsForSelected = useMemo(() => {
    if (clientFilter === "all") {
      const allLocs = new Set<string>()
      clientAccess.forEach((e) => (e.locationNames || []).forEach((n) => allLocs.add(n)))
      return Array.from(allLocs).sort((a, b) => (a || "").localeCompare(b || "", "ro", { sensitivity: "base" }))
    }
    const entry = clientAccess.find((e) => e.clientId === clientFilter)
    const list = entry?.locationNames || []
    return [...list].sort((a, b) => (a || "").localeCompare(b || "", "ro", { sensitivity: "base" }))
  }, [clientFilter, userData])

  const getStatusBadge = (status?: string) => {
    const s = (status || "").toLowerCase()
    if (s.includes("anulat")) {
      return { label: "Anulat", className: "bg-red-100 text-red-700" }
    }
    if (s.includes("finalizat") || s.includes("arhivat")) {
      return { label: "Finalizată", className: "bg-emerald-100 text-emerald-700" }
    }
    return { label: "Activ", className: "bg-blue-100 text-blue-700" }
  }

  const content = (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto max-w-7xl h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">FOM</span>
            <span className="text-sm text-muted-foreground">Portal Client</span>
          </div>
          <UserNav />
        </div>
      </div>

      <div className="p-4 mx-auto max-w-7xl">
        <h1 className="text-xl font-semibold mb-4">Lucrările mele</h1>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Input placeholder="Caută client/locație/tip" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toți clienții</SelectItem>
            {clientsForFilter.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.nume}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Locație" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate locațiile</SelectItem>
            {locationOptionsForSelected.map((n: string, idx: number) => (
              <SelectItem key={`${n}-${idx}`} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between sm:justify-end gap-3 px-2 py-2 border rounded">
          <span className="text-sm text-muted-foreground">Doar active</span>
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
        </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
          <span className="text-sm font-medium text-muted-foreground">Sortare:</span>
          <Select value={sortField} onValueChange={setSortField}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dataInterventie">Dată intervenție</SelectItem>
            <SelectItem value="statusLucrare">Status</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="locatie">Locație</SelectItem>
            <SelectItem value="tipLucrare">Tip lucrare</SelectItem>
          </SelectContent>
        </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSortDirection}
            className="gap-2"
          >
            {sortDirection === "asc" ? (
              <>
                <ArrowUp className="h-4 w-4" />
                Crescător
              </>
            ) : (
              <>
                <ArrowDown className="h-4 w-4" />
                Descrescător
              </>
            )}
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className="gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="gap-2"
            >
              <TableIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {visibleSorted.length} {visibleSorted.length === 1 ? "lucrare" : "lucrări"}
          </div>
        </div>
      </div>
      {loading ? (
        <div>Se încarcă...</div>
      ) : viewMode === "cards" ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSorted.map((w) => (
            <Card key={w.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = `/portal/${w.id}`}>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">{w.client}</h3>
                    {(() => { const b = getStatusBadge(w.statusLucrare); return (
                      <Badge className={b.className}>{b.label}</Badge>
                    )})()}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {w.locatie}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {w.tipLucrare}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {formatDate(w.dataInterventie)}
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex flex-wrap gap-2">
                    {w.raportSnapshot?.url && (
                      <Link 
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-100 transition-colors" 
                        href={w.raportSnapshot.url}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Raport
                      </Link>
                    )}
                    {w.facturaDocument?.url && (
                      <Link 
                        className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium hover:bg-green-100 transition-colors" 
                        href={w.facturaDocument.url}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Factură
                      </Link>
                    )}
                    {w.ofertaDocument?.url && (
                      <Link 
                        className="inline-flex items-center gap-1 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium hover:bg-purple-100 transition-colors" 
                        href={w.ofertaDocument.url}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Ofertă
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!visibleSorted.length && <div className="text-sm text-muted-foreground">Nu există lucrări disponibile.</div>}
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Locație</TableHead>
                <TableHead>Tip lucrare</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dată intervenție</TableHead>
                <TableHead>Documente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSorted.map((w) => {
                const b = getStatusBadge(w.statusLucrare)
                return (
                  <TableRow 
                    key={w.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => window.location.href = `/portal/${w.id}`}
                  >
                    <TableCell className="font-medium">{w.client}</TableCell>
                    <TableCell>{w.locatie}</TableCell>
                    <TableCell>{w.tipLucrare}</TableCell>
                    <TableCell>
                      <Badge className={b.className}>{b.label}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(w.dataInterventie)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {w.raportSnapshot?.url && (
                          <Link 
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium hover:bg-blue-100 transition-colors" 
                            href={w.raportSnapshot.url}
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Raport
                          </Link>
                        )}
                        {w.facturaDocument?.url && (
                          <Link 
                            className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium hover:bg-green-100 transition-colors" 
                            href={w.facturaDocument.url}
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Factură
                          </Link>
                        )}
                        {w.ofertaDocument?.url && (
                          <Link 
                            className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium hover:bg-purple-100 transition-colors" 
                            href={w.ofertaDocument.url}
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ofertă
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!visibleSorted.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Nu există lucrări disponibile.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      </div>
    </div>
  )

  return <ProtectedRoute allowedRoles={["client"]}>{content}</ProtectedRoute>
}


