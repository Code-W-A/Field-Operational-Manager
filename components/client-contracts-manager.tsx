"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Plus, Trash2, AlertTriangle, CheckCircle, X } from "lucide-react"
import {
  getContractsByClient,
  getUnassignedContracts,
  assignContractToClient,
  unassignContractFromClient,
  isContractAvailableForClient,
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
      const validation = await validateContractAssignment(selectedContract.number, clientId)
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
      <Card>
        <CardHeader>
          <CardTitle>Contracte Client</CardTitle>
          <CardDescription>Se încarcă contractele...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Contracte Client: {clientName}</span>
            <Button
              onClick={() => setIsAssignDialogOpen(true)}
              disabled={availableContracts.length === 0}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Asignează Contract
            </Button>
          </CardTitle>
          <CardDescription>
            Gestionează contractele asignate acestui client
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clientContracts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Clientul nu are contracte asignate</p>
              {availableContracts.length > 0 && (
                <p className="text-sm mt-2">Folosiți butonul "Asignează Contract" pentru a adăuga un contract</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {clientContracts.map((contract) => (
                <div
                  key={contract.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{contract.name}</h4>
                      <Badge variant="outline">{contract.number}</Badge>
                      <Badge variant="secondary">{contract.type}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setContractToRemove(contract)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {availableContracts.length === 0 && clientContracts.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <p>Nu există contracte disponibile pentru asignare</p>
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