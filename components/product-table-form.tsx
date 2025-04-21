"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface Product {
  id: string
  name: string
  um: string
  quantity: number
  price: number
}

interface ProductTableFormProps {
  products: Product[]
  onProductsChange: (products: Product[]) => void
}

export function ProductTableForm({ products, onProductsChange }: ProductTableFormProps) {
  const [newProduct, setNewProduct] = useState<Omit<Product, "id">>({
    name: "",
    um: "buc",
    quantity: 1,
    price: 0,
  })

  const addProduct = () => {
    if (!newProduct.name) return

    const product: Product = {
      id: Date.now().toString(),
      ...newProduct,
    }

    onProductsChange([...products, product])
    setNewProduct({
      name: "",
      um: "buc",
      quantity: 1,
      price: 0,
    })
  }

  const removeProduct = (id: string) => {
    onProductsChange(products.filter((product) => product.id !== id))
  }

  const updateProduct = (id: string, field: keyof Omit<Product, "id">, value: string | number) => {
    onProductsChange(
      products.map((product) =>
        product.id === id
          ? {
              ...product,
              [field]: field === "quantity" || field === "price" ? Number.parseFloat(value as string) || 0 : value,
            }
          : product,
      ),
    )
  }

  const calculateTotal = (quantity: number, price: number) => {
    return (quantity * price).toFixed(2)
  }

  const calculateSubtotal = () => {
    return products.reduce((sum, product) => sum + product.quantity * product.price, 0).toFixed(2)
  }

  const calculateTotalWithVAT = () => {
    const subtotal = Number.parseFloat(calculateSubtotal())
    return (subtotal * 1.19).toFixed(2) // 19% TVA
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Produse și servicii</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">Nr.</TableHead>
                <TableHead>Denumire produse</TableHead>
                <TableHead className="w-[80px]">UM</TableHead>
                <TableHead className="w-[100px]">Cantitate</TableHead>
                <TableHead className="w-[120px]">Preț unitar</TableHead>
                <TableHead className="w-[120px]">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, index) => (
                <TableRow key={product.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Input value={product.name} onChange={(e) => updateProduct(product.id, "name", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={product.um} onChange={(e) => updateProduct(product.id, "um", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={product.quantity}
                      onChange={(e) => updateProduct(product.id, "quantity", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={product.price}
                      onChange={(e) => updateProduct(product.id, "price", e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{calculateTotal(product.quantity, product.price)} RON</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeProduct(product.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell></TableCell>
                <TableCell>
                  <Input
                    placeholder="Adaugă produs nou"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input value={newProduct.um} onChange={(e) => setNewProduct({ ...newProduct, um: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={newProduct.quantity}
                    onChange={(e) => setNewProduct({ ...newProduct, quantity: Number.parseFloat(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: Number.parseFloat(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addProduct}
                    disabled={!newProduct.name}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adaugă
                  </Button>
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex flex-col items-end space-y-2 pt-4">
            <div className="flex justify-between w-[240px]">
              <span className="font-medium">Total fără TVA:</span>
              <span>{calculateSubtotal()} RON</span>
            </div>
            <div className="flex justify-between w-[240px]">
              <span className="font-medium">Total cu TVA (19%):</span>
              <span className="font-bold">{calculateTotalWithVAT()} RON</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
