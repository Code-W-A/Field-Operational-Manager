"use client"

import type { Employee, HrRequest, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, Download } from "lucide-react"
import { generateHrRequestPDF } from "@/lib/hr/request-pdf-generator"
import { hrRequestDateLabel, hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"
import Link from "next/link"

export function LeaveRequestsSection({
  monthKey,
  employees,
  leaveRequests,
  onCreateRequest,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  leaveRequests: HrRequest[]
  onCreateRequest: () => void
}) {
  const empMap = new Map(employees.map(e => [e.id, e]))
  const visibleRequests = leaveRequests.slice(0, 3)
  
  return (
    <div className="pb-40">
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg font-semibold">Concedii luna curentă</CardTitle>
            <Button size="sm" onClick={onCreateRequest}>
              <Plus className="h-4 w-4 mr-1" />
              Cerere
            </Button>
          </CardHeader>
          <CardContent>
            {leaveRequests.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <div className="text-sm text-muted-foreground">Nicio cerere pentru această lună</div>
                <div className="text-xs text-muted-foreground mt-1">Apasă butonul "Cerere" pentru a adăuga</div>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleRequests.map(req => {
                  const employee = empMap.get(req.employeeId)
                  
                  return (
                    <div key={req.id} className="flex items-center justify-between rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium">{employee ? getEmployeeFullName(employee) : req.employeeId}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                          <span>{hrRequestDateLabel(req)}</span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`inline-block h-2 w-2 rounded-full ${
                              req.kind === "CO" ? "bg-amber-500" : 
                              "bg-violet-500"
                            }`} />
                            {hrRequestKindLabel(req.kind)}
                          </span>
                        </div>
                        {(req.payload as any)?.reason && (
                          <div className="text-xs text-muted-foreground mt-1 italic">"{String((req.payload as any).reason)}"</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => generateHrRequestPDF(req)}
                          title="Descarcă PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Badge 
                          variant={
                            req.status === "approved" ? "default" : 
                            req.status === "pending" ? "secondary" : 
                            "destructive"
                          }
                        >
                          {hrRequestStatusLabel(req.status)}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
                {leaveRequests.length > 3 && (
                  <div className="pt-1">
                    <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                      <Link href="/dashboard/cereri-aprobari">Vezi mai multe</Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Evenimente luna {monthKey}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">
                Calendar evenimente / sărbători
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                (Poate fi integrat mai târziu cu sărbători legale din România)
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
