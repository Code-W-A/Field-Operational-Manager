export const RECENT_INTERVENTION_WINDOW_DAYS = 90
export const SIMILAR_CAUSE_SCORE_THRESHOLD = 0.6

export type ReinterventionMatchType = "same_cause" | "similar_cause" | "recent_only"

export type EquipmentLookupKey = {
  field: "echipamentId" | "echipamentCod" | "echipament"
  value: string
}

export type RecentInterventionSuggestion = {
  id: string
  nrDisplay: string
  date: Date
  cauzaPrincipalaDefect?: string
  cauzaPrincipalaDefectId?: string
  defectReclamat?: string
  constatareLaLocatie?: string
  descriereInterventie?: string
  matchType: ReinterventionMatchType
  matchScore: number
  matchReason?: string
}

export function getEquipmentLookupKeys(equipment: {
  id?: unknown
  cod?: unknown
  nume?: unknown
}): EquipmentLookupKey[] {
  const id = String(equipment?.id || "").trim()
  const cod = String(equipment?.cod || "").trim()
  const nume = String(equipment?.nume || "").trim()
  return [
    id ? { field: "echipamentId", value: id } : null,
    cod ? { field: "echipamentCod", value: cod } : null,
    nume ? { field: "echipament", value: nume } : null,
  ].filter(Boolean) as EquipmentLookupKey[]
}

function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value?.toDate === "function") {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getCompletionDate(work: any): Date | null {
  return toDate(
    work?.raportSnapshot?.dataGenerare ||
      work?.timpPlecare ||
      work?.dataPlecare ||
      work?.dataInterventie ||
      work?.updatedAt,
  )
}

function isCompletedIntervention(work: any) {
  const status = String(work?.statusLucrare || "").trim().toLowerCase()
  const finalStatus = String(work?.statusFinalizareInterventie || "").trim().toUpperCase()
  return Boolean(work?.raportGenerat) && (status.includes("finalizat") || finalStatus === "FINALIZAT")
}

function sanitizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string) {
  const normalized = sanitizeText(value)
  if (!normalized) return [] as string[]
  return normalized.split(" ").filter(Boolean)
}

