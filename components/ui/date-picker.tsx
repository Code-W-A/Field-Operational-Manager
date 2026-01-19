"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { ro } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  formatISODate,
  formatRomanianDate,
  formatRomanianDateISO,
  parseRomanianDateString,
} from "@/lib/utils/date-utils"

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  /**
   * - input: editable text field + calendar popover
   * - button: outline button + calendar popover
   */
  variant?: "input" | "button"
}

function isoToDate(iso?: string): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function DatePicker({
  value,
  onChange,
  placeholder = "dd MMM yyyy",
  disabled,
  min,
  max,
  className,
  variant = "input",
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const selectedDate = useMemo(() => isoToDate(value) ?? undefined, [value])
  const minDate = useMemo(() => isoToDate(min) ?? undefined, [min])
  const maxDate = useMemo(() => isoToDate(max) ?? undefined, [max])

  const yearRange = useMemo(() => {
    const nowY = new Date().getFullYear()
    const fromY = minDate?.getFullYear() ?? (nowY - 5)
    const toY = maxDate?.getFullYear() ?? (nowY + 5)
    return { fromY, toY }
  }, [minDate, maxDate])

  // input variant: allow typing dd MMM yyyy
  const displayValue = value ? formatRomanianDateISO(value) : ""
  const [draft, setDraft] = useState(displayValue)
  useEffect(() => {
    if (open) return
    setDraft(displayValue)
  }, [displayValue, open])

  const commitDraft = () => {
    const next = draft.trim()
    if (!next) {
      onChange("")
      return
    }
    const parsed = parseRomanianDateString(next)
    if (!parsed) return
    const iso = formatISODate(parsed)
    if (min && iso < min) {
      setDraft(displayValue)
      return
    }
    if (max && iso > max) {
      setDraft(displayValue)
      return
    }
    onChange(iso)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "button" ? (
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground", className)}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? formatRomanianDateISO(value) : placeholder}
          </Button>
        </PopoverTrigger>
      ) : (
        <div className={cn("relative", className)}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitDraft()
                setOpen(false)
              }
            }}
            placeholder={placeholder || "dd MMM yyyy"}
            disabled={disabled}
            className="pr-10"
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-8 w-8"
              disabled={disabled}
              aria-label="Deschide calendar"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </div>
      )}
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return
            const iso = formatISODate(date)
            if (min && iso < min) return
            if (max && iso > max) return
            onChange(iso)
            setDraft(formatRomanianDate(date))
            setOpen(false)
          }}
          // Better month/year navigation
          captionLayout="dropdown-buttons"
          fromYear={yearRange.fromY}
          toYear={yearRange.toY}
          fromDate={minDate}
          toDate={maxDate}
          defaultMonth={selectedDate ?? minDate ?? maxDate ?? new Date()}
          initialFocus
          locale={ro}
          disabled={(date) => {
            const iso = formatISODate(date)
            if (min && iso < min) return true
            if (max && iso > max) return true
            return false
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

