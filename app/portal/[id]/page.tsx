"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { db } from "@/lib/firebase/config"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UserNav } from "@/components/user-nav"
import { ArrowLeft, Calendar, MapPin, FileText, Download, CheckCircle, XCircle } from "lucide-react"
import Link from "next/link"

export default function PortalWorkDetail() {
  const params = useParams()
  const router = useRouter()
  const { userData } = useAuth()
  const [w, setW] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState("")
  const id = params?.id as string

  useEffect(() => {
    const load = async () => {
      const data = await getLucrareById(id)
      setW(data)
    }
    if (id) load()
  }, [id])

  const setStatus = async (accepted: boolean) => {
    try {
      setSaving(true)
      await updateLucrare(id, {
        // menținem statusOferta ca "OFERTAT"; folosim offerResponse pentru decizia finală
        offerResponse: {
          status: accepted ? "accept" : "reject",
          reason: reason || undefined,
          at: new Date().toISOString(),
        },
      } as any, undefined, undefined, true)
      
      // Log response in global logs (best-effort)
      try {
        await addDoc(collection(db, 'logs'), {
          timestamp: serverTimestamp(),
          utilizator: 'Client portal',
          utilizatorId: 'portal',
          actiune: 'Răspuns ofertă',
          detalii: `lucrare: ${id}; status: ${accepted ? 'accept' : 'reject'}; reason: ${reason || '-'}`,
          tip: 'Informație',
          categorie: 'Ofertă',
        })
      } catch {}

      // Best-effort: email admins/dispeceri despre răspunsul clientului
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const subject = `Răspuns ofertă (${accepted ? 'ACCEPTAT' : 'RESPINS'}) – lucrare ${id}`
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.5">
            <h2 style="margin:0 0 12px;color:#0f56b3">Răspuns ofertă</h2>
            <p>Clientul a <strong>${accepted ? 'ACCEPTAT' : 'RESPINS'}</strong> oferta.</p>
            <p><strong>Lucrare:</strong> ${id}</p>
            <p><strong>Client:</strong> ${w?.client || '-'} • <strong>Locație:</strong> ${w?.locatie || '-'}</p>
            ${reason ? `<p><strong>Motiv:</strong> ${reason}</p>` : ''}
            <p><a href="${origin}/dashboard/lucrari/${id}" target="_blank">Deschide lucrarea</a></p>
          </div>`
        // Trimitem către lista de admin/dispecer cunoscută sau configurată (fallback: către EMAIL_USER)
        const recipients = [process.env.NEXT_PUBLIC_NOTIF_ADMIN || '', process.env.NEXT_PUBLIC_NOTIF_DISPECER || ''].filter(Boolean)
        const to = recipients.length ? recipients : [process.env.NEXT_PUBLIC_FALLBACK_EMAIL || 'fom@nrg-acces.ro']
        await fetch('/api/users/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, html })
        })
      } catch {}
      
      const data = await getLucrareById(id)
      setW(data)
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A"
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString("ro-RO", { 
        day: "2-digit", 
        month: "2-digit", 
        year: "numeric" 
      })
    } catch {
      return "N/A"
    }
  }

  const content = (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto max-w-7xl h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">FOM</span>
            <span className="text-sm text-muted-foreground">Portal Client</span>
          </div>
          <UserNav />
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-6">
        {/* Back Button */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/portal')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Înapoi la lucrări
          </Button>
        </div>

        {w ? (
          <div className="space-y-6">
            {/* Header */}
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <h1 className="text-2xl font-bold">{w.client}</h1>
                  <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{w.locatie}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>{w.tipLucrare}</span>
                    </div>
                    {w.dataProgramare && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(w.dataProgramare)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ofertă Section */}
            {w.necesitaOferta && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Ofertă
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {w.products?.length ? (
                    <div>
                      <h4 className="font-medium mb-3">Detalii ofertă:</h4>
                      <div className="space-y-2">
                        {w.products.map((p: any, i: number) => (
                          <div key={i} className="flex justify-between items-center py-2 border-b last:border-b-0">
                            <div>
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground ml-2">x{p.quantity}</span>
                            </div>
                            <span className="font-medium">{(p.total || (p.quantity * p.price)).toFixed(2)} lei</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center pt-3 border-t font-bold text-lg">
                          <span>Total:</span>
                          <span>{(w.offerTotal?.toFixed?.(2) || w.products.reduce((s: number, p: any) => s + (p.total || (p.quantity * p.price)), 0).toFixed(2))} lei</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Se pregătește oferta...</p>
                  )}

                  {w.statusOferta === "OFERTAT" && !w.offerResponse?.status && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <h4 className="font-medium mb-3">Răspuns ofertă:</h4>
                      <Textarea 
                        placeholder="Motiv (opțional pentru Nu accept)" 
                        value={reason} 
                        onChange={(e) => setReason(e.target.value)}
                        className="mb-3"
                      />
                      <div className="flex gap-3">
                        <Button onClick={() => setStatus(true)} disabled={saving} className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {saving ? "Se procesează..." : "Accept oferta"}
                        </Button>
                        <Button variant="destructive" onClick={() => setStatus(false)} disabled={saving}>
                          <XCircle className="h-4 w-4 mr-2" />
                          Nu accept
                        </Button>
                      </div>
                    </div>
                  )}

                  {w.offerResponse?.status && (
                    <div className={`p-4 rounded-lg ${w.offerResponse.status === "accept" ? "bg-green-50" : "bg-red-50"}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Răspuns ofertă:</span>
                        <Badge variant={w.offerResponse.status === "accept" ? "default" : "destructive"}>
                          {w.offerResponse.status === "accept" ? "Acceptată" : "Respinsă"}
                        </Badge>
                      </div>
                      {w.offerResponse.reason && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Motiv: {w.offerResponse.reason}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Documente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {w.raportSnapshot?.url && (
                    <Link 
                      className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors" 
                      href={`/api/download?lucrareId=${encodeURIComponent(id)}&type=raport&url=${encodeURIComponent(w.raportSnapshot.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="p-2 bg-blue-100 rounded">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">Raport lucrare</div>
                        <div className="text-sm text-muted-foreground">Descarcă raportul complet</div>
                      </div>
                    </Link>
                  )}
                  {w.facturaDocument?.url && (
                    <Link 
                      className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors" 
                      href={`/api/download?lucrareId=${encodeURIComponent(id)}&type=factura&url=${encodeURIComponent(w.facturaDocument.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="p-2 bg-green-100 rounded">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium">Factură</div>
                        <div className="text-sm text-muted-foreground">Descarcă factura</div>
                      </div>
                    </Link>
                  )}
                  {w.ofertaDocument?.url && (
                    <Link 
                      className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors" 
                      href={`/api/download?lucrareId=${encodeURIComponent(id)}&type=oferta&url=${encodeURIComponent(w.ofertaDocument.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="p-2 bg-purple-100 rounded">
                        <FileText className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium">Ofertă</div>
                        <div className="text-sm text-muted-foreground">Descarcă oferta detaliată</div>
                      </div>
                    </Link>
                  )}
                  {!w.raportSnapshot?.url && !w.facturaDocument?.url && !w.ofertaDocument?.url && (
                    <div className="text-center py-8 text-muted-foreground">
                      Nu sunt disponibile documente pentru această lucrare.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Se încarcă detaliile lucrării...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return <ProtectedRoute allowedRoles={["client"]}>{content}</ProtectedRoute>
}