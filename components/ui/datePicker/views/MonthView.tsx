"use client"

import { cn } from "@/lib/utils"
import type { DatePickerLocale } from "../types"
import { getMonthLabels } from "../utils"

type MonthViewProps = {
  year: number
  locale: DatePickerLocale
  selectedMonth: number
  onSelect: (monthIndex: number) => void
}

export function MonthView({ year, locale, selectedMonth, onSelect }: MonthViewProps) {
  const months = getMonthLabels(locale)

  return (
    <div className="grid grid-cols-3 gap-2">
      {months.map((m, idx) => (
        <button
          key={`${year}-${idx}`}
          type="button"
          onClick={() => onSelect(idx)}
          className={cn(
            "h-12 rounded-md text-sm font-medium transition-colors",
            idx === selectedMonth ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

