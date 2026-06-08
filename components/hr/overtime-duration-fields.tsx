"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  formatOvertimeDuration,
  OVERTIME_MINUTE_OPTIONS,
  overtimeHoursFromParts,
  type OvertimeDurationParts,
} from "@/lib/hr/overtime-duration"

const HOUR_OPTIONS = Array.from({ length: 13 }, (_, i) => i)

export function OvertimeDurationFields({
  value,
  onChange,
  hoursId = "overtime-hours",
  minutesId = "overtime-minutes",
}: {
  value: OvertimeDurationParts
  onChange: (next: OvertimeDurationParts) => void
  hoursId?: string
  minutesId?: string
}) {
  const preview = formatOvertimeDuration(overtimeHoursFromParts(value.hours, value.minutes))

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={hoursId}>Ore</Label>
          <Select
            value={String(value.hours)}
            onValueChange={(v) => onChange({ ...value, hours: Number(v) })}
          >
            <SelectTrigger id={hoursId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={minutesId}>Minute</Label>
          <Select
            value={String(value.minutes)}
            onValueChange={(v) => onChange({ ...value, minutes: Number(v) as (typeof OVERTIME_MINUTE_OPTIONS)[number] })}
          >
            <SelectTrigger id={minutesId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OVERTIME_MINUTE_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m === 0 ? "00" : String(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Durată totală: <span className="font-medium text-foreground">{preview}</span> (granularitate 30 min)
      </p>
    </div>
  )
}
