"use client"

import { useEffect, useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Check, ExternalLink, AlertTriangle } from "lucide-react"
import { ProtectedRoute } from "@/components/protected-route"

interface ScanIssueItem {
  id: string
  lucrareId: string
  status: string
  createdAt: string
  createdBy: string
  createdByEmail?: string
  context?: any
  lastScan?: any
  device?: any
}

export default function ScanIssuesAdminPage() {
  const [items, setItems] = useState<ScanIssueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const fetchItems = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/scan-issues", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Eroare la încărcare")
      setItems(data.items || [])
      setError(null)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const approve = async (id: string) => {
    try {
      setApprovingId(id)
      const res = await fetch("/api/scan-issues/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Eroare la aprobare")
      await fetchItems()
    } catch (e) {
      // best-effort – UI already shows error on reload
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardShell>
        <DashboardHeader
          heading="Solicitări problemă scanare"
          text="Admin poate aproba manual verificarea echipamentului în cazuri particulare."
        />

        {loading ? (
          <div className="flex items-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Se încarcă...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nu există solicitări în așteptare.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <Card key={it.id} className={it.status === "pending" ? "border-red-300" : ""}>
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>Lucrare #{it.lucrareId}</span>
                    <Badge variant={it.status === "pending" ? "destructive" : "default"}>{it.status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Creat de</span><span>{it.createdByEmail || it.createdBy}</span></div>
                  <div className="flex justify-between"><span>Cod așteptat</span><span>{it.context?.expectedEquipmentCode || '-'}</span></div>
                  <div className="flex justify-between"><span>Ultimul cod scanat</span><span>{it.lastScan?.raw || '-'}</span></div>
                  <div className="flex justify-between"><span>Încercări eșuate</span><span>{it.lastScan?.failedScanAttempts ?? 0}</span></div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" asChild>
                      <a href={`/dashboard/lucrari/${it.lucrareId}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" /> Vezi lucrarea
                      </a>
                    </Button>
                    {it.status === "pending" && (
                      <Button onClick={() => approve(it.id)} disabled={approvingId === it.id}>
                        {approvingId === it.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Se aprobă...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Aprobă verificarea
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="pt-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">Detalii debugging</summary>
                      <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-muted p-2 rounded">{JSON.stringify({ context: it.context, lastScan: it.lastScan, device: it.device }, null, 2)}</pre>
                    </details>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DashboardShell>
    </ProtectedRoute>
  )
}


