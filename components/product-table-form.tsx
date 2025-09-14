"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

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

  return (
    <div className="space-y-4">
      {showTitle && (
        <h3 className="text-lg font-medium">Calcul costuri pentru remediere</h3>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left w-16">Nr. Crt.</th>
              <th className="px-3 py-2 text-left">Denumire</th>
              <th className="px-3 py-2 text-right w-28">PU (lei)</th>
              <th className="px-3 py-2 text-right w-24">Buc</th>
              <th className="px-3 py-2 text-right w-32">Total (lei)</th>
              <th className="px-3 py-2 text-right w-10">&nbsp;</th>
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
                    <td className="px-3 py-2 align-top">{idx + 1}</td>
                    <td className="px-3 py-2 align-top">
                      <Textarea
                        id={`name-${p.id}`}
                        value={p.name}
                        onChange={(e) => updateProduct(p.id, "name", e.target.value)}
                        placeholder="Denumire produs/serviciu"
                        className="min-h-[60px]"
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        id={`price-${p.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.price === 0 ? "" : String(p.price)}
                        onChange={handleNumberChange(p.id, "price")}
                        disabled={disabled}
                        className="text-right"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        id={`quantity-${p.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={p.quantity === 0 ? "" : String(p.quantity)}
                        onChange={handleNumberChange(p.id, "quantity")}
                        disabled={disabled}
                        className="text-right"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-right font-medium">{(Number(p.total) || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 align-top text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeProduct(p.id)} disabled={disabled}>
                        <Trash2 className="h-4 w-4" />
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

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={addProduct} disabled={disabled} className="gap-1">
          <Plus className="h-4 w-4" /> Adaugă rând
        </Button>
        <div className="text-xs text-muted-foreground">Valută: RON</div>
      </div>
    </div>
  )
}
