"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table/data-table"
import type { Department, Employee } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { Pencil, UserRoundSearch } from "lucide-react"

export function EmployeesTable({
  employees,
  users = [],
  departments = [],
  onEdit,
}: {
  employees: Employee[]
  users?: Array<{ uid: string; email: string | null; displayName: string | null }>
  departments?: Department[]
  onEdit: (employee: Employee) => void
}) {
  const router = useRouter()

  const columns: ColumnDef<Employee, any>[] = useMemo(
    () => [
      {
        id: "search",
        accessorFn: (employee) => {
          const user = users.find((item) => item.uid === employee.userUid)
          const departmentNames = (employee.sectorIds ?? [])
            .map((id) => departments.find((department) => department.id === id)?.name ?? id)
            .join(" ")
          return [
            getEmployeeFullName(employee),
            employee.nume,
            employee.prenume,
            employee.title,
            employee.active ? "activ" : "inactiv",
            user?.email,
            user?.displayName,
            departmentNames,
          ].filter(Boolean).join(" ").toLowerCase()
        },
        header: () => null,
        cell: () => null,
        enableHiding: true,
      },
      {
        accessorKey: "nume",
        header: "Nume",
        cell: ({ row }) => <div className="font-medium">{getEmployeeFullName(row.original)}</div>,
      },
      {
        accessorKey: "title",
        header: "Funcție",
        cell: ({ row }) => <div className="text-muted-foreground">{row.original.title || "—"}</div>,
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) =>
          row.original.active ? (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              Activ
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Inactiv
            </Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/dashboard/resurse-umane/salariati/${row.original.id}`)
              }}
            >
              <UserRoundSearch className="h-4 w-4 mr-2" />
              Fișă
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(row.original)
              }}
              aria-label="Editează salariat"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [departments, onEdit, router, users]
  )

  return (
    <DataTable
      columns={columns}
      data={employees}
      initialColumnVisibility={{ search: false }}
      showFilters={true}
      defaultSort={{ id: "nume", desc: false }}
      onRowClick={(row) => router.push(`/dashboard/resurse-umane/salariati/${(row as Employee).id}`)}
      enablePagination={true}
      initialPageSize={20}
    />
  )
}
