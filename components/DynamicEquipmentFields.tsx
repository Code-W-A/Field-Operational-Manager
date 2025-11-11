"use client"

import { useMemo } from "react"
import { SETTINGS_TARGETS } from "@/lib/settings/targets"
import { useTargetList, useTargetValue } from "@/hooks/use-settings"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface DynamicEquipmentFieldsProps {
  // Mapă de valori curente persistate pe echipament (ex: { "equipment.create.types": "Ascensor", ... })
  values: Record<string, any> | undefined
  onChange: (targetId: string, value: any) => void
  className?: string
}

function shortLabel(fullLabel: string): string {
  const parts = String(fullLabel || "").split("→")
  return (parts[1] || parts[0] || fullLabel || "").trim()
}

function toBoolean(val: any): boolean {
  if (typeof val === "boolean") return val
  if (typeof val === "number") return val !== 0
  const s = String(val || "").toLowerCase().trim()
  return s === "true" || s === "1" || s === "da" || s === "on"
}

export function DynamicEquipmentFields({ values, onChange, className = "" }: DynamicEquipmentFieldsProps) {
  // Ținte pentru echipamente (filtrăm după prefixul stabil al id-ului)
  const equipmentTargets = useMemo(
    () => SETTINGS_TARGETS.filter((t) => t.id.startsWith("equipment.create.")),
    []
  )

  // Pentru listă: folosim hook-ul per target, apoi decidem ce randăm
  // Pentru value/flag: citim valoare implicită cu useTargetValue și afișăm doar dacă există setare legată

  return (
    <div className={className}>
      <div className="mb-2">
        <Label className="text-xs text-muted-foreground">Setări dinamice</Label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {equipmentTargets.map((t) => {
          if (t.kind === "list") {
            const { items } = useTargetList(t.id)
            if (!items?.length) return null
            const current = values?.[t.id] ?? ""
            const options = items
              .map((it) => it?.name || it?.value || "")
              .filter((x) => String(x || "").trim().length > 0)
            if (!options.length) return null
            return (
              <div key={t.id} className="space-y-1">
                <Label htmlFor={t.id} className="text-sm font-medium">
                  {shortLabel(t.label)}
                </Label>
                <Select value={current} onValueChange={(val) => onChange(t.id, val)}>
                  <SelectTrigger id={t.id}>
                    <SelectValue placeholder={`Selectați ${shortLabel(t.label).toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          }

          if (t.kind === "value") {
            const { value: defaultVal } = useTargetValue<any>(t.id)
            const show = defaultVal !== undefined || values?.[t.id] !== undefined
            if (!show) return null
            const current = values?.[t.id] ?? (defaultVal ?? "")
            return (
              <div key={t.id} className="space-y-1">
                <Label htmlFor={t.id} className="text-sm font-medium">
                  {shortLabel(t.label)}
                </Label>
                <Input
                  id={t.id}
                  value={String(current ?? "")}
                  onChange={(e) => onChange(t.id, e.target.value)}
                  placeholder={shortLabel(t.label)}
                />
              </div>
            )
          }

          if (t.kind === "flag") {
            const { value: defaultVal } = useTargetValue<any>(t.id)
            const show = defaultVal !== undefined || values?.[t.id] !== undefined
            if (!show) return null
            const current = toBoolean(values?.[t.id] ?? defaultVal ?? false)
            return (
              <div key={t.id} className="flex items-center justify-between border rounded p-2">
                <div className="flex flex-col">
                  <Label className="text-sm font-medium">{shortLabel(t.label)}</Label>
                  <span className="text-xs text-muted-foreground">Comutator configurabil din setări</span>
                </div>
                <Switch checked={current} onCheckedChange={(v) => onChange(t.id, v)} />
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}


