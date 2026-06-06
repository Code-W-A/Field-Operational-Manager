import test from "node:test"
import assert from "node:assert/strict"

import {
  countActiveContractFilters,
  filterContracts,
  normalizeActiveContractFilters,
  shouldShowFilteredEmptyState,
  type ActiveContractFilter,
} from "@/lib/contracts/contract-filters"

/**
 * Smoke: scenariu realist dispecer — 5 contracte, filtre client + fără echipamente + search.
 * Simulează fluxul paginii: activeFilters din localStorage + searchText din bară.
 */
const smokeClients = [
  { id: "client-acme", nume: "Acme SRL" },
  { id: "client-beta", nume: "Beta Industries" },
  { id: "client-gamma", nume: "Gamma Service" },
]

const smokeContracts = [
  {
    id: "sm-1",
    name: "Mentenanță centrală Acme",
    number: "MNT-2026-001",
    clientId: "client-acme",
    locationNames: ["Sediu", "Depozit"],
    equipmentIds: ["eq-a1"],
    recurrenceInterval: 3,
    recurrenceUnit: "luni" as const,
    createdAt: { toDate: () => new Date(2026, 0, 10) },
  },
  {
    id: "sm-2",
    name: "Contract provizoriu Acme",
    number: "MNT-2026-002",
    clientId: "client-acme",
    locationNames: ["Depozit"],
    equipmentIds: [],
    recurrenceInterval: 1,
    recurrenceUnit: "luni" as const,
    createdAt: { toDate: () => new Date(2026, 1, 5) },
  },
  {
    id: "sm-3",
    name: "Revizie Beta anuală",
    number: "MNT-2026-003",
    clientId: "client-beta",
    locationNames: ["Fabrică Nord"],
    equipmentIds: ["eq-b1", "eq-b2"],
    recurrenceInterval: 12,
    recurrenceUnit: "luni" as const,
    createdAt: { toDate: () => new Date(2026, 2, 1) },
  },
  {
    id: "sm-4",
    name: "Neasignat draft",
    number: "MNT-2026-004",
    locatie: "Magazin legacy",
    equipmentIds: [],
    createdAt: { seconds: Math.floor(new Date(2026, 3, 1).getTime() / 1000) },
  },
  {
    id: "sm-5",
    name: "Gamma fără recurență",
    number: "MNT-2026-005",
    clientId: "client-gamma",
    locationName: "Punct service",
    equipmentIds: ["eq-g1"],
    createdAt: { toDate: () => new Date(2026, 4, 15) },
  },
]

test("smoke: dispecer filtrează Acme + fără echipamente + caută depozit → un singur contract", () => {
  const activeFilters: ActiveContractFilter[] = [
    { id: "clienti", type: "multiselect", value: ["client-acme"] },
    { id: "echipamente", type: "multiselect", value: ["fara"] },
  ]
  const searchText = "depozit"

  const result = filterContracts(smokeContracts, activeFilters, searchText, smokeClients)

  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, "sm-2")
  assert.equal(result[0]?.number, "MNT-2026-002")
})

test("smoke: payload localStorage (activeFilters) + search se reîncarcă corect", () => {
  const rawStorage = JSON.stringify([
    { id: "clienti", type: "multiselect", value: ["client-acme"] },
    { id: "echipamente", type: "multiselect", value: ["fara"] },
  ])
  const persisted = JSON.parse(rawStorage) as ActiveContractFilter[]
  const normalized = normalizeActiveContractFilters(
    persisted.map((f) => ({ ...f, label: f.id, type: f.type })),
  )

  assert.equal(normalized.length, 2)

  const result = filterContracts(smokeContracts, normalized, "depozit", smokeClients)
  assert.deepEqual(
    result.map((c) => c.id),
    ["sm-2"],
  )

  assert.equal(countActiveContractFilters(normalized, "depozit"), 3)
  assert.equal(shouldShowFilteredEmptyState(smokeContracts.length, result.length), false)
})

test("smoke: filtre stricte fără match → empty state, contor 0 din 5", () => {
  const activeFilters: ActiveContractFilter[] = [
    { id: "clienti", type: "multiselect", value: ["client-gamma"] },
    { id: "echipamente", type: "multiselect", value: ["fara"] },
  ]

  const result = filterContracts(smokeContracts, activeFilters, "", smokeClients)

  assert.equal(result.length, 0)
  assert.equal(shouldShowFilteredEmptyState(smokeContracts.length, result.length), true)
})
