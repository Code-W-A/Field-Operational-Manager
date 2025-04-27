"use client"

import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FilterButtonProps {
  onClick: () => void
  activeFilters?: number
}

export function FilterButton({ onClick, activeFilters = 0 }: FilterButtonProps) {
  return (
    <Button variant="outline" size="sm" className="h-10 px-3 flex items-center gap-2" onClick={onClick}>
      <Filter className="h-4 w-4" />
      <span>Filtrare</span>
      {activeFilters > 0 && (
        <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
          {activeFilters}
        </span>
      )}
    </Button>
  )
}
