"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Pencil, Plus, Trash2, ChevronLeft, ArrowUp, ArrowDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  createTechnicianGroup,
  deleteTechnicianGroupDoc,
  removeGroupIdFromAllTechnicians,
  subscribeTechnicianGroups,
  updateTechnicianGroup,
  type TechnicianGroup,
} from "@/lib/firebase/technician-groups"

export default function GrupuriTehnicieniPage() {
  const { toast } = useToast()
  const [groups, setGroups] = useState<TechnicianGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TechnicianGroup | null>(null)
  const [name, setName] = useState("")
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeTechnicianGroups(
      (list) => {
        setGroups(list)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub()
  }, [])

  const openCreate = () => {
    setEditing(null)
    const nextOrder = groups.length ? Math.max(...groups.map((g) => g.sortOrder)) + 1 : 0
    setName("")
    setSortOrder(nextOrder)
    setDialogOpen(true)
  }

  const openEdit = (g: TechnicianGroup) => {
    setEditing(g)
    setName(g.name)
    setSortOrder(g.sortOrder)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast({ variant: "destructive", title: "Nume lipsă", description: "Introduceți un nume pentru grup." })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateTechnicianGroup(editing.id, trimmed, sortOrder)
        toast({ title: "Grup actualizat" })
      } else {
        await createTechnicianGroup(trimmed, sortOrder)
        toast({ title: "Grup creat" })
      }
      setDialogOpen(false)
    } catch (e: any) {
      console.error(e)
      toast({
        variant: "destructive",
        title: "Eroare",
        description: e?.message || "Nu s-a putut salva grupul.",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = useCallback(
    async (g: TechnicianGroup) => {
      if (!window.confirm(`Ștergeți grupul „${g.name}”? Tehnicienii alocați vor fi scoși din acest grup.`)) return
      setDeletingId(g.id)
      try {
        await removeGroupIdFromAllTechnicians(g.id)
        await deleteTechnicianGroupDoc(g.id)
        toast({ title: "Grup șters" })
      } catch (e: any) {
        console.error(e)
        toast({
          variant: "destructive",
          title: "Eroare",
          description: e?.message || "Ștergerea a eșuat.",
        })
      } finally {
        setDeletingId(null)
      }
    },
    [toast],
  )

  const sortedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ro", { sensitivity: "base" }),
      ),
    [groups],
  )

  const moveOrder = async (g: TechnicianGroup, direction: -1 | 1) => {
    const sorted = sortedGroups
    const idx = sorted.findIndex((x) => x.id === g.id)
    if (idx < 0) return
    const swapWith = sorted[idx + direction]
    if (!swapWith) return
    setSaving(true)
    try {
      await updateTechnicianGroup(g.id, g.name, swapWith.sortOrder)
      await updateTechnicianGroup(swapWith.id, swapWith.name, g.sortOrder)
    } catch (e: any) {
      toast({ variant: "destructive", title: "Eroare", description: e?.message || "Nu s-a putut reordona." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Grupuri tehnicieni"
        text="Definiți grupurile folosite la selectarea tehnicienilor în tichete. Alocarea se face din fișa fiecărui utilizator tehnician."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/utilizatori">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Înapoi la utilizatori
            </Link>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Grup nou
          </Button>
        </div>
      </DashboardHeader>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          Se încarcă grupurile…
        </div>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground py-6">Nu există încă grupuri. Adăugați primul grup.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Ordine</TableHead>
                <TableHead>Nume</TableHead>
                <TableHead className="w-[200px] text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedGroups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-mono text-sm">{g.sortOrder}</TableCell>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={saving || sortedGroups[0]?.id === g.id}
                        onClick={() => moveOrder(g, -1)}
                        aria-label="Mută sus"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={saving || sortedGroups[sortedGroups.length - 1]?.id === g.id}
                        onClick={() => moveOrder(g, 1)}
                        aria-label="Mută jos"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        disabled={deletingId === g.id}
                        onClick={() => handleDelete(g)}
                      >
                        {deletingId === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editare grup" : "Grup nou"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nume</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Echipa Nord" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ordine sortare (număr mai mic = mai sus în listă)</label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Anulează
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
