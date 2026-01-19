"use client"

import { useEffect, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { ro } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { formatISODate, formatRomanianDate, formatRomanianDateISO, parseRomanianDateString } from "@/lib/utils/date-utils"

type DateInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  min?: string
  max?: string
  className?: string
}

export function DateInput({ value, onChange, placeholder = "dd MMM yyyy", disabled, min, max, className }: DateInputProps) {
  const displayValue = value ? formatRomanianDateISO(value) : ""
  const [draft, setDraft] = useState(displayValue)
  const [open, setOpen] = useState(false)

  const yearRange = (() => {
    const nowY = new Date().getFullYear()
    const fromY = min ? Number(String(min).slice(0, 4)) : (nowY - 5)
    const toY = max ? Number(String(max).slice(0, 4)) : (nowY + 5)
    return {
      fromYear: Number.isFinite(fromY) ? fromY : nowY - 5,
      toYear: Number.isFinite(toY) ? toY : nowY + 5,
    }
  })()

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
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10"
      />
      <Popover open={open} onOpenChange={setOpen}>
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
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value ? new Date(value) : undefined}
            onSelect={(date) => {
              if (!date) return
              const iso = formatISODate(date)
              if (min && iso < min) return
              if (max && iso > max) return
              onChange(iso)
              setDraft(formatRomanianDate(date))
              setOpen(false)
            }}
            captionLayout="dropdown-buttons"
            fromYear={yearRange.fromYear}
            toYear={yearRange.toYear}
            fromDate={min ? new Date(min) : undefined}
            toDate={max ? new Date(max) : undefined}
            defaultMonth={(value ? new Date(value) : (min ? new Date(min) : undefined)) ?? new Date()}
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
    </div>
  )
}

