"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { Plus, AlertTriangle, CheckCircle, X, ExternalLink } from "lucide-react"
import {
  getContractsByClient,
  getUnassignedContracts,
  assignContractToClient,
  unassignContractFromClient,
  validateContractAssignment
} from "@/lib/firebase/firestore"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ClientContractsManagerProps {
  clientId: string
  clientName: string
  onContractsChange?: () => void
}

interface Contract {
  id: string
  name: string
  number: string
  type: string
  clientId?: string
}

export function ClientContractsManager({ clientId, clientName, onContractsChange }: ClientContractsManagerProps) {
  const [clientContracts, setClientContracts] = useState<Contract[]>([])
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [selectedContractId, setSelectedContractId] = useState("")
  const [isAssigning, setIsAssigning] = useState(false)
  const [contractToRemove, setContractToRemove] = useState<Contract | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  // Încărcăm contractele clientului și cele disponibile
  useEffect(() => {
    loadContracts()
  }, [clientId])

  const loadContracts = async () => {
    try {
      setLoading(true)
      const [assigned, unassigned] = await Promise.all([
        getContractsByClient(clientId),
        getUnassignedContracts()
      ])
      
      setClientContracts(assigned as Contract[])
      setAvailableContracts(unassigned as Contract[])
    } catch (error) {
      console.error("Eroare la încărcarea contractelor:", error)
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca contractele",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAssignContract = async () => {
    if (!selectedContractId) return

    try {
      setIsAssigning(true)
      
      // Găsim contractul selectat pentru a obține numărul
      const selectedContract = availableContracts.find(c => c.id === selectedContractId)
      if (!selectedContract) {
        toast({
          title: "Eroare",
          description: "Contractul selectat nu a fost găsit",
          variant: "destructive",
        })
        return
      }

      // Folosim sistemul robust de validare
      const validation = await validateContractAssignment(selectedContract.number, clientId, selectedContract.id)
      if (!validation.isValid) {
        toast({
          title: "Contract indisponibil",
          description: validation.error,
          variant: "destructive",
        })
        return
      }

      await assignContractToClient(selectedContractId, clientId)
      
      toast({
        title: "Contract asignat",
        description: "Contractul a fost asignat cu succes clientului",
      })
      
      // Reîncărcăm contractele
      await loadContracts()
      setIsAssignDialogOpen(false)
      setSelectedContractId("")
      
      if (onContractsChange) {
        onContractsChange()
      }
    } catch (error: any) {
      console.error("Eroare la asignarea contractului:", error)
      toast({
        title: "Eroare",
        description: error.message || "Nu s-a putut asigna contractul",
        variant: "destructive",
      })
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRemoveContract = async () => {
    if (!contractToRemove) return

    try {
      setIsRemoving(true)
      await unassignContractFromClient(contractToRemove.id)
      
      toast({
        title: "Contract eliminat",
        description: "Contractul a fost eliminat de la client",
      })
      
      // Reîncărcăm contractele
      await loadContracts()
      setContractToRemove(null)
      
      if (onContractsChange) {
        onContractsChange()
      }
    } catch (error) {
      console.error("Eroare la eliminarea contractului:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut elimina contractul",
        variant: "destructive",
      })
    } finally {
      setIsRemoving(false)
    }
  }

  if (loading) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">Contracte Client</CardTitle>
          <CardDescription className="text-xs">Se încarcă contractele...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
      <Card className="flex h-full flex-col">
        <CardHeader className="space-y-2 border-b px-4 py-3">
          <CardTitle className="text-sm">
            <span className="min-w-0 truncate">Contracte Client: {clientName}</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {availableContracts.length === 0 ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5"
                >
                  <Link href="/dashboard/contracte">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Creează Contract
                  </Link>
                </Button>
                <Button
                  onClick={() => setIsAssignDialogOpen(true)}
                  disabled={true}
                  size="sm"
                  className="h-8 px-2.5"
                  title="Nu există contracte disponibile. Creați un contract nou sau eliberați unul existent."
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Asignează Contract
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsAssignDialogOpen(true)}
                size="sm"
                className="h-8 px-2.5"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Asignează Contract
              </Button>
            )}
          </div>
          <CardDescription className="text-xs">
            {availableContracts.length === 0 ? (
              <span className="text-muted-foreground">Nu există contracte disponibile pentru asignare.</span>
            ) : (
              <span>Gestionează contractele asignate acestui client ({availableContracts.length} disponibile)</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 p-4">
          {clientContracts.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-7 w-7 opacity-40" />
              <p className="text-sm font-medium">Nu există contracte atribuite</p>
              {availableContracts.length > 0 && (
                <p className="mt-1 text-xs">Folosiți "Asignează Contract" pentru a adăuga unul.</p>
              )}
              {availableContracts.length === 0 && (
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="mt-1 text-xs">Creați un contract nou pentru acest client.</p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5"
                  >
                    <Link href="/dashboard/contracte">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Creează Contract Nou
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {clientContracts.map((contract) => (
                <div
                  key={contract.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-2.5 transition-colors hover:border-primary/40 hover:bg-muted/50 focus-within:border-primary/40 focus-within:bg-muted/50"
                >
                  <Link
                    href={`/dashboard/contracte/${contract.id}`}
                    className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Deschide contractul ${contract.name}, ${contract.number}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4 className="min-w-0 truncate text-sm font-medium">{contract.name}</h4>
                      <Badge variant="outline" className="text-xs">{contract.number}</Badge>
                      <Badge variant="secondary" className="text-xs">{contract.type}</Badge>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setContractToRemove(contract)}
                    className="h-8 w-8 shrink-0 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog pentru asignarea unui contract */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Asignează Contract la Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Client:</label>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">{clientName}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Selectează Contract:</label>
              <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectează un contract disponibil" />
                </SelectTrigger>
                <SelectContent>
                  {availableContracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      <div className="flex items-center gap-2">
                        <span>{contract.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {contract.number}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {contract.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {availableContracts.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nu există contracte disponibile pentru asignare</p>
                <p className="text-xs mt-1">Toate contractele sunt deja asignate la alți clienți</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                Anulează
              </Button>
              <Button
                onClick={handleAssignContract}
                disabled={!selectedContractId || isAssigning}
              >
                {isAssigning ? "Se asignează..." : "Asignează Contract"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru confirmarea eliminării */}
      <AlertDialog open={!!contractToRemove} onOpenChange={() => setContractToRemove(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Elimină Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Sunteți sigur că doriți să eliminați contractul "{contractToRemove?.name}" ({contractToRemove?.number}) de la clientul {clientName}?
              <br /><br />
              Contractul va deveni disponibil pentru asignare la alți clienți.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => setContractToRemove(null)}>
              Anulează
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveContract}
              disabled={isRemoving}
              className="bg-red-600 hover:bg-red-700"
            >
              {isRemoving ? "Se elimină..." : "Elimină Contract"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
