"use client"

import { useEffect, useState } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, FileText, Download } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import type { Employee, HrRequest } from "@/lib/hr/types"
import { getEmployeeByUserUid, subscribeDepartments, subscribeHrRequestsForEmployee, subscribeHrRequestsForRequester } from "@/lib/hr/storage"
import { hrRequestDateLabel, hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"
import { CreateHrRequestDialog } from "@/components/hr/create-hr-request-dialog"
import { generateHrRequestPDF } from "@/lib/hr/request-pdf-generator"

export default function CereriTehnicianPage() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [requests, setRequests] = useState<HrRequest[]>([])
  const [departmentsById, setDepartmentsById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [missingEmployeeLink, setMissingEmployeeLink] = useState(false)

  useEffect(() => {
    let unsub: null | (() => void) = null
    ;(async () => {
      try {
        if (!user?.uid) return
        setLoading(true)
        const emp = await getEmployeeByUserUid(user.uid)
        setEmployee(emp)
        setMissingEmployeeLink(!emp)
        if (emp) {
        unsub = subscribeHrRequestsForEmployee({
          employeeId: emp.id,
          onChange: setRequests,
        })
        } else {
          // Fallback for users without hrEmployees link (e.g. PWA users)
          unsub = subscribeHrRequestsForRequester({
            requesterUid: user.uid,
            onChange: setRequests,
          })
        }
      } finally {
        setLoading(false)
      }
    })()
    return () => unsub?.()
  }, [user?.uid])

  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: (deps) => {
        const map: Record<string, string> = {}
        for (const d of deps) map[d.id] = d.name
        setDepartmentsById(map)
      },
    })
    return () => unsub()
  }, [])

  return (
    <DashboardShell>
      <DashboardHeader
        heading={
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cererile mele
          </span>
        }
        text="Creează și urmărește cererile tale (concedii, învoiri, delegații, corectări de ore)."
        headerAction={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Cerere
          </Button>
        }
      />

      {missingEmployeeLink ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Contul tău nu este asociat cu un salariat HR. Cererile sunt afișate pe baza contului curent.
        </div>
      ) : null}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Listă cereri</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Se încarcă...</div>
          ) : !user?.uid ? (
            <div className="text-sm text-muted-foreground">Trebuie să fii autentificat.</div>
          ) : !employee ? (
            <div className="text-sm text-muted-foreground">
              Contul tău nu este asociat cu un salariat în HR (`hrEmployees.userUid`). Roagă un admin să facă asocierea din
              „Fișa salariat”.
            </div>
          ) : requests.length === 0 ? (
            <div className="text-sm text-muted-foreground">Încă nu ai cereri. Apasă pe „Cerere” ca să creezi una nouă.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{hrRequestKindLabel(r.kind)}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                      <span>{hrRequestDateLabel(r)}</span>
                      <span>Departament: {r.sectorId ? (departmentsById[r.sectorId] || "—") : "—"}</span>
                    </div>
                    {r.status === "rejected" && r.rejectionReason ? (
                      <div className="text-xs text-destructive mt-1">Motiv: {r.rejectionReason}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => generateHrRequestPDF(r)}
                      title="Descarcă document"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Badge
                      variant={
                        r.status === "approved" ? "default" : r.status === "pending" ? "secondary" : "destructive"
                      }
                    >
                      {hrRequestStatusLabel(r.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {employee && user?.uid ? (
        <CreateHrRequestDialog open={open} onOpenChange={setOpen} employee={employee} requesterUid={user.uid} />
      ) : null}
    </DashboardShell>
  )
}
