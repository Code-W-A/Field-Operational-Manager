"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { updateLucrare, getLucrareById, getClientById } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"

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
    }
    if (open) void load()
  }, [open, lucrareId])

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
        onOpenChange(false)
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
      await updateLucrare(lucrareId, {
        products,
        offerTotal: total,
        offerVAT: Number(vatPercent) || 0,
        offerVersions: newVersions as any,
      } as any)
      setVersions(newVersions)
      setBaselineProducts(products)
      setEditingNewVersion(false)
      // allow sending after a new version is created
      setCanSendOffer(true)
      // Fallback save: append version to a dedicated endpoint by overwriting whole array is not ideal; leave for next iteration
      onOpenChange(false)
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

      // recipients from location contact email only
      let recipient: string | undefined
      try {
        const loc = (clientData as any)?.locatii?.find((l: any) => l?.nume === currentWork?.locatie)
        const contact = loc?.persoaneContact?.find((c: any) => c?.nume === currentWork?.persoanaContact)
        recipient = contact?.email
      } catch {}
      const isValid = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(e || '')
      const recipients = isValid(recipient) ? [recipient as string] : []
      if (!recipients.length) throw new Error('Nu există un email valid pentru persoana de contact a locației.')

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
          <div style=\"display:flex;gap:8px;margin-top:12px\">
            <a href=\"${acceptUrl}\" style=\"padding:10px 14px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600\">Accept ofertă</a>
            <a href=\"${rejectUrl}\" style=\"padding:10px 14px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;font-weight:600\">Refuz ofertă</a>
          </div>
        </div>`

      const resp = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipients, subject, html })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err?.error || `Cerere invalidă (${resp.status})`)
      }

      // Lock offer after sending
      await updateLucrare(lucrareId, { statusOferta: "OFERTAT" } as any)
      setStatusOferta("OFERTAT")
      setCanSendOffer(false)
      onOpenChange(false)
    } catch (e) {
      console.warn('Trimitere ofertă eșuată', e)
      // optional: surface a toast - left out to avoid adding imports; page level will handle notifications
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader >
        <DialogTitle>Editor ofertă</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-w-[1000px] w-[calc(100%-2rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <ProductTableForm products={products} onProductsChange={setProducts} disabled={effectiveDisabled} />

            {/* VAT controls & totals */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">TVA (%)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={vatPercent}
                  onChange={(e) => setVatPercent(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-20 border rounded px-2 py-1 text-sm"
                  disabled={effectiveDisabled}
                />
              </div>
              <div className="text-right text-sm">
                <div>Total fără TVA: <strong>{total.toFixed(2)} lei</strong></div>
                <div>Total cu TVA: <strong>{totalWithVAT.toFixed(2)} lei</strong></div>
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
              <Button onClick={handleSendOffer} disabled={saving || !canSendOffer || statusOferta === "OFERTAT"}>Trimite ofertă</Button>
            </div>
          </div>
          <div className="space-y-3">
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


