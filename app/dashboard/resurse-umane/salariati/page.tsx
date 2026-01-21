"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, getDocs } from "firebase/firestore"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { EmployeesTable } from "@/components/hr/employees-table"
import type { Employee } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { normalizeTimeHHmmLoose } from "@/lib/utils/time-input"
import {
  getCurrentMonthKey,
  importLegacyLocalStorageHrDataToFirestore,
  readLegacyLocalStorageHrData,
  saveHrDefaults,
  applyHrDefaultsToEmployees,
  applyHrDefaultsToAllEmployees,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeDepartments,
  subscribeHrDefaults,
} from "@/lib/hr/storage"
import { db } from "@/lib/firebase/config"
import type { Department } from "@/lib/hr/types"
import { Plus } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { EmployeeEditDialog } from "@/components/hr/employee-edit-dialog"
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

type AppUser = { uid: string; displayName: string | null; email: string | null; role?: string }

export default function HrEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLegacyData, setHasLegacyData] = useState(false)
  const [importing, setImporting] = useState(false)
  const [defaultProgramStart, setDefaultProgramStart] = useState("")
  const [defaultProgramEnd, setDefaultProgramEnd] = useState("")
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [confirmDefaultsOpen, setConfirmDefaultsOpen] = useState(false)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

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

  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: setDepartments,
      onError: (err) => console.error("Error loading departments:", err),
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true)
      try {
        const snap = await getDocs(collection(db, "users"))
        const items: AppUser[] = snap.docs.map((d) => {
          const data = d.data() as any
          return {
            uid: d.id,
            displayName: data.displayName ?? null,
            email: data.email ?? null,
            role: data.role,
          }
        })
        items.sort((a, b) => String(a.displayName ?? a.email ?? "").localeCompare(String(b.displayName ?? b.email ?? "")))
        setUsers(items)
      } catch {
        // non-blocking
      } finally {
        setLoadingUsers(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const unsub = subscribeHrDefaults({
      onChange: (d) => {
        setDefaultProgramStart(d.programLucruStart ?? "")
        setDefaultProgramEnd(d.programLucruEnd ?? "")
      },
    })
    return () => unsub()
  }, [])

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const nameA = getEmployeeFullName(a)
      const nameB = getEmployeeFullName(b)
      return nameA.localeCompare(nameB)
    })
  }, [employees])

  const openAdd = () => {
    setEditing(null)
    setIsDialogOpen(true)
  }

  const openEdit = (e: Employee) => {
    setEditing(e)
    setIsDialogOpen(true)
  }

  // Note: upload/delete are performed only when saving the dialog.

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

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Program standard</CardTitle>
          <CardDescription>
            Programul standard se aplică salariaților fără program particular.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="defaultProgramStart">Program start</Label>
            <Input
              id="defaultProgramStart"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
              title="Format 24h: HH:mm (ex: 08:00, 16:30)"
              value={defaultProgramStart}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d:]/g, "").slice(0, 5)
                setDefaultProgramStart(next)
              }}
              placeholder="08:00"
              onBlur={() => {
                const normalized = normalizeTimeHHmmLoose(defaultProgramStart)
                if (normalized === null) {
                  toast({
                    title: "Oră invalidă",
                    description: "Folosește formatul 24h HH:mm (ex: 08:00).",
                    variant: "destructive",
                  })
                  return
                }
                if (normalized !== defaultProgramStart) setDefaultProgramStart(normalized)
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="defaultProgramEnd">Program end</Label>
            <Input
              id="defaultProgramEnd"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
              title="Format 24h: HH:mm (ex: 08:00, 16:30)"
              value={defaultProgramEnd}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d:]/g, "").slice(0, 5)
                setDefaultProgramEnd(next)
              }}
              placeholder="16:30"
              onBlur={() => {
                const normalized = normalizeTimeHHmmLoose(defaultProgramEnd)
                if (normalized === null) {
                  toast({
                    title: "Oră invalidă",
                    description: "Folosește formatul 24h HH:mm (ex: 16:30).",
                    variant: "destructive",
                  })
                  return
                }
                if (normalized !== defaultProgramEnd) setDefaultProgramEnd(normalized)
              }}
            />
          </div>
          <Button onClick={() => setConfirmDefaultsOpen(true)} disabled={savingDefaults}>
            {savingDefaults ? "Se salvează..." : "Salvează"}
          </Button>
        </CardContent>
      </Card>

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

      <EmployeeEditDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        employee={editing}
        defaultProgramStart={defaultProgramStart}
        defaultProgramEnd={defaultProgramEnd}
        users={users}
        departments={departments}
      />

      <AlertDialog open={confirmDefaultsOpen} onOpenChange={setConfirmDefaultsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicăm programul la toți salariații?</AlertDialogTitle>
            <AlertDialogDescription>
              Vrei să actualizezi și salariații care au deja un program personal, sau doar programul standard?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={async () => {
                try {
                  const normalizedStart = normalizeTimeHHmmLoose(defaultProgramStart)
                  const normalizedEnd = normalizeTimeHHmmLoose(defaultProgramEnd)
                  if (normalizedStart === null || normalizedEnd === null) {
                    toast({
                      title: "Program invalid",
                      description: "Completează orele în format 24h HH:mm (ex: 08:00, 16:30).",
                      variant: "destructive",
                    })
                    return
                  }
                  if (normalizedStart !== defaultProgramStart) setDefaultProgramStart(normalizedStart)
                  if (normalizedEnd !== defaultProgramEnd) setDefaultProgramEnd(normalizedEnd)

                  setSavingDefaults(true)
                  await saveHrDefaults({
                    programLucruStart: normalizedStart.trim() || undefined,
                    programLucruEnd: normalizedEnd.trim() || undefined,
                  })
                  const updated = await applyHrDefaultsToEmployees({
                    programLucruStart: normalizedStart.trim() || undefined,
                    programLucruEnd: normalizedEnd.trim() || undefined,
                  })
                  toast({
                    title: "Salvat",
                    description: updated
                      ? `Programul standard a fost actualizat (${updated} salariați fără program personal au fost actualizați).`
                      : "Programul standard a fost actualizat.",
                  })
                } catch {
                  toast({ title: "Eroare", description: "Nu s-a putut salva programul standard.", variant: "destructive" })
                } finally {
                  setSavingDefaults(false)
                }
              }}
            >
              Doar program standard
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const normalizedStart = normalizeTimeHHmmLoose(defaultProgramStart)
                  const normalizedEnd = normalizeTimeHHmmLoose(defaultProgramEnd)
                  if (normalizedStart === null || normalizedEnd === null) {
                    toast({
                      title: "Program invalid",
                      description: "Completează orele în format 24h HH:mm (ex: 08:00, 16:30).",
                      variant: "destructive",
                    })
                    return
                  }
                  if (normalizedStart !== defaultProgramStart) setDefaultProgramStart(normalizedStart)
                  if (normalizedEnd !== defaultProgramEnd) setDefaultProgramEnd(normalizedEnd)

                  setSavingDefaults(true)
                  await saveHrDefaults({
                    programLucruStart: normalizedStart.trim() || undefined,
                    programLucruEnd: normalizedEnd.trim() || undefined,
                  })
                  const updated = await applyHrDefaultsToAllEmployees({
                    programLucruStart: normalizedStart.trim() || undefined,
                    programLucruEnd: normalizedEnd.trim() || undefined,
                  })
                  toast({
                    title: "Salvat",
                    description: updated
                      ? `Programul a fost aplicat la toți salariații (${updated} actualizați).`
                      : "Programul standard a fost actualizat.",
                  })
                } catch {
                  toast({ title: "Eroare", description: "Nu s-a putut salva programul standard.", variant: "destructive" })
                } finally {
                  setSavingDefaults(false)
                }
              }}
            >
              Aplică tuturor salariaților
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}


