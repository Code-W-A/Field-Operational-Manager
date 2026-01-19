"use client"

import { isSameDay, isSameMonth } from "date-fns"
import { cn } from "@/lib/utils"
import type { DatePickerLocale, DateRange } from "../types"
import { buildMonthMatrix, formatDate, getWeekdayLabels, isOutsideRange, isWithinRange } from "../utils"

type DayViewProps = {
  month: Date
  locale: DatePickerLocale
  focusedDate: Date
  onDayClick: (date: Date) => void
  onDayHover?: (date: Date | null) => void
  minDate?: Date
  maxDate?: Date
  selected?: Date | null
  range?: DateRange
  hoverRange?: DateRange
}

export function DayView({
  month,
  locale,
  focusedDate,
  onDayClick,
  onDayHover,
  minDate,
  maxDate,
  selected,
  range,
  hoverRange,
}: DayViewProps) {
  const weeks = buildMonthMatrix(month, locale)
  const weekdays = getWeekdayLabels(locale)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 text-xs text-muted-foreground">
        {weekdays.map((d, idx) => (
          <div key={idx} className="text-center py-1">{d}</div>
        ))}
      </div>
      <div role="grid" className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day, idx) => {
          const outside = !isSameMonth(day, month)
          const disabled = isOutsideRange(day, minDate, maxDate)
          const isSelected = selected ? isSameDay(day, selected) : false
          const isRangeStart = range?.start ? isSameDay(day, range.start) : false
          const isRangeEnd = range?.end ? isSameDay(day, range.end) : false
          const inRange = range ? isWithinRange(day, range) : false
          const inHover = hoverRange ? isWithinRange(day, hoverRange) : false
          const isFocused = isSameDay(day, focusedDate)

          return (
            <button
              key={`${day.toISOString()}-${idx}`}
              role="gridcell"
              type="button"
              disabled={disabled}
              onClick={() => onDayClick(day)}
              onMouseEnter={() => onDayHover?.(day)}
              onMouseLeave={() => onDayHover?.(null)}
              aria-selected={isSelected || isRangeStart || isRangeEnd}
              className={cn(
                "h-9 w-9 rounded-md text-sm flex items-center justify-center transition-colors",
                outside && "text-muted-foreground/50",
                disabled && "text-muted-foreground/30 pointer-events-none",
                (inRange || inHover) && "bg-primary/10",
                (isRangeStart || isRangeEnd || isSelected) && "bg-primary text-primary-foreground",
                isFocused && "ring-2 ring-primary/30",
                !disabled && !isSelected && !isRangeStart && !isRangeEnd && "hover:bg-muted"
              )}
              title={formatDate(day, "dd MMM yyyy", locale)}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

