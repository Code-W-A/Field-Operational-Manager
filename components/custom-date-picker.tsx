"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from "date-fns"
import { ro } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CustomDatePickerProps {
  selectedDate: Date | undefined
  onDateChange: (date: Date | undefined) => void
  onClose: () => void
  hasError?: boolean
}

export function CustomDatePicker({ selectedDate, onDateChange, onClose, hasError = false }: CustomDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date())
  const [animationDirection, setAnimationDirection] = useState<"left" | "right" | null>(null)

  // Reset animation after it completes
  useEffect(() => {
    if (animationDirection) {
      const timer = setTimeout(() => {
        setAnimationDirection(null)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [animationDirection])

  const goToPreviousMonth = () => {
    setAnimationDirection("right")
    setCurrentMonth((prevMonth) => subMonths(prevMonth, 1))
  }

  const goToNextMonth = () => {
    setAnimationDirection("left")
    setCurrentMonth((prevMonth) => addMonths(prevMonth, 1))
  }

  const goToToday = () => {
    setAnimationDirection(currentMonth > new Date() ? "right" : "left")
    setCurrentMonth(new Date())
  }

  // Generate days for the current month view
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get day names in Romanian
  const dayNames = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"]

  // Calculate which day of the week the month starts on (0 = Sunday, 1 = Monday, etc.)
  // Adjust for Romanian calendar (week starts on Monday)
  let firstDayOfMonth = monthStart.getDay() // 0 = Sunday, 1 = Monday, etc.
  if (firstDayOfMonth === 0) firstDayOfMonth = 7 // Convert Sunday from 0 to 7
  firstDayOfMonth -= 1 // Adjust to make Monday = 0

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    onDateChange(date)
    onClose()
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg w-[300px]">
      {/* Header with month navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="h-8 w-8 p-0">
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Luna anterioară</span>
        </Button>

        <h2 className="text-base font-medium">{format(currentMonth, "LLLL yyyy", { locale: ro })}</h2>

        <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8 p-0">
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Luna următoare</span>
        </Button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="text-xs font-medium text-center text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid with animation */}
      <div className="relative overflow-hidden">
        <div
          className={cn(
            "grid grid-cols-7 gap-1 transition-transform duration-300 ease-in-out",
            animationDirection === "left" && "translate-x-[-100%]",
            animationDirection === "right" && "translate-x-[100%]",
          )}
        >
          {/* Empty cells for days before the start of the month */}
          {Array.from({ length: firstDayOfMonth }).map((_, index) => (
            <div key={`empty-start-${index}`} className="h-8 w-8" />
          ))}

          {/* Actual days of the month */}
          {daysInMonth.map((day) => {
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
            const isToday = isSameDay(day, new Date())

            return (
              <Button
                key={day.toString()}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 p-0 font-normal rounded-full",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  isToday && !isSelected && "border border-primary text-primary",
                  !isSameMonth(day, currentMonth) && "text-muted-foreground opacity-50",
                )}
                onClick={() => handleDateSelect(day)}
              >
                <time dateTime={format(day, "yyyy-MM-dd")}>{format(day, "d")}</time>
              </Button>
            )
          })}
        </div>
      </div>

      {/* Footer with today button */}
      <div className="mt-4 flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-8">
          Astăzi
        </Button>

        <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
          Închide
        </Button>
      </div>
    </div>
  )
}
