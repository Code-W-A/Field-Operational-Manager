"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsMobile } from "@/components/ui/use-mobile"
import { cn } from "@/lib/utils"
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
  allowDecimalQuantity?: boolean
  /** Clase pentru containerul scrollabil al tabelului (desktop). Implicit max-h-[60vh]. */
  tableScrollClassName?: string
}

export function ProductTableForm({
  products,
  onProductsChange,
  disabled = false,
  showTitle = true,
  allowDecimalQuantity = false,
  tableScrollClassName = "max-h-[60vh]",
}: ProductTableFormProps) {
  const isMobile = useIsMobile()
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<ProductItem | null>(null)
  const [numberDrafts, setNumberDrafts] = React.useState<Record<string, string>>({})
  const lastFocusedFieldIdRef = React.useRef<string | null>(null)

  const normalizeDecimalInput = (value: string) =>
    value.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")

  const parseDecimalInput = (value: string) => {
    const normalized = normalizeDecimalInput(value)
    return normalized === "" ? undefined : parseFloat(normalized)
  }

  const numberDraftKey = (id: string, field: "price" | "quantity") => `${id}:${field}`

  const clearNumberDraft = (id: string, field: "price" | "quantity") => {
    const key = numberDraftKey(id, field)
    setNumberDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

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
  const handleNumberChange = (id: string, field: "price" | "quantity", rawValue: string) => {
    const parsed = parseDecimalInput(rawValue)
    updateProduct(id, field, parsed ?? 0)
  }

  const hasValidationError = (p: ProductItem) => {
    const nameOk = (p.name || "").trim().length > 0
    const priceOk = (Number(p.price) || 0) >= 0
    const qtyOk = allowDecimalQuantity ? (Number(p.quantity) || 0) > 0 : (Number(p.quantity) || 0) >= 1
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
        <div
          className={cn(
            "overflow-x-auto overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-sm",
            tableScrollClassName
          )}
        >
          <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-[1] border-b border-neutral-200 bg-neutral-100/95 backdrop-blur-sm">
            <tr>
              <th className="w-11 shrink-0 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Nr.
              </th>
              <th className="min-w-[240px] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Denumire
              </th>
              <th className="w-28 shrink-0 px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-600">
                PU (lei)
              </th>
              <th className="w-24 shrink-0 px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Buc
              </th>
              <th className="w-28 shrink-0 px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Total
              </th>
              <th className="w-11 shrink-0 px-1 py-2.5 text-center text-xs font-semibold text-neutral-600">&nbsp;</th>
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
                const priceKey = numberDraftKey(p.id, "price")
                const quantityKey = numberDraftKey(p.id, "quantity")
                return (
                  <tr key={p.id} className={cn("border-b border-neutral-100", invalid ? "bg-red-50" : "hover:bg-neutral-50/80")}>
                    <td className="px-2 py-2.5 align-top text-center text-sm text-muted-foreground">{idx + 1}</td>
                    <td className="min-w-[240px] px-3 py-2.5 align-top">
                      <Textarea
                        id={`name-${p.id}`}
                        value={p.name}
                        onChange={(e) => updateProduct(p.id, "name", e.target.value)}
                        placeholder="Denumire produs sau serviciu"
                        className="min-h-[72px] w-full resize-y text-sm leading-relaxed"
                        disabled={disabled}
                        rows={3}
                        onFocus={(e) => { lastFocusedFieldIdRef.current = e.currentTarget.id }}
                      />
                    </td>
                    <td className="w-28 shrink-0 px-2 py-2.5 align-top">
                      <Input
                        id={`price-${p.id}`}
                        type="text"
                        inputMode="decimal"
                        value={numberDrafts[priceKey] ?? (p.price === 0 ? "" : String(p.price))}
                        onChange={(e) => {
                          const norm = normalizeDecimalInput(e.target.value)
                          setNumberDrafts((prev) => ({ ...prev, [priceKey]: norm }))
                          handleNumberChange(p.id, "price", norm)
                        }}
                        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                        disabled={disabled}
                        className="h-9 text-right text-sm tabular-nums"
                        onFocus={(e) => {
                          lastFocusedFieldIdRef.current = e.currentTarget.id
                          setNumberDrafts((prev) => ({ ...prev, [priceKey]: p.price === 0 ? "" : String(p.price) }))
                        }}
                        onBlur={() => clearNumberDraft(p.id, "price")}
                      />
                    </td>
                    <td className="w-24 shrink-0 px-2 py-2.5 align-top">
                      <Input
                        id={`quantity-${p.id}`}
                        type="text"
                        inputMode={allowDecimalQuantity ? "decimal" : "numeric"}
                        pattern={allowDecimalQuantity ? "[0-9]+([.,][0-9]+)?" : "[0-9]*"}
                        value={numberDrafts[quantityKey] ?? (p.quantity === 0 ? "" : String(p.quantity))}
                        onChange={(e) => {
                          const normalized = allowDecimalQuantity
                            ? normalizeDecimalInput(e.target.value)
                            : e.target.value.replace(/\D+/g, "")
                          setNumberDrafts((prev) => ({ ...prev, [quantityKey]: normalized }))
                          handleNumberChange(p.id, "quantity", normalized)
                        }}
                        onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                        disabled={disabled}
                        className="h-9 text-right text-sm tabular-nums"
                        onFocus={(e) => {
                          lastFocusedFieldIdRef.current = e.currentTarget.id
                          setNumberDrafts((prev) => ({ ...prev, [quantityKey]: p.quantity === 0 ? "" : String(p.quantity) }))
                        }}
                        onBlur={() => clearNumberDraft(p.id, "quantity")}
                      />
                    </td>
                    <td className="w-28 shrink-0 px-2 py-2.5 align-top text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {(Number(p.total) || 0).toFixed(2)}
                    </td>
                    <td className="px-1 py-2.5 align-top text-center">
                      <Button variant="ghost" size="sm" onClick={() => removeProduct(p.id)} disabled={disabled} className="h-8 w-8 p-0 text-neutral-500 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-amber-200/80 bg-amber-50/90">
              <td colSpan={4} className="px-3 py-3 text-right text-sm font-semibold text-amber-950">
                Total lei fără TVA
              </td>
              <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-amber-950">
                {totalWithoutVAT.toFixed(2)}
              </td>
              <td className="px-3 py-3" />
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

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Button variant="outline" onClick={addProduct} disabled={disabled} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" /> Adaugă produs
        </Button>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
          Valută: RON
        </div>
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
                  type="text"
                  inputMode={allowDecimalQuantity ? "decimal" : "numeric"}
                  pattern={allowDecimalQuantity ? "[0-9]+([.,][0-9]+)?" : "[0-9]*"}
                  min={allowDecimalQuantity ? "0.01" : "1"}
                  step={allowDecimalQuantity ? "0.01" : "1"}
                  value={draft?.quantity === undefined || draft?.quantity === null ? "" : String(draft.quantity)}
                  onChange={(e) => {
                    const v = allowDecimalQuantity ? normalizeDecimalInput(e.target.value) : e.target.value.replace(/\D+/g, "")
                    setDraft((d) => ({ ...(d as ProductItem), quantity: v === "" ? (undefined as unknown as number) : (v as unknown as number) }))
                  }}
                  disabled={disabled}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">PU (lei)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]+)?"
                  min="0"
                  step="0.01"
                  value={draft?.price === undefined || draft?.price === null ? "" : String(draft.price)}
                  onChange={(e) => {
                    const v = normalizeDecimalInput(e.target.value)
                    setDraft((d) => ({ ...(d as ProductItem), price: v === "" ? (undefined as unknown as number) : (v as unknown as number) }))
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
