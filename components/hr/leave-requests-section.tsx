"use client"

import type { Employee, LeaveRequest, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, Download } from "lucide-react"
import { generateLeaveRequestPDF } from "@/lib/hr/leave-pdf-generator"

export function LeaveRequestsSection({
  monthKey,
  employees,
  leaveRequests,
  onCreateRequest,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  leaveRequests: LeaveRequest[]
  onCreateRequest: () => void
}) {
  const empMap = new Map(employees.map(e => [e.id, e]))
  
  const handleDownloadPDF = (request: LeaveRequest, employee: Employee) => {
    // Zile hardcodate pentru demo (în producție ar veni din baza de date)
    const availableDays = 21
    const workDays = calculateWorkDays(request.startDate, request.endDate)
    const remainingDays = availableDays - workDays
    
    generateLeaveRequestPDF(request, employee, availableDays, remainingDays)
  }
  
  return (
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
              {leaveRequests.map(req => {
                const employee = empMap.get(req.employeeId)
                
                return (
                  <div key={req.id} className="flex items-center justify-between rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium">{employee ? getEmployeeFullName(employee) : req.employeeId}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span>{req.startDate} → {req.endDate}</span>
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block h-2 w-2 rounded-full ${
                            req.type === "CO" ? "bg-amber-500" : 
                            req.type === "SL" ? "bg-blue-500" : 
                            "bg-violet-500"
                          }`} />
                          {req.type === "CO" ? "Concediu" : req.type === "SL" ? "Sărbătoare" : "Delegație"}
                        </span>
                      </div>
                      {req.reason && (
                        <div className="text-xs text-muted-foreground mt-1 italic">"{req.reason}"</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {employee && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownloadPDF(req, employee)}
                          title="Descarcă PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Badge 
                        variant={
                          req.status === "approved" ? "default" : 
                          req.status === "pending" ? "secondary" : 
                          "destructive"
                        }
                      >
                        {req.status === "approved" ? "Aprobat" : 
                         req.status === "pending" ? "Pending" : 
                         "Respins"}
                      </Badge>
                    </div>
                  </div>
                )
              })}
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
  )
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

