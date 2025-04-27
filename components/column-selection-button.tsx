"use client"

import { Columns } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ColumnSelectionButtonProps {
  onClick: () => void
  hiddenColumnsCount?: number
}

export function ColumnSelectionButton({ onClick, hiddenColumnsCount = 0 }: ColumnSelectionButtonProps) {
  return (
    <Button variant="outline" size="sm" className="h-10 px-3 flex items-center gap-2" onClick={onClick}>
      <Columns className="h-4 w-4" />
      <span>Coloane</span>
      {hiddenColumnsCount > 0 && (
        <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
          {hiddenColumnsCount}
        </span>
      )}
    </Button>
  )
}
