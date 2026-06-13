import type { FilterOption } from "@/components/filter-modal"

export type ContractFilterRecord = {
  id?: string
  name: string
  number: string
  clientId?: string
  locationId?: string
  locationName?: string
  locationNames?: string[]
  locatie?: string
  equipmentIds?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: "zile" | "luni"
  daysBeforeWork?: number
  revisionSchedulePreview?: Array<{
    scheduledIso: string
    generateIso: string
    locationId?: string
    locationName?: string
  }>
  customFields?: Record<string, string>
  createdAt?: unknown
  status?: "active" | "suspended"
}

export type ClientLookup = {
  id: string
  nume: string
}

export type ActiveContractFilter = Pick<FilterOption, "id" | "type" | "value">

export function getContractClientName(
  contract: ContractFilterRecord,
  clients: ClientLookup[],
): string {
  if (!contract.clientId) return ""
  return clients.find((c) => c.id === contract.clientId)?.nume || ""
}

export function getContractLocations(contract: ContractFilterRecord): string[] {
  if (Array.isArray(contract.locationNames) && contract.locationNames.length > 0) {
    return contract.locationNames.map((l) => String(l || "").trim()).filter(Boolean)
  }
  const single = contract.locationName || contract.locatie
  return single ? [String(single).trim()] : []
}

export function getContractCreatedAt(contract: ContractFilterRecord): Date | null {
  const raw = contract.createdAt as any
  if (!raw) return null
  try {
    if (typeof raw?.toDate === "function") {
      const d = raw.toDate()
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
    }
    if (typeof raw?.seconds === "number") {
      const d = new Date(raw.seconds * 1000)
      return Number.isNaN(d.getTime()) ? null : d
    }
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d
    }
  } catch {
    return null
  }
  return null
}

export function hasContractEquipment(contract: ContractFilterRecord): boolean {
  return Array.isArray(contract.equipmentIds) && contract.equipmentIds.length > 0
}

export function hasContractRecurrence(contract: ContractFilterRecord): boolean {
  return typeof contract.recurrenceInterval === "number" && contract.recurrenceInterval > 0
}

export function isContractAssigned(contract: ContractFilterRecord): boolean {
  return Boolean(String(contract.clientId || "").trim())
}

function getFilterValues(filter: ActiveContractFilter): string[] {
  if (!Array.isArray(filter.value)) return []
  return filter.value.map((v) => String(v || "").trim()).filter(Boolean)
}

function hasDateRangeValue(value: unknown): value is { from?: Date; to?: Date } {
  if (!value || typeof value !== "object") return false
  const range = value as { from?: Date; to?: Date }
  return Boolean(range.from || range.to)
}

export function filterHasValue(filter: ActiveContractFilter): boolean {
  if (filter.type === "dateRange") {
    return hasDateRangeValue(filter.value) && Boolean(filter.value.from || filter.value.to)
  }
  if (Array.isArray(filter.value)) return filter.value.length > 0
  return Boolean(filter.value)
}

export function normalizeActiveContractFilters(filters: FilterOption[]): ActiveContractFilter[] {
  return filters
    .filter((f) => filterHasValue(f))
    .map((f) => ({ id: f.id, type: f.type, value: f.value }))
}

export function countActiveContractFilters(
  activeFilters: ActiveContractFilter[],
  searchText = "",
): number {
  let count = activeFilters.filter(filterHasValue).length
  if (searchText.trim()) count += 1
  return count
}

export function buildLocationOptions(contracts: ContractFilterRecord[]) {
  const locations = new Set<string>()
  contracts.forEach((contract) => {
    getContractLocations(contract).forEach((loc) => locations.add(loc))
  })
  return Array.from(locations)
    .sort((a, b) => a.localeCompare(b, "ro", { sensitivity: "base" }))
    .map((loc) => ({ value: loc, label: loc }))
}

