"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import type { Department, Employee } from "@/lib/hr/types"
import { createOrUpdateEmployee } from "@/lib/hr/storage"
import { deleteEmployeeProfilePhoto, uploadEmployeeProfilePhoto } from "@/lib/hr/profile-photo"
import { normalizeEmployeeSectorAssignment } from "@/lib/hr/employee-sector-assignment"

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
import { DatePicker } from "@/components/ui/DatePicker"
import { normalizeTimeHHmmLoose } from "@/lib/utils/time-input"
import { formatISODate, parseRomanianDateTime } from "@/lib/utils/date-utils"

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
  defaultBreakStart,
  defaultBreakEnd,
  users,
  departments,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
  defaultProgramStart?: string
  defaultProgramEnd?: string
  defaultBreakStart?: string
  defaultBreakEnd?: string
  users: EmployeeEditDialogUser[]
  departments: Department[]
  onSaved?: (employee: Employee) => void
}) {
  const isEdit = Boolean(employee)

  // Draft ID for "add" (used to allow photo upload before save)
  const [draftEmployeeId, setDraftEmployeeId] = useState<string>("")

  // Basic fields
  const [nume, setNume] = useState("")
  const [prenume, setPrenume] = useState("")
  const [title, setTitle] = useState("")
  const [active, setActive] = useState(true)
  const [userUid, setUserUid] = useState<string | undefined>(undefined)

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
  const [managerDraft, setManagerDraft] = useState({ sectorIds: [] as string[], managerUidBySector: {} as Record<string, string> })
  const { sectorIds, managerUidBySector } = managerDraft
  const [loculDeMunca, setLoculDeMunca] = useState("")
  const [programLucruStart, setProgramLucruStart] = useState("")
  const [programLucruEnd, setProgramLucruEnd] = useState("")
  const [pauzaStart, setPauzaStart] = useState("")
  const [pauzaEnd, setPauzaEnd] = useState("")
  const [zileConcediuAnuale, setZileConcediuAnuale] = useState("21")
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    if (!employee) {
      setValidationError(null)
      setDraftEmployeeId(makeId())
      setNume("")
      setPrenume("")
      setTitle("")
      setActive(true)
      setUserUid(undefined)
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
      setManagerDraft({ sectorIds: [], managerUidBySector: {} })
      setLoculDeMunca("")
      setProgramLucruStart(defaultProgramStart || "")
      setProgramLucruEnd(defaultProgramEnd || "")
      setPauzaStart(defaultBreakStart || "")
      setPauzaEnd(defaultBreakEnd || "")
      setZileConcediuAnuale("21")
      return
    }

    setDraftEmployeeId("")
    setValidationError(null)
    setNume(employee.nume)
    setPrenume(employee.prenume)
    setTitle(employee.title || "")
    setActive(employee.active)
    setUserUid(employee.userUid)
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
    setManagerDraft({ sectorIds: employee.sectorIds || [], managerUidBySector: employee.managerUidBySector || {} })
    setLoculDeMunca(employee.loculDeMunca || "")
    setProgramLucruStart(employee.programLucruStart || "")
    setProgramLucruEnd(employee.programLucruEnd || "")
    setPauzaStart(employee.pauzaStart || "")
    setPauzaEnd(employee.pauzaEnd || "")
    setZileConcediuAnuale(String(employee.zileConcediuAnuale || 21))
  // Defaults initialize only a new employee. A late defaults snapshot must not reset an edit draft.
  }, [open, employee])

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
  const ciIssueDateValue = useMemo(() => {
    const parsed = parseRomanianDateTime(ciDataEmiterii)
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
  }, [ciDataEmiterii])

  const save = async () => {
    const trimmedNume = nume.trim()
    const trimmedPrenume = prenume.trim()
    if (!trimmedNume || !trimmedPrenume) {
      const message = "Numele și prenumele sunt obligatorii."
      setValidationError(message)
      toast({ title: "Eroare", description: message, variant: "destructive" })
      return
    }

    const normalizedStart = normalizeTimeHHmmLoose(programLucruStart)
    const normalizedEnd = normalizeTimeHHmmLoose(programLucruEnd)
    const normalizedBreakStart = normalizeTimeHHmmLoose(pauzaStart)
    const normalizedBreakEnd = normalizeTimeHHmmLoose(pauzaEnd)
    if (normalizedStart === null || normalizedEnd === null || normalizedBreakStart === null || normalizedBreakEnd === null) {
      const message = "Completează orele în format 24h HH:mm (ex: 08:00–16:30, pauză 12:00–12:30)."
      setValidationError(message)
      toast({
        title: "Program / pauză invalidă",
        description: message,
        variant: "destructive",
      })
      return
    }
    if ((normalizedBreakStart && !normalizedBreakEnd) || (!normalizedBreakStart && normalizedBreakEnd)) {
      const message = "Completează atât pauză start cât și pauză end (sau lasă ambele goale)."
      setValidationError(message)
      toast({
        title: "Pauză incompletă",
        description: message,
        variant: "destructive",
      })
      return
    }
    if (normalizedStart !== programLucruStart) setProgramLucruStart(normalizedStart)
    if (normalizedEnd !== programLucruEnd) setProgramLucruEnd(normalizedEnd)
    if (normalizedBreakStart !== pauzaStart) setPauzaStart(normalizedBreakStart)
    if (normalizedBreakEnd !== pauzaEnd) setPauzaEnd(normalizedBreakEnd)

    const employeeId = employee?.id ?? (draftEmployeeId || makeId())

    try {
      setValidationError(null)
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

      const assignment = normalizeEmployeeSectorAssignment(managerDraft)
      const nextSectorIds = assignment.sectorIds
      const nextManagerUidBySector = assignment.managerUidBySector

      const next: Employee = employee
        ? {
            ...employee,
            nume: trimmedNume,
            prenume: trimmedPrenume,
            title: title.trim() || undefined,
            active,
            userUid,
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
            programLucruStart: normalizedStart.trim() || undefined,
            programLucruEnd: normalizedEnd.trim() || undefined,
            pauzaStart: normalizedBreakStart.trim() || undefined,
            pauzaEnd: normalizedBreakEnd.trim() || undefined,
            zileConcediuAnuale: zileConcediuAnuale.trim() ? Number(zileConcediuAnuale) : undefined,
          }
        : {
            id: employeeId,
            nume: trimmedNume,
            prenume: trimmedPrenume,
            title: title.trim() || undefined,
            active,
            userUid,
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
            programLucruStart: normalizedStart.trim() || undefined,
            programLucruEnd: normalizedEnd.trim() || undefined,
            pauzaStart: normalizedBreakStart.trim() || undefined,
            pauzaEnd: normalizedBreakEnd.trim() || undefined,
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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[1000px] lg:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              {isEdit ? "Editează salariat" : "Adaugă salariat"}
            </DialogTitle>
          </DialogHeader>
          {validationError ? <p role="alert" className="text-sm font-medium text-destructive">{validationError}</p> : null}

          <div className="grid gap-6 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <div className="space-y-6">
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

                <div className="grid gap-2">
                  <Label htmlFor="employeeUserUid">Utilizator asociat</Label>
                  <Select value={userUid || "__none__"} onValueChange={(v) => setUserUid(v === "__none__" ? undefined : v)}>
                    <SelectTrigger id="employeeUserUid" aria-label="Utilizator asociat">
                      <SelectValue placeholder="Alege utilizator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Fără utilizator asociat</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.uid} value={u.uid}>
                          {u.displayName || u.email || u.uid}
                          {u.role ? ` • ${u.role}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Leagă salariatul de contul din aplicație. Este necesar pentru pontaj, cereri și kiosk.
                  </div>
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
                  <DatePicker
                    value={ciIssueDateValue}
                    onChange={(value) => {
                      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
                        setCiDataEmiterii("")
                        return
                      }
                      setCiDataEmiterii(formatISODate(value))
                    }}
                    format="dd.MM.yyyy"
                    placeholder="dd.MM.yyyy"
                    locale="ro"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employeeCiEmitent">Emitent CI</Label>
                  <Input id="employeeCiEmitent" value={ciEmitent} onChange={(e) => setCiEmitent(e.target.value)} placeholder="Ex: SPCLEP Chiajana" />
                </div>
              </div>
            </div>

            {/* Workplace Data */}
            <div className="space-y-3 lg:border-l lg:pl-6">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase lg:pt-1">Date despre locul de muncă</h3>
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
                      <Button asChild variant="link" className="h-auto p-0">
                        <Link href="/dashboard/resurse-umane/departamente">
                          Creează primul departament →
                        </Link>
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
                            if (checked === true) {
                              const nextSectorIds = sectorIds.includes(dept.id) ? sectorIds : [...sectorIds, dept.id]
                              const nextManagerUidBySector = { ...managerUidBySector }
                              if (managerUid) {
                                nextManagerUidBySector[dept.id] = managerUid
                                if (!superiorUid) setSuperiorUid(managerUid)
                              }
                              setManagerDraft({ sectorIds: nextSectorIds, managerUidBySector: nextManagerUidBySector })
                            } else {
                              const nextSectorIds = sectorIds.filter((id) => id !== dept.id)
                              const nextManagerUidBySector = { ...managerUidBySector }
                              delete nextManagerUidBySector[dept.id]
                              if (superiorUid && managerUid && superiorUid === managerUid) {
                                const remainingManager = nextSectorIds
                                  .map((id) => departments.find((department) => department.id === id)?.managerUid)
                                  .find(Boolean)
                                setSuperiorUid(remainingManager || undefined)
                              }
                              setManagerDraft({ sectorIds: nextSectorIds, managerUidBySector: nextManagerUidBySector })
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
                          onValueChange={(v) => {
                            const nextManagerUidBySector = { ...managerUidBySector }
                            if (v === "__none__") delete nextManagerUidBySector[sectorId]
                            else nextManagerUidBySector[sectorId] = v
                            setManagerDraft({ sectorIds, managerUidBySector: nextManagerUidBySector })
                          }}
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
                  <Input
                    id="employeeProgramLucruStart"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="08:00"
                    title="Format 24h: HH:mm (ex: 08:00, 16:30)"
                    value={programLucruStart}
                    onChange={(e) => setProgramLucruStart(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                    onBlur={() => {
                      const normalized = normalizeTimeHHmmLoose(programLucruStart)
                      if (normalized === null) {
                        setValidationError("Folosește formatul 24h HH:mm (ex: 08:00).")
                        toast({
                          title: "Oră invalidă",
                          description: "Folosește formatul 24h HH:mm (ex: 08:00).",
                          variant: "destructive",
                        })
                        return
                      }
                      if (normalized !== programLucruStart) setProgramLucruStart(normalized)
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employeeProgramLucruEnd">Program end</Label>
                  <Input
                    id="employeeProgramLucruEnd"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="16:30"
                    title="Format 24h: HH:mm (ex: 08:00, 16:30)"
                    value={programLucruEnd}
                    onChange={(e) => setProgramLucruEnd(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                    onBlur={() => {
                      const normalized = normalizeTimeHHmmLoose(programLucruEnd)
                      if (normalized === null) {
                        setValidationError("Folosește formatul 24h HH:mm (ex: 16:30).")
                        toast({
                          title: "Oră invalidă",
                          description: "Folosește formatul 24h HH:mm (ex: 16:30).",
                          variant: "destructive",
                        })
                        return
                      }
                      if (normalized !== programLucruEnd) setProgramLucruEnd(normalized)
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="employeePauzaStart">Pauză start</Label>
                  <Input
                    id="employeePauzaStart"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12:00"
                    title="Format 24h: HH:mm (ex: 12:00, 12:30)"
                    value={pauzaStart}
                    onChange={(e) => setPauzaStart(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                    onBlur={() => {
                      const normalized = normalizeTimeHHmmLoose(pauzaStart)
                      if (normalized === null) {
                        setValidationError("Folosește formatul 24h HH:mm (ex: 12:00).")
                        toast({
                          title: "Oră invalidă",
                          description: "Folosește formatul 24h HH:mm (ex: 12:00).",
                          variant: "destructive",
                        })
                        return
                      }
                      if (normalized !== pauzaStart) setPauzaStart(normalized)
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employeePauzaEnd">Pauză end</Label>
                  <Input
                    id="employeePauzaEnd"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12:30"
                    title="Format 24h: HH:mm (ex: 12:00, 12:30)"
                    value={pauzaEnd}
                    onChange={(e) => setPauzaEnd(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                    onBlur={() => {
                      const normalized = normalizeTimeHHmmLoose(pauzaEnd)
                      if (normalized === null) {
                        setValidationError("Folosește formatul 24h HH:mm (ex: 12:30).")
                        toast({
                          title: "Oră invalidă",
                          description: "Folosește formatul 24h HH:mm (ex: 12:30).",
                          variant: "destructive",
                        })
                        return
                      }
                      if (normalized !== pauzaEnd) setPauzaEnd(normalized)
                    }}
                  />
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
