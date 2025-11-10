"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, X, AlertCircle } from "lucide-react"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { generateOfferPdf } from "@/lib/utils/offer-pdf"
import { uploadFile } from "@/lib/firebase/storage"
import { getClientById } from "@/lib/firebase/firestore"

export default function OfferActionPage() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const token = params.get("t") || ""
  const action = params.get("action") as ("accept" | "reject" | null)

  const [state, setState] = useState<"loading" | "success" | "error" | "expired" | "used" | "invalid">("loading")
  const [message, setMessage] = useState<string>("")
  const [offerUrl, setOfferUrl] = useState<string>("")
  const [generating, setGenerating] = useState<boolean>(false)
  const [downloading, setDownloading] = useState<boolean>(false)
  const [reason, setReason] = useState<string>("")
  const [errorDetails, setErrorDetails] = useState<any>(null)

  useEffect(() => {
    const run = async () => {
      try {
        if (!id || !token || !action || (action !== "accept" && action !== "reject")) {
          setState("invalid")
          setMessage("Link invalid. Contactați operatorul.")
          return
        }
        if (action === "reject") {
          // Așteptăm motivul refuzului înainte de a înregistra răspunsul
          setState("await_reason" as any)
          setMessage("Vă rugăm să indicați motivul refuzului.")
          return
        }

        // Procesează pe server pentru fiabilitate maximă
        const resp = await fetch("/api/offer/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lucrareId: id, token, action }),
        })
        const json = await resp.json()
        if (!resp.ok || json.status !== "success") {
          if (json.status === "expired") {
            setState("expired"); setMessage("Link expirat. Contactați operatorul pentru o ofertă nouă."); return
          }
          if (json.status === "used") {
            setState("used"); setMessage("Oferta a fost deja acceptată sau refuzată. Contactați operatorul."); return
          }
          if (json.status === "invalid") {
            setState("invalid"); setMessage("Link invalid. Contactați operatorul."); return
          }
          throw new Error(json?.message || "Eroare la procesare pe server")
        }

        // Continuăm cu pașii opționali (email/PDF) non-blocanți
        const ref = doc(db, "lucrari", id)
        const snap = await getDoc(ref)
        const data: any = snap.exists() ? snap.data() : null
        // Helper: return ONLY the email for the exact contact of the work's location
        const resolveRecipientEmailForLocation = (client: any, work: any): string | null => {
          const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(e || "")
          const norm = (s?: string) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()

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

        // Pregătim emailul de confirmare pentru accept/refuz – strict către emailul locației din Firestore
        try {
          const freshSnap = await getDoc(ref)
          const fresh = freshSnap.exists() ? (freshSnap.data() as any) : null
          if (fresh) {
            // La accept: generăm (dacă lipsește) și salvăm PDF-ul în Storage pentru a putea oferi link de descărcare
            let ofertaUrl: string | undefined = fresh?.ofertaDocument?.url
            if (action === "accept" && !ofertaUrl) {
              const products = Array.isArray(fresh?.products) ? fresh.products : []
              if (products.length) {
                const blob = await generateOfferPdf({
                  id: String(id),
                  numarRaport: String(data?.numarRaport || ''),
                  offerNumber: Number((fresh as any)?.offerSendCount || 0) + 1,
                  client: fresh?.client || "",
                  attentionTo: fresh?.persoanaContact || "",
                  fromCompany: "NRG Access Systems SRL",
                  products: products.map((p: any) => ({
                    name: p?.name || p?.denumire || "",
                    quantity: Number(p?.quantity || p?.cantitate || 0),
                    price: Number(p?.price || p?.pretUnitar || 0),
                  })),
                  offerVAT: typeof (fresh as any)?.offerVAT === "number" ? (fresh as any).offerVAT : 19,
                  adjustmentPercent: Number((fresh as any)?.offerAdjustmentPercent || 0),
                  damages: String((fresh as any)?.constatareLaLocatie || (fresh as any)?.raportSnapshot?.constatareLaLocatie || fresh?.comentariiOferta || "")
                    .split(/\r?\n|\u2022|\-|\*/)
                    .map((s: string) => s.trim())
                    .filter(Boolean),
                  conditions: Array.isArray((fresh as any)?.conditiiOferta)
                    ? (fresh as any).conditiiOferta
                    : undefined,
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
                const file = new File([blob], fileName, { type: "application/pdf" })
                const path = `lucrari/${id}/oferta/${fileName}`
                const uploaded = await uploadFile(file, path)
                ofertaUrl = uploaded.url
                await updateDoc(ref, {
                  ofertaDocument: {
                    url: uploaded.url,
                    fileName: uploaded.fileName,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: "Portal client",
                    numarOferta: (fresh as any)?.numarOferta || "",
                    dataOferta: new Date().toISOString().slice(0, 10),
                  },
                  offerSendCount: Number((fresh as any)?.offerSendCount || 0) + 1,
                })
              }
            }

            // Determinăm destinatarul (doar email-ul persoanei de contact a locației)
            let clientData: any = null
            try {
              const cid = fresh?.clientInfo?.id
              if (cid) clientData = await getClientById(cid)
            } catch {}
            const recipient = resolveRecipientEmailForLocation(clientData, fresh)

            if (recipient) {
              const to = [recipient]
              const subject = `${action === "accept" ? "Confirmare acceptare ofertă" : "Confirmare răspuns – refuz ofertă"} – lucrare ${fresh?.numarRaport || String(id)}`
              const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")
              const downloadLink = ofertaUrl ? `${base}/api/download?lucrareId=${encodeURIComponent(String(id))}&type=oferta&url=${encodeURIComponent(ofertaUrl)}&recipient=${encodeURIComponent(String(recipient))}` : ""

              const messageParagraph = action === "accept"
                ? "Va multumim pentru acceptarea ofertei noastre. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi."
                : "Va multumim pentru raspunsul dvs. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi."

              const linkSection = action === "accept" && downloadLink
                ? `<p style="margin:12px 0"><a href="${downloadLink}" style="background:#2563eb;border-radius:6px;color:#ffffff;display:inline-block;font-weight:600;padding:10px 14px;text-decoration:none">Descarcă oferta</a></p>`
                : ""

              const html = `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
                  <p>${messageParagraph}</p>
                  ${linkSection}
                </div>
              `

              try {
                await fetch('/api/users/invite', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to, subject, html })
                })
              } catch (e) {
                console.warn('Trimitere email confirmare ofertă eșuată (non-blocant):', e)
              }
            }
          }
        } catch (e) {
          console.warn('Post-response email or attachment handling failed (non-blocant):', e)
        }
        if (action === "accept") setGenerating(false)
        setState("success")
        setMessage(action === "accept" ? "Ați acceptat oferta. Vă mulțumim!" : "Ați refuzat oferta. Am înregistrat răspunsul.")
      } catch (e) {
        console.error(e)
        setState("error")
        setMessage("A apărut o eroare. Încercați mai târziu sau contactați operatorul.")
        try {
          const err: any = e
          setErrorDetails({
            context: {
              action,
              workId: id,
              hasToken: Boolean(token),
              time: new Date().toISOString(),
            },
            error: {
              message: String(err?.message || err),
              code: err?.code || undefined,
              name: err?.name || undefined,
              stack: typeof err?.stack === "string" ? err.stack : undefined,
            },
          })
        } catch {}
      }
    }
    run()
  }, [id, token, action])

  const submitReject = async () => {
    try {
      setState("loading")
      const resp = await fetch("/api/offer/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lucrareId: id, token, action: "reject", reason }),
      })
      const json = await resp.json()
      if (!resp.ok || json.status !== "success") {
        if (json.status === "expired") {
          setState("expired"); setMessage("Link expirat. Contactați operatorul pentru o ofertă nouă."); return
        }
        if (json.status === "used") {
          setState("used"); setMessage("Oferta a fost deja acceptată sau refuzată. Contactați operatorul."); return
        }
        if (json.status === "invalid") {
          setState("invalid"); setMessage("Link invalid. Contactați operatorul."); return
        }
        throw new Error(json?.message || "Eroare la procesare pe server")
      }

      // Trimite emailul de confirmare (secțiunea existentă reutilizată)
      try {
        const ref = doc(db, "lucrari", id)
        const freshSnap = await getDoc(ref)
        const fresh = freshSnap.exists() ? (freshSnap.data() as any) : null
        if (fresh) {
          // Determinăm destinatarul (doar email-ul persoanei de contact a locației)
          const resolveRecipientEmailForLocation = (client: any, work: any): string | null => {
            const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(e || "")
            const norm = (s?: string) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
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
            const cid = fresh?.clientInfo?.id
            if (cid) clientData = await getClientById(cid)
          } catch {}
          const recipient = resolveRecipientEmailForLocation(clientData, fresh)
          if (recipient) {
            const to = [recipient]
            const subject = `Confirmare răspuns – refuz ofertă – lucrare ${fresh?.numarRaport || String(id)}`
            const html = `
              <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
                <p>Am înregistrat refuzul ofertei.</p>
                ${reason ? `<p><strong>Motiv indicat:</strong> ${reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : ''}
              </div>
            `
            try {
              await fetch('/api/users/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, subject, html })
              })
            } catch (e) {
              console.warn('Trimitere email confirmare refuz ofertă eșuată (non-blocant):', e)
            }
          }
        }
      } catch (e) {
        console.warn('Post-response email handling (reject) failed (non-blocant):', e)
      }

      setState("success")
      setMessage("Ați refuzat oferta. Am înregistrat răspunsul.")
    } catch (e) {
      console.error(e)
      setState("error")
      setMessage("A apărut o eroare. Încercați mai târziu sau contactați operatorul.")
      try {
        const err: any = e
        setErrorDetails({
          context: {
            action: "reject",
            workId: id,
            hasToken: Boolean(token),
            time: new Date().toISOString(),
          },
          error: {
            message: String(err?.message || err),
            code: err?.code || undefined,
            name: err?.name || undefined,
            stack: typeof err?.stack === "string" ? err.stack : undefined,
          },
        })
      } catch {}
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Confirmare ofertă</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {state === "loading" && (
            <div className="text-sm text-muted-foreground">Se procesează...</div>
          )}
          {String(state) === "await_reason" && (
            <div className="space-y-3">
              <Alert>
                <X className="h-4 w-4" />
                <AlertDescription>Vă rugăm să indicați motivul refuzului (opțional).</AlertDescription>
              </Alert>
              <textarea
                className="w-full border rounded p-2 text-sm"
                rows={4}
                placeholder="Ex.: Preț prea mare / Nu mai este necesar / Alt motiv"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" asChild>
                  <a href="/">Renunță</a>
                </Button>
                <Button variant="destructive" onClick={submitReject}>Trimite refuzul</Button>
              </div>
            </div>
          )}
          {state === "success" && (
            <div className="space-y-3">
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
              {action === "accept" && (
                <div className="space-y-2">
                  <Button onClick={async () => {
                    try {
                      setDownloading(true)
                      const ref = doc(db, "lucrari", id)
                      const freshSnap = await getDoc(ref)
                      const fresh = freshSnap.exists() ? (freshSnap.data() as any) : null
                      const products = Array.isArray(fresh?.products) ? fresh.products : []
                      if (!products.length) return
                const blob = await generateOfferPdf({
                  id: id,
                  numarRaport: String(fresh?.numarRaport || ''),
                        client: fresh?.client || "",
                        attentionTo: fresh?.persoanaContact || "",
                        fromCompany: "NRG Access Systems SRL",
                        products: products.map((p: any) => ({
                          name: p?.name || p?.denumire || "",
                          quantity: Number(p?.quantity || p?.cantitate || 0),
                          price: Number(p?.price || p?.pretUnitar || 0),
                        })),
                        offerVAT: typeof (fresh as any)?.offerVAT === "number" ? (fresh as any).offerVAT : 19,
                        damages: String((fresh as any)?.constatareLaLocatie || (fresh as any)?.raportSnapshot?.constatareLaLocatie || fresh?.comentariiOferta || "")
                          .split(/\r?\n|\u2022|\-|\*/)
                          .map((s: string) => s.trim())
                          .filter(Boolean),
                        conditions: Array.isArray((fresh as any)?.conditiiOferta)
                          ? (fresh as any).conditiiOferta
                          : undefined,
                        equipmentName: String((fresh as any)?.echipament || ''),
                        locationName: String((fresh as any)?.locatie || ''),
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
                  }} disabled={downloading}>
                    {downloading ? "Se generează..." : "Descarcă oferta"}
                  </Button>
                </div>
              )}
            </div>
          )}
          {(state === "error" || state === "expired" || state === "used" || state === "invalid") && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {(state === "error" || state === "expired" || state === "used" || state === "invalid") && id && token && (
            <div className="flex flex-wrap gap-2 justify-between items-center">
              <Button variant="outline" onClick={() => window.location.reload()}>Reîncearcă</Button>
              <Button
                onClick={async () => {
                  try {
                    const resp = await fetch("/api/offer/reissue", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lucrareId: id, token }),
                    })
                    const json = await resp.json()
                    if (!resp.ok || !json?.acceptUrl || !json?.rejectUrl) {
                      throw new Error(json?.error || "Nu s-a putut reemite link-ul.")
                    }
                    const target = action === "reject" ? json.rejectUrl : json.acceptUrl
                    window.location.href = target
                  } catch (e) {
                    console.error(e)
                    alert("Nu s-a putut reemite link-ul. Contactați operatorul.")
                  }
                }}
              >
                Solicită link nou
              </Button>
            </div>
          )}
          {state === "error" && errorDetails && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium mb-1">Detalii tehnice eroare (pentru suport)</div>
              <pre className="text-xs overflow-auto max-h-48 whitespace-pre-wrap">
{JSON.stringify(errorDetails, null, 2)}
              </pre>
            </div>
          )}
          <div className="pt-2">
            <Button asChild variant="outline">
              <a href="/">Înapoi la FOM</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