export function buildContractFilterOptions(
  contracts: ContractFilterRecord[],
  clients: ClientLookup[],
): FilterOption[] {
  const clientOptions = clients
    .map((c) => ({ value: String(c.id || ""), label: String(c.nume || "") }))
    .filter((o) => o.value && o.label)
    .sort((a, b) => a.label.localeCompare(b.label, "ro", { sensitivity: "base" }))

  const allLocationOptions = buildLocationOptions(contracts)

  return [
    {
      id: "clienti",
      label: "Client",
      type: "multiselect",
      options: clientOptions,
      value: [],
    },
    {
      id: "locatie",
      label: "Locație",
      type: "multiselect",
      options: allLocationOptions,
      value: [],
      getOptions: (filters) => {
        const selectedClientIds = getFilterValues(
          (filters.find((f) => f.id === "clienti") as ActiveContractFilter) || { id: "clienti", type: "multiselect", value: [] },
        )
        if (!selectedClientIds.length) return allLocationOptions

        const locations = new Set<string>()
        contracts.forEach((contract) => {
          if (!contract.clientId || !selectedClientIds.includes(contract.clientId)) return
          getContractLocations(contract).forEach((loc) => locations.add(loc))
        })

        return Array.from(locations)
          .sort((a, b) => a.localeCompare(b, "ro", { sensitivity: "base" }))
          .map((loc) => ({ value: loc, label: loc }))
      },
    },
    {
      id: "asignare",
      label: "Asignare client",
      type: "multiselect",
      options: [
        { value: "asignat", label: "Asignat" },
        { value: "neasignat", label: "Neasignat" },
      ],
      value: [],
    },
    {
      id: "echipamente",
      label: "Echipamente",
      type: "multiselect",
      options: [
        { value: "cu", label: "Cu echipamente" },
        { value: "fara", label: "Fără echipamente" },
      ],
      value: [],
    },
    {
      id: "recurenta",
      label: "Recurență",
      type: "multiselect",
      options: [
        { value: "cu", label: "Cu recurență" },
        { value: "fara", label: "Fără recurență" },
      ],
      value: [],
    },
    {
      id: "recurrenceUnit",
      label: "Unitate recurență",
      type: "multiselect",
      options: [
        { value: "zile", label: "Zile" },
        { value: "luni", label: "Luni" },
      ],
      value: [],
    },
    {
      id: "createdAt",
      label: "Data adăugării",
      type: "dateRange",
      value: null,
    },
  ]
}

export function contractMatchesSearch(
  contract: ContractFilterRecord,
  searchText: string,
  clients: ClientLookup[],
): boolean {
  const query = searchText.trim().toLowerCase()
  if (!query) return true

  const haystack: string[] = [
    contract.name,
    contract.number,
    getContractClientName(contract, clients),
    ...getContractLocations(contract),
  ]

  if (contract.customFields && typeof contract.customFields === "object") {
    Object.values(contract.customFields).forEach((v) => {
      if (v != null) haystack.push(String(v))
    })
  }

  return haystack.some((part) => String(part || "").toLowerCase().includes(query))
}

export function applyContractFilters(
  contracts: ContractFilterRecord[],
  activeFilters: ActiveContractFilter[],
  clients: ClientLookup[],
): ContractFilterRecord[] {
  if (!activeFilters.length) return contracts

  return contracts.filter((contract) =>
    activeFilters.every((filter) => {
      if (!filterHasValue(filter)) return true

      switch (filter.id) {
        case "clienti": {
          const selected = getFilterValues(filter)
          return selected.includes(String(contract.clientId || ""))
        }
        case "locatie": {
          const selected = getFilterValues(filter)
          const locations = getContractLocations(contract)
          return locations.some((loc) => selected.includes(loc))
        }
        case "asignare": {
          const selected = getFilterValues(filter)
          const assigned = isContractAssigned(contract)
          if (selected.includes("asignat") && selected.includes("neasignat")) return true
          if (selected.includes("asignat")) return assigned
          if (selected.includes("neasignat")) return !assigned
          return true
        }
        case "echipamente": {
          const selected = getFilterValues(filter)
          const hasEquipment = hasContractEquipment(contract)
          if (selected.includes("cu") && selected.includes("fara")) return true
          if (selected.includes("cu")) return hasEquipment
          if (selected.includes("fara")) return !hasEquipment
          return true
        }
        case "recurenta": {
          const selected = getFilterValues(filter)
          const hasRecurrence = hasContractRecurrence(contract)
          if (selected.includes("cu") && selected.includes("fara")) return true
          if (selected.includes("cu")) return hasRecurrence
          if (selected.includes("fara")) return !hasRecurrence
          return true
        }
        case "recurrenceUnit": {
          const selected = getFilterValues(filter)
          if (!hasContractRecurrence(contract)) return false
          return selected.includes(String(contract.recurrenceUnit || ""))
        }
        case "createdAt": {
          if (!hasDateRangeValue(filter.value)) return true
          const createdAt = getContractCreatedAt(contract)
          if (!createdAt) return false

          if (filter.value.from) {
            const fromDate = new Date(filter.value.from)
            fromDate.setHours(0, 0, 0, 0)
            if (createdAt.getTime() < fromDate.getTime()) return false
          }
          if (filter.value.to) {
            const toDate = new Date(filter.value.to)
            toDate.setHours(23, 59, 59, 999)
            if (createdAt.getTime() > toDate.getTime()) return false
          }
          return true
        }
        default:
          return true
      }
    }),
  )
}

export function filterContracts(
  contracts: ContractFilterRecord[],
  activeFilters: ActiveContractFilter[],
  searchText: string,
  clients: ClientLookup[],
): ContractFilterRecord[] {
  let result = contracts
  if (activeFilters.length) {
    result = applyContractFilters(result, activeFilters, clients)
  }
  if (searchText.trim()) {
    result = result.filter((contract) => contractMatchesSearch(contract, searchText, clients))
  }
  return result
}

export function shouldShowFilteredEmptyState(totalCount: number, filteredCount: number): boolean {
  return totalCount > 0 && filteredCount === 0
}
