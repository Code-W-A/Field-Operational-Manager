import test from "node:test"
import assert from "node:assert/strict"

import {
  applyContractFilters,
  buildContractFilterOptions,
  buildLocationOptions,
  contractMatchesSearch,
  countActiveContractFilters,
  filterContracts,
  filterHasValue,
  getContractClientName,
  getContractCreatedAt,
  getContractLocations,
  hasContractEquipment,
  hasContractRecurrence,
  isContractAssigned,
  normalizeActiveContractFilters,
  shouldShowFilteredEmptyState,
} from "@/lib/contracts/contract-filters"

const clients = [
  { id: "c1", nume: "Acme SRL" },
  { id: "c2", nume: "Beta SA" },
]

const baseContracts = [
  {
    id: "ct1",
    name: "Mentenanță HVAC",
    number: "CTR-001",
    clientId: "c1",
    locationNames: ["Sediu Central", "Depozit"],
    equipmentIds: ["eq1"],
    recurrenceInterval: 3,
    recurrenceUnit: "luni" as const,
    createdAt: { toDate: () => new Date(2026, 0, 15, 10, 0) },
  },
  {
    id: "ct2",
    name: "Contract fără client",
    number: "CTR-002",
    locationName: "Fabrică",
    equipmentIds: [],
    createdAt: { toDate: () => new Date(2026, 1, 1, 9, 0) },
  },
  {
    id: "ct3",
    name: "Revizie anuală",
    number: "CTR-003",
    clientId: "c2",
    locationNames: ["Punct lucru"],
    equipmentIds: ["eq2", "eq3"],
    recurrenceInterval: 90,
    recurrenceUnit: "zile" as const,
    customFields: { tip: "Premium" },
    createdAt: { toDate: () => new Date(2026, 2, 10, 14, 0) },
  },
]

test("getContractClientName resolves client id to display name", () => {
  assert.equal(getContractClientName(baseContracts[0], clients), "Acme SRL")
  assert.equal(getContractClientName(baseContracts[1], clients), "")
})

test("getContractLocations prefers locationNames over legacy fields", () => {
  assert.deepEqual(getContractLocations(baseContracts[0]), ["Sediu Central", "Depozit"])
  assert.deepEqual(getContractLocations(baseContracts[1]), ["Fabrică"])
})

test("getContractCreatedAt reads Firestore-like timestamp", () => {
  const d = getContractCreatedAt(baseContracts[0])
  assert.ok(d)
  assert.equal(d!.getFullYear(), 2026)
  assert.equal(d!.getMonth(), 0)
  assert.equal(d!.getDate(), 15)
})

test("contractMatchesSearch finds by client name and custom field", () => {
  assert.equal(contractMatchesSearch(baseContracts[0], "acme", clients), true)
  assert.equal(contractMatchesSearch(baseContracts[2], "premium", clients), true)
  assert.equal(contractMatchesSearch(baseContracts[0], "beta", clients), false)
  assert.equal(contractMatchesSearch(baseContracts[0], "depozit", clients), true)
})

test("applyContractFilters: client multiselect by id", () => {
  const filtered = applyContractFilters(baseContracts, [{ id: "clienti", type: "multiselect", value: ["c2"] }], clients)
  assert.deepEqual(filtered.map((c) => c.id), ["ct3"])
})

test("applyContractFilters: locatie multiselect", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "locatie", type: "multiselect", value: ["Depozit"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct1"])
})

test("applyContractFilters: asignare neasignat", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "asignare", type: "multiselect", value: ["neasignat"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct2"])
})

test("applyContractFilters: echipamente fara", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "echipamente", type: "multiselect", value: ["fara"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct2"])
})

