"use client"

import * as React from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isToday,
  setDefaultOptions,
} from "date-fns"
import { ro } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { Locale } from "date-fns"

// Set default locale to Romanian
setDefaultOptions({ locale: ro })

export interface CalendarProps {
  mode?: "single" | "range" | "multiple"
  selected?: Date | Date[] | undefined
  onSelect?: (date: Date | undefined) => void
  disabled?: (date: Date) => boolean
  locale?: Locale
  showOutsideDays?: boolean
  className?: string
  classNames?: Record<string, string>
  fromDate?: Date
  toDate?: Date
  initialFocus?: boolean
}

export function Calendar({
  mode = "single",
  selected,
  onSelect,
  disabled,
  locale = ro,
  showOutsideDays = true,
  className,
  classNames,
  fromDate,
  toDate,
  initialFocus,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    // Initialize with the month of the selected date or current month
    if (selected instanceof Date) {
      return new Date(selected.getFullYear(), selected.getMonth(), 1)
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  })

  // Get days in current month
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get day names in Romanian
  const dayNames = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"]

  // Calculate which day of the week the month starts on (0 = Sunday, 1 = Monday, etc.)
  // Adjust for Romanian calendar (week starts on Monday)
  let firstDayOfMonth = getDay(monthStart) // 0 = Sunday, 1 = Monday, etc.
  if (firstDayOfMonth === 0) firstDayOfMonth = 7 // Convert Sunday from 0 to 7
  firstDayOfMonth -= 1 // Adjust to make Monday = 0

  // Handle month navigation
  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))

  // Handle date selection
  const handleDateSelect = (day: Date) => {
    if (disabled?.(day)) return
    onSelect?.(day)
  }

  // Check if a date is selected
  const isDateSelected = (day: Date): boolean => {
    if (!selected) return false

    if (selected instanceof Date) {
      return isSameDay(day, selected)
    }

    if (Array.isArray(selected)) {
      return selected.some((selectedDate) => isSameDay(day, selectedDate))
    }

    return false
  }

  return (
    <div className={cn("w-72 p-3 bg-white rounded-xl shadow-sm", className)}>
      {/* Header with month and year */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousMonth}
          className="h-7 w-7 bg-transparent hover:bg-muted rounded-full p-0"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Luna anterioară</span>
        </Button>

        <h2 className="text-sm font-medium">{format(currentMonth, "LLLL yyyy", { locale })}</h2>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          className="h-7 w-7 bg-transparent hover:bg-muted rounded-full p-0"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Luna următoare</span>
        </Button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="text-xs font-medium text-center text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before the start of the month */}
        {Array.from({ length: firstDayOfMonth }).map((_, index) => (
          <div key={`empty-start-${index}`} className="h-8 w-8" />
        ))}

        {/* Actual days of the month */}
        {daysInMonth.map((day) => {
          const isSelected = isDateSelected(day)
          const isDayToday = isToday(day)
          const isDisabled = disabled?.(day) || false
          const isOutsideCurrentMonth = !isSameMonth(day, currentMonth)
          const shouldDisplay = showOutsideDays || !isOutsideCurrentMonth

          if (!shouldDisplay) {
            return <div key={day.toString()} className="h-8 w-8" />
          }

          return (
            <Button
              key={day.toString()}
              variant="ghost"
              size="icon"
              disabled={isDisabled}
              className={cn(
                "h-8 w-8 p-0 font-normal rounded-full text-center",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                !isSelected && isDayToday && "border border-primary text-foreground",
                !isSelected && !isDayToday && !isDisabled && "hover:bg-accent",
                isOutsideCurrentMonth && !isSelected && "text-muted-foreground opacity-50",
                isDisabled && "text-muted-foreground opacity-50 cursor-not-allowed",
              )}
              onClick={() => handleDateSelect(day)}
            >
              <time dateTime={format(day, "yyyy-MM-dd")}>{format(day, "d")}</time>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

Calendar.displayName = "Calendar"
