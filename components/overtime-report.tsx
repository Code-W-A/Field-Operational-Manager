"use client"

import { useState, useEffect, useMemo } from "react"
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { Employee, HrRequest, HrRequestKind } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { subscribeEmployees } from "@/lib/hr/storage"
import { formatOvertimeDuration } from "@/lib/hr/overtime-duration"
import {
  extractApprovedOvertime,
  aggregateOvertimeGeneral,
  aggregateOvertimeByEmployee,
  formatOvertimeCSV,
  downloadCSV,
  formatDateRo,
  formatMonthRo,
  currentYearRange,
  type OvertimeDateRange,
} from "@/lib/hr/overtime-report"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Download, Clock, Users, FileText, ChevronDown, ChevronRight, AlertCircle } from "lucide-react"

function normalizeHrRequest(id: string, data: any): HrRequest {
  return {
    id,
    employeeId: String(data.employeeId ?? ""),
    employeeName: data.employeeName ? String(data.employeeName) : undefined,
    requesterUid: String(data.requesterUid ?? ""),
    sectorId: String(data.sectorId ?? ""),
    managerUid: String(data.managerUid ?? ""),
    kind: String(data.kind ?? "") as HrRequestKind,
    status: String(data.status ?? "") as any,
    payload: (data.payload ?? {}) as any,
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
    documentSerial: typeof data.documentSerial === "number" ? data.documentSerial : undefined,
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    decidedAt: data.decidedAt?.toMillis?.() ?? undefined,
    decidedByUid: data.decidedByUid ? String(data.decidedByUid) : undefined,
  }
}