test("applyContractFilters: recurenta cu + unitate luni", () => {
  const withRecurrence = applyContractFilters(
    baseContracts,
    [{ id: "recurenta", type: "multiselect", value: ["cu"] }],
    clients,
  )
  assert.deepEqual(withRecurrence.map((c) => c.id), ["ct1", "ct3"])

  const monthly = applyContractFilters(
    baseContracts,
    [{ id: "recurrenceUnit", type: "multiselect", value: ["luni"] }],
    clients,
  )
  assert.deepEqual(monthly.map((c) => c.id), ["ct1"])
})

test("applyContractFilters: createdAt date range", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [
      {
        id: "createdAt",
        type: "dateRange",
        value: { from: new Date(2026, 1, 1), to: new Date(2026, 2, 31) },
      },
    ],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct2", "ct3"])
})

test("filterContracts combines filters and search", () => {
  const result = filterContracts(
    baseContracts,
    [{ id: "recurenta", type: "multiselect", value: ["cu"] }],
    "acme",
    clients,
  )
  assert.deepEqual(result.map((c) => c.id), ["ct1"])
})

test("buildContractFilterOptions includes client and location options", () => {
  const options = buildContractFilterOptions(baseContracts, clients)
  const clientOpt = options.find((o) => o.id === "clienti")
  const locOpt = options.find((o) => o.id === "locatie")
  assert.ok(clientOpt?.options?.some((o) => o.label === "Acme SRL"))
  assert.ok(locOpt?.options?.some((o) => o.value === "Depozit"))
})

test("buildContractFilterOptions: locatie getOptions depends on selected client", () => {
  const options = buildContractFilterOptions(baseContracts, clients)
  const locOpt = options.find((o) => o.id === "locatie")
  assert.ok(locOpt?.getOptions)

  const scoped = locOpt!.getOptions!([
    { id: "clienti", label: "Client", type: "multiselect", value: ["c1"], options: [] },
    locOpt!,
  ])
  assert.deepEqual(
    scoped.map((o) => o.value).sort(),
    ["Depozit", "Sediu Central"].sort(),
  )
})

test("normalizeActiveContractFilters keeps only filters with values", () => {
  const normalized = normalizeActiveContractFilters([
    { id: "clienti", label: "Client", type: "multiselect", value: ["c1"] },
    { id: "locatie", label: "Locație", type: "multiselect", value: [] },
    { id: "createdAt", label: "Data", type: "dateRange", value: { from: new Date(2026, 0, 1) } },
  ])
  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].id, "clienti")
  assert.equal(normalized[1].id, "createdAt")
})

test("countActiveContractFilters includes search text", () => {
  assert.equal(countActiveContractFilters([{ id: "clienti", type: "multiselect", value: ["c1"] }], "ctr"), 2)
  assert.equal(countActiveContractFilters([], ""), 0)
})

test("shouldShowFilteredEmptyState only when total > 0 and filtered = 0", () => {
  assert.equal(shouldShowFilteredEmptyState(5, 0), true)
  assert.equal(shouldShowFilteredEmptyState(0, 0), false)
  assert.equal(shouldShowFilteredEmptyState(5, 3), false)
})

test("helper predicates for contract state", () => {
  assert.equal(hasContractEquipment(baseContracts[0]), true)
  assert.equal(hasContractEquipment(baseContracts[1]), false)
  assert.equal(hasContractRecurrence(baseContracts[0]), true)
  assert.equal(hasContractRecurrence(baseContracts[1]), false)
  assert.equal(isContractAssigned(baseContracts[0]), true)
  assert.equal(isContractAssigned(baseContracts[1]), false)
})

test("buildLocationOptions deduplicates and sorts locations", () => {
  const locations = buildLocationOptions(baseContracts)
  assert.deepEqual(
    locations.map((o) => o.value),
    ["Depozit", "Fabrică", "Punct lucru", "Sediu Central"],
  )
})

test("filterHasValue handles dateRange and multiselect", () => {
  assert.equal(filterHasValue({ id: "clienti", type: "multiselect", value: [] }), false)
  assert.equal(filterHasValue({ id: "clienti", type: "multiselect", value: ["c1"] }), true)
  assert.equal(filterHasValue({ id: "createdAt", type: "dateRange", value: null }), false)
  assert.equal(
    filterHasValue({ id: "createdAt", type: "dateRange", value: { from: new Date() } }),
    true,
  )
})

