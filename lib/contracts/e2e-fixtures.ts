import type { ContractFilterRecord } from "@/lib/contracts/contract-filters"
import { computeRevisionSchedulePreview } from "@/lib/contracts/revision-calendar"

const SM1_START_DATE = "2026-01-15"
const SM1_REVISION_PARAMS = {
  startDate: SM1_START_DATE,
  recurrenceInterval: 3,
  recurrenceUnit: "luni" as const,
  daysBeforeWork: 10,
  locationIds: ["Sediu", "Depozit"],
  locationNames: ["Sediu", "Depozit"],
}

export const E2E_CONTRACT_CLIENTS = [
  { id: "client-acme", nume: "Acme SRL" },
  { id: "client-beta", nume: "Beta Industries" },
  { id: "client-gamma", nume: "Gamma Service" },
]

export const E2E_CONTRACTS: ContractFilterRecord[] = [
  {
    id: "sm-1",
    name: "Mentenanță centrală Acme",
    number: "MNT-2026-001",
    clientId: "client-acme",
    locationNames: ["Sediu", "Depozit"],
    equipmentIds: ["eq-a1"],
    startDate: SM1_START_DATE,
    recurrenceInterval: 3,
    recurrenceUnit: "luni",
    daysBeforeWork: 10,
    revisionSchedulePreview: computeRevisionSchedulePreview(SM1_REVISION_PARAMS),
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
    recurrenceUnit: "luni",
    createdAt: { toDate: () => new Date(2026, 1, 5) },
  },
  {
    id: "sm-3",
    name: "Revizie Beta anuală",
    number: "MNT-2026-003",
    clientId: "client-beta",
    locationNames: ["Fabrică Nord"],
    equipmentIds: ["eq-b1", "eq-b2"],
    startDate: "2026-03-01",
    recurrenceInterval: 12,
    recurrenceUnit: "luni",
    daysBeforeWork: 14,
    revisionSchedulePreview: computeRevisionSchedulePreview({
      startDate: "2026-03-01",
      recurrenceInterval: 12,
      recurrenceUnit: "luni",
      daysBeforeWork: 14,
      locationIds: ["Fabrică Nord"],
      locationNames: ["Fabrică Nord"],
    }),
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
