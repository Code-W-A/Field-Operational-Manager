"use client"

import { cn } from "@/lib/utils"
import { getYearGrid } from "../utils"

type YearViewProps = {
  startYear: number
  selectedYear: number
  onSelect: (year: number) => void
}

export function YearView({ startYear, selectedYear, onSelect }: YearViewProps) {
  const years = getYearGrid(startYear)

  return (
    <div className="grid grid-cols-3 gap-2">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => onSelect(y)}
          className={cn(
            "h-12 rounded-md text-sm font-medium transition-colors",
            y === selectedYear ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          {y}
        </button>
      ))}
    </div>
  )
}