function jaccardSimilarity(aText: string, bText: string) {
  const aSet = new Set(tokenize(aText))
  const bSet = new Set(tokenize(bText))
  if (aSet.size === 0 || bSet.size === 0) return 0
  let intersectionSize = 0
  for (const token of aSet) {
    if (bSet.has(token)) intersectionSize += 1
  }
  const unionSize = new Set([...aSet, ...bSet]).size
  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

function matchPriority(matchType: ReinterventionMatchType) {
  if (matchType === "same_cause") return 2
  if (matchType === "similar_cause") return 1
  return 0
}

function normalizeForCompare(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function matchesClientContext(
  work: any,
  options?: {
    currentClientId?: string
    currentClientName?: string
  },
) {
  const expectedId = String(options?.currentClientId || "").trim()
  const expectedName = String(options?.currentClientName || "").trim()
  if (!expectedId && !expectedName) return true

  const workClientId = String(work?.clientId || "").trim()
  if (expectedId && workClientId) return workClientId === expectedId

  const workClientName = String(work?.client || work?.raportSnapshot?.client || "").trim()
  if (expectedName && workClientName) {
    return normalizeForCompare(workClientName) === normalizeForCompare(expectedName)
  }

  return false
}

function matchesLocationContext(
  work: any,
  options?: {
    currentLocationId?: string
    currentLocationName?: string
  },
) {
  const expectedId = String(options?.currentLocationId || "").trim()
  const expectedName = String(options?.currentLocationName || "").trim()
  if (!expectedId && !expectedName) return true

  const workLocationId = String(work?.locationId || "").trim()
  if (expectedId && workLocationId) return workLocationId === expectedId

  const workLocationName = String(work?.locatie || work?.raportSnapshot?.locatie || "").trim()
  if (expectedName && workLocationName) {
    return normalizeForCompare(workLocationName) === normalizeForCompare(expectedName)
  }

  return false
}

function getHistoricalComparisonText(work: RecentInterventionSuggestion) {
  return [work.defectReclamat, work.descriereInterventie, work.cauzaPrincipalaDefect].filter(Boolean).join(" ")
}

function classifySuggestion(
  suggestion: Omit<RecentInterventionSuggestion, "matchType" | "matchScore" | "matchReason">,
  options?: {
    currentDefectText?: string
    currentFailureCauseId?: string
    similarScoreThreshold?: number
  },
): RecentInterventionSuggestion {
  const currentFailureCauseId = String(options?.currentFailureCauseId || "").trim()
  const historicalFailureCauseId = String(suggestion.cauzaPrincipalaDefectId || "").trim()
  const similarScoreThreshold = options?.similarScoreThreshold ?? SIMILAR_CAUSE_SCORE_THRESHOLD
  const currentDefectText = String(options?.currentDefectText || "").trim()

  if (currentFailureCauseId && historicalFailureCauseId && currentFailureCauseId === historicalFailureCauseId) {
    return {
      ...suggestion,
      matchType: "same_cause",
      matchScore: 1,
      matchReason: "Aceeași cauză principală a defectului.",
    }
  }

  const score = jaccardSimilarity(currentDefectText, getHistoricalComparisonText(suggestion))
  if (score >= similarScoreThreshold) {
    return {
      ...suggestion,
      matchType: "similar_cause",
      matchScore: score,
      matchReason: "Defectul reclamat este similar cu o intervenție recentă.",
    }
  }

  return {
    ...suggestion,
    matchType: "recent_only",
    matchScore: score,
    matchReason: "Intervenție recentă pe același echipament.",
  }
}

export function classifyRecentInterventionSuggestions(
  suggestions: Array<Omit<RecentInterventionSuggestion, "matchType" | "matchScore" | "matchReason">>,
  options?: {
    currentDefectText?: string
    currentFailureCauseId?: string
    similarScoreThreshold?: number
  },
): RecentInterventionSuggestion[] {
  return (suggestions || [])
    .map((suggestion) => classifySuggestion(suggestion, options))
    .sort((a, b) => {
      const priorityDiff = matchPriority(b.matchType) - matchPriority(a.matchType)
      if (priorityDiff !== 0) return priorityDiff
      return b.date.getTime() - a.date.getTime()
    })
}

export function filterRecentCompletedInterventions(
  works: any[],
  options?: {
    now?: Date
    windowDays?: number
    excludeWorkId?: string
    currentDefectText?: string
    currentFailureCauseId?: string
    similarScoreThreshold?: number
    currentClientId?: string
    currentClientName?: string
    currentLocationId?: string
    currentLocationName?: string
  },
): RecentInterventionSuggestion[] {
  const now = options?.now || new Date()
  const windowDays = options?.windowDays ?? RECENT_INTERVENTION_WINDOW_DAYS
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const excludeWorkId = String(options?.excludeWorkId || "").trim()

  const baseSuggestions = (works || [])
    .map((work) => {
      const id = String(work?.id || "").trim()
      if (!id || (excludeWorkId && id === excludeWorkId)) return null
      if (String(work?.tipLucrare || "").trim().toLowerCase() === "revizie") return null
      if (!isCompletedIntervention(work)) return null
      if (!matchesClientContext(work, options)) return null
      if (!matchesLocationContext(work, options)) return null

      const date = getCompletionDate(work)
      if (!date || date < cutoff || date > now) return null

      return {
        id,
        nrDisplay: String(work?.nrLucrare || work?.numarRaport || id),
        date,
        cauzaPrincipalaDefect: String(
          work?.cauzaPrincipalaDefect || work?.raportSnapshot?.cauzaPrincipalaDefect || "",
        ).trim() || undefined,
        cauzaPrincipalaDefectId: String(
          work?.cauzaPrincipalaDefectId || work?.raportSnapshot?.cauzaPrincipalaDefectId || "",
        ).trim() || undefined,
        defectReclamat: String(work?.defectReclamat || "").trim() || undefined,
        constatareLaLocatie: String(work?.constatareLaLocatie || work?.raportSnapshot?.constatareLaLocatie || "").trim() || undefined,
        descriereInterventie: String(work?.descriereInterventie || work?.raportSnapshot?.descriereInterventie || "").trim() || undefined,
      }
    })
    .filter(Boolean) as Array<Omit<RecentInterventionSuggestion, "matchType" | "matchScore" | "matchReason">>

  return classifyRecentInterventionSuggestions(baseSuggestions, {
    currentDefectText: options?.currentDefectText,
    currentFailureCauseId: options?.currentFailureCauseId,
    similarScoreThreshold: options?.similarScoreThreshold,
  })
}
