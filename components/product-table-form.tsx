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

interface ProductTableFormProps {
  products: ProductItem[]
  onProductsChange: (products: ProductItem[]) => void
}

export function ProductTableForm({ products, onProductsChange }: ProductTableFormProps) {
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
          updatedProduct.total = updatedProduct.quantity * updatedProduct.price
        }

        return updatedProduct
      }
      return product
    })

    onProductsChange(updatedProducts)
  }

  // Calculăm totalul general
  const totalWithoutVAT = products.reduce((sum, product) => sum + product.total, 0)
  const totalWithVAT = totalWithoutVAT * 1.19 // Presupunem TVA 19%

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Produse și servicii</h3>

      {products.length > 0 ? (
        <div className="space-y-4">
          {products.map((product, index) => (
            <Card key={product.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="font-medium">Produs #{index + 1}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProduct(product.id)}
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor={`name-${product.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                      Denumire produs/serviciu
                    </label>
                    <Textarea
                      id={`name-${product.id}`}
                      value={product.name}
                      onChange={(e) => updateProduct(product.id, "name", e.target.value)}
                      placeholder="Descriere detaliată a produsului sau serviciului"
                      className="min-h-[80px] resize-y"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor={`um-${product.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                        UM
                      </label>
                      <Input
                        id={`um-${product.id}`}
                        value={product.um}
                        onChange={(e) => updateProduct(product.id, "um", e.target.value)}
                        placeholder="buc"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`quantity-${product.id}`}
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Cantitate
                      </label>
                      <Input
                        id={`quantity-${product.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={product.quantity}
                        onChange={(e) => updateProduct(product.id, "quantity", Number.parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div>
                      <label htmlFor={`price-${product.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Preț unitar
                      </label>
                      <Input
                        id={`price-${product.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.price}
                        onChange={(e) => updateProduct(product.id, "price", Number.parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                      <div className="h-10 px-3 py-2 rounded-md border border-input bg-background text-sm font-medium flex items-center">
                        {product.total.toFixed(2)} lei
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border rounded-md bg-muted/20">
          <p className="text-muted-foreground">
            Nu există produse adăugate. Folosiți butonul de mai jos pentru a adăuga.
          </p>
        </div>
      )}

      <Button variant="outline" onClick={addProduct} className="gap-1">
        <Plus className="h-4 w-4" /> Adaugă produs
      </Button>

      {products.length > 0 && (
        <div className="flex flex-col items-end space-y-2 pt-4">
          <div className="flex justify-between w-full max-w-[300px]">
            <span className="font-medium">Total fără TVA:</span>
            <span>{totalWithoutVAT.toFixed(2)} lei</span>
          </div>
          <div className="flex justify-between w-full max-w-[300px]">
            <span className="font-medium">Total cu TVA (19%):</span>
            <span className="font-bold">{totalWithVAT.toFixed(2)} lei</span>
          </div>
        </div>
      )}
    </div>
  )
}
