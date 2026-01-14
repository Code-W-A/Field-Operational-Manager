"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { collection, query, where, getDocs, orderBy, Timestamp, doc, getDoc, limit } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { AttendanceSession } from "@/types/attendance"
import { CalendarIcon, MapPin, Clock, TrendingUp, Users, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

type EmployeeInfo = { fullName: string; title?: string }

function buildEmployeeInfo(data: any): EmployeeInfo {
  const prenume = String(data?.prenume || "").trim()
  const nume = String(data?.nume || "").trim()
  const legacy = String(data?.fullName || "").trim()
  const fullName = `${prenume} ${nume}`.trim() || legacy
  const title = data?.title ? String(data.title) : undefined
  return { fullName: fullName || "N/A", title }
}

export default function AttendanceDashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [loading, setLoading] = useState(false)
  const [employeeInfoById, setEmployeeInfoById] = useState<Record<string, EmployeeInfo>>({})
  const [employeeInfoByUserUid, setEmployeeInfoByUserUid] = useState<Record<string, EmployeeInfo>>({})
  const [stats, setStats] = useState({
    totalSessions: 0,
    activeNow: 0,
    totalHours: 0,
    totalExtraHours: 0,
  })

  useEffect(() => {
    loadSessionsForDate(selectedDate)
  }, [selectedDate])

  const loadSessionsForDate = async (date: Date) => {
    try {
      setLoading(true)

      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)

      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const sessionsQuery = query(
        collection(db, "attendance"),
        where("sessionStart", ">=", Timestamp.fromDate(startOfDay)),
        where("sessionStart", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("sessionStart", "desc")
      )

      const snapshot = await getDocs(sessionsQuery)

      const loadedSessions: AttendanceSession[] = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          sessionStart: data.sessionStart?.toMillis?.() || Date.now(),
          sessionEnd: data.sessionEnd?.toMillis?.(),
          createdAt: data.createdAt?.toMillis?.() || Date.now(),
          updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
        } as AttendanceSession
      })

      setSessions(loadedSessions)

      // Resolve technician details dynamically from HR employees (so edits show up immediately).
      // Primary: attendance.employeeId -> hrEmployees/{employeeId}
      // Fallback: attendance.userId -> hrEmployees where userUid == userId
      try {
        const ids = Array.from(
          new Set(
            loadedSessions
              .map((s) => String((s as any)?.employeeId || ""))
              .filter(Boolean)
          )
        )
        const missingUids = Array.from(
          new Set(
            loadedSessions
              .filter((s) => !String((s as any)?.employeeId || ""))
              .map((s) => String((s as any)?.userId || ""))
              .filter(Boolean)
          )
        )

        if (ids.length) {
          const pairs = await Promise.all(
            ids.map(async (id) => {
              const snap = await getDoc(doc(db, "hrEmployees", id))
              if (!snap.exists()) return null
              return [id, buildEmployeeInfo(snap.data())] as const
            })
          )
          const next: Record<string, EmployeeInfo> = {}
          for (const p of pairs) {
            if (!p) continue
            next[p[0]] = p[1]
          }
          setEmployeeInfoById(next)
        } else {
          setEmployeeInfoById({})
        }

        if (missingUids.length) {
          const pairs = await Promise.all(
            missingUids.map(async (uid) => {
              const q = query(collection(db, "hrEmployees"), where("userUid", "==", uid), limit(1))
              const snap = await getDocs(q)
              if (snap.empty) return null
              return [uid, buildEmployeeInfo(snap.docs[0].data())] as const
            })
          )
          const next: Record<string, EmployeeInfo> = {}
          for (const p of pairs) {
            if (!p) continue
            next[p[0]] = p[1]
          }
          setEmployeeInfoByUserUid(next)
        } else {
          setEmployeeInfoByUserUid({})
        }
      } catch (e) {
        console.warn("Failed to resolve HR employee display data:", e)
      }

      // Calculate stats
      const totalHours = loadedSessions.reduce((sum, s) => {
        if (!s.sessionEnd) return sum
        const hours = (s.sessionEnd - s.sessionStart) / (1000 * 60 * 60)
        return sum + hours
      }, 0)

      const totalExtraMinutes = loadedSessions.reduce((sum, s) => {
        if (!s.extraTimeLogs) return sum
        return sum + s.extraTimeLogs.reduce((logSum, log) => logSum + log.minutesEligible, 0)
      }, 0)

      const activeNow = loadedSessions.filter((s) => s.status === "active").length

      setStats({
        totalSessions: loadedSessions.length,
        activeNow,
        totalHours: Math.round(totalHours * 10) / 10,
        totalExtraHours: Math.round((totalExtraMinutes / 60) * 10) / 10,
      })
    } catch (error) {
      console.error("Failed to load sessions:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (start: number, end?: number) => {
    if (!end) return "În desfășurare"
    const duration = Math.floor((end - start) / (1000 * 60))
    const hours = Math.floor(duration / 60)
    const minutes = duration % 60
    return `${hours}h ${minutes}m`
  }

  const formatExtraTime = (session: AttendanceSession) => {
    if (!session.extraTimeLogs || session.extraTimeLogs.length === 0) return "-"
    const totalMinutes = session.extraTimeLogs.reduce((sum, log) => sum + log.minutesEligible, 0)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const getTechnicianLabel = (session: AttendanceSession): EmployeeInfo => {
    const employeeId = String((session as any)?.employeeId || "")
    if (employeeId && employeeInfoById[employeeId]) return employeeInfoById[employeeId]
    const uid = String((session as any)?.userId || "")
    if (uid && employeeInfoByUserUid[uid]) return employeeInfoByUserUid[uid]
    // Backward compatibility (older attendance docs might have snapshot userName):
    const fallback = String((session as any)?.userName || "").trim()
    return { fullName: fallback || "N/A" }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Pontaj</h1>
          <p className="text-muted-foreground mt-2">
            Vizualizare pontaje și statistici
          </p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : "Selectează data"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sesiuni</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Acum</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeNow}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Lucrate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalHours}h</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Extra</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.totalExtraHours}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sesiuni Pontaj</CardTitle>
          <CardDescription>
            Detalii pentru {format(selectedDate, "dd MMMM yyyy")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nu există pontaje pentru această zi
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tehnician</TableHead>
                    <TableHead>Mod</TableHead>
                    <TableHead>Check-In</TableHead>
                    <TableHead>Check-Out</TableHead>
                    <TableHead>Durată</TableHead>
                    <TableHead>Timp Extra</TableHead>
                    <TableHead>Locație</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{getTechnicianLabel(session).fullName}</span>
                          {getTechnicianLabel(session).title && (
                            <span className="text-xs text-muted-foreground">{getTechnicianLabel(session).title}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={session.mode === "office" ? "default" : "secondary"}>
                          {session.mode === "office" ? "Birou" : "Mașină"}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(session.sessionStart), "HH:mm")}</TableCell>
                      <TableCell>
                        {session.sessionEnd ? format(new Date(session.sessionEnd), "HH:mm") : "-"}
                      </TableCell>
                      <TableCell>{formatDuration(session.sessionStart, session.sessionEnd)}</TableCell>
                      <TableCell>{formatExtraTime(session)}</TableCell>
                      <TableCell>
                        {session.location?.address ? (
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[200px]" title={session.location.address}>
                              {session.location.address}
                            </span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={session.status === "active" ? "default" : "secondary"}
                          className={session.status === "active" ? "bg-green-500" : ""}
                        >
                          {session.status === "active" ? "Activ" : "Finalizat"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
