"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { collection, getDocs } from "firebase/firestore"

import { db } from "@/lib/firebase/config"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, BarChart3, Calendar, CalendarCheck, CalendarDays, Clock, ClipboardList, Link2, Pencil, Plus, TrendingUp, Trash2, Image as ImageIcon, User, UserCheck, UserRound } from "lucide-react"

import type { Department, Employee, HrRequest, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import {
  createOrUpdateEmployee,
  daysInMonth,
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeHrRequestsForEmployee,
  subscribeTimesheetsForMonth,
  subscribeDepartments,
} from "@/lib/hr/storage"
import type { TimesheetMonth } from "@/lib/hr/types"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { CreateHrRequestDialog } from "@/components/hr/create-hr-request-dialog"
import { generateHrRequestPDF } from "@/lib/hr/request-pdf-generator"
import { hrRequestDateLabel, hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"
import { deleteEmployeeProfilePhoto, uploadEmployeeProfilePhoto } from "@/lib/hr/profile-photo"
import { useAuth } from "@/contexts/AuthContext"

type AppUser = { uid: string; displayName: string | null; email: string | null; role?: string }

function summarizeTimesheetFromTimesheets(monthKey: TimesheetMonthKey, employeeId: string, timesheets: TimesheetMonth[]) {
  const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employeeId)
  const dim = daysInMonth(monthKey)
  let workHours = 0
  let coDays = 0
  let slDays = 0
  let weDays = 0
  let delDays = 0
  for (let d = 1; d <= dim; d++) {
    const cell = ts?.days?.[String(d)]
    if (!cell) continue
    if (cell.code === "WORK") workHours += Number(cell.hours ?? 0)
    if (cell.code === "CO") coDays += 1
    if (cell.code === "SL") slDays += 1
    if (cell.code === "WE") weDays += 1
    if (cell.code === "DEL") delDays += 1
  }
  return { workHours, coDays, slDays, weDays, delDays }
}

function cellClasses(cell: TimesheetCell | undefined) {
  const code = cell?.code ?? "EMPTY"
  if (code === "WORK") return "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-900 border-emerald-300 dark:from-emerald-950 dark:to-emerald-900"
  if (code === "WE") return "bg-gradient-to-br from-pink-50 to-pink-100 text-pink-900 border-pink-300 dark:from-pink-950 dark:to-pink-900"
  if (code === "CO") return "bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900 border-amber-300 dark:from-amber-950 dark:to-amber-900"
  if (code === "CFP") return "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-900 border-orange-300 dark:from-orange-950 dark:to-orange-900"
  if (code === "CM") return "bg-gradient-to-br from-teal-50 to-teal-100 text-teal-900 border-teal-300 dark:from-teal-950 dark:to-teal-900"
  if (code === "DEL") return "bg-gradient-to-br from-violet-50 to-violet-100 text-violet-900 border-violet-300 dark:from-violet-950 dark:to-violet-900"
  if (code === "IN") return "bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 border-slate-300 dark:from-slate-950 dark:to-slate-900"
  if (code === "SL") return "bg-gradient-to-br from-blue-50 to-blue-100 text-blue-900 border-blue-300 dark:from-blue-950 dark:to-blue-900"
  return "bg-gradient-to-br from-muted/30 to-muted/50 text-muted-foreground border-muted"
}

function calculateWorkDays(startStr: string, endStr: string): number {
  const start = new Date(startStr)
  const end = new Date(endStr)
  let count = 0
  const current = new Date(start)
  
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return count
}

export default function HrEmployeeDetailsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string

  const monthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()

  const [employees, setEmployees] = useState<Employee[]>([])
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [timesheets, setTimesheets] = useState<TimesheetMonth[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [leaveRequests, setLeaveRequests] = useState<HrRequest[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  
  const [activeTab, setActiveTab] = useState<"detalii" | "pontaj" | "concedii">("detalii")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  
  // Edit dialog state - basic fields
  const [editNume, setEditNume] = useState("")
  const [editPrenume, setEditPrenume] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editActive, setEditActive] = useState(true)

  // Edit dialog state - profile photo
  const [editPhotoURL, setEditPhotoURL] = useState("")
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState<string>("")
  const [editPhotoSaving, setEditPhotoSaving] = useState(false)
  const [editInitialPhotoURL, setEditInitialPhotoURL] = useState("")
  const [editPhotoZoomOpen, setEditPhotoZoomOpen] = useState(false)
  
  // Edit dialog state - identification fields
  const [editCnp, setEditCnp] = useState("")
  const [editCiSerie, setEditCiSerie] = useState("")
  const [editCiNumar, setEditCiNumar] = useState("")
  const [editCiDataEmiterii, setEditCiDataEmiterii] = useState("")
  const [editCiEmitent, setEditCiEmitent] = useState("")
  
  // Edit dialog state - workplace fields
  const [editPoziteCOR, setEditPoziteCOR] = useState("")
  const [editSuperiorUid, setEditSuperiorUid] = useState<string | undefined>()
  const [editSectorIds, setEditSectorIds] = useState<string[]>([])
  const [editManagerUidBySector, setEditManagerUidBySector] = useState<Record<string, string>>({})
  const [editLoculDeMunca, setEditLoculDeMunca] = useState("")
  const [editProgramLucruStart, setEditProgramLucruStart] = useState("")
  const [editProgramLucruEnd, setEditProgramLucruEnd] = useState("")
  const [editZileConcediuAnuale, setEditZileConcediuAnuale] = useState("21")
  
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false)

  useEffect(() => {
    let unsub: null | (() => void) = null
    ;(async () => {
      try {
        await seedHrIfEmpty({ monthKey })
      } catch {
        // ignore
      }
      unsub = subscribeEmployees({
        onChange: (e) => {
          setEmployees(e)
          setEmployee(e.find((x) => x.id === id) ?? null)
        },
      })
    })()
    return () => unsub?.()
  }, [id])

  useEffect(() => {
    let unsub: null | (() => void) = null
    unsub = subscribeTimesheetsForMonth({
      monthKey,
      onChange: setTimesheets,
    })
    return () => unsub?.()
  }, [monthKey])

  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true)
      setUsersError(null)
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
      } catch (e: any) {
        setUsersError("Nu s-a putut încărca lista de utilizatori.")
      } finally {
        setLoadingUsers(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: setDepartments,
      onError: (err) => console.error("Error loading departments:", err),
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!employee) return
    const unsub = subscribeHrRequestsForEmployee({
      employeeId: employee.id,
      onChange: setLeaveRequests,
    })
    return () => unsub()
  }, [employee])

  useEffect(() => {
    if (isEditDialogOpen && employee) {
      setEditNume(employee.nume)
      setEditPrenume(employee.prenume)
      setEditTitle(employee.title || "")
      setEditActive(employee.active)
      setEditPhotoURL(employee.photoURL || "")
      setEditInitialPhotoURL(employee.photoURL || "")
      setEditPhotoFile(null)
      setEditPhotoPreview("")
      setEditCnp(employee.cnp || "")
      setEditCiSerie(employee.ciSerie || "")
      setEditCiNumar(employee.ciNumar || "")
      setEditCiDataEmiterii(employee.ciDataEmiterii || "")
      setEditCiEmitent(employee.ciEmitent || "")
      setEditPoziteCOR(employee.poziteCOR || "")
      setEditSuperiorUid(employee.superiorUid)
      setEditSectorIds(employee.sectorIds || [])
      setEditManagerUidBySector(employee.managerUidBySector || {})
      setEditLoculDeMunca(employee.loculDeMunca || "")
      setEditProgramLucruStart(employee.programLucruStart || "")
      setEditProgramLucruEnd(employee.programLucruEnd || "")
      setEditZileConcediuAnuale(String(employee.zileConcediuAnuale || 21))
    }
  }, [isEditDialogOpen, employee])

  useEffect(() => {
    if (!editPhotoFile) {
      setEditPhotoPreview("")
      return
    }
    const url = URL.createObjectURL(editPhotoFile)
    setEditPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [editPhotoFile])

  const suggestionUid = useMemo(() => {
    if (!employee) return null
    const norm = (s: string) => s.toLowerCase().replaceAll(/\s+/g, " ").trim()
    const target = norm(getEmployeeFullName(employee))
    const match = users.find((u) => (u.displayName ? norm(u.displayName) === target : false))
    return match?.uid ?? null
  }, [employee, users])

  const suggestionUser = useMemo(() => {
    if (!suggestionUid) return null
    return users.find((u) => u.uid === suggestionUid) ?? null
  }, [suggestionUid, users])

  const summary = useMemo(() => {
    if (!employee) return null
    return summarizeTimesheetFromTimesheets(monthKey, employee.id, timesheets)
  }, [employee, monthKey, timesheets])

  const setUserUid = async (uid: string | undefined) => {
    if (!employee) return
    const next: Employee = { ...employee, userUid: uid || undefined }
    setEmployee(next)
    try {
      await createOrUpdateEmployee(next)
    } catch {
      // revert optimistic update
      setEmployee(employee)
    }
  }

  const handleSaveEdit = async () => {
    if (!employee) return
    
    if (!editNume.trim() || !editPrenume.trim()) {
      toast({ title: "Eroare", description: "Numele și prenumele sunt obligatorii.", variant: "destructive" })
      return
    }
    
    try {
      setEditPhotoSaving(true)

      let finalPhotoURL = editPhotoURL.trim() || ""
      let photoUpdatedAt: number | undefined = undefined

      if (editPhotoFile) {
        // Replace: delete any prior variants first (best-effort), then upload.
        await deleteEmployeeProfilePhoto(employee.id)
        const res = await uploadEmployeeProfilePhoto(employee.id, editPhotoFile)
        finalPhotoURL = res.photoURL
        photoUpdatedAt = Date.now()
      } else if (editInitialPhotoURL && !finalPhotoURL) {
        // Remove requested.
        await deleteEmployeeProfilePhoto(employee.id)
        photoUpdatedAt = Date.now()
      }

      const sectorIds = editSectorIds.filter(Boolean)
      const managerUidBySector = Object.fromEntries(
        Object.entries(editManagerUidBySector || {})
          .map(([k, v]) => [String(k).trim(), String(v || "").trim()])
          .filter(([k, v]) => k && v && sectorIds.includes(k))
      )

      const updated: Employee = {
        ...employee,
        nume: editNume.trim(),
        prenume: editPrenume.trim(),
        title: editTitle.trim() || undefined,
        active: editActive,
        photoURL: finalPhotoURL || undefined,
        photoUpdatedAt,
        cnp: editCnp.trim() || undefined,
        ciSerie: editCiSerie.trim() || undefined,
        ciNumar: editCiNumar.trim() || undefined,
        ciDataEmiterii: editCiDataEmiterii.trim() || undefined,
        ciEmitent: editCiEmitent.trim() || undefined,
        poziteCOR: editPoziteCOR.trim() || undefined,
        superiorUid: editSuperiorUid,
        sectorIds: sectorIds.length ? sectorIds : undefined,
        managerUidBySector: Object.keys(managerUidBySector).length ? managerUidBySector : undefined,
        loculDeMunca: editLoculDeMunca.trim() || undefined,
        programLucruStart: editProgramLucruStart.trim() || undefined,
        programLucruEnd: editProgramLucruEnd.trim() || undefined,
        zileConcediuAnuale: editZileConcediuAnuale.trim() ? Number(editZileConcediuAnuale) : undefined,
      }
      await createOrUpdateEmployee(updated)
      setEmployee(updated)
      setIsEditDialogOpen(false)
      toast({ title: "Salariat actualizat", description: "Datele au fost salvate cu succes." })
    } catch (e: any) {
      toast({ title: "Eroare", description: e.message || "Nu s-a putut salva.", variant: "destructive" })
    } finally {
      setEditPhotoSaving(false)
    }
  }
  // Note: upload/delete are performed only when saving the dialog.

  const getCell = (day: number): TimesheetCell | undefined => {
    if (!employee) return undefined
    const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employee.id)
    return ts?.days?.[String(day)]
  }

  const employeeLeaveThisYear = useMemo(() => {
    const year = new Date().getFullYear()
    return leaveRequests.filter((r) => {
      const payload: any = r.payload as any
      const startYear = payload?.startDate ? new Date(payload.startDate).getFullYear() : null
      return startYear === year && r.kind === "CO"
    })
  }, [leaveRequests])

  const daysConsumed = useMemo(() => {
    return employeeLeaveThisYear
      .filter((r) => r.status === "approved")
      .reduce((acc, r) => {
        const payload: any = r.payload as any
        const startDate = payload?.startDate
        const endDate = payload?.endDate
        if (!startDate || !endDate) return acc
        return acc + calculateWorkDays(startDate, endDate)
      }, 0)
  }, [employeeLeaveThisYear])

  const daysAvailable = employee?.zileConcediuAnuale ?? 21
  const daysRemaining = daysAvailable - daysConsumed

  const leaveRequestsDisplay = useMemo(
    () => leaveRequests.filter((req) => ["CO", "CFP", "CM", "SL", "DEL"].includes(req.kind)),
    [leaveRequests]
  )

  if (!employee) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Fișa salariat" text="Salariat inexistent." />
        <Button variant="outline" onClick={() => router.push("/dashboard/resurse-umane/salariati")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Înapoi la salariați
        </Button>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading={
          <span className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            Fișa salariat - {getEmployeeFullName(employee)}
          </span>
        }
        text={employee.title || "Angajat"}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/resurse-umane/salariati")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi
          </Button>
          <Button onClick={() => setIsEditDialogOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editează
          </Button>
        </div>
      </DashboardHeader>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-12 p-1">
          <TabsTrigger value="detalii" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Detalii generale</span>
            <span className="sm:hidden">Detalii</span>
          </TabsTrigger>
          <TabsTrigger value="pontaj" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pontaj
          </TabsTrigger>
          <TabsTrigger value="concedii" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Concedii
          </TabsTrigger>
        </TabsList>

        {/* TAB: DETALII */}
        <TabsContent value="detalii" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Card 1: Informații de bază - Modern design */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                    {(employee.prenume[0] || "") + (employee.nume[0] || "")}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      Informații de bază
                    </CardTitle>
                  </div>
                </div>
          </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prenume</Label>
                  <div className="text-lg font-bold text-foreground">{employee.prenume}</div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nume</Label>
                  <div className="text-lg font-bold text-foreground">{employee.nume}</div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Funcție</Label>
                  <div className="text-sm font-semibold text-foreground/80">{employee.title || "—"}</div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</Label>
                  <div>
                    <Badge 
                      variant={employee.active ? "default" : "secondary"}
                      className={employee.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                    >
              {employee.active ? (
                        <><UserCheck className="h-3 w-3 mr-1" /> Activ</>
              ) : (
                        "Inactiv"
                      )}
                </Badge>
            </div>
            </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2 border-2 hover:bg-slate-50 hover:border-slate-400 transition-all" 
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <Pencil className="h-3 w-3 mr-2" />
                  Editează detalii
                </Button>
          </CardContent>
        </Card>

            {/* Card 2: Date de identificare */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950 dark:to-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-base">Date de identificare</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {employee.cnp && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CNP</Label>
                      <div className="text-sm font-semibold text-foreground/80">{employee.cnp}</div>
                    </div>
                    <Separator />
                  </>
                )}
                {(employee.ciSerie || employee.ciNumar) && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Serie și număr CI</Label>
                      <div className="text-sm font-semibold text-foreground/80">
                        {employee.ciSerie} {employee.ciNumar}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                {employee.ciDataEmiterii && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data emiterii CI</Label>
                      <div className="text-sm font-semibold text-foreground/80">{employee.ciDataEmiterii}</div>
                    </div>
                    <Separator />
                  </>
                )}
                {employee.ciEmitent && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emitent CI</Label>
                      <div className="text-sm font-semibold text-foreground/80">{employee.ciEmitent}</div>
                    </div>
                  </>
                )}
                {!employee.cnp && !employee.ciSerie && !employee.ciNumar && !employee.ciDataEmiterii && !employee.ciEmitent && (
                  <div className="text-sm text-muted-foreground italic">Nicio informație de identificare</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Workplace data and statistics */}
          <div className="grid gap-6 md:grid-cols-3 pb-12">
            {/* Card: Date despre locul de muncă */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950 dark:to-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-md">
                    <ClipboardList className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-base">Locul de muncă</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {employee.poziteCOR && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Poziție COR</Label>
                      <div className="text-sm font-semibold text-foreground/80">{employee.poziteCOR}</div>
                    </div>
                    <Separator />
                  </>
                )}
                {employee.superiorUid && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Superior ierarhic</Label>
                      <div className="text-sm font-semibold text-foreground/80">
                        {users.find(u => u.uid === employee.superiorUid)?.displayName || 
                         users.find(u => u.uid === employee.superiorUid)?.email || 
                         "—"}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                {employee.sectorIds && employee.sectorIds.length > 0 && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sectoare</Label>
                      <div className="flex flex-wrap gap-2">
                        {employee.sectorIds.map(sId => {
                          const dept = departments.find(d => d.id === sId)
                          return dept ? (
                            <Badge key={sId} variant="secondary">{dept.name}</Badge>
                          ) : (
                            <Badge key={sId} variant="outline" className="text-muted-foreground">
                              {sId} (șters)
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                {employee.loculDeMunca && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Locul de muncă</Label>
                      <div className="text-sm font-semibold text-foreground/80">{employee.loculDeMunca}</div>
                    </div>
                    <Separator />
                  </>
                )}
                {(employee.programLucruStart || employee.programLucruEnd) && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Program de lucru</Label>
                      <div className="text-sm font-semibold text-foreground/80">
                        {employee.programLucruStart || "—"} - {employee.programLucruEnd || "—"}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                {employee.zileConcediuAnuale && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zile concediu anuale</Label>
                      <div className="text-sm font-semibold text-foreground/80">{employee.zileConcediuAnuale} zile</div>
                    </div>
                  </>
                )}
                {!employee.poziteCOR && !employee.superiorUid && !employee.sectorIds?.length && !employee.loculDeMunca && !employee.programLucruStart && !employee.programLucruEnd && !employee.zileConcediuAnuale && (
                  <div className="text-sm text-muted-foreground italic">Nicio informație despre locul de muncă</div>
                )}
              </CardContent>
            </Card>

            {/* Card: Asociere utilizator - Modern design */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-white dark:from-purple-950 dark:to-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md">
                    <Link2 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Asociere utilizator</CardTitle>
                    <CardDescription className="text-xs">Contul de autentificare legat</CardDescription>
                  </div>
                </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {usersError && (
              <Alert variant="destructive">
                <AlertDescription>{usersError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <div className="text-sm text-muted-foreground">Utilizator asociat</div>
              <Select
                value={employee.userUid ?? "__none__"}
                onValueChange={(v) => setUserUid(v === "__none__" ? undefined : v)}
                disabled={loadingUsers}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingUsers ? "Se încarcă..." : "Alege utilizator"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Fără asociere</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.uid} value={u.uid}>
                      {(u.displayName || u.email || u.uid) + (u.role ? ` • ${u.role}` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employee.userUid && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Asociat:{" "}
                    <span className="font-medium">
                      {users.find((u) => u.uid === employee.userUid)?.displayName ||
                        users.find((u) => u.uid === employee.userUid)?.email ||
                        employee.userUid}
                    </span>
                  </span>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => router.push("/dashboard/utilizatori")}>
                    Deschide Utilizatori →
                  </Button>
                </div>
              )}
              {suggestionUid && !employee.userUid && suggestionUser && (
                <div className="flex flex-col gap-2 rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Sugestie (nume identic):</div>
                  <div className="text-sm font-medium">
                    {suggestionUser.displayName || suggestionUser.email || suggestionUser.uid}
                    {suggestionUser.role ? <span className="text-xs text-muted-foreground"> • {suggestionUser.role}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setUserUid(suggestionUid)}>
                      Asociază sugestia
                    </Button>
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => router.push("/dashboard/utilizatori")}>
                      Verifică în Utilizatori →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

            {/* Card: Statistici rapide - Modern design */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950 dark:to-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-base">Rezumat rapid</CardTitle>
      </div>
          </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-muted-foreground">Ore luna curentă</span>
                  </div>
                  <span className="text-xl font-bold text-emerald-700">{summary?.workHours ?? 0}h</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-900 shadow-sm">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-muted-foreground">Zile CO</span>
                  </div>
                  <span className="text-xl font-bold text-amber-700">{summary?.coDays ?? 0}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full mt-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium" 
                  onClick={() => setActiveTab("pontaj")}
                >
                  Vezi detalii complete →
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: PONTAJ */}
        <TabsContent value="pontaj" className="space-y-6 mt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border shadow-sm">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Pontaj lunar
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Activitate și statistici pentru perioada selectată</p>
            </div>
            <Input
              type="month"
              value={monthKey}
              onChange={(e) => {
                const newMonth = e.target.value as TimesheetMonthKey
                router.push(`/dashboard/resurse-umane/salariati/${employee.id}?month=${newMonth}`)
              }}
              className="w-[180px] border-2"
            />
          </div>

          {/* KPI Cards - Modern design */}
          <div className="grid gap-4 md:grid-cols-5">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -mr-10 -mt-10" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  <CardTitle className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">Ore lucrate</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-700">{summary?.workHours ?? 0}<span className="text-lg">h</span></div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full -mr-10 -mt-10" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-amber-600" />
                  <CardTitle className="text-xs font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">Zile CO</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-700">{summary?.coDays ?? 0}</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-blue-600" />
                  <CardTitle className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wide">Zile SL</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-700">{summary?.slDays ?? 0}</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/10 rounded-full -mr-10 -mt-10" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-pink-600" />
                  <CardTitle className="text-xs font-semibold text-pink-900 dark:text-pink-100 uppercase tracking-wide">Zile WE</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-pink-700">{summary?.weDays ?? 0}</div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/10 rounded-full -mr-10 -mt-10" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-violet-600" />
                  <CardTitle className="text-xs font-semibold text-violet-900 dark:text-violet-100 uppercase tracking-wide">Zile DEL</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-violet-700">{summary?.delDays ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Calendar vizual - Modern grid */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                <CardTitle>Activitate lunară</CardTitle>
            </div>
              <CardDescription className="mt-2">Calendar vizual cu statusul fiecărei zile</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: daysInMonth(monthKey) }, (_, i) => i + 1).map((d) => {
                  const cell = getCell(d)
                  return (
                    <div
                      key={d}
                      className={cn(
                        "h-14 w-full rounded-lg flex flex-col items-center justify-center text-sm font-bold shadow-sm hover:shadow-md transition-all duration-200 cursor-default border-2",
                        cellClasses(cell)
                      )}
                      title={`Ziua ${d}`}
                    >
                      <span className="text-xs opacity-60">Zi</span>
                      <span>{d}</span>
            </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>

          {/* Acțiuni rapide */}
          <div className="pb-12">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1 h-12 shadow-md hover:shadow-lg transition-all"
                onClick={() =>
                  router.push(`/dashboard/resurse-umane/condica-prezenta?employeeId=${encodeURIComponent(employee.id)}&month=${encodeURIComponent(monthKey)}`)
                }
              >
                <ClipboardList className="h-5 w-5 mr-2" />
                Deschide condica completă
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 h-12 border-2 shadow-md hover:shadow-lg transition-all"
                onClick={() => router.push(`/dashboard/resurse-umane/rapoarte?month=${encodeURIComponent(monthKey)}`)}
              >
                <BarChart3 className="h-5 w-5 mr-2" />
                Vezi rapoarte
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* TAB: CONCEDII */}
        <TabsContent value="concedii" className="space-y-6 mt-6">
          {/* Header cu descriere */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border shadow-sm">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Gestiune concedii
            </h3>
            <p className="text-sm text-muted-foreground mt-1">Soldul de zile libere și istoric cereri pentru {new Date().getFullYear()}</p>
          </div>

          {/* KPI concedii - Modern cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full -mr-12 -mt-12" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  <CardTitle className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wide">Disponibile {new Date().getFullYear()}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-blue-600">{daysAvailable}</div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">zile</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full -mr-12 -mt-12" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-amber-600" />
                  <CardTitle className="text-xs font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">Consumate</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-amber-600">{daysConsumed}</div>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">zile</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-slate-900 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full -mr-12 -mt-12" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <CardTitle className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">Rămase</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-emerald-600">{daysRemaining}</div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">zile</p>
          </CardContent>
        </Card>
      </div>

          {/* Listă cereri concediu - Modern design */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Istoric cereri concediu
                </CardTitle>
                <CardDescription className="mt-1">Toate cererile pentru acest angajat</CardDescription>
              </div>
              <Button size="sm" className="shadow-md hover:shadow-lg transition-all" onClick={() => setIsLeaveDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Cerere nouă
              </Button>
            </CardHeader>
            <CardContent className="pt-6">
              {leaveRequestsDisplay.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <CalendarDays className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">Nicio cerere de concediu</p>
                  <p className="text-sm text-muted-foreground mt-1">Creează prima cerere folosind butonul de mai sus</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaveRequestsDisplay.map((req) => (
                    <div 
                      key={req.id} 
                      className="flex items-center justify-between rounded-xl border-2 p-4 shadow-sm hover:shadow-md transition-all bg-gradient-to-r from-white to-slate-50 dark:from-slate-900 dark:to-slate-800"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center shadow-sm",
                            req.kind === "CO" ? "bg-gradient-to-br from-amber-500 to-amber-600" :
                            req.kind === "SL" ? "bg-gradient-to-br from-blue-500 to-blue-600" :
                            "bg-gradient-to-br from-violet-500 to-violet-600"
                          )}>
                            <CalendarDays className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base">
                                {hrRequestKindLabel(req.kind)}
                              </span>
                              <Badge 
                                variant={req.status === "approved" ? "default" : req.status === "pending" ? "secondary" : "destructive"}
                                className={req.status === "approved" ? "bg-emerald-500" : ""}
                              >
                                {hrRequestStatusLabel(req.status)}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 font-medium">
                              {hrRequestDateLabel(req)} •{" "}
                              <span className="font-bold">
                                {(() => {
                                  const payload: any = req.payload as any
                                  const startDate = payload?.startDate
                                  const endDate = payload?.endDate
                                  if (!startDate || !endDate) return "—"
                                  return `${calculateWorkDays(startDate, endDate)} zile`
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {(req.payload as any)?.reason && (
                          <div className="ml-13 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 mt-2">
                            {String((req.payload as any).reason)}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="ml-4 border-2 shadow-sm hover:shadow-md transition-all"
                        onClick={() => {
                          generateHrRequestPDF(req)
                        }}
                        title="Descarcă PDF"
                      >
                        <ClipboardList className="h-5 w-5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog - Modern design with all fields */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              Editează salariat
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Profile photo (first) */}
            <div className="grid gap-2">
              <Label>Poză profil</Label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="relative h-24 w-24 rounded-full overflow-hidden bg-muted flex items-center justify-center border"
                  onClick={() => {
                    const src = editPhotoPreview || editPhotoURL
                    if (src) setEditPhotoZoomOpen(true)
                  }}
                  title={editPhotoPreview || editPhotoURL ? "Vezi poza" : undefined}
                  aria-label={editPhotoPreview || editPhotoURL ? "Vezi poza" : "Poză profil"}
                >
                  {editPhotoPreview || editPhotoURL ? (
                    <img src={editPhotoPreview || editPhotoURL} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-muted-foreground/60" />
                  )}
                  {(editPhotoPreview || editPhotoURL) && (
                    <button
                      type="button"
                      className="absolute top-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm border border-red-100 hover:bg-white"
                      title="Elimină poza"
                      aria-label="Elimină poza"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditPhotoURL("")
                        setEditPhotoFile(null)
                        setEditPhotoPreview("")
                      }}
                      disabled={editPhotoSaving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </button>
                <div className="flex-1 space-y-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditPhotoFile(e.target.files?.[0] ?? null)}
                    disabled={editPhotoSaving}
                  />
                  <div className="text-xs text-muted-foreground">
                    Modificările de poză se aplică doar la apăsarea „Salvează”.
                  </div>
                </div>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Informații de bază</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="editPrenume">Prenume *</Label>
              <Input 
                    id="editPrenume"
                    value={editPrenume} 
                    onChange={(e) => setEditPrenume(e.target.value)}
                className="border-2 h-11"
                    placeholder="Ex: Ion"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editNume">Nume *</Label>
                  <Input 
                    id="editNume"
                    value={editNume} 
                    onChange={(e) => setEditNume(e.target.value)}
                    className="border-2 h-11"
                    placeholder="Ex: Popescu"
              />
                </div>
            </div>

              <div className="grid gap-2">
                <Label htmlFor="editTitle">Funcție</Label>
              <Input 
                  id="editTitle"
                value={editTitle} 
                onChange={(e) => setEditTitle(e.target.value)}
                className="border-2 h-11"
                placeholder="Ex: Manager Proiect"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border-2 p-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center shadow-sm",
                  editActive ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : "bg-gradient-to-br from-slate-400 to-slate-500"
                )}>
                  <UserCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold">Status activ</div>
                  <div className="text-xs text-muted-foreground">Dezactivează pentru a ascunde din liste</div>
                </div>
              </div>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>
            </div>

            <Separator />

            {/* Identification Data */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Date de identificare</h3>
              <div className="grid gap-2">
                <Label htmlFor="editCnp">CNP</Label>
                <Input 
                  id="editCnp"
                  value={editCnp} 
                  onChange={(e) => setEditCnp(e.target.value)}
                  placeholder="Ex: 1820620285533"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="editCiSerie">Serie CI</Label>
                  <Input 
                    id="editCiSerie"
                    value={editCiSerie} 
                    onChange={(e) => setEditCiSerie(e.target.value)}
                    placeholder="Ex: RT"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editCiNumar">Număr CI</Label>
                  <Input 
                    id="editCiNumar"
                    value={editCiNumar} 
                    onChange={(e) => setEditCiNumar(e.target.value)}
                    placeholder="Ex: 226633"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editCiDataEmiterii">Data emiterii CI</Label>
                <Input 
                  id="editCiDataEmiterii"
                  type="date"
                  value={editCiDataEmiterii} 
                  onChange={(e) => setEditCiDataEmiterii(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editCiEmitent">Emitent CI</Label>
                <Input 
                  id="editCiEmitent"
                  value={editCiEmitent} 
                  onChange={(e) => setEditCiEmitent(e.target.value)}
                  placeholder="Ex: SPCLEP Chiajana"
                />
              </div>
            </div>

            <Separator />

            {/* Workplace Data */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Date despre locul de muncă</h3>
              <div className="grid gap-2">
                <Label htmlFor="editPoziteCOR">Poziție COR</Label>
                <Input 
                  id="editPoziteCOR"
                  value={editPoziteCOR} 
                  onChange={(e) => setEditPoziteCOR(e.target.value)}
                  placeholder="Ex: 8114-Montator ansambluri mecanice"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editSuperiorUid">Superior ierarhic</Label>
                <Select 
                  value={editSuperiorUid || "__none__"}
                  onValueChange={(v) => setEditSuperiorUid(v === "__none__" ? undefined : v)}
                >
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
                <Label>Sectoare</Label>
                <div className="space-y-2 rounded-lg border p-3">
                  {departments.filter(d => d.active).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Niciun departament disponibil.{" "}
                      <Button 
                        variant="link" 
                        className="h-auto p-0" 
                        onClick={() => router.push("/dashboard/resurse-umane/departamente")}
                      >
                        Creează primul departament →
                      </Button>
                    </div>
                  ) : (
                    departments.filter(d => d.active).map((dept) => (
                      <div key={dept.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={editSectorIds.includes(dept.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditSectorIds([...editSectorIds, dept.id])
                            } else {
                              setEditSectorIds(editSectorIds.filter(id => id !== dept.id))
                              setEditManagerUidBySector((prev) => {
                                const next = { ...prev }
                                delete next[dept.id]
                                return next
                              })
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
                <div className="text-xs text-muted-foreground">
                  Pentru fiecare sector, selectează șeful ierarhic care aprobă cererile.
                </div>
              </div>

              {editSectorIds.length > 0 ? (
                <div className="grid gap-3 rounded-lg border p-3 bg-muted/20">
                  <div className="text-sm font-semibold">Șef ierarhic pe sector</div>
                  {editSectorIds.map((sectorId) => {
                    const dept = departments.find(d => d.id === sectorId)
                    return (
                      <div key={sectorId} className="grid gap-2">
                        <Label className="text-xs text-muted-foreground">
                          Sector: {dept?.name || sectorId}
                        </Label>
                        <Select
                          value={editManagerUidBySector?.[sectorId] ?? "__none__"}
                          onValueChange={(v) =>
                            setEditManagerUidBySector((prev) => {
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
                <Label htmlFor="editLoculDeMunca">Locul de muncă</Label>
                <Input 
                  id="editLoculDeMunca"
                  value={editLoculDeMunca} 
                  onChange={(e) => setEditLoculDeMunca(e.target.value)}
                  placeholder="Ex: Birou"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="editProgramLucruStart">Program start</Label>
                  <Input 
                    id="editProgramLucruStart"
                    type="time"
                    value={editProgramLucruStart} 
                    onChange={(e) => setEditProgramLucruStart(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editProgramLucruEnd">Program end</Label>
                  <Input 
                    id="editProgramLucruEnd"
                    type="time"
                    value={editProgramLucruEnd} 
                    onChange={(e) => setEditProgramLucruEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editZileConcediuAnuale">Zile concediu anuale</Label>
                <Input 
                  id="editZileConcediuAnuale"
                  type="number"
                  min="0"
                  max="50"
                  value={editZileConcediuAnuale} 
                  onChange={(e) => setEditZileConcediuAnuale(e.target.value)}
                  placeholder="21"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="border-2">
              Anulează
            </Button>
            <Button onClick={handleSaveEdit} className="shadow-md hover:shadow-lg transition-all">
              <Pencil className="h-4 w-4 mr-2" />
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo zoom dialog */}
      <Dialog open={editPhotoZoomOpen} onOpenChange={setEditPhotoZoomOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Poză profil</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={editPhotoPreview || editPhotoURL}
              alt=""
              className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Request Dialog */}
      {user?.uid ? (
        <CreateHrRequestDialog
          open={isLeaveDialogOpen}
          onOpenChange={setIsLeaveDialogOpen}
          employee={employee}
          requesterUid={user.uid}
        />
      ) : null}
    </DashboardShell>
  )
}


