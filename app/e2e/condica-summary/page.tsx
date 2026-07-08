"use client"

import { Download } from "lucide-react"
import { isE2eTestMode } from "@/lib/utils/environment"
import { formatTimesheetsCSV } from "@/lib/hr/export"
import { calculateEmployeeOvertimeBank, calculateEmployeeTimesheetSummary } from "@/lib/hr/timesheet-summary"
import { minutesToHM } from "@/lib/hr/time-calc"
import type { Employee, HrRequest, TimesheetMonth } from "@/lib/hr/types"

const employee: Employee = {
  id: "emp-summary-e2e",
  nume: "Summary",
  prenume: "Condica",
  active: true,
  programLucruStart: "08:00",
  programLucruEnd: "16:30",
  pauzaStart: "12:00",
  pauzaEnd: "12:30",
}

const timesheet: TimesheetMonth = {
  employeeId: employee.id,
  monthKey: "2026-03",
  updatedAt: 0,
  days: {
    "1": {
      code: "WORK",
      entries: [{ start: "07:30", end: "08:00", project: "Traseu către client" }],
    },
    "2": {
      code: "WORK",
      hours: 99,
      entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }],
    },
    "3": {
      code: "WORK",
      hours: 6,
    },
    "4": {
      code: "CO",
    },
    "5": {
      code: "DEL",
    },
    "6": {
      code: "IN",
      hours: 1.5,
    },
  },
}

const requests: HrRequest[] = [
  {
    id: "co-summary-e2e",
    employeeId: employee.id,
    requesterUid: "user",
    sectorId: "sector",
    managerUid: "manager",
    kind: "CO",
    status: "approved",
    payload: { kind: "CO", startDate: "2026-03-04", endDate: "2026-03-04" },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "del-summary-e2e",
    employeeId: employee.id,
    requesterUid: "user",
    sectorId: "sector",
    managerUid: "manager",
    kind: "DEL",
    status: "approved",
    payload: { kind: "DEL", startDate: "2026-03-05", endDate: "2026-03-05", clientName: "Client" },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "in-summary-e2e",
    employeeId: employee.id,
    requesterUid: "user",
    sectorId: "sector",
    managerUid: "manager",
    kind: "IN",
    status: "approved",
    payload: { kind: "IN", date: "2026-03-06", startTime: "10:00", endTime: "11:30" },
    createdAt: 0,
    updatedAt: 0,
  },
]

export default function CondicaSummaryE2ePage() {
  if (!isE2eTestMode()) {
    return <div data-testid="condica-summary-disabled">Harness indisponibil în afara E2E.</div>
  }

  const summary = calculateEmployeeTimesheetSummary({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet,
    employee,
    requests,
  })
  const bank = calculateEmployeeOvertimeBank({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet,
    employee,
    requests,
  })

  const downloadCSV = () => {
    const csv = formatTimesheetsCSV("2026-03", [employee], [timesheet], { requests })
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "condica-summary-e2e.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, fontFamily: "sans-serif" }}>
      <h1 data-testid="condica-summary-title">Condică sumar E2E</h1>
      <button data-testid="condica-summary-export" onClick={downloadCSV} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Download size={16} />
        Export CSV
      </button>

      <table style={{ marginTop: 24, borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["Zile lucrate", "Tichete de masă", "Ore prezență", "Bancă de ore", "Ore traseu la client", "Zile CO", "Zile DEL", "Ore IN"].map((label) => (
              <th key={label} style={{ border: "1px solid #ddd", padding: 8, textAlign: "left" }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-testid="summary-zile-lucrate">{summary.zileLucrate}</td>
            <td data-testid="summary-tichete-masa">{summary.ticheteMasa}</td>
            <td data-testid="summary-ore-prezenta">{minutesToHM(Math.round(summary.orePrezenta * 60))}</td>
            <td data-testid="summary-banca-ore">{bank.display}</td>
            <td data-testid="summary-traseu-client">{summary.oreTraseuLaClient}</td>
            <td data-testid="summary-zile-co">{summary.co}</td>
            <td data-testid="summary-zile-del">{summary.del}</td>
            <td data-testid="summary-ore-in">{summary.totalTimpIN}</td>
          </tr>
        </tbody>
      </table>
    </main>
  )
}
