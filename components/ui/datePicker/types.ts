export type DatePickerMode = "single" | "range"

export type DateRange = {
  start: Date | null
  end: Date | null
}

export type DatePickerValue = Date | DateRange | null

export type DatePickerView = "day" | "month" | "year"

export type DatePickerLocale = "ro" | "en"

export type DatePickerChangeHandler = (value: Date | DateRange | null) => void

export type DatePickerProps = {
  value?: Date | DateRange | null
  onChange: DatePickerChangeHandler
  mode?: DatePickerMode
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  locale?: DatePickerLocale
  format?: string
  placeholder?: string
  label?: string
  error?: string
  required?: boolean
  name?: string
  /** Range-only: show Apply button (default true) */
  showApply?: boolean
  /** Range-only: show Clear button (default true) */
  showClear?: boolean
  /** Use bottom sheet on mobile (default true) */
  useBottomSheetOnMobile?: boolean
  className?: string
}

