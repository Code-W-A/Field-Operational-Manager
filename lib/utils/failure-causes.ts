import type { Setting } from "@/types/settings"

export type FailureCauseOption = {
  id: string
  label: string
}

export const FALLBACK_FAILURE_CAUSES: FailureCauseOption[] = [
  { id: "uzura", label: "Uzură" },
  { id: "defect-componenta", label: "Defect componentă" },
  { id: "reglaj-montaj", label: "Reglaj/Montaj" },
  { id: "alimentare-electrica", label: "Alimentare electrică" },
  { id: "utilizare-necorespunzatoare", label: "Utilizare necorespunzătoare" },
  { id: "conditii-externe", label: "Condiții externe" },
  { id: "alta-cauza", label: "Altă cauză" },
]

export function failureCauseOptionsFromSettings(settings: Setting[] | undefined): FailureCauseOption[] {
  const options = (settings || [])
    .map((setting) => ({
      id: String(setting.id || setting.value || setting.name || "").trim(),
      label: String(setting.value || setting.name || "").trim(),
    }))
    .filter((option) => option.id && option.label)

  return options.length > 0 ? options : FALLBACK_FAILURE_CAUSES
}

export function resolveFailureCauseLabel(options: FailureCauseOption[], id: string, fallbackLabel?: string) {
  const selected = options.find((option) => option.id === id)
  return selected?.label || String(fallbackLabel || "").trim()
}

