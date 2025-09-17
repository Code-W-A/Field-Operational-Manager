"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ProductTableForm, type ProductItem } from "@/components/product-table-form"
import { updateLucrare, getLucrareById } from "@/lib/firebase/firestore"
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

  const handleSave = async () => {
    try {
      setSaving(true)
      // determinăm baseline: ultima versiune sau baseline-ul din deschidere
      const last = versions && versions.length ? versions[versions.length - 1] : undefined
      const baseline = last?.products?.length ? last.products : baselineProducts
      const changed = JSON.stringify(products) !== JSON.stringify(baseline) || (last?.total ?? 0) !== total || (Number((vatPercent||0))) !== Number((vatPercent||0))
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
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


