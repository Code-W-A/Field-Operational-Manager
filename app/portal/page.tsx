"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { ProtectedRoute } from "@/components/protected-route"
import { getLucrari } from "@/lib/firebase/firestore"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { UserNav } from "@/components/user-nav"

export default function ClientPortalPage() {
  const { userData } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [locationFilter, setLocationFilter] = useState<string>("all")

  useEffect(() => {
    const load = async () => {
      try {
        const all = await getLucrari()
        const allowedLocations = userData?.allowedLocationNames || []
        const clientName = userData?.clientId // we match by clientId through clientInfo if available
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

  const visible = useMemo(() => {
    return items.filter((w) => {
      if (statusFilter !== "all" && (w.statusLucrare || "").toLowerCase() !== statusFilter) return false
      if (locationFilter !== "all" && w.locatie !== locationFilter) return false
      if (search && !(`${w.client} ${w.locatie} ${w.tipLucrare}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
  }, [items, statusFilter, locationFilter, search])

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Input placeholder="Caută client/locație/tip" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Locație" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate locațiile</SelectItem>
            {(userData?.allowedLocationNames || []).map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate statusurile</SelectItem>
            <SelectItem value="programat">Programat</SelectItem>
            <SelectItem value="în lucru">În lucru</SelectItem>
            <SelectItem value="finalizat">Finalizat</SelectItem>
            <SelectItem value="arhivată">Arhivată</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <div>Se încarcă...</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((w) => (
            <Card key={w.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = `/portal/${w.id}`}>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{w.client}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {w.locatie}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {w.tipLucrare}
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
          {!visible.length && <div className="text-sm text-muted-foreground">Nu există lucrări disponibile.</div>}
        </div>
      )}
      </div>
    </div>
  )

  return <ProtectedRoute allowedRoles={["client"]}>{content}</ProtectedRoute>
}


