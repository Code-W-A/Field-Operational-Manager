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
    <div className="p-4">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((w) => (
            <Card key={w.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{w.client}</span>
                  <Badge>{w.statusLucrare || "N/A"}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{w.locatie}</div>
                <div className="text-sm">{w.tipLucrare}</div>
                <div className="flex gap-3 pt-1">
                  {w.raportSnapshot?.url && (
                    <Link className="text-blue-600 underline text-sm" href={`/api/download?lucrareId=${w.id}&type=raport&url=${encodeURIComponent(w.raportSnapshot.url)}`}>Raport</Link>
                  )}
                  {w.facturaDocument?.url && (
                    <Link className="text-blue-600 underline text-sm" href={`/api/download?lucrareId=${w.id}&type=factura&url=${encodeURIComponent(w.facturaDocument.url)}`}>Factură</Link>
                  )}
                  {w.ofertaDocument?.url && (
                    <Link className="text-blue-600 underline text-sm" href={`/api/download?lucrareId=${w.id}&type=oferta&url=${encodeURIComponent(w.ofertaDocument.url)}`}>Ofertă</Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!visible.length && <div className="text-sm text-muted-foreground">Nu există lucrări disponibile.</div>}
        </div>
      )}
    </div>
  )

  return <ProtectedRoute allowedRoles={["client"]}>{content}</ProtectedRoute>
}


