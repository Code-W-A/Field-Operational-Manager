"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDate } from "@/lib/utils/date-formatter"
import Link from "next/link"
import type { Lucrare } from "@/types/work-order"

// Definirea coloanelor pentru tabelul de lucrări
export const workOrderColumns: ColumnDef<Lucrare>[] = [
  {
    accessorKey: "numarComanda",
    header: "Nr. Comandă",
    cell: ({ row }) => <div className="font-medium">{row.getValue("numarComanda") || "-"}</div>,
  },
  {
    accessorKey: "numeClient",
    header: "Client",
    cell: ({ row }) => <div>{row.getValue("numeClient") || "-"}</div>,
  },
  {
    accessorKey: "locatie",
    header: "Locație",
    cell: ({ row }) => <div>{row.getValue("locatie") || "-"}</div>,
  },
  {
    accessorKey: "tipLucrare",
    header: "Tip Lucrare",
    cell: ({ row }) => <div>{row.getValue("tipLucrare") || "-"}</div>,
  },
  {
    accessorKey: "dataCreare",
    header: "Data Creare",
    cell: ({ row }) => {
      const timestamp = row.getValue("dataCreare") as { seconds: number; nanoseconds: number } | null
      return <div>{timestamp ? formatDate(timestamp) : "-"}</div>
    },
  },
  {
    accessorKey: "dataProgramare",
    header: "Data Programare",
    cell: ({ row }) => {
      const timestamp = row.getValue("dataProgramare") as { seconds: number; nanoseconds: number } | null
      return <div>{timestamp ? formatDate(timestamp) : "-"}</div>
    },
  },
  {
    accessorKey: "statusLucrare",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("statusLucrare") as string
      return (
        <Badge
          variant={
            status === "Finalizat"
              ? "success"
              : status === "În curs"
                ? "warning"
                : status === "În așteptare"
                  ? "secondary"
                  : "outline"
          }
        >
          {status || "Nedefinit"}
        </Badge>
      )
    },
  },
  {
    accessorKey: "tehnician",
    header: "Tehnician",
    cell: ({ row }) => <div>{row.getValue("tehnician") || "-"}</div>,
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const lucrare = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Deschide meniu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Acțiuni</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/lucrari/${lucrare.id}`} className="flex items-center">
                <Eye className="mr-2 h-4 w-4" />
                <span>Vizualizare</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/lucrari/${lucrare.id}/edit`} className="flex items-center">
                <Edit className="mr-2 h-4 w-4" />
                <span>Editare</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Ștergere</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