// --- Edge cases ---

test("applyContractFilters: asignare asignat only", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "asignare", type: "multiselect", value: ["asignat"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct1", "ct3"])
})

test("applyContractFilters: echipamente cu only", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "echipamente", type: "multiselect", value: ["cu"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct1", "ct3"])
})

test("applyContractFilters: recurenta fara only", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "recurenta", type: "multiselect", value: ["fara"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct2"])
})

test("applyContractFilters: both asignat and neasignat returns all", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "asignare", type: "multiselect", value: ["asignat", "neasignat"] }],
    clients,
  )
  assert.equal(filtered.length, baseContracts.length)
})

test("applyContractFilters: both cu and fara echipamente returns all", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "echipamente", type: "multiselect", value: ["cu", "fara"] }],
    clients,
  )
  assert.equal(filtered.length, baseContracts.length)
})

test("applyContractFilters: triple filter client + locatie + echipamente", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [
      { id: "clienti", type: "multiselect", value: ["c1"] },
      { id: "locatie", type: "multiselect", value: ["Depozit"] },
      { id: "echipamente", type: "multiselect", value: ["cu"] },
    ],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct1"])
})

test("applyContractFilters: createdAt from-only boundary", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "createdAt", type: "dateRange", value: { from: new Date(2026, 2, 10) } }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct3"])
})

test("applyContractFilters: createdAt to-only boundary", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "createdAt", type: "dateRange", value: { to: new Date(2026, 0, 31) } }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct1"])
})

test("getContractCreatedAt: Firestore seconds object without toDate", () => {
  const seconds = Math.floor(new Date(2026, 5, 4, 12, 0).getTime() / 1000)
  const d = getContractCreatedAt({ name: "x", number: "1", createdAt: { seconds } })
  assert.ok(d)
  assert.equal(d!.getFullYear(), 2026)
  assert.equal(d!.getMonth(), 5)
})

test("getContractLocations: legacy locatie when locationNames missing", () => {
  assert.deepEqual(
    getContractLocations({ name: "x", number: "1", locatie: "Magazin vechi" }),
    ["Magazin vechi"],
  )
})

test("filterContracts: empty input returns empty", () => {
  assert.deepEqual(filterContracts([], [{ id: "clienti", type: "multiselect", value: ["c1"] }], "x", clients), [])
})

test("getContractClientName: unknown client id returns empty string", () => {
  assert.equal(getContractClientName({ name: "x", number: "1", clientId: "missing" }, clients), "")
})

test("applyContractFilters: recurrenceUnit excludes contracts without recurrence", () => {
  const filtered = applyContractFilters(
    baseContracts,
    [{ id: "recurrenceUnit", type: "multiselect", value: ["zile"] }],
    clients,
  )
  assert.deepEqual(filtered.map((c) => c.id), ["ct3"])
})

test("contractMatchesSearch: empty query matches everything", () => {
  assert.equal(contractMatchesSearch(baseContracts[0], "   ", clients), true)
})

test("integration: full table-settings-contracte style payload replays filters + search", () => {
  const tableSettings = {
    activeFilters: [
      { id: "recurenta", type: "multiselect", value: ["cu"] },
      { id: "recurrenceUnit", type: "multiselect", value: ["luni"] },
    ],
    searchText: "hvac",
  }

  const normalized = normalizeActiveContractFilters(
    tableSettings.activeFilters.map((f) => ({
      id: f.id,
      label: f.id,
      type: f.type as "multiselect",
      value: f.value,
    })),
  )

  const result = filterContracts(baseContracts, normalized, tableSettings.searchText, clients)
  assert.deepEqual(result.map((c) => c.id), ["ct1"])
})
