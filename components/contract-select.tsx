"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

interface ContractSelectProps {
  value: string
  onChange: (value: string) => void
  hasError?: boolean
  errorStyle?: string
}

export function ContractSelect({ value, onChange, hasError = false, errorStyle = "" }: ContractSelectProps) {
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newContractName, setNewContractName] = useState("")
  const [newContractNumber, setNewContractNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Încărcăm contractele din Firestore
  useEffect(() => {
    const fetchContracts = async () => {
      try {
        setLoading(true)
        // Verificăm dacă colecția există, dacă nu, o vom crea când adăugăm primul contract
        const contractsQuery = query(collection(db, "contracts"), orderBy("name", "asc"))

        const unsubscribe = onSnapshot(
          contractsQuery,
          (snapshot) => {
            const contractsData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            setContracts(contractsData)
            setLoading(false)
          },
          (error) => {
            console.error("Eroare la încărcarea contractelor:", error)
            // Dacă colecția nu există încă, nu afișăm eroare
            if (error.code !== "permission-denied") {
              console.error("Eroare la încărcarea contractelor:", error)
            }
            setLoading(false)
          },
        )

        return () => unsubscribe()
      } catch (error) {
        console.error("Eroare la încărcarea contractelor:", error)
        setLoading(false)
      }
    }

    fetchContracts()
  }, [])

  // Funcție pentru adăugarea unui contract nou
  const handleAddContract = async () => {
    if (!newContractName || !newContractNumber) return

    try {
      setIsSubmitting(true)

      // Adăugăm contractul în Firestore
      await addDoc(collection(db, "contracts"), {
        name: newContractName,
        number: newContractNumber,
        createdAt: serverTimestamp(),
      })

      // Resetăm formularul și închidem dialogul
      setNewContractName("")
      setNewContractNumber("")
      setIsAddDialogOpen(false)
    } catch (error) {
      console.error("Eroare la adăugarea contractului:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="contract" className={`flex-1 ${hasError ? errorStyle : ""}`}>
          <SelectValue placeholder={loading ? "Se încarcă..." : "Selectați contractul"} />
        </SelectTrigger>
        <SelectContent>
          {loading ? (
            <div className="flex items-center justify-center p-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Se încarcă...</span>
            </div>
          ) : contracts.length > 0 ? (
            contracts.map((contract) => (
              <SelectItem key={contract.id} value={contract.id}>
                {contract.name} ({contract.number})
              </SelectItem>
            ))
          ) : (
            <div className="p-2 text-center text-sm text-muted-foreground">Nu există contracte disponibile</div>
          )}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" onClick={() => setIsAddDialogOpen(true)}>
        <Plus className="h-4 w-4" />
      </Button>

      {/* Dialog pentru adăugarea unui contract nou */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adaugă Contract Nou</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contractName">Nume Contract</Label>
              <Input
                id="contractName"
                value={newContractName}
                onChange={(e) => setNewContractName(e.target.value)}
                placeholder="Introduceți numele contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractNumber">Număr Contract</Label>
              <Input
                id="contractNumber"
                value={newContractNumber}
                onChange={(e) => setNewContractNumber(e.target.value)}
                placeholder="Introduceți numărul contractului"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Anulează
              </Button>
              <Button onClick={handleAddContract} disabled={isSubmitting || !newContractName || !newContractNumber}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                  </>
                ) : (
                  "Adaugă"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