export function OvertimeReport({ className }: { className?: string }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [requests, setRequests] = useState<HrRequest[]>([])
  const [loading, setLoading] = useState(true)

  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(String(currentYear))
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all")
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("sumar")

  const yearOptions = useMemo(() => {
    const years: string[] = []
    for (let y = currentYear; y >= currentYear - 4; y--) {
      years.push(String(y))
    }
    return years
  }, [currentYear])

  // Subscribe to employees
  useEffect(() => {
    const unsub = subscribeEmployees({
      onChange: (emps) => setEmployees(emps),
      onError: (err) => console.error("OvertimeReport: employees error", err),
    })
    return unsub
  }, [])

  // Subscribe to ADD_OVERTIME requests
  useEffect(() => {
    const q = query(
      collection(db, "hrRequests"),
      where("kind", "==", "ADD_OVERTIME"),
      orderBy("createdAt", "desc"),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => normalizeHrRequest(d.id, d.data()))
        setRequests(items)
        setLoading(false)
      },
      (err) => {
        console.error("OvertimeReport: requests error", err)
        setLoading(false)
      },
    )
    return unsub
  }, [])

  const dateRange: OvertimeDateRange = useMemo(
    () => ({ from: `${selectedYear}-01-01`, to: `${selectedYear}-12-31` }),
    [selectedYear],
  )

  const allEntries = useMemo(
    () => extractApprovedOvertime(requests, employees, dateRange),
    [requests, employees, dateRange],
  )

  const filteredEntries = useMemo(() => {
    if (selectedEmployee === "all") return allEntries
    return allEntries.filter((e) => e.employeeId === selectedEmployee)
  }, [allEntries, selectedEmployee])

  const generalStats = useMemo(() => aggregateOvertimeGeneral(filteredEntries), [filteredEntries])
  const byEmployee = useMemo(() => aggregateOvertimeByEmployee(filteredEntries), [filteredEntries])

  const chartData = useMemo(
    () =>
      generalStats.byMonth.map((m) => ({
        name: formatMonthRo(m.month),
        ore: m.hours,
        cereri: m.count,
      })),
    [generalStats],
  )

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active).sort((a, b) => getEmployeeFullName(a).localeCompare(getEmployeeFullName(b), "ro")),
    [employees],
  )

  const avgPerEmployee = generalStats.byEmployee.length > 0
    ? Math.round((generalStats.totalHours / generalStats.byEmployee.length) * 100) / 100
    : 0

  const handleExport = (mode: "general" | "detailed") => {
    const csv = formatOvertimeCSV(filteredEntries, mode)
    const suffix = mode === "general" ? "sumar" : "detaliat"
    downloadCSV(csv, `ore-suplimentare-${selectedYear}-${suffix}.csv`)
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className || ""}`}>
        <Spinner className="mr-2" />
        <span className="text-muted-foreground">Se încarcă datele...</span>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtre</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">An</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Angajat</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Toți angajații" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toți angajații</SelectItem>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {getEmployeeFullName(emp)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredEntries.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nu există ore suplimentare aprobate pentru {selectedYear}
            {selectedEmployee !== "all" ? " pentru angajatul selectat" : ""}.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <TabsList>
              <TabsTrigger value="sumar">Sumar</TabsTrigger>
              <TabsTrigger value="per-tehnician">Per Tehnician</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("general")}>
                <Download className="mr-2 h-4 w-4" />
                Export Sumar CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("detailed")}>
                <Download className="mr-2 h-4 w-4" />
                Export Detaliat CSV
              </Button>
            </div>
          </div>

          <TabsContent value="sumar" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Total Ore Suplimentare
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatOvertimeDuration(generalStats.totalHours)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{generalStats.totalHours} h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Cereri Aprobate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{generalStats.totalRequests}</div>
                  <p className="text-xs text-muted-foreground mt-1">cereri în {selectedYear}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Medie / Angajat
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatOvertimeDuration(avgPerEmployee)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{generalStats.byEmployee.length} angajați</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ore Suplimentare per Lună</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        angle={-30}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RechartsTooltip
                        formatter={(value: number, name: string) => {
                          if (name === "ore") return [`${value} h`, "Ore"]
                          return [value, "Cereri"]
                        }}
                      />
                      <Bar dataKey="ore" fill="#3b82f6" radius={[4, 4, 0, 0]} name="ore" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Top Employees Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clasament Angajați</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">#</th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Angajat</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Total Ore</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Nr. Cereri</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generalStats.byEmployee.map((emp, idx) => (
                        <tr key={emp.employeeId} className="border-b last:border-0">
                          <td className="py-2 pr-4 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 pr-4 font-medium">{emp.name}</td>
                          <td className="py-2 pr-4 text-right">
                            <Badge variant="secondary">{formatOvertimeDuration(emp.hours)}</Badge>
                          </td>
                          <td className="py-2 text-right text-muted-foreground">{emp.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="per-tehnician" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ore Suplimentare per Tehnician</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-8"></th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Angajat</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Total Ore</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Nr. Cereri</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byEmployee.map((emp) => {
                        const isExpanded = expandedEmployee === emp.employeeId
                        return (
                          <EmployeeRow
                            key={emp.employeeId}
                            emp={emp}
                            isExpanded={isExpanded}
                            onToggle={() => setExpandedEmployee(isExpanded ? null : emp.employeeId)}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function EmployeeRow({
  emp,
  isExpanded,
  onToggle,
}: {
  emp: ReturnType<typeof aggregateOvertimeByEmployee>[number]
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 pr-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="py-2 pr-4 font-medium">{emp.name}</td>
        <td className="py-2 pr-4 text-right">
          <Badge variant="secondary">{formatOvertimeDuration(emp.hours)}</Badge>
        </td>
        <td className="py-2 text-right text-muted-foreground">{emp.count}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="bg-muted/30 px-8 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-1 pr-4">Data</th>
                    <th className="text-right py-1 pr-4">Ore</th>
                    <th className="text-left py-1">Motiv</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.entries.map((entry) => (
                    <tr key={entry.requestId} className="border-t border-muted">
                      <td className="py-1.5 pr-4">{formatDateRo(entry.date)}</td>
                      <td className="py-1.5 pr-4 text-right">{formatOvertimeDuration(entry.hours)}</td>
                      <td className="py-1.5 text-muted-foreground">{entry.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
