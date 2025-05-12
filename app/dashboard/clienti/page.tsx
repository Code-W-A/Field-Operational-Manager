"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { collection, query, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { useFirestoreQuery } from "@/hooks/use-firebase-collection"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { ClientForm } from "@/components/client-form"
import { ClientEditForm } from "@/components/client-edit-form"
import { DataTable } from "@/components/data-table/data-table"
import { clientColumns } from "./columns"
import { Spinner } from "@/components/ui/spinner"
import { PlusCircle, Trash2 } from "lucide-react"
import { deleteDoc, doc } from "firebase/firestore"
import { toast } from "sonner"

export default function ClientsPage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<"close-add" | "close-edit" | null>(null)

  const addFormRef = useRef<{ hasUnsavedChanges: () => boolean }>(null)
  const editFormRef = useRef<{ hasUnsavedChanges: () => boolean }>(null)

  const router = useRouter()

  const clientsQuery = query(collection(db, "clients"), orderBy("companyName", "asc"))

  const { data: clients, isLoading } = useFirestoreQuery(clientsQuery)

  const handleAddClient = () => {
    setAddDialogOpen(true)
  }

  const handleEditClient = (client: any) => {
    setSelectedClient(client)
    setEditDialogOpen(true)
  }

  const handleDeleteClient = (client: any) => {
    setSelectedClient(client)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!selectedClient) return

    try {
      await deleteDoc(doc(db, "clients", selectedClient.id))
      toast.success("Client șters cu succes")
      setDeleteDialogOpen(false)
    } catch (error) {
      console.error("Error deleting client:", error)
      toast.error("Eroare la ștergerea clientului")
    }
  }

  const handleCloseAddDialog = () => {
    if (addFormRef.current?.hasUnsavedChanges()) {
      setPendingAction("close-add")
      setConfirmDialogOpen(true)
    } else {
      setAddDialogOpen(false)
    }
  }

  const handleCloseEditDialog = () => {
    if (editFormRef.current?.hasUnsavedChanges()) {
      setPendingAction("close-edit")
      setConfirmDialogOpen(true)
    } else {
      setEditDialogOpen(false)
    }
  }

  const handleConfirmAction = () => {
    setConfirmDialogOpen(false)

    if (pendingAction === "close-add") {
      setAddDialogOpen(false)
    } else if (pendingAction === "close-edit") {
      setEditDialogOpen(false)
    }

    setPendingAction(null)
  }

  const handleCancelAction = () => {
    setConfirmDialogOpen(false)
    setPendingAction(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Clienți</h1>
        <Button onClick={handleAddClient}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adaugă Client
        </Button>
      </div>

      <DataTable
        columns={clientColumns}
        data={clients || []}
        onEdit={handleEditClient}
        onDelete={handleDeleteClient}
        searchField="companyName"
      />

      {/* Add Client Dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseAddDialog()
          else setAddDialogOpen(true)
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adaugă Client Nou</DialogTitle>
          </DialogHeader>
          <ClientForm onSuccess={() => setAddDialogOpen(false)} onCancel={handleCloseAddDialog} ref={addFormRef} />
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseEditDialog()
          else setEditDialogOpen(true)
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează Client</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <ClientEditForm
              client={selectedClient}
              onSuccess={() => setEditDialogOpen(false)}
              onCancel={handleCloseEditDialog}
              ref={editFormRef}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ești sigur?</AlertDialogTitle>
            <AlertDialogDescription>
              Această acțiune va șterge clientul {selectedClient?.companyName} și nu poate fi anulată.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
              Șterge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modificări nesalvate</AlertDialogTitle>
            <AlertDialogDescription>
              Ai modificări nesalvate. Ești sigur că vrei să închizi fără a salva?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelAction}>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} className="bg-red-600 hover:bg-red-700">
              Închide fără salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
