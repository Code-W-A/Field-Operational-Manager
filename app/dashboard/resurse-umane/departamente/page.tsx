"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Pencil, Trash2, Building2, Search, AlertCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import type { Department } from "@/lib/hr/types"
import { subscribeDepartments, createOrUpdateDepartment, deleteDepartment } from "@/lib/hr/storage"
import { Textarea } from "@/components/ui/textarea"

export default function DepartamentePage() {
  const { userData } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showInactive, setShowInactive] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [dialogName, setDialogName] = useState("")
  const [dialogDescription, setDialogDescription] = useState("")
  const [dialogActive, setDialogActive] = useState(true)
  const [saving, setSaving] = useState(false)

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeDepartments({
      onChange: (deps) => {
        setDepartments(deps)
        setLoading(false)
      },
      onError: (err) => {
        console.error("Error loading departments:", err)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca departamentele.",
          variant: "destructive",
        })
        setLoading(false)
      },
    })

    return () => unsubscribe()
  }, [])

  const filteredDepartments = departments.filter((dept) => {
    const matchesSearch =
      dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dept.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesActive = showInactive || dept.active
    return matchesSearch && matchesActive
  })

  const handleOpenCreateDialog = () => {
    setEditingDepartment(null)
    setDialogName("")
    setDialogDescription("")
    setDialogActive(true)
    setDialogOpen(true)
  }

  const handleOpenEditDialog = (dept: Department) => {
    setEditingDepartment(dept)
    setDialogName(dept.name)
    setDialogDescription(dept.description || "")
    setDialogActive(dept.active)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!dialogName.trim()) {
      toast({
        title: "Eroare",
        description: "Numele departamentului este obligatoriu.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      const department: Department = {
        id: editingDepartment?.id || `dept_${Date.now()}`,
        name: dialogName.trim(),
        description: dialogDescription.trim() || undefined,
        active: dialogActive,
        createdAt: editingDepartment?.createdAt || Date.now(),
        updatedAt: Date.now(),
        createdBy: editingDepartment?.createdBy || userData?.uid,
      }

      await createOrUpdateDepartment(department)

      toast({
        title: editingDepartment ? "Departament actualizat" : "Departament creat",
        description: `Departamentul "${department.name}" a fost salvat cu succes.`,
      })

      setDialogOpen(false)
    } catch (error) {
      console.error("Error saving department:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut salva departamentul.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = (dept: Department) => {
    setDepartmentToDelete(dept)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!departmentToDelete) return

    setDeleting(true)
    try {
      const result = await deleteDepartment(departmentToDelete.id)

      if (result.success) {
        toast({
          title: "Departament șters",
          description: `Departamentul "${departmentToDelete.name}" a fost șters cu succes.`,
        })
        setDeleteDialogOpen(false)
        setDepartmentToDelete(null)
      } else {
        toast({
          title: "Nu se poate șterge",
          description: result.error || "Departamentul este folosit de angajați.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting department:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut șterge departamentul.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleActive = async (dept: Department) => {
    try {
      const updated: Department = {
        ...dept,
        active: !dept.active,
        updatedAt: Date.now(),
      }
      await createOrUpdateDepartment(updated)
      toast({
        title: dept.active ? "Departament dezactivat" : "Departament reactivat",
        description: `Departamentul "${dept.name}" a fost ${dept.active ? "dezactivat" : "reactivat"}.`,
      })
    } catch (error) {
      console.error("Error toggling department active state:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut actualiza starea departamentului.",
        variant: "destructive",
      })
    }
  }

  // Access control
  if (userData && userData.role !== "admin") {
    return (
      <DashboardShell>
        <DashboardHeader heading="Departamente" text="" />
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="text-2xl font-semibold">Acces restricționat</div>
          <div className="text-muted-foreground">
            Această pagină este disponibilă doar pentru administratori.
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Departamente"
        text="Gestionează departamentele/sectoarele companiei"
      >
        <Button onClick={handleOpenCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Adaugă departament
        </Button>
      </DashboardHeader>

      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtrare și căutare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută departamente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-inactive"
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
                <Label htmlFor="show-inactive" className="cursor-pointer">
                  Arată inactive
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Departments table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Liste departamente
            </CardTitle>
            <CardDescription>
              {filteredDepartments.length} departament{filteredDepartments.length === 1 ? "" : "e"}
              {searchQuery && " (filtrat)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Se încarcă...</div>
              </div>
            ) : filteredDepartments.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-semibold">
                  {searchQuery
                    ? "Niciun departament găsit"
                    : "Niciun departament încă"}
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchQuery
                    ? "Încearcă să modifici criteriile de căutare."
                    : "Creează primul departament pentru a începe."}
                </p>
                {!searchQuery && (
                  <Button onClick={handleOpenCreateDialog} className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Creează departament
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nume</TableHead>
                    <TableHead>Descriere</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDepartments.map((dept) => (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dept.description || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={dept.active ? "default" : "secondary"}>
                          {dept.active ? "Activ" : "Inactiv"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(dept)}
                            title={dept.active ? "Dezactivează" : "Reactivează"}
                          >
                            <Switch checked={dept.active} className="pointer-events-none" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditDialog(dept)}
                            title="Editează"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(dept)}
                            title="Șterge"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {editingDepartment ? "Editează departament" : "Departament nou"}
            </DialogTitle>
            <DialogDescription>
              {editingDepartment
                ? "Modifică datele departamentului existent."
                : "Completează datele pentru departamentul nou."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Nume departament *</Label>
              <Input
                id="dept-name"
                value={dialogName}
                onChange={(e) => setDialogName(e.target.value)}
                placeholder="Ex: IT, HR, Vânzări, Producție"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-description">Descriere (opțional)</Label>
              <Textarea
                id="dept-description"
                value={dialogDescription}
                onChange={(e) => setDialogDescription(e.target.value)}
                placeholder="Descriere scurtă a departamentului..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="dept-active">Status activ</Label>
                <div className="text-sm text-muted-foreground">
                  Departamentele inactive nu vor fi disponibile pentru selecție
                </div>
              </div>
              <Switch
                id="dept-active"
                checked={dialogActive}
                onCheckedChange={setDialogActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Anulează
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Se salvează..." : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirmare ștergere
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi departamentul{" "}
              <span className="font-semibold">{departmentToDelete?.name}</span>?
              <br />
              <br />
              Această acțiune nu poate fi anulată. Departamentul nu poate fi șters dacă există
              angajați asociați cu el.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Anulează</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Se șterge..." : "Șterge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}
