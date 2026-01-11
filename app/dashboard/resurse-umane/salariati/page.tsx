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
import { getEmployeeFullName } from "@/lib/hr/types"
import { createOrUpdateEmployee, getCurrentMonthKey, importLegacyLocalStorageHrDataToFirestore, readLegacyLocalStorageHrData, seedHrIfEmpty, subscribeEmployees } from "@/lib/hr/storage"
import { Plus, ChevronDown, ChevronUp } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

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

  // Basic fields
  const [nume, setNume] = useState("")
  const [prenume, setPrenume] = useState("")
  const [title, setTitle] = useState("")
  const [active, setActive] = useState(true)
  
  // Identification fields
  const [cnp, setCnp] = useState("")
  const [ciSerie, setCiSerie] = useState("")
  const [ciNumar, setCiNumar] = useState("")
  const [ciDataEmiterii, setCiDataEmiterii] = useState("")
  const [ciEmitent, setCiEmitent] = useState("")
  
  // Workplace fields
  const [poziteCOR, setPoziteCOR] = useState("")
  const [superiorIerarhic, setSuperiorIerarhic] = useState("")
  const [loculDeMunca, setLoculDeMunca] = useState("")
  const [programLucruStart, setProgramLucruStart] = useState("")
  const [programLucruEnd, setProgramLucruEnd] = useState("")
  const [zileConcediuAnuale, setZileConcediuAnuale] = useState("21")
  
  // Collapsible sections
  const [showIdentification, setShowIdentification] = useState(false)
  const [showWorkplace, setShowWorkplace] = useState(false)

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
    return [...employees].sort((a, b) => {
      const nameA = getEmployeeFullName(a)
      const nameB = getEmployeeFullName(b)
      return nameA.localeCompare(nameB)
    })
  }, [employees])

  const openAdd = () => {
    setEditing(null)
    setNume("")
    setPrenume("")
    setTitle("")
    setActive(true)
    setCnp("")
    setCiSerie("")
    setCiNumar("")
    setCiDataEmiterii("")
    setCiEmitent("")
    setPoziteCOR("")
    setSuperiorIerarhic("")
    setLoculDeMunca("")
    setProgramLucruStart("")
    setProgramLucruEnd("")
    setZileConcediuAnuale("21")
    setShowIdentification(false)
    setShowWorkplace(false)
    setIsDialogOpen(true)
  }

  const openEdit = (e: Employee) => {
    setEditing(e)
    setNume(e.nume)
    setPrenume(e.prenume)
    setTitle(e.title ?? "")
    setActive(e.active)
    setCnp(e.cnp ?? "")
    setCiSerie(e.ciSerie ?? "")
    setCiNumar(e.ciNumar ?? "")
    setCiDataEmiterii(e.ciDataEmiterii ?? "")
    setCiEmitent(e.ciEmitent ?? "")
    setPoziteCOR(e.poziteCOR ?? "")
    setSuperiorIerarhic(e.superiorIerarhic ?? "")
    setLoculDeMunca(e.loculDeMunca ?? "")
    setProgramLucruStart(e.programLucruStart ?? "")
    setProgramLucruEnd(e.programLucruEnd ?? "")
    setZileConcediuAnuale(String(e.zileConcediuAnuale ?? 21))
    setShowIdentification(false)
    setShowWorkplace(false)
    setIsDialogOpen(true)
  }

  const save = async () => {
    const trimmedNume = nume.trim()
    const trimmedPrenume = prenume.trim()
    
    if (!trimmedNume || !trimmedPrenume) {
      toast({ title: "Nume invalid", description: "Completează numele și prenumele salariatului.", variant: "destructive" })
      return
    }

    const next: Employee = editing
      ? {
          ...editing,
          nume: trimmedNume,
          prenume: trimmedPrenume,
          title: title.trim() || undefined,
          active,
          cnp: cnp.trim() || undefined,
          ciSerie: ciSerie.trim() || undefined,
          ciNumar: ciNumar.trim() || undefined,
          ciDataEmiterii: ciDataEmiterii.trim() || undefined,
          ciEmitent: ciEmitent.trim() || undefined,
          poziteCOR: poziteCOR.trim() || undefined,
          superiorIerarhic: superiorIerarhic.trim() || undefined,
          loculDeMunca: loculDeMunca.trim() || undefined,
          programLucruStart: programLucruStart.trim() || undefined,
          programLucruEnd: programLucruEnd.trim() || undefined,
          zileConcediuAnuale: zileConcediuAnuale.trim() ? Number(zileConcediuAnuale) : undefined,
        }
      : {
          id: makeId(),
          nume: trimmedNume,
          prenume: trimmedPrenume,
          title: title.trim() || undefined,
          active,
          cnp: cnp.trim() || undefined,
          ciSerie: ciSerie.trim() || undefined,
          ciNumar: ciNumar.trim() || undefined,
          ciDataEmiterii: ciDataEmiterii.trim() || undefined,
          ciEmitent: ciEmitent.trim() || undefined,
          poziteCOR: poziteCOR.trim() || undefined,
          superiorIerarhic: superiorIerarhic.trim() || undefined,
          loculDeMunca: loculDeMunca.trim() || undefined,
          programLucruStart: programLucruStart.trim() || undefined,
          programLucruEnd: programLucruEnd.trim() || undefined,
          zileConcediuAnuale: zileConcediuAnuale.trim() ? Number(zileConcediuAnuale) : undefined,
        }

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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editează salariat" : "Adaugă salariat"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Basic Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Informații de bază</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="prenume">Prenume *</Label>
                  <Input id="prenume" value={prenume} onChange={(e) => setPrenume(e.target.value)} placeholder="Ex: Marian" />
                </div>
            <div className="grid gap-2">
                  <Label htmlFor="nume">Nume *</Label>
                  <Input id="nume" value={nume} onChange={(e) => setNume(e.target.value)} placeholder="Ex: Xulescu" />
                </div>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="title">Funcție</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Tehnician montator" />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="grid gap-0.5">
                <div className="text-sm font-medium">Activ</div>
                <div className="text-xs text-muted-foreground">Poți dezactiva un salariat fără a șterge datele.</div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            </div>

            <Separator />

            {/* Identification Data - Collapsible */}
            <Collapsible open={showIdentification} onOpenChange={setShowIdentification}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="font-semibold">Date de identificare (opțional)</span>
                  {showIdentification ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="cnp">CNP</Label>
                  <Input id="cnp" value={cnp} onChange={(e) => setCnp(e.target.value)} placeholder="Ex: 1820620285533" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ciSerie">Serie CI</Label>
                    <Input id="ciSerie" value={ciSerie} onChange={(e) => setCiSerie(e.target.value)} placeholder="Ex: RT" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ciNumar">Număr CI</Label>
                    <Input id="ciNumar" value={ciNumar} onChange={(e) => setCiNumar(e.target.value)} placeholder="Ex: 226633" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ciDataEmiterii">Data emiterii CI</Label>
                  <Input id="ciDataEmiterii" type="date" value={ciDataEmiterii} onChange={(e) => setCiDataEmiterii(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ciEmitent">Emitent CI</Label>
                  <Input id="ciEmitent" value={ciEmitent} onChange={(e) => setCiEmitent(e.target.value)} placeholder="Ex: SPCLEP Chiajana" />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Workplace Data - Collapsible */}
            <Collapsible open={showWorkplace} onOpenChange={setShowWorkplace}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="font-semibold">Date despre locul de muncă (opțional)</span>
                  {showWorkplace ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="poziteCOR">Poziție COR</Label>
                  <Input id="poziteCOR" value={poziteCOR} onChange={(e) => setPoziteCOR(e.target.value)} placeholder="Ex: 8114-Montator ansambluri mecanice" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="superiorIerarhic">Superior ierarhic</Label>
                  <Input id="superiorIerarhic" value={superiorIerarhic} onChange={(e) => setSuperiorIerarhic(e.target.value)} placeholder="Ex: Voinea Ionut" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="loculDeMunca">Locul de muncă</Label>
                  <Input id="loculDeMunca" value={loculDeMunca} onChange={(e) => setLoculDeMunca(e.target.value)} placeholder="Ex: Birou" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="programLucruStart">Program start</Label>
                    <Input id="programLucruStart" type="time" value={programLucruStart} onChange={(e) => setProgramLucruStart(e.target.value)} placeholder="08:00" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="programLucruEnd">Program end</Label>
                    <Input id="programLucruEnd" type="time" value={programLucruEnd} onChange={(e) => setProgramLucruEnd(e.target.value)} placeholder="16:30" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="zileConcediuAnuale">Zile concediu anuale</Label>
                  <Input 
                    id="zileConcediuAnuale" 
                    type="number" 
                    min="0" 
                    max="50" 
                    value={zileConcediuAnuale} 
                    onChange={(e) => setZileConcediuAnuale(e.target.value)} 
                    placeholder="21" 
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
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


