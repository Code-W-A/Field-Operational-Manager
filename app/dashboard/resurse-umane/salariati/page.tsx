"use client"

import { useEffect, useMemo, useState } from "react"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { EmployeesTable } from "@/components/hr/employees-table"
import type { Employee } from "@/lib/hr/types"
import { createOrUpdateEmployee, getCurrentMonthKey, importLegacyLocalStorageHrDataToFirestore, readLegacyLocalStorageHrData, seedHrIfEmpty, subscribeEmployees } from "@/lib/hr/storage"
import { Plus } from "lucide-react"

function makeId() {
  try {
    return `emp_${crypto.randomUUID().replaceAll("-", "")}`
  } catch {
    return `emp_${Date.now()}`
  }
}

export default function HrEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLegacyData, setHasLegacyData] = useState(false)
  const [importing, setImporting] = useState(false)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)

  const [fullName, setFullName] = useState("")
  const [title, setTitle] = useState("")
  const [active, setActive] = useState(true)

  useEffect(() => {
    let unsub: null | (() => void) = null
    ;(async () => {
      try {
        await seedHrIfEmpty({ monthKey: getCurrentMonthKey() })
      } catch {
        // ignore (rules/permissions might block seed in some environments)
      }
      setHasLegacyData(Boolean(readLegacyLocalStorageHrData()))
      unsub = subscribeEmployees({
        onChange: (e) => {
          setEmployees(e)
          setLoading(false)
        },
        onError: () => setLoading(false),
      })
    })()

    return () => {
      unsub?.()
    }
  }, [])

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [employees])

  const openAdd = () => {
    setEditing(null)
    setFullName("")
    setTitle("")
    setActive(true)
    setIsDialogOpen(true)
  }

  const openEdit = (e: Employee) => {
    setEditing(e)
    setFullName(e.fullName)
    setTitle(e.title ?? "")
    setActive(e.active)
    setIsDialogOpen(true)
  }

  const save = async () => {
    const name = fullName.trim()
    if (!name) {
      toast({ title: "Nume invalid", description: "Completează numele salariatului.", variant: "destructive" })
      return
    }

    const next: Employee =
      editing
        ? { ...editing, fullName: name, title: title.trim() || undefined, active }
        : { id: makeId(), fullName: name, title: title.trim() || undefined, active }

    try {
      await createOrUpdateEmployee(next)
      setIsDialogOpen(false)
      toast({ title: "Salvat", description: editing ? "Salariatul a fost actualizat." : "Salariatul a fost adăugat." })
    } catch {
      toast({ title: "Eroare", description: "Nu s-a putut salva salariatul.", variant: "destructive" })
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Salariați"
        text="Gestionează salariații și accesează fișa individuală (pontaj + detalii)."
        headerAction={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Adaugă
          </Button>
        }
      />

      {hasLegacyData && (
        <div className="mb-4 rounded-lg border p-4 bg-muted/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Date vechi găsite (localStorage)</div>
              <div className="text-sm text-muted-foreground">
                Poți importa o singură dată datele vechi de HR în Firestore și apoi se vor șterge local.
              </div>
            </div>
            <Button
              variant="outline"
              disabled={importing}
              onClick={async () => {
                setImporting(true)
                try {
                  const res = await importLegacyLocalStorageHrDataToFirestore()
                  if (res) {
                    toast({
                      title: "Import finalizat",
                      description: `Importate: ${res.employees} salariați, ${res.timesheets} pontaje.`,
                    })
                  }
                  setHasLegacyData(false)
                } catch {
                  toast({ title: "Eroare", description: "Nu s-a putut importa.", variant: "destructive" })
                } finally {
                  setImporting(false)
                }
              }}
            >
              Import în Firestore
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Se încarcă…</div>
      ) : (
        <EmployeesTable employees={sortedEmployees} onEdit={openEdit} />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editează salariat" : "Adaugă salariat"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Nume și prenume</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex: Stratulat Daniel" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="title">Funcție (opțional)</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Tehnician" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="grid gap-0.5">
                <div className="text-sm font-medium">Activ</div>
                <div className="text-xs text-muted-foreground">Poți dezactiva un salariat fără a șterge datele.</div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={save}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}


