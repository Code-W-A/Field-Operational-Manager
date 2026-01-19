"use client"

import { useEffect, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { DatePickerLocale } from "./types"
import { formatDate, parseDate } from "./utils"

type DatePickerInputProps = {
  value?: Date | null
  displayValue?: string
  onValueChange: (date: Date | null) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  name?: string
  format?: string
  locale?: DatePickerLocale
  onOpen: () => void
  className?: string
}

export function DatePickerInput({
  value,
  displayValue,
  onValueChange,
  placeholder = "dd.MM.yyyy",
  disabled,
  readOnly,
  required,
  name,
  format = "dd.MM.yyyy",
  locale = "ro",
  onOpen,
  className,
}: DatePickerInputProps) {
  const computed = value ? formatDate(value, format, locale) : ""
  const valueToShow = displayValue ?? computed
  const [draft, setDraft] = useState(valueToShow)

  useEffect(() => {
    setDraft(valueToShow)
  }, [valueToShow])

  const commit = () => {
    const next = draft.trim()
    if (!next) {
      onValueChange(null)
      return
    }
    if (readOnly) return
    const parsed = parseDate(next, format, locale)
    if (!parsed) return
    onValueChange(parsed)
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        name={name}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            onOpen()
          }
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-8 w-8"
        disabled={disabled}
        aria-label="Deschide calendar"
        onClick={onOpen}
      >
        <CalendarIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

