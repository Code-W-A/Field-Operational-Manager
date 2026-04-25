/** Decizia tehnicianului la fața locului (Intervenție în garanție). */
export type TehnicianGarantieDecizie = "confirma" | "nu_intra" | "dupa_atelier"

export const TEHNICIAN_GARANTIE_DECIZIE_LABELS: Record<TehnicianGarantieDecizie, string> = {
  confirma: "Confirm garanția",
  nu_intra: "Nu face obiectul garanției",
  dupa_atelier: "Se va stabili după constatarea în atelier",
}

export function isTehnicianGarantieDecizie(
  v: string | undefined | null
): v is TehnicianGarantieDecizie {
  return v === "confirma" || v === "nu_intra" || v === "dupa_atelier"
}

/** Stare inițială: câmpuri noi sau migrare de la `tehnicianConfirmaGarantie` (boolean). */
export function initialTehnicianGarantieState(params: {
  tehnicianGarantieDecizie?: string | null
  tehnicianGarantieNuIntraMotiv?: string | null
  tehnicianConfirmaGarantie?: boolean
}): { decizie: TehnicianGarantieDecizie | ""; motiv: string } {
  const d = params.tehnicianGarantieDecizie
  if (d && isTehnicianGarantieDecizie(d)) {
    return {
      decizie: d,
      motiv: String(params.tehnicianGarantieNuIntraMotiv || ""),
    }
  }
  if (params.tehnicianConfirmaGarantie === true) {
    return { decizie: "confirma", motiv: "" }
  }
  return { decizie: "", motiv: "" }
}

export function labelForTehnicianGarantieDecizie(
  d: TehnicianGarantieDecizie | "" | undefined
): string {
  if (!d || !isTehnicianGarantieDecizie(d)) return "—"
  return TEHNICIAN_GARANTIE_DECIZIE_LABELS[d]
}

export function tehnicianGarantieDecizieBadgeClassName(d: TehnicianGarantieDecizie): string {
  if (d === "confirma") return "bg-green-100 text-green-800 border-green-200"
  if (d === "nu_intra") return "bg-red-100 text-red-800 border-red-200"
  return "bg-amber-100 text-amber-900 border-amber-200"
}
