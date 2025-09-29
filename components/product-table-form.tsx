"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsMobile } from "@/components/ui/use-mobile"
import React from "react"

export interface ProductItem {
  id: string
  name: string
  um: string
  quantity: number
  price: number
  total: number
}

// Re-export a simplified `Product` alias so other modules can depend on
// a common shape without necessarily caring about `id` or `total`.
// This keeps backwards compatibility for existing code that already
// relies on `ProductItem`, while satisfying the named export expected
// by consumers such as `ReportGenerator`.
export type Product = ProductItem

interface ProductTableFormProps {
  products: ProductItem[]
  onProductsChange: (products: ProductItem[]) => void
  disabled?: boolean
  showTitle?: boolean
}

export function ProductTableForm({ products, onProductsChange, disabled = false, showTitle = true }: ProductTableFormProps) {
  const isMobile = useIsMobile()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<ProductItem | null>(null)
  const lastFocusedFieldIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const handleWindowFocus = () => {
      const id = lastFocusedFieldIdRef.current
      if (!id) return
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
      if (el) {
        try {
          el.focus()
          const val = (el as HTMLInputElement).value || ""
          if (typeof (el as HTMLInputElement).setSelectionRange === "function") {
            (el as HTMLInputElement).setSelectionRange(val.length, val.length)
          }
        } catch {}
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleWindowFocus()
    }
    window.addEventListener("focus", handleWindowFocus)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.removeEventListener("focus", handleWindowFocus)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  // Funcție pentru a genera un ID unic
  const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Funcție pentru a adăuga un produs nou
  const addProduct = () => {
    const newProduct: ProductItem = {
      id: generateId(),
      name: "",
      um: "buc",
      quantity: 1,
      price: 0,
      total: 0,
    }
    onProductsChange([...products, newProduct])
    if (isMobile) {
      setEditingId(newProduct.id)
      setDraft(newProduct)
    }
  }

  // Funcție pentru a șterge un produs
  const removeProduct = (id: string) => {
    onProductsChange(products.filter((product) => product.id !== id))
  }

  // Funcție pentru a actualiza un produs
  const updateProduct = (id: string, field: keyof ProductItem, value: any) => {
    const updatedProducts = products.map((product) => {
      if (product.id === id) {
        const updatedProduct = { ...product, [field]: value }

        // Recalculăm totalul dacă s-a modificat cantitatea sau prețul
        if (field === "quantity" || field === "price") {
          const q = Number(updatedProduct.quantity) || 0
          const p = Number(updatedProduct.price) || 0
          updatedProduct.total = q * p
        }

        return updatedProduct
      }
      return product
    })

    onProductsChange(updatedProducts)
  }

  // Calculăm totalul general
  const totalWithoutVAT = products.reduce((sum, product) => sum + (Number(product.total) || 0), 0)
  const totalWithVAT = totalWithoutVAT * 1.21 // Presupunem TVA 21%
const handleNumberChange = (
  id: string,
  field: "price" | "quantity",
) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const raw = e.target.value           // string
  const parsed = raw === "" ? undefined : parseFloat(raw)

  updateProduct(id, field, parsed ?? 0) // păstrăm 0 doar când vrem noi
}

  const hasValidationError = (p: ProductItem) => {
    const nameOk = (p.name || "").trim().length > 0
    const priceOk = (Number(p.price) || 0) >= 0
    const qtyOk = (Number(p.quantity) || 0) >= 1
    return !(nameOk && priceOk && qtyOk)
  }

  const openEditor = (p: ProductItem) => {
    if (disabled) return
    setEditingId(p.id)
    setDraft({ ...p })
  }

  const closeEditor = () => {
    setEditingId(null)
    setDraft(null)
  }

  const saveEditor = () => {
    if (!draft) return
    const nextProducts = products.map((p) => {
      if (p.id !== draft.id) return p
      const nextQuantity = draft.quantity === (undefined as unknown as number) ? 0 : Number(draft.quantity) || 0
      const nextPrice = draft.price === (undefined as unknown as number) ? 0 : Number(draft.price) || 0
      return {
        ...p,
        name: draft.name,
        um: draft.um,
        quantity: nextQuantity,
        price: nextPrice,
        total: nextQuantity * nextPrice,
      }
    })
    onProductsChange(nextProducts)
    closeEditor()
  }

  return (
    <div className="space-y-4">
      {showTitle && (
        <h3 className="text-lg font-medium">Calcul costuri pentru remediere</h3>
      )}

      {!isMobile ? (
        <div className="overflow-x-auto overflow-y-auto rounded border max-h-[60vh]">
          <table className="w-full text-sm table-fixed">
          <thead className="bg-muted">
            <tr>
              <th className="px-2 py-2 text-left w-10">Nr.</th>
              <th className="px-3 py-2 text-left">Denumire</th>
              <th className="px-2 py-2 text-right w-32">PU (lei)</th>
              <th className="px-2 py-2 text-right w-24">Buc</th>
              <th className="px-2 py-2 text-right w-28">Total</th>
              <th className="px-1 py-2 text-right w-10">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Nu există poziții. Adăugați un rând.</td>
              </tr>
            ) : (
              products.map((p, idx) => {
                const invalid = hasValidationError(p)
                return (
                  <tr key={p.id} className={invalid ? "bg-red-50" : ""}>
                    <td className="px-2 py-2 align-top text-center">{idx + 1}</td>
                    <td className="px-3 py-2 align-top">
                      <Textarea
                        id={`name-${p.id}`}
                        value={p.name}
                        onChange={(e) => updateProduct(p.id, "name", e.target.value)}
                        placeholder="Denumire produs/serviciu"
                        className="min-h-[60px] text-sm w-full resize-none"
                        disabled={disabled}
                        onFocus={(e) => { lastFocusedFieldIdRef.current = e.currentTarget.id }}
                      />
                    </td>
                    <td className="px-2 py-2 align-top w-32">
                      <Input
                        id={`price-${p.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.price === 0 ? "" : String(p.price)}
                        onChange={handleNumberChange(p.id, "price")}
                        disabled={disabled}
                        className="text-right text-xs"
                      onFocus={(e) => { lastFocusedFieldIdRef.current = e.currentTarget.id }}
                      />
                    </td>
                    <td className="px-2 py-2 align-top w-24">
                      <Input
                        id={`quantity-${p.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={p.quantity === 0 ? "" : String(p.quantity)}
                        onChange={handleNumberChange(p.id, "quantity")}
                        disabled={disabled}
                        className="text-right text-xs"
                      onFocus={(e) => { lastFocusedFieldIdRef.current = e.currentTarget.id }}
                      />
                    </td>
                    <td className="px-2 py-2 align-top text-right font-medium text-xs">{(Number(p.total) || 0).toFixed(2)}</td>
                    <td className="px-1 py-2 align-top text-center">
                      <Button variant="ghost" size="sm" onClick={() => removeProduct(p.id)} disabled={disabled} className="h-6 w-6 p-0">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-yellow-50">
              <td colSpan={4} className="px-3 py-2 text-right font-medium">Total lei fără TVA</td>
              <td className="px-3 py-2 text-right font-bold">{totalWithoutVAT.toFixed(2)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {products.length === 0 && (
            <div className="text-sm text-muted-foreground">Nu există poziții. Adăugați un rând.</div>
          )}
          {products.map((p, idx) => (
            <Card key={p.id} className="border">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">#{idx + 1} • {p.um} • {p.quantity} × {Number(p.price || 0).toFixed(2)} lei</div>
                    <div className="font-medium line-clamp-2">{p.name || "—"}</div>
                    <div className="text-sm mt-1">Total: <span className="font-semibold">{(Number(p.total) || 0).toFixed(2)} lei</span></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => openEditor(p)} disabled={disabled}>Editează</Button>
                    <Button variant="ghost" size="icon" onClick={() => removeProduct(p.id)} disabled={disabled}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={addProduct} disabled={disabled} className="gap-1">
          <Plus className="h-4 w-4" /> Adaugă produs
        </Button>
        <div className="text-xs text-muted-foreground">Valută: RON</div>
      </div>

      {/* Dialog editor mobil */}
      <Dialog open={!!editingId} onOpenChange={(open) => { if (!open) closeEditor() }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Editează produs</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Denumire</label>
              <Textarea
                value={draft?.name || ""}
                onChange={(e) => setDraft((d) => ({ ...(d as ProductItem), name: e.target.value }))}
                placeholder="Denumire produs/serviciu"
                disabled={disabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">UM</label>
                <Input
                  value={draft?.um || ""}
                  onChange={(e) => setDraft((d) => ({ ...(d as ProductItem), um: e.target.value }))}
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Buc</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft?.quantity === undefined || draft?.quantity === null ? "" : String(draft.quantity)}
                  onChange={(e) => {
                    const v = e.target.value
                    setDraft((d) => ({ ...(d as ProductItem), quantity: v === "" ? (undefined as unknown as number) : Number(v) }))
                  }}
                  disabled={disabled}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">PU (lei)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft?.price === undefined || draft?.price === null ? "" : String(draft.price)}
                  onChange={(e) => {
                    const v = e.target.value
                    setDraft((d) => ({ ...(d as ProductItem), price: v === "" ? (undefined as unknown as number) : parseFloat(v) }))
                  }}
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Total (lei)</label>
                <Input value={((Number(draft?.quantity) || 0) * (Number(draft?.price) || 0)).toFixed(2)} readOnly />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeEditor}>Anulează</Button>
            <Button onClick={saveEditor} disabled={disabled}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
