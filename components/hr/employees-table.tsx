"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table/data-table"
import type { Employee } from "@/lib/hr/types"
import { Pencil, UserRoundSearch } from "lucide-react"

export function EmployeesTable({
  employees,
  onEdit,
}: {
  employees: Employee[]
  onEdit: (employee: Employee) => void
}) {
  const router = useRouter()

  const columns: ColumnDef<Employee, any>[] = useMemo(
    () => [
      {
        accessorKey: "fullName",
        header: "Nume",
        cell: ({ row }) => <div className="font-medium">{row.original.fullName}</div>,
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
    [onEdit, router]
  )

  return (
    <DataTable
      columns={columns}
      data={employees}
      showFilters={true}
      defaultSort={{ id: "fullName", desc: false }}
      onRowClick={(row) => router.push(`/dashboard/resurse-umane/salariati/${(row as Employee).id}`)}
      enablePagination={true}
      initialPageSize={20}
    />
  )
}


