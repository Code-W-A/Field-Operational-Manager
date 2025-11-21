"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { db } from "@/lib/firebase/config"
import { getLucrareById, updateLucrare, getClientById } from "@/lib/firebase/firestore"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UserNav } from "@/components/user-nav"
import { ArrowLeft, Calendar, MapPin, FileText, Download, CheckCircle, XCircle } from "lucide-react"
import { generateOfferPdf } from "@/lib/utils/offer-pdf"
import Link from "next/link"
import { generateRevisionOperationsPDF } from "@/lib/pdf/revision-operations"

export default function PortalWorkDetail() {
  const params = useParams()
  const router = useRouter()
  const { userData } = useAuth()
  const [w, setW] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [redirecting, setRedirecting] = useState(true)
  const id = params?.id as string
  // Redirect client portal view to the unified dashboard detail page
  useEffect(() => {
    if (id) {
      router.replace(`/dashboard/lucrari/${id}`)
    }
  }, [id, router])

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Se încarcă detaliile lucrării...</p>
        </div>
      </div>
    )
  }


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
      const response: any = {
        status: accepted ? "accept" : "reject",
        at: new Date().toISOString(),
      }
      if (reason && reason.trim()) {
        response.reason = reason.trim()
      }
      await updateLucrare(id, {
        offerResponse: response,
        // La acceptarea clientului, marcăm "OFERTAT" (oferta a fost emisă și acceptată)
        statusOferta: accepted ? "OFERTAT" : "DA",
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

      // Best-effort: email de confirmare către contactul locației (doar către acel email)
      try {
        const fresh = await getLucrareById(id)
        if (fresh) {
          // Helper: return ONLY the email for the exact contact of the work's location
          const resolveRecipientEmailForLocation = (client: any, work: any): string | null => {
            const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(e || '')
            const norm = (s?: string) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
            const locatii = Array.isArray(client?.locatii) ? client.locatii : []
            const targetName = norm(work?.locatie || work?.clientInfo?.locationName)
            const targetAddr = norm(work?.clientInfo?.locationAddress)
            const targetContactName = norm(work?.persoanaContact)
            const loc = locatii.find((l: any) => norm(l?.nume) === targetName || norm(l?.adresa) === targetAddr)
            if (!loc) return null
            const exact = (loc.persoaneContact || []).find((c: any) => norm(c?.nume) === targetContactName)
            const email = exact?.email
            return isValid(email) ? String(email) : null
          }

          let clientData: any = null
          try {
            const cid = (fresh as any)?.clientInfo?.id
            if (cid) clientData = await getClientById(cid)
          } catch {}

          const recipient = resolveRecipientEmailForLocation(clientData, fresh)
          if (recipient) {
            const to = [recipient]
            const base = typeof window !== 'undefined' ? window.location.origin : ''
            const ofertaUrl = (fresh as any)?.ofertaDocument?.url
            const downloadLink = ofertaUrl ? `${base}/api/download?lucrareId=${encodeURIComponent(String(id))}&type=oferta&url=${encodeURIComponent(ofertaUrl)}` : ''
            const subject = accepted ? `Confirmare acceptare ofertă – lucrare ${String(id)}` : `Confirmare răspuns – refuz ofertă – lucrare ${String(id)}`
            const messageParagraph = accepted
              ? 'Va multumim pentru acceptarea ofertei noastre. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi.'
              : 'Va multumim pentru raspunsul dvs. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi.'
            const linkSection = accepted && downloadLink
              ? `<p style="margin:12px 0"><a href="${downloadLink}" style="background:#2563eb;border-radius:6px;color:#ffffff;display:inline-block;font-weight:600;padding:10px 14px;text-decoration:none">Descarcă oferta</a></p>`
              : ''
            const html = `
              <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
                <p>${messageParagraph}</p>
                ${linkSection}
              </div>
            `

            await fetch('/api/users/invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, subject, html })
            })
          }
        }
      } catch {}

      const data = await getLucrareById(id)
      setW(data)
    } finally {
      setSaving(false)
    }
  }

  const downloadOffer = async () => {
    try {
      setDownloading(true)
      const fresh = await getLucrareById(id)
      const products = Array.isArray(fresh?.products) ? fresh.products : []
      if (!products.length) return
      const damages: string[] = (() => {
        const raw = (fresh as any)?.constatareLaLocatie || (fresh as any)?.raportSnapshot?.constatareLaLocatie || (fresh as any)?.comentariiOferta
        if (!raw) return []
        return String(raw)
          .split(/\r?\n|\u2022|\-|\*/)
          .map((s: string) => s.trim())
          .filter(Boolean)
      })()
      const conditions: string[] | undefined = Array.isArray((fresh as any)?.conditiiOferta)
        ? (fresh as any).conditiiOferta
        : undefined
      const offerVatVal = typeof (fresh as any)?.offerVAT === 'number' ? (fresh as any).offerVAT : 19
      const blob = await generateOfferPdf({
        id: id,
        numarRaport: String(fresh?.numarRaport || ''),
        offerNumber: Number((fresh as any)?.offerSendCount || 0) + 1,
        client: fresh?.client || "",
        attentionTo: fresh?.persoanaContact || "",
        fromCompany: "NRG Access Systems SRL",
        products: products.map((p: any) => ({
          name: p?.name || p?.denumire || "",
          quantity: Number(p?.quantity || p?.cantitate || 0),
          price: Number(p?.price || p?.pretUnitar || 0),
        })),
        offerVAT: offerVatVal,
        adjustmentPercent: Number((fresh as any)?.offerAdjustmentPercent || 0),
        damages,
        conditions,
        equipmentName: String((fresh as any)?.echipament || ''),
        locationName: String((fresh as any)?.locatie || ''),
        preparedBy: String((fresh as any)?.offerPreparedBy || (fresh as any)?.updatedByName || (fresh as any)?.createdByName || ''),
        preparedAt: ((fresh as any)?.offerPreparedAt ? (() => {
          try { const d = (fresh as any).offerPreparedAt?.toDate ? (fresh as any).offerPreparedAt.toDate() : new Date((fresh as any).offerPreparedAt); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}` } catch { return new Date().toISOString().slice(0,10).split('-').reverse().join('.') }
        })() : new Date().toISOString().slice(0,10).split('-').reverse().join('.')),
        beneficiar: {
          name: String((fresh as any)?.client || (fresh as any)?.clientInfo?.nume || ''),
          cui: String((fresh as any)?.clientInfo?.cui || ''),
          reg: String((fresh as any)?.clientInfo?.rc || ''),
          address: String((fresh as any)?.clientInfo?.adresa || ''),
        },
      })
      const fileName = `oferta_${id}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (dateStr: any) => {
    if (!dateStr) return "-"
    try {
      // Gestionăm Firestore Timestamp
      let d: Date
      if (dateStr?.toDate && typeof dateStr.toDate === 'function') {
        d = dateStr.toDate()
      } else if (dateStr instanceof Date) {
        d = dateStr
      } else {
        // Încercăm să convertim string-ul în dată
        d = new Date(dateStr)
      }
      
      // Verificăm dacă data este validă
      if (isNaN(d.getTime())) {
        return "-"
      }
      
      // Formatăm în DD.MM.YYYY
      const day = d.getDate().toString().padStart(2, '0')
      const month = (d.getMonth() + 1).toString().padStart(2, '0')
      const year = d.getFullYear()
      return `${day}.${month}.${year}`
    } catch {
      return "-"
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

            {/* Ofertă Section – ascuns pentru client */}

            {/* Documents: afișăm doar Factură și Ofertă pentru client */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Documente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
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