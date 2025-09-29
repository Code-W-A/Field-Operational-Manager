"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { updateLucrare, getLucrareById, getClientById } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/hooks/use-toast"
// Recipient selection temporarily disabled; show read-only info instead

interface OfferEditorDialogProps {
  lucrareId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProducts?: ProductItem[]
}

export function OfferEditorDialog({ lucrareId, open, onOpenChange, initialProducts = [] }: OfferEditorDialogProps) {
  const { userData } = useAuth()
  const [products, setProducts] = useState<ProductItem[]>(initialProducts)
  const [saving, setSaving] = useState(false)
  const [versions, setVersions] = useState<Array<{ savedAt: string; savedBy?: string; total: number; products: ProductItem[] }>>([])
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [vatPercent, setVatPercent] = useState<number>(21)
  const [isPickedUp, setIsPickedUp] = useState<boolean>(true)
  const [statusOferta, setStatusOferta] = useState<string | undefined>(undefined)
  const [editingNewVersion, setEditingNewVersion] = useState(false)
  const [baselineProducts, setBaselineProducts] = useState<ProductItem[]>(initialProducts)
  const [initialVersionsCount, setInitialVersionsCount] = useState(0)
  const [canSendOffer, setCanSendOffer] = useState(false)
  const [currentWork, setCurrentWork] = useState<any>(null)
  const [clientData, setClientData] = useState<any>(null)
  // read-only suggested recipient
  const suggestedRecipient = useMemo(() => {
    try {
      return resolveRecipientEmailForLocation(clientData, currentWork)
    } catch {
      return null
    }
  }, [clientData, currentWork])
  const [termsPayment, setTermsPayment] = useState<string>("100% in avans")
  const [termsDelivery, setTermsDelivery] = useState<string>("30 zile lucratoare de la plata")
  const [termsInstallation, setTermsInstallation] = useState<string>("3 zile lucratoare de la livrare")

  useEffect(() => {
    setProducts(initialProducts || [])
    setBaselineProducts(initialProducts || [])
  }, [initialProducts])

  useEffect(() => {
    const load = async () => {
      const current = await getLucrareById(lucrareId)
      setVersions(((current as any)?.offerVersions || []) as any)
      setIsPickedUp(Boolean((current as any)?.preluatDispecer))
      setStatusOferta((current as any)?.statusOferta)
      setCurrentWork(current)
      try {
        const cid = (current as any)?.clientInfo?.id
        if (cid) {
          const c = await getClientById(cid)
          setClientData(c)
        }
      } catch {}
      {
        const rawVat = (current as any)?.offerVAT
        const nextVat = (typeof rawVat === 'number' && rawVat > 0) ? Number(rawVat) : 21
        setVatPercent(nextVat)
      }
      // Initialize dynamic terms from existing conditiiOferta if present
      try {
        const conds: string[] = Array.isArray((current as any)?.conditiiOferta) ? ((current as any).conditiiOferta as string[]) : []
        const findByPrefix = (prefix: string) => conds.find((c) => String(c || '').toLowerCase().startsWith(prefix))
        const p = findByPrefix('plata:')
        const l = findByPrefix('livrare:')
        const i = findByPrefix('instalare:')
        if (p) setTermsPayment(p.replace(/^plata:\s*/i, '').trim() || termsPayment)
        if (l) setTermsDelivery(l.replace(/^livrare:\s*/i, '').trim() || termsDelivery)
        if (i) setTermsInstallation(i.replace(/^instalare:\s*/i, '').trim() || termsInstallation)
      } catch {}
    }
    if (open) void load()
  }, [open, lucrareId])

  // no manual recipient selection; display-only suggestion handled via suggestedRecipient

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

  const total = useMemo(() => products.reduce((s, p) => s + (p.total || 0), 0), [products])
  const totalWithVAT = useMemo(() => total * (1 + (Number(vatPercent) || 0) / 100), [total, vatPercent])

  // Seed rows on empty open
  useEffect(() => {
    if (open && (!products || products.length === 0)) {
      setProducts([
        { id: `seed1`, name: "Fotocelule de siguranță", um: "buc", price: 180, quantity: 1, total: 180 },
        { id: `seed2`, name: "Picior mobil", um: "buc", price: 290, quantity: 2, total: 580 },
        { id: `seed3`, name: "Manoperă montaj", um: "buc", price: 750, quantity: 1, total: 750 },
      ])
    }
  }, [open])

  // When versions load, remember initial count to know if a save created a new version
  useEffect(() => {
    if (open) {
      setInitialVersionsCount(versions?.length || 0)
      setCanSendOffer(false)
    }
  }, [open, versions?.length])

  const handleSave = async () => {
    try {
      setSaving(true)
      // determinăm baseline: ultima versiune sau baseline-ul din deschidere
      const last = versions && versions.length ? versions[versions.length - 1] : undefined
      const baseline = last?.products?.length ? last.products : baselineProducts
      const changed = JSON.stringify(products) !== JSON.stringify(baseline) || (last?.total ?? 0) !== total
      if (!changed) {
        // Nu închidem dialogul dacă nu sunt schimbări
        setCanSendOffer(true)
        return
      }
      const version = {
        savedAt: new Date().toISOString(),
        savedBy: userData?.displayName || userData?.email || "Unknown",
        total,
        products,
      }
      const current = await getLucrareById(lucrareId)
      const existing = (current as any)?.offerVersions || []
      const newVersions = [...existing, version]
      // Build dynamic conditions (without warranty)
      const conditiiOferta = [
        `Plata: ${termsPayment}`,
        `Livrare: ${termsDelivery}`,
        `Instalare: ${termsInstallation}`,
      ]
      await updateLucrare(lucrareId, {
        products,
        offerTotal: total,
        offerVAT: Number(vatPercent) || 0,
        offerVersions: newVersions as any,
        conditiiOferta: conditiiOferta as any,
      } as any)
      setVersions(newVersions)
      setBaselineProducts(products)
      setEditingNewVersion(false)
      // allow sending after a new version is created și păstrăm dialogul deschis
      setCanSendOffer(true)
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (index: number) => {
    try {
      setSaving(true)
      const v = versions[index]
      // Restaurăm produsele și totalul fără a crea o versiune nouă în istoric
      await updateLucrare(lucrareId, {
        products: v.products,
        offerTotal: v.total,
      } as any)
      setProducts(v.products)
      // Istoricul rămâne neschimbat (nu adăugăm o versiune nouă)
    } finally {
      setSaving(false)
    }
  }

  const canEditOffer = isPickedUp && statusOferta !== "OFERTAT"
  const effectiveDisabled = !canEditOffer && !editingNewVersion
  const startNewVersion = () => {
    const last = versions && versions.length ? versions[versions.length - 1] : undefined
    const seed = last?.products?.length ? last.products : products
    setProducts(seed)
    setEditingNewVersion(true)
  }

  const handleSendOffer = async () => {
    try {
      setSaving(true)
      // generate token and links
      const tokenResp = await fetch('/api/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lucrareId }) })
      if (!tokenResp.ok) throw new Error('Nu s-a putut genera link-ul de ofertă')
      const { acceptUrl, rejectUrl } = await tokenResp.json()

      // Fetch fresh data to avoid stale emails
      const freshWork = await getLucrareById(lucrareId)
      let freshClient: any = clientData
      try {
        const cid = (freshWork as any)?.clientInfo?.id
        if (cid) freshClient = await getClientById(cid)
      } catch {}
      const recipient = resolveRecipientEmailForLocation(freshClient, freshWork)
      if (!recipient) throw new Error('Nu există un email valid disponibil pentru această lucrare.')

      toast({ title: 'Se trimite ofertă', description: `Către: ${recipient}` })

      // build email body with current products
      const subject = `Ofertă pentru lucrarea ${currentWork?.numarRaport || currentWork?.id}`
      const rows = (products || []).map((p: any) => `
        <tr>
          <td style=\"padding:6px;border:1px solid #e5e7eb\">${p.name || ''}</td>
          <td style=\"padding:6px;border:1px solid #e5e7eb;text-align:center\">${p.um || '-'}</td>
          <td style=\"padding:6px;border:1px solid #e5e7eb;text-align:right\">${Number(p.quantity||0)}</td>
          <td style=\"padding:6px;border:1px solid #e5e7eb;text-align:right\">${Number(p.price||0).toFixed(2)}</td>
          <td style=\"padding:6px;border:1px solid #e5e7eb;text-align:right\">${((Number(p.quantity)||0)*(Number(p.price)||0)).toFixed(2)}</td>
        </tr>`).join('')
      const totalNoVat = (products || []).reduce((s: number, p: any) => s + (Number(p.quantity)||0)*(Number(p.price)||0), 0)
      const html = `
        <div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#0b1220\"> 
          <h2 style=\"margin:0 0 12px;color:#0f56b3\">Ofertă lucrarea ${currentWork?.numarRaport || currentWork?.id}</h2>
          <table style=\"border-collapse:collapse;width:100%;margin-top:8px;font-size:14px\">
            <thead>
              <tr style=\"background:#f8fafc\">
                <th style=\"padding:6px;border:1px solid #e5e7eb;text-align:left\">Denumire</th>
                <th style=\"padding:6px;border:1px solid #e5e7eb;text-align:center\">UM</th>
                <th style=\"padding:6px;border:1px solid #e5e7eb;text-align:right\">Buc</th>
                <th style=\"padding:6px;border:1px solid #e5e7eb;text-align:right\">PU (lei)</th>
                <th style=\"padding:6px;border:1px solid #e5e7eb;text-align:right\">Total (lei)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan=\"4\" style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:600\">Total fără TVA</td>
                <td style=\"padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:700\">${totalNoVat.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <p style=\"margin:12px 0 6px;color:#64748b\">Acest link este valabil 30 de zile de la primirea emailului. După confirmare, linkurile devin inactive.</p>
          <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin-top:12px\">
            <tr>
              <td>
                <a href=\"${acceptUrl}\" style=\"background:#16a34a;border-radius:6px;color:#ffffff;display:inline-block;font-weight:600;padding:10px 14px;text-decoration:none;line-height:normal\">Accept ofertă</a>
              </td>
              <td style=\"width:8px\">&nbsp;</td>
              <td>
                <a href=\"${rejectUrl}\" style=\"background:#dc2626;border-radius:6px;color:#ffffff;display:inline-block;font-weight:600;padding:10px 14px;text-decoration:none;line-height:normal\">Refuz ofertă</a>
              </td>
            </tr>
          </table>
        </div>`

      const resp = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: [recipient], subject, html })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err?.error || `Cerere invalidă (${resp.status})`)
      }

      // Lock offer after sending
      await updateLucrare(lucrareId, { statusOferta: "OFERTAT" } as any)
      setStatusOferta("OFERTAT")
      setCanSendOffer(false)
      toast({ title: 'Ofertă trimisă', description: `S-a trimis oferta la: ${recipient}` })
    } catch (e) {
      console.warn('Trimitere ofertă eșuată', e)
      const msg = e instanceof Error ? e.message : 'Nu s-a putut trimite emailul.'
      toast({ title: 'Eroare trimitere', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader >
        <DialogTitle className="my-4">Editor ofertă</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-w-[1400px] w-[calc(100%-2rem)] max-h-[95vh] p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 space-y-4 overflow-y-auto max-h-[calc(95vh-8rem)] p-6">
            <ProductTableForm products={products} onProductsChange={setProducts} disabled={effectiveDisabled} />

            {/* Termeni ofertă (dinamici) */}
            <div className="space-y-3">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de plată</label>
                  <input
                    type="text"
                    value={termsPayment}
                    onChange={(e) => setTermsPayment(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 100% în avans"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de livrare</label>
                  <input
                    type="text"
                    value={termsDelivery}
                    onChange={(e) => setTermsDelivery(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 30 zile lucrătoare de la plată"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Termen de instalare</label>
                  <input
                    type="text"
                    value={termsInstallation}
                    onChange={(e) => setTermsInstallation(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    disabled={effectiveDisabled}
                    placeholder="ex: 1-2 zile lucrătoare de la livrare"
                  />
                </div>
              </div>
            {/* Sumar total */}
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <div className="text-right text-sm">
                  <div>Total: <strong>{total.toFixed(2)} lei</strong></div>
                </div>
              </div>

              {/* Destinatar informativ (read-only) */}
              <div className="text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded px-2 py-2">
                <span className="font-medium">Destinatar ofertă: </span>
                <span>{suggestedRecipient || 'Nu există email valid pentru persoana de contact din locația lucrării.'}</span>
              </div>
            </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {(!isPickedUp || statusOferta === "OFERTAT") && (
                <span className="text-xs text-muted-foreground mr-auto">{!isPickedUp ? "Editorul este disponibil după preluarea lucrării de către dispecer." : "Oferta trimisă este înghețată. Creați o versiune nouă pentru modificări."}</span>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Anulează</Button>
              {statusOferta === "OFERTAT" && !editingNewVersion ? (
                <Button onClick={startNewVersion} disabled={saving}>Începe versiune nouă</Button>
              ) : (
                <Button onClick={handleSave} disabled={saving || products.length === 0 || (!isPickedUp && !editingNewVersion)}>{saving ? "Se salvează..." : "Salvează"}</Button>
              )}
              <Button onClick={handleSendOffer} disabled={saving}>Trimite ofertă</Button>
            </div>
          </div>
          <div className="space-y-3 p-6 overflow-y-auto max-h-[calc(95vh-8rem)]">
            <div className="text-sm font-medium">Istoric versiuni ofertă</div>
            <div className="rounded border divide-y bg-white">
              {versions?.length ? versions.map((v, i) => (
                <div key={i} className="p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{new Date(v.savedAt).toLocaleString("ro-RO")}</div>
                      <div className="text-xs text-muted-foreground truncate">{v.savedBy || "-"} • Total: {v.total?.toFixed?.(2) ?? v.total} lei</div>
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewIndex(i)}>Vizualizează</Button>
                      <Button size="sm" onClick={() => handleRestore(i)} disabled={saving}>Restaurează</Button>
                    </div>
                  </div>
                  {viewIndex === i && (
                    <div className="mt-2 bg-gray-50 rounded p-2">
                      {v.products?.length ? (
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          {v.products.map((p, idx) => (
                            <li key={idx} className="truncate">{p.name} – {p.quantity} x {p.price} = {p.total} lei</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-muted-foreground">Fără produse</div>
                      )}
                    </div>
                  )}
                </div>
              )) : (
                <div className="p-2 text-sm text-muted-foreground">Nu există versiuni salvate.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


