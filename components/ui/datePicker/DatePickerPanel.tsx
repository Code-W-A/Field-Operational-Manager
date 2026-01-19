"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { addDays, addMonths, addYears } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { DatePickerLocale, DatePickerMode, DatePickerView, DateRange } from "./types"
import { formatDate, isOutsideRange, normalizeRange, updateRange } from "./utils"
import { DayView } from "./views/DayView"
import { MonthView } from "./views/MonthView"
import { YearView } from "./views/YearView"

type DatePickerPanelProps = {
  mode: DatePickerMode
  locale: DatePickerLocale
  minDate?: Date
  maxDate?: Date
  value?: Date | DateRange | null
  onChange: (value: Date | DateRange | null) => void
  onClose: () => void
  showApply?: boolean
  showClear?: boolean
}

export function DatePickerPanel({
  mode,
  locale,
  minDate,
  maxDate,
  value,
  onChange,
  onClose,
  showApply = true,
  showClear = true,
}: DatePickerPanelProps) {
  const initialDate = useMemo(() => {
    if (mode === "range") {
      const r = value as DateRange | null
      return r?.start || r?.end || new Date()
    }
    return (value as Date | null) || new Date()
  }, [value, mode])

  const [view, setView] = useState<DatePickerView>("day")
  const [monthDate, setMonthDate] = useState<Date>(initialDate)
  const [yearPageStart, setYearPageStart] = useState<number>(() => Math.floor(initialDate.getFullYear() / 12) * 12)
  const [focusedDate, setFocusedDate] = useState<Date>(initialDate)
  const [hoverRange, setHoverRange] = useState<DateRange | null>(null)
  const [draftRange, setDraftRange] = useState<DateRange>(() => {
    if (mode !== "range") return { start: null, end: null }
    const r = value as DateRange | null
    return normalizeRange({ start: r?.start ?? null, end: r?.end ?? null })
  })

  useEffect(() => {
    if (mode !== "range") return
    const r = value as DateRange | null
    setDraftRange(normalizeRange({ start: r?.start ?? null, end: r?.end ?? null }))
  }, [value, mode])

  const selectedSingle = mode === "single" ? (value as Date | null) : null
  const selectedRange = mode === "range" ? draftRange : null

  const monthLabel = formatDate(monthDate, "MMMM", locale)
  const yearLabel = formatDate(monthDate, "yyyy", locale)

  const handleDaySelect = (day: Date) => {
    if (isOutsideRange(day, minDate, maxDate)) return
    if (mode === "single") {
      onChange(day)
      onClose()
      return
    }
    const next = updateRange(draftRange, day)
    setDraftRange(next)
    if (!showApply && next.start && next.end) {
      onChange(next)
      onClose()
    }
  }

  const handleDayHover = (day: Date | null) => {
    if (mode !== "range") return
    if (!draftRange.start || draftRange.end || !day) {
      setHoverRange(null)
      return
    }
    setHoverRange(normalizeRange({ start: draftRange.start, end: day }))
  }

  const applyRange = () => {
    if (mode !== "range") return
    if (!draftRange.start || !draftRange.end) return
    onChange(draftRange)
    onClose()
  }

  const clearSelection = () => {
    if (mode === "single") {
      onChange(null)
      return
    }
    setDraftRange({ start: null, end: null })
    onChange({ start: null, end: null })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (view !== "day") return
    let next = focusedDate
    if (e.key === "ArrowLeft") next = addMonths(focusedDate, 0), next = addDays(next, -1)
    if (e.key === "ArrowRight") next = addMonths(focusedDate, 0), next = addDays(next, 1)
    if (e.key === "ArrowUp") next = addDays(focusedDate, -7)
    if (e.key === "ArrowDown") next = addDays(focusedDate, 7)
    if (e.key === "PageUp") next = e.shiftKey ? addYears(focusedDate, -1) : addMonths(focusedDate, -1)
    if (e.key === "PageDown") next = e.shiftKey ? addYears(focusedDate, 1) : addMonths(focusedDate, 1)
    if (e.key === "Enter") {
      handleDaySelect(focusedDate)
      return
    }
    setFocusedDate(next)
    setMonthDate(next)
  }

  return (
    <div className="w-[320px] sm:w-[360px] p-4" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between pb-3">
        <Button variant="ghost" size="icon" onClick={() => {
          if (view === "day") setMonthDate(addMonths(monthDate, -1))
          if (view === "month") setMonthDate(addYears(monthDate, -1))
          if (view === "year") setYearPageStart((y) => y - 12)
        }}>
          ‹
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-sm font-medium hover:underline"
            onClick={() => setView("month")}
          >
            {monthLabel}
          </button>
          <button
            type="button"
            className="text-sm font-medium hover:underline"
            onClick={() => setView("year")}
          >
            {yearLabel}
          </button>
        </div>
        <Button variant="ghost" size="icon" onClick={() => {
          if (view === "day") setMonthDate(addMonths(monthDate, 1))
          if (view === "month") setMonthDate(addYears(monthDate, 1))
          if (view === "year") setYearPageStart((y) => y + 12)
        }}>
          ›
        </Button>
      </div>

      {view === "day" && (
        <DayView
          month={monthDate}
          locale={locale}
          focusedDate={focusedDate}
          onDayClick={handleDaySelect}
          onDayHover={handleDayHover}
          minDate={minDate}
          maxDate={maxDate}
          selected={selectedSingle}
          range={selectedRange ?? undefined}
          hoverRange={hoverRange ?? undefined}
        />
      )}

      {view === "month" && (
        <MonthView
          year={monthDate.getFullYear()}
          locale={locale}
          selectedMonth={monthDate.getMonth()}
          onSelect={(m) => {
            const next = new Date(monthDate)
            next.setMonth(m)
            setMonthDate(next)
            setView("day")
          }}
        />
      )}

      {view === "year" && (
        <YearView
          startYear={yearPageStart}
          selectedYear={monthDate.getFullYear()}
          onSelect={(y) => {
            const next = new Date(monthDate)
            next.setFullYear(y)
            setMonthDate(next)
            setView("month")
          }}
        />
      )}

      {(showClear || (mode === "range" && showApply)) && (
        <div className={cn("pt-4 flex items-center justify-between")}>
          {showClear ? (
            <Button variant="ghost" onClick={clearSelection}>
              Resetează
            </Button>
          ) : <span />}
          {mode === "range" && showApply ? (
            <Button onClick={applyRange} disabled={!draftRange.start || !draftRange.end}>
              Aplică
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

