"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import type { Department, Employee } from "@/lib/hr/types"
import { createOrUpdateEmployee } from "@/lib/hr/storage"
import { deleteEmployeeProfilePhoto, uploadEmployeeProfilePhoto } from "@/lib/hr/profile-photo"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Image as ImageIcon, Pencil, Trash2, UserCheck } from "lucide-react"
import { DateInput } from "@/components/ui/date-input"

export type EmployeeEditDialogUser = {
  uid: string
  displayName: string | null
  email: string | null
  role?: string
}

function makeId() {
  try {
    return `emp_${crypto.randomUUID().replaceAll("-", "")}`
  } catch {
    return `emp_${Date.now()}`
  }
}

export function EmployeeEditDialog({
  open,
  onOpenChange,
  employee,
  defaultProgramStart,
  defaultProgramEnd,
  users,
  departments,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
  defaultProgramStart?: string
  defaultProgramEnd?: string
  users: EmployeeEditDialogUser[]
  departments: Department[]
  onSaved?: (employee: Employee) => void
}) {
  const router = useRouter()
  const isEdit = Boolean(employee)

  // Draft ID for "add" (used to allow photo upload before save)
  const [draftEmployeeId, setDraftEmployeeId] = useState<string>("")

  // Basic fields
  const [nume, setNume] = useState("")
  const [prenume, setPrenume] = useState("")
  const [title, setTitle] = useState("")
  const [active, setActive] = useState(true)

  // Profile photo
  const [photoURL, setPhotoURL] = useState("")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>("")
  const [initialPhotoURL, setInitialPhotoURL] = useState("")
  const [photoSaving, setPhotoSaving] = useState(false)
  const [photoZoomOpen, setPhotoZoomOpen] = useState(false)

  // Identification fields
  const [cnp, setCnp] = useState("")
  const [ciSerie, setCiSerie] = useState("")
  const [ciNumar, setCiNumar] = useState("")
  const [ciDataEmiterii, setCiDataEmiterii] = useState("")
  const [ciEmitent, setCiEmitent] = useState("")

  // Workplace fields
  const [poziteCOR, setPoziteCOR] = useState("")
  const [superiorUid, setSuperiorUid] = useState<string | undefined>(undefined)
  const [sectorIds, setSectorIds] = useState<string[]>([])
  const [managerUidBySector, setManagerUidBySector] = useState<Record<string, string>>({})
  const [loculDeMunca, setLoculDeMunca] = useState("")
  const [programLucruStart, setProgramLucruStart] = useState("")
  const [programLucruEnd, setProgramLucruEnd] = useState("")
  const [zileConcediuAnuale, setZileConcediuAnuale] = useState("21")

  useEffect(() => {
    if (!open) return

    if (!employee) {
      setDraftEmployeeId(makeId())
      setNume("")
      setPrenume("")
      setTitle("")
      setActive(true)
      setPhotoURL("")
      setInitialPhotoURL("")
      setPhotoFile(null)
      setPhotoPreview("")
      setCnp("")
      setCiSerie("")
      setCiNumar("")
      setCiDataEmiterii("")
      setCiEmitent("")
      setPoziteCOR("")
      setSuperiorUid(undefined)
      setSectorIds([])
      setManagerUidBySector({})
      setLoculDeMunca("")
      setProgramLucruStart(defaultProgramStart || "")
      setProgramLucruEnd(defaultProgramEnd || "")
      setZileConcediuAnuale("21")
      return
    }

    setDraftEmployeeId("")
    setNume(employee.nume)
    setPrenume(employee.prenume)
    setTitle(employee.title || "")
    setActive(employee.active)
    setPhotoURL(employee.photoURL || "")
    setInitialPhotoURL(employee.photoURL || "")
    setPhotoFile(null)
    setPhotoPreview("")
    setCnp(employee.cnp || "")
    setCiSerie(employee.ciSerie || "")
    setCiNumar(employee.ciNumar || "")
    setCiDataEmiterii(employee.ciDataEmiterii || "")
    setCiEmitent(employee.ciEmitent || "")
    setPoziteCOR(employee.poziteCOR || "")
    setSuperiorUid(employee.superiorUid)
    setSectorIds(employee.sectorIds || [])
    setManagerUidBySector(employee.managerUidBySector || {})
    setLoculDeMunca(employee.loculDeMunca || "")
    setProgramLucruStart(employee.programLucruStart || "")
    setProgramLucruEnd(employee.programLucruEnd || "")
    setZileConcediuAnuale(String(employee.zileConcediuAnuale || 21))
  }, [open, employee, defaultProgramStart, defaultProgramEnd])

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("")
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  const activeDepartments = useMemo(() => departments.filter((d) => d.active), [departments])

  const save = async () => {
    const trimmedNume = nume.trim()
    const trimmedPrenume = prenume.trim()
    if (!trimmedNume || !trimmedPrenume) {
      toast({ title: "Eroare", description: "Numele și prenumele sunt obligatorii.", variant: "destructive" })
      return
    }

    const employeeId = employee?.id ?? (draftEmployeeId || makeId())

    try {
      setPhotoSaving(true)

      let finalPhotoURL = photoURL.trim() || ""
      let photoUpdatedAt: number | undefined = undefined

      if (photoFile) {
        await deleteEmployeeProfilePhoto(employeeId)
        const res = await uploadEmployeeProfilePhoto(employeeId, photoFile)
        finalPhotoURL = res.photoURL
        photoUpdatedAt = Date.now()
      } else if (initialPhotoURL && !finalPhotoURL) {
        await deleteEmployeeProfilePhoto(employeeId)
        photoUpdatedAt = Date.now()
      }

      const nextSectorIds = sectorIds.filter(Boolean)
      const nextManagerUidBySector = Object.fromEntries(
        Object.entries(managerUidBySector || {})
          .map(([k, v]) => [String(k).trim(), String(v || "").trim()])
          .filter(([k, v]) => k && v && nextSectorIds.includes(k)),
      )

      const next: Employee = employee
        ? {
            ...employee,
            nume: trimmedNume,
            prenume: trimmedPrenume,
            title: title.trim() || undefined,
            active,
            photoURL: finalPhotoURL || undefined,
            photoUpdatedAt,
            cnp: cnp.trim() || undefined,
            ciSerie: ciSerie.trim() || undefined,
            ciNumar: ciNumar.trim() || undefined,
            ciDataEmiterii: ciDataEmiterii.trim() || undefined,
            ciEmitent: ciEmitent.trim() || undefined,
            poziteCOR: poziteCOR.trim() || undefined,
            superiorUid,
            sectorIds: nextSectorIds.length ? nextSectorIds : undefined,
            managerUidBySector: Object.keys(nextManagerUidBySector).length ? nextManagerUidBySector : undefined,
            loculDeMunca: loculDeMunca.trim() || undefined,
            programLucruStart: programLucruStart.trim() || undefined,
            programLucruEnd: programLucruEnd.trim() || undefined,
            zileConcediuAnuale: zileConcediuAnuale.trim() ? Number(zileConcediuAnuale) : undefined,
          }
        : {
            id: employeeId,
            nume: trimmedNume,
            prenume: trimmedPrenume,
            title: title.trim() || undefined,
            active,
            photoURL: finalPhotoURL || undefined,
            photoUpdatedAt,
            cnp: cnp.trim() || undefined,
            ciSerie: ciSerie.trim() || undefined,
            ciNumar: ciNumar.trim() || undefined,
            ciDataEmiterii: ciDataEmiterii.trim() || undefined,
            ciEmitent: ciEmitent.trim() || undefined,
            poziteCOR: poziteCOR.trim() || undefined,
            superiorUid,
            sectorIds: nextSectorIds.length ? nextSectorIds : undefined,
            managerUidBySector: Object.keys(nextManagerUidBySector).length ? nextManagerUidBySector : undefined,
            loculDeMunca: loculDeMunca.trim() || undefined,
            programLucruStart: programLucruStart.trim() || undefined,
            programLucruEnd: programLucruEnd.trim() || undefined,
            zileConcediuAnuale: zileConcediuAnuale.trim() ? Number(zileConcediuAnuale) : undefined,
          }

      await createOrUpdateEmployee(next)
      onSaved?.(next)
      onOpenChange(false)
      toast({
        title: isEdit ? "Salariat actualizat" : "Salariat adăugat",
        description: isEdit ? "Datele au fost salvate cu succes." : "Salariatul a fost creat.",
      })
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || "Nu s-a putut salva.", variant: "destructive" })
    } finally {
      setPhotoSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              {isEdit ? "Editează salariat" : "Adaugă salariat"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Profile photo */}
            <div className="grid gap-2">
              <Label>Poză profil</Label>
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted flex items-center justify-center border group">
                  <div
                    className={cn(
                      "h-full w-full flex items-center justify-center",
                      photoPreview || photoURL ? "cursor-pointer" : ""
                    )}
                    onClick={() => {
                      const src = photoPreview || photoURL
                      if (src) setPhotoZoomOpen(true)
                    }}
                    title={photoPreview || photoURL ? "Vezi poza" : undefined}
                    aria-label={photoPreview || photoURL ? "Vezi poza" : "Poză profil"}
                  >
                    {photoPreview || photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoPreview || photoURL} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-muted-foreground/60" />
                    )}
                  </div>
                  {(photoPreview || photoURL) && (
                    <button
                      type="button"
                      className="absolute top-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm border border-red-100 hover:bg-white"
                      title="Elimină poza"
                      aria-label="Elimină poza"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPhotoURL("")
                        setPhotoFile(null)
                        setPhotoPreview("")
                      }}
                      disabled={photoSaving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                    disabled={photoSaving}
                  />
                  <div className="text-xs text-muted-foreground">Modificările de poză se aplică doar la apăsarea „Salvează".</div>
                </div>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Informații de bază</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="employeePrenume">Prenume *</Label>
                  <Input
                    id="employeePrenume"
                    value={prenume}
                    onChange={(e) => setPrenume(e.target.value)}
                    className="border-2 h-11"
                    placeholder="Ex: Ion"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employeeNume">Nume *</Label>
                  <Input
                    id="employeeNume"
                    value={nume}
                    onChange={(e) => setNume(e.target.value)}
                    className="border-2 h-11"
                    placeholder="Ex: Popescu"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="employeeTitle">Funcție</Label>
                <Input
                  id="employeeTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border-2 h-11"
                  placeholder="Ex: Tehnician montator"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border-2 p-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shadow-sm",
                      active
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
                        : "bg-gradient-to-br from-slate-400 to-slate-500",
                    )}
                  >
                    <UserCheck className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">Status activ</div>
                    <div className="text-xs text-muted-foreground">Dezactivează pentru a ascunde din liste</div>
                  </div>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
            </div>

            <Separator />

            {/* Identification Data */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Date de identificare</h3>
              <div className="grid gap-2">
                <Label htmlFor="employeeCnp">CNP</Label>
                <Input
                  id="employeeCnp"
                  value={cnp}
                  onChange={(e) => setCnp(e.target.value)}
                  placeholder="Ex: 1820620285533"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="employeeCiSerie">Serie CI</Label>
                  <Input id="employeeCiSerie" value={ciSerie} onChange={(e) => setCiSerie(e.target.value)} placeholder="Ex: RT" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employeeCiNumar">Număr CI</Label>
                  <Input id="employeeCiNumar" value={ciNumar} onChange={(e) => setCiNumar(e.target.value)} placeholder="Ex: 226633" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employeeCiDataEmiterii">Data emiterii CI</Label>
                <DateInput value={ciDataEmiterii} onChange={setCiDataEmiterii} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employeeCiEmitent">Emitent CI</Label>
                <Input id="employeeCiEmitent" value={ciEmitent} onChange={(e) => setCiEmitent(e.target.value)} placeholder="Ex: SPCLEP Chiajana" />
              </div>
            </div>

            <Separator />

            {/* Workplace Data */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Date despre locul de muncă</h3>
              <div className="grid gap-2">
                <Label htmlFor="employeePoziteCOR">Poziție COR</Label>
                <Input
                  id="employeePoziteCOR"
                  value={poziteCOR}
                  onChange={(e) => setPoziteCOR(e.target.value)}
                  placeholder="Ex: 8114-Montator ansambluri mecanice"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employeeSuperiorUid">Superior ierarhic</Label>
                <Select value={superiorUid || "__none__"} onValueChange={(v) => setSuperiorUid(v === "__none__" ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează superior" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Fără superior</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.uid} value={u.uid}>
                        {u.displayName || u.email || u.uid}
                        {u.role ? ` • ${u.role}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Departamente</Label>
                <div className="space-y-2 rounded-lg border p-3">
                  {activeDepartments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Niciun departament disponibil.{" "}
                      <Button variant="link" className="h-auto p-0" onClick={() => router.push("/dashboard/resurse-umane/departamente")}>
                        Creează primul departament →
                      </Button>
                    </div>
                  ) : (
                    activeDepartments.map((dept) => (
                      <div key={dept.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={sectorIds.includes(dept.id)}
                          onCheckedChange={(checked) => {
                            const managerUid = dept.managerUid ? String(dept.managerUid) : ""
                            if (checked) {
                              const nextSectorIds = [...sectorIds, dept.id]
                              setSectorIds(nextSectorIds)
                              if (managerUid) {
                                setManagerUidBySector((prev) => ({ ...(prev || {}), [dept.id]: managerUid }))
                                if (!superiorUid) setSuperiorUid(managerUid)
                              }
                            } else {
                              const nextSectorIds = sectorIds.filter((id) => id !== dept.id)
                              setSectorIds(nextSectorIds)
                              setManagerUidBySector((prev) => {
                                const next = { ...prev }
                                delete next[dept.id]
                                return next
                              })
                              if (superiorUid && managerUid && superiorUid === managerUid) {
                                const remainingManagers = nextSectorIds
                                  .map((id) => departments.find((d) => d.id === id)?.managerUid)
                                  .filter(Boolean) as string[]
                                setSuperiorUid(remainingManagers[0] || undefined)
                              }
                            }
                          }}
                        />
                        <Label htmlFor={`dept-${dept.id}`} className="cursor-pointer font-normal">
                          {dept.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Pentru fiecare departament, selectează șeful ierarhic care aprobă cererile.</div>
              </div>

              {sectorIds.length > 0 ? (
                <div className="grid gap-3 rounded-lg border p-3 bg-muted/20">
                  <div className="text-sm font-semibold">Șef ierarhic pe departament</div>
                  {sectorIds.map((sectorId) => {
                    const dept = departments.find((d) => d.id === sectorId)
                    return (
                      <div key={sectorId} className="grid gap-2">
                        <Label className="text-xs text-muted-foreground">Departament: {dept?.name || sectorId}</Label>
                        <Select
                          value={managerUidBySector?.[sectorId] ?? "__none__"}
                          onValueChange={(v) =>
                            setManagerUidBySector((prev) => {
                              const next = { ...(prev || {}) }
                              if (v === "__none__") delete next[sectorId]
                              else next[sectorId] = v
                              return next
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Alege șef ierarhic" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Necompletat</SelectItem>
                            {users.map((u) => (
                              <SelectItem key={u.uid} value={u.uid}>
                                {(u.displayName || u.email || u.uid) + (u.role ? ` • ${u.role}` : "")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="employeeLoculDeMunca">Locul de muncă</Label>
                <Input
                  id="employeeLoculDeMunca"
                  value={loculDeMunca}
                  onChange={(e) => setLoculDeMunca(e.target.value)}
                  placeholder="Ex: Birou"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="employeeProgramLucruStart">Program start</Label>
                  <Input id="employeeProgramLucruStart" type="time" value={programLucruStart} onChange={(e) => setProgramLucruStart(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employeeProgramLucruEnd">Program end</Label>
                  <Input id="employeeProgramLucruEnd" type="time" value={programLucruEnd} onChange={(e) => setProgramLucruEnd(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employeeZileConcediuAnuale">Zile concediu anuale</Label>
                <Input
                  id="employeeZileConcediuAnuale"
                  type="number"
                  min="0"
                  max="50"
                  value={zileConcediuAnuale}
                  onChange={(e) => setZileConcediuAnuale(e.target.value)}
                  placeholder="21"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-2" disabled={photoSaving}>
              Anulează
            </Button>
            <Button onClick={save} className="shadow-md hover:shadow-lg transition-all" disabled={photoSaving}>
              <Pencil className="h-4 w-4 mr-2" />
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo zoom dialog */}
      <Dialog open={photoZoomOpen} onOpenChange={setPhotoZoomOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Poză profil</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview || photoURL} alt="" className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

