"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import type { DatePickerProps, DateRange } from "./datePicker/types"
import { DatePickerInput } from "./datePicker/DatePickerInput"
import { DatePickerPanel } from "./datePicker/DatePickerPanel"
import { formatDate } from "./datePicker/utils"

export function DatePicker({
  value,
  onChange,
  mode = "single",
  disabled,
  minDate,
  maxDate,
  locale = "ro",
  format = "dd.MM.yyyy",
  placeholder,
  label,
  error,
  required,
  name,
  showApply = true,
  showClear = true,
  useBottomSheetOnMobile = true,
  className,
}: DatePickerProps) {
  const isMobile = useMediaQuery("(max-width: 640px)")
  const [open, setOpen] = useState(false)

  const singleValue = useMemo(() => (mode === "single" ? (value as Date | null) : null), [mode, value])
  const rangeValue = useMemo(() => (mode === "range" ? (value as DateRange | null) : null), [mode, value])

  const handleSingleChange = (date: Date | null) => {
    if (mode === "single") onChange(date)
  }

  const handleRangeChange = (range: Date | DateRange | null) => {
    onChange(range as DateRange | null)
  }

  const panel = (
    <DatePickerPanel
      mode={mode}
      locale={locale}
      minDate={minDate}
      maxDate={maxDate}
      value={value as any}
      onChange={mode === "single" ? (v) => onChange(v as Date | null) : handleRangeChange}
      onClose={() => setOpen(false)}
      showApply={showApply}
      showClear={showClear}
    />
  )

  return (
    <div className={cn("grid gap-2", className)}>
      {label ? (
        <label className="text-sm font-medium">
          {label} {required ? <span className="text-destructive">*</span> : null}
        </label>
      ) : null}

      {isMobile && useBottomSheetOnMobile ? (
        <>
          <DatePickerInput
            value={singleValue}
            displayValue={
              mode === "range" && rangeValue
                ? [rangeValue.start, rangeValue.end]
                    .map((d) => (d ? formatDate(d, format, locale) : "—"))
                    .join(" - ")
                : undefined
            }
            onValueChange={handleSingleChange}
            placeholder={placeholder ?? format}
            disabled={disabled}
            required={required}
            name={name}
            format={format}
            locale={locale}
            readOnly={mode === "range"}
            onOpen={() => setOpen(true)}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="fixed bottom-0 left-0 right-0 rounded-t-2xl p-0">
              {panel}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div>
              <DatePickerInput
                value={singleValue}
                displayValue={
                  mode === "range" && rangeValue
                    ? [rangeValue.start, rangeValue.end]
                        .map((d) => (d ? formatDate(d, format, locale) : "—"))
                        .join(" - ")
                    : undefined
                }
                onValueChange={handleSingleChange}
                placeholder={placeholder ?? format}
                disabled={disabled}
                required={required}
                name={name}
                format={format}
                locale={locale}
                readOnly={mode === "range"}
                onOpen={() => setOpen(true)}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            {panel}
          </PopoverContent>
        </Popover>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

