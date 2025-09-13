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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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

  const content = (
    <div className="p-4 space-y-4">
      {w ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">{w.client}</div>
              <div className="text-sm text-muted-foreground">{w.locatie}</div>
            </div>
            <Badge>{w.statusLucrare}</Badge>
          </div>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-sm">Tip: {w.tipLucrare}</div>
              <div className="text-sm">Status ofertă: {w.statusOferta || (w.necesitaOferta ? "DA" : "NU")}</div>
              {w.products?.length ? (
                <div className="text-sm">
                  <div className="font-medium mb-2">Oferta curentă</div>
                  <ul className="list-disc list-inside space-y-1">
                    {w.products.map((p: any, i: number) => (
                      <li key={i}>{p.name} – {p.quantity} x {p.price} = {p.total} lei</li>
                    ))}
                  </ul>
                  <div className="mt-2 font-semibold">Total: {w.offerTotal?.toFixed?.(2) || w.products.reduce((s: number, p: any) => s + (p.total || 0), 0)} lei</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Nu există ofertă definită.</div>
              )}
              <div className="space-y-2 pt-2">
                <Textarea placeholder="Motiv (opțional pentru Nu accept)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={() => setStatus(false)} disabled={saving}>Nu accept</Button>
                  <Button onClick={() => setStatus(true)} disabled={saving}>Accept</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div>Se încarcă...</div>
      )}
    </div>
  )

  return <ProtectedRoute allowedRoles={["client"]}>{content}</ProtectedRoute>
}


