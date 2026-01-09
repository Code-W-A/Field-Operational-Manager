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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, ClipboardList, Link2, UserRound } from "lucide-react"

import type { Employee, TimesheetMonthKey } from "@/lib/hr/types"
import {
  createOrUpdateEmployee,
  daysInMonth,
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeTimesheetsForMonth,
} from "@/lib/hr/storage"
import type { TimesheetMonth } from "@/lib/hr/types"

type AppUser = { uid: string; displayName: string | null; email: string | null; role?: string }

function summarizeTimesheetFromTimesheets(monthKey: TimesheetMonthKey, employeeId: string, timesheets: TimesheetMonth[]) {
  const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employeeId)
  const dim = daysInMonth(monthKey)
  let workHours = 0
  let coDays = 0
  let slDays = 0
  let weDays = 0
  for (let d = 1; d <= dim; d++) {
    const cell = ts?.days?.[String(d)]
    if (!cell) continue
    if (cell.code === "WORK") workHours += Number(cell.hours ?? 0)
    if (cell.code === "CO") coDays += 1
    if (cell.code === "SL") slDays += 1
    if (cell.code === "WE") weDays += 1
  }
  return { workHours, coDays, slDays, weDays }
}

export default function HrEmployeeDetailsPage() {
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

  const suggestionUid = useMemo(() => {
    if (!employee) return null
    const norm = (s: string) => s.toLowerCase().replaceAll(/\s+/g, " ").trim()
    const target = norm(employee.fullName)
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
            Fișa salariat: {employee.fullName}
          </span>
        }
        text="Detalii, asociere utilizator și sumar de pontaj."
        headerAction={
          <Button variant="outline" onClick={() => router.push("/dashboard/resurse-umane/salariati")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Înapoi
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Detalii</CardTitle>
            <CardDescription>Informații de bază.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Status</div>
              {employee.active ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  Activ
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  Inactiv
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Funcție</div>
              <div className="font-medium">{employee.title || "—"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Asociere utilizator
            </CardTitle>
            <CardDescription>Leagă fișa salariatului de un utilizator din aplicație.</CardDescription>
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
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Pontaj (sumar)</CardTitle>
            <CardDescription>Month: {monthKey}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Ore lucrate</div>
              <div className="text-2xl font-bold">{summary?.workHours ?? 0}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">CO</div>
              <div className="text-2xl font-bold">{summary?.coDays ?? 0}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">SL (sărbătoare legală)</div>
              <div className="text-2xl font-bold">{summary?.slDays ?? 0}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">WE</div>
              <div className="text-2xl font-bold">{summary?.weDays ?? 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acțiuni</CardTitle>
            <CardDescription>Acces rapid.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              onClick={() =>
                router.push(
                  `/dashboard/resurse-umane/condica-prezenta?employeeId=${encodeURIComponent(employee.id)}&month=${encodeURIComponent(monthKey)}`
                )
              }
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              Vezi condică
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push(`/dashboard/resurse-umane/rapoarte?month=${encodeURIComponent(monthKey)}`)}>
              Rapoarte HR
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}


