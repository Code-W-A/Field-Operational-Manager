"use client"

import { useMemo, useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  format,
  addMonths,
  subMonths,
  setMonth,
  setYear,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  startOfDay,
  isBefore,
} from "date-fns"
import { ro } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PickerView = "day" | "month" | "year"

const MIN_YEAR = 2000
const MAX_YEAR = () => new Date().getFullYear() + 1
const YEAR_PAGE_SIZE = 12

function yearPageStartFor(year: number) {
  const clamped = Math.min(Math.max(year, MIN_YEAR), MAX_YEAR())
  return MIN_YEAR + Math.floor((clamped - MIN_YEAR) / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE
}

const MONTH_LABELS = [
  "Ian",
  "Feb",
  "Mar",
  "Apr",
  "Mai",
  "Iun",
  "Iul",
  "Aug",
  "Sep",
  "Oct",
  "Noi",
  "Dec",
]

interface CustomDatePickerProps {
  selectedDate: Date | undefined
  onDateChange: (date: Date | undefined) => void
  onClose: () => void
  hasError?: boolean
  disablePast?: boolean
}

export function CustomDatePicker({
  selectedDate,
  onDateChange,
  onClose,
  hasError = false,
  disablePast = false,
}: CustomDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date())
  const [view, setView] = useState<PickerView>("day")
  const [yearPageStart, setYearPageStart] = useState(() => yearPageStartFor((selectedDate || new Date()).getFullYear()))
  const [animationDirection, setAnimationDirection] = useState<"left" | "right" | null>(null)

  const maxYear = MAX_YEAR()

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
    const today = new Date()
    setAnimationDirection(currentMonth > today ? "right" : "left")
    setCurrentMonth(today)
    setView("day")
    setYearPageStart(yearPageStartFor(today.getFullYear()))
  }

  const openYearView = () => {
    setYearPageStart(yearPageStartFor(currentMonth.getFullYear()))
    setView("year")
  }

  const handleYearSelect = (year: number) => {
    setCurrentMonth((prev) => setYear(prev, year))
    setView("month")
  }

  const handleMonthSelect = (monthIndex: number) => {
    setCurrentMonth((prev) => setMonth(prev, monthIndex))
    setView("day")
  }

  const yearsOnPage = useMemo(() => {
    return Array.from({ length: YEAR_PAGE_SIZE }, (_, i) => yearPageStart + i).filter(
      (year) => year >= MIN_YEAR && year <= maxYear,
    )
  }, [yearPageStart, maxYear])

  const canGoPrevYearPage = yearPageStart > MIN_YEAR
  const canGoNextYearPage = yearPageStart + YEAR_PAGE_SIZE <= maxYear

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const dayNames = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"]

  let firstDayOfMonth = monthStart.getDay()
  if (firstDayOfMonth === 0) firstDayOfMonth = 7
  firstDayOfMonth -= 1

  const handleDateSelect = (date: Date) => {
    onDateChange(date)
    onClose()
  }

  const yearPageEnd = Math.min(yearPageStart + YEAR_PAGE_SIZE - 1, maxYear)

  return (
    <div className={cn("p-4 bg-white rounded-lg shadow-lg w-[300px]", hasError && "ring-2 ring-destructive/40")}>
      <div className="flex items-center justify-between mb-4">
        {view === "day" ? (
          <>
            <Button variant="ghost" size="icon" onClick={goToPreviousMonth} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Luna anterioară</span>
            </Button>

            <button
              type="button"
              onClick={openYearView}
              className="text-base font-medium capitalize px-2 py-1 rounded-md hover:bg-muted transition-colors"
              title="Alege anul și luna"
            >
              {format(currentMonth, "LLLL yyyy", { locale: ro })}
            </button>

            <Button variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Luna următoare</span>
            </Button>
          </>
        ) : null}

        {view === "year" ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setYearPageStart((prev) => Math.max(MIN_YEAR, prev - YEAR_PAGE_SIZE))}
              className="h-8 w-8 p-0"
              disabled={!canGoPrevYearPage}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Anii anteriori</span>
            </Button>

            <h2 className="text-base font-medium">
              {yearPageStart}–{yearPageEnd}
            </h2>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setYearPageStart((prev) => prev + YEAR_PAGE_SIZE)}
              className="h-8 w-8 p-0"
              disabled={!canGoNextYearPage}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Anii următori</span>
            </Button>
          </>
        ) : null}

        {view === "month" ? (
          <>
            <div className="h-8 w-8" />
            <button
              type="button"
              onClick={openYearView}
              className="text-base font-medium px-2 py-1 rounded-md hover:bg-muted transition-colors"
              title="Înapoi la alegerea anului"
            >
              {currentMonth.getFullYear()}
            </button>
            <div className="h-8 w-8" />
          </>
        ) : null}
      </div>

      {view === "year" ? (
        <div className="grid grid-cols-3 gap-2 min-h-[192px]">
          {yearsOnPage.map((year) => {
            const isSelected = year === currentMonth.getFullYear()
            return (
              <Button
                key={year}
                type="button"
                variant="ghost"
                className={cn(
                  "h-12 text-sm font-medium",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                onClick={() => handleYearSelect(year)}
              >
                {year}
              </Button>
            )
          })}
        </div>
      ) : null}

      {view === "month" ? (
        <div className="grid grid-cols-3 gap-2 min-h-[192px]">
          {MONTH_LABELS.map((label, monthIndex) => {
            const isSelected = monthIndex === currentMonth.getMonth()
            return (
              <Button
                key={label}
                type="button"
                variant="ghost"
                className={cn(
                  "h-12 text-sm font-medium",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                onClick={() => handleMonthSelect(monthIndex)}
              >
                {label}
              </Button>
            )
          })}
        </div>
      ) : null}

      {view === "day" ? (
        <>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((day) => (
              <div key={day} className="text-xs font-medium text-center text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          <div className="relative overflow-hidden">
            <div
              className={cn(
                "grid grid-cols-7 gap-1 transition-transform duration-300 ease-in-out",
                animationDirection === "left" && "translate-x-[-100%]",
                animationDirection === "right" && "translate-x-[100%]",
              )}
            >
              {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                <div key={`empty-start-${index}`} className="h-8 w-8" />
              ))}

              {daysInMonth.map((day) => {
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
                const isToday = isSameDay(day, new Date())
                const isPast = isBefore(startOfDay(day), startOfDay(new Date()))

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
                      disablePast && isPast && "opacity-40 cursor-not-allowed",
                    )}
                    disabled={disablePast && isPast}
                    aria-disabled={disablePast && isPast}
                    onClick={() => {
                      if (disablePast && isPast) return
                      handleDateSelect(day)
                    }}
                  >
                    <time dateTime={format(day, "yyyy-MM-dd")}>{format(day, "d")}</time>
                  </Button>
                )
              })}
            </div>
          </div>
        </>
      ) : null}

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
