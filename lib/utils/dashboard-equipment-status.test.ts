import test from "node:test"
import assert from "node:assert/strict"

import {
  selectLatestEquipmentStatusWinners,
  type EquipmentStatusSettings,
} from "@/lib/utils/dashboard-equipment-status"

const baseCfg: EquipmentStatusSettings = {
  equipmentStatusEnabled: true,
  equipmentStatusIncludeNonFunctional: true,
  equipmentStatusIncludePartiallyFunctional: true,
}

function work(overrides: Record<string, unknown> = {}) {
  return {
    id: "w-default",
    clientId: "c1",
    locationId: "l1",
    echipamentId: "e1",
    locatie: "Loc 1",
    echipament: "Echipament 1",
    statusEchipament: "Nefuncțional",
    createdAt: "2026-05-01T08:00:00.000Z",
    ...overrides,
  }
}

function winnerIds(winners: ReturnType<typeof selectLatestEquipmentStatusWinners>) {
  return winners.map((w) => w.work.id)
}

function winnerSummary(winners: ReturnType<typeof selectLatestEquipmentStatusWinners>) {
  return winners.map((w) => ({ id: w.work.id, status: w.status }))
}

// --- Config & input guards ---

test("returns empty when equipment status is disabled", () => {
  const winners = selectLatestEquipmentStatusWinners([work()], {
    ...baseCfg,
    equipmentStatusEnabled: false,
  })
  assert.deepEqual(winners, [])
})

test("returns empty for empty, null, or non-array input", () => {
  assert.deepEqual(selectLatestEquipmentStatusWinners([], baseCfg), [])
  assert.deepEqual(selectLatestEquipmentStatusWinners(null as any, baseCfg), [])
  assert.deepEqual(selectLatestEquipmentStatusWinners(undefined as any, baseCfg), [])
})

test("returns empty when both include toggles are off", () => {
  const winners = selectLatestEquipmentStatusWinners([work(), work({ id: "w2", statusEchipament: "Parțial funcțional" })], {
    ...baseCfg,
    equipmentStatusIncludeNonFunctional: false,
    equipmentStatusIncludePartiallyFunctional: false,
  })
  assert.deepEqual(winners, [])
})

// --- Winner selection by createdAt (not updatedAt) ---

test("keeps one row per equipment using latest createdAt", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-old",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      }),
      work({
        id: "w-new",
        statusEchipament: "Parțial funcțional",
        createdAt: "2026-05-02T08:00:00.000Z",
        updatedAt: "2026-05-02T09:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  assert.equal(winners.length, 1)
  assert.equal(winners[0].work.id, "w-new")
  assert.equal(winners[0].status, "Parțial funcțional")
})

test("updatedAt on older ticket does not override newer Functional ticket", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-old-bad",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      }),
      work({
        id: "w-new-good",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-05T08:00:00.000Z",
        updatedAt: "2026-05-05T09:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

test("many older bad tickets do not block newer Functional winner", () => {
  const badTickets = Array.from({ length: 5 }, (_, i) =>
    work({
      id: `w-bad-${i}`,
      statusEchipament: "Nefuncțional",
      createdAt: `2026-05-0${i + 1}T08:00:00.000Z`,
      updatedAt: "2026-05-30T12:00:00.000Z",
    }),
  )

  const winners = selectLatestEquipmentStatusWinners(
    [
      ...badTickets,
      work({
        id: "w-functional",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-10T08:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

// --- Functional = singura conditie de disparitie ---

test("excludes equipment when latest ticket by createdAt is Functional", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({ id: "w-nonfunctional", statusEchipament: "Nefuncțional", createdAt: "2026-05-01T08:00:00.000Z" }),
      work({ id: "w-functional", statusEchipament: "Funcțional", createdAt: "2026-05-03T08:00:00.000Z" }),
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

test("shows equipment when latest ticket is Nefuncțional", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({ id: "w-functional-old", statusEchipament: "Funcțional", createdAt: "2026-05-01T08:00:00.000Z" }),
      work({ id: "w-bad-new", statusEchipament: "Nefuncțional", createdAt: "2026-05-05T08:00:00.000Z" }),
    ],
    baseCfg,
  )

  assert.deepEqual(winnerSummary(winners), [{ id: "w-bad-new", status: "Nefuncțional" }])
})

test("shows equipment when latest ticket is Parțial funcțional", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({ id: "w-old", statusEchipament: "Nefuncțional", createdAt: "2026-05-01T08:00:00.000Z" }),
      work({ id: "w-partial", statusEchipament: "Parțial funcțional", createdAt: "2026-05-03T08:00:00.000Z" }),
    ],
    baseCfg,
  )

  assert.deepEqual(winnerSummary(winners), [{ id: "w-partial", status: "Parțial funcțional" }])
})

test("excludes equipment when latest status is unknown (not in dashboard toggles)", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [work({ id: "w-unknown", statusEchipament: "Nedefinit", createdAt: "2026-05-01T08:00:00.000Z" })],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

// --- Tichete arhivate ---

test("archived Functional ticket removes equipment from dashboard", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-active-bad",
        statusLucrare: "Finalizat",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
      }),
      work({
        id: "w-archived-good",
        statusLucrare: "Arhivată",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-10T08:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

test("newer Non-functional ticket after archived Functional re-shows equipment", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-archived-good",
        statusLucrare: "Arhivată",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-10T08:00:00.000Z",
      }),
      work({
        id: "w-new-bad",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-15T08:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winnerSummary(winners), [{ id: "w-new-bad", status: "Nefuncțional" }])
})

test("archived Nefuncțional as latest winner is shown", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-active-functional",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-01T08:00:00.000Z",
      }),
      work({
        id: "w-archived-bad",
        statusLucrare: "Arhivată",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-10T08:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winnerSummary(winners), [{ id: "w-archived-bad", status: "Nefuncțional" }])
})

test("integration: active + archived merge (dashboard hook pattern)", () => {
  const activeLucrari = [
    work({
      id: "w-active",
      statusLucrare: "Atribuită",
      statusEchipament: "Nefuncțional",
      createdAt: "2026-05-01T08:00:00.000Z",
    }),
  ]
  const lucrariArhivate = [
    work({
      id: "w-archived",
      statusLucrare: "Arhivată",
      statusEchipament: "Funcțional",
      createdAt: "2026-05-08T08:00:00.000Z",
    }),
  ]
  const lucrariForEquipmentStatus = [...activeLucrari, ...lucrariArhivate]

  const winners = selectLatestEquipmentStatusWinners(lucrariForEquipmentStatus, baseCfg)
  assert.deepEqual(winners, [])
})

test("integration: only archived tickets still resolve equipment status", () => {
  const lucrariForEquipmentStatus = [
    work({
      id: "w-archived-bad",
      statusLucrare: "Arhivată",
      statusEchipament: "Parțial funcțional",
      createdAt: "2026-05-04T08:00:00.000Z",
    }),
  ]

  const winners = selectLatestEquipmentStatusWinners(lucrariForEquipmentStatus, baseCfg)
  assert.deepEqual(winnerSummary(winners), [{ id: "w-archived-bad", status: "Parțial funcțional" }])
})

// --- Deduplicare multi-echipament ---

test("deduplicates per equipment and keeps independent rows", () => {
  const works = [
    work({
      id: "w1-old",
      echipamentId: "e1",
      statusEchipament: "Nefuncțional",
      createdAt: "2026-05-01T08:00:00.000Z",
    }),
    work({
      id: "w1-new",
      echipamentId: "e1",
      statusEchipament: "Funcțional",
      createdAt: "2026-05-02T08:00:00.000Z",
    }),
    work({
      id: "w2",
      echipamentId: "e2",
      statusEchipament: "Parțial funcțional",
      createdAt: "2026-05-02T10:00:00.000Z",
    }),
    work({
      id: "w3",
      clientId: "c2",
      locationId: "l2",
      echipamentId: "e3",
      statusEchipament: "Nefuncțional",
      createdAt: "2026-05-02T12:00:00.000Z",
    }),
  ]

  const winners = selectLatestEquipmentStatusWinners(works, baseCfg)
  assert.deepEqual(winnerSummary(winners), [
    { id: "w2", status: "Parțial funcțional" },
    { id: "w3", status: "Nefuncțional" },
  ])
})

test("sorts winners by ticketCreatedAt ascending (oldest first)", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({ id: "w-late", echipamentId: "e2", createdAt: "2026-05-10T08:00:00.000Z" }),
      work({ id: "w-early", echipamentId: "e3", clientId: "c2", createdAt: "2026-05-02T08:00:00.000Z" }),
    ],
    baseCfg,
  )

  assert.deepEqual(winnerIds(winners), ["w-early", "w-late"])
  assert.ok(winners[0].ticketCreatedAt.getTime() <= winners[1].ticketCreatedAt.getTime())
})

// --- Setari dashboard (toggle-uri) ---

test("respects includeNonFunctional toggle", () => {
  const works = [
    work({ id: "w-nf", statusEchipament: "Nefuncțional" }),
    work({ id: "w-pf", echipamentId: "e2", statusEchipament: "Parțial funcțional" }),
  ]

  const winners = selectLatestEquipmentStatusWinners(works, {
    ...baseCfg,
    equipmentStatusIncludeNonFunctional: false,
  })

  assert.deepEqual(winnerIds(winners), ["w-pf"])
})

test("respects includePartiallyFunctional toggle", () => {
  const works = [
    work({ id: "w-nf", statusEchipament: "Nefuncțional" }),
    work({ id: "w-pf", echipamentId: "e2", statusEchipament: "Parțial funcțional" }),
  ]

  const winners = selectLatestEquipmentStatusWinners(works, {
    ...baseCfg,
    equipmentStatusIncludePartiallyFunctional: false,
  })

  assert.deepEqual(winnerIds(winners), ["w-nf"])
})

// --- Tie-break & date parsing ---

test("tie-breaks on equal createdAt using lexicographically greater work id", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({ id: "w-a", statusEchipament: "Nefuncțional", createdAt: "2026-05-01T08:00:00.000Z" }),
      work({ id: "w-z", statusEchipament: "Parțial funcțional", createdAt: "2026-05-01T08:00:00.000Z" }),
    ],
    baseCfg,
  )

  assert.equal(winners.length, 1)
  assert.equal(winners[0].work.id, "w-z")
  assert.equal(winners[0].status, "Parțial funcțional")
})

test("parses Firestore-like Timestamp on createdAt", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-ts-old",
        statusEchipament: "Nefuncțional",
        createdAt: { toDate: () => new Date("2026-05-01T08:00:00.000Z") },
      }),
      work({
        id: "w-ts-new",
        statusEchipament: "Funcțional",
        createdAt: { toDate: () => new Date("2026-05-05T08:00:00.000Z") },
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

test("parses Romanian createdAt format dd.MM.yyyy HH:mm", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-ro-old",
        statusEchipament: "Nefuncțional",
        createdAt: "01.05.2026 08:00",
      }),
      work({
        id: "w-ro-new",
        statusEchipament: "Funcțional",
        createdAt: "10.05.2026 08:00",
      }),
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

test("status matching is case-insensitive for dashboard inclusion", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [work({ id: "w-ci", statusEchipament: "nefuncțional", createdAt: "2026-05-01T08:00:00.000Z" })],
    baseCfg,
  )

  assert.equal(winners.length, 1)
  assert.equal(winners[0].work.id, "w-ci")
})

// --- Ignorare tichete incomplete ---

test("skips tickets without equipment identifier", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [work({ id: "w-no-eq", echipamentId: "", echipamentCod: "", echipament: "" })],
    baseCfg,
  )
  assert.deepEqual(winners, [])
})

test("skips tickets without statusEchipament", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [work({ id: "w-no-status", statusEchipament: "" })],
    baseCfg,
  )
  assert.deepEqual(winners, [])
})

test("skips tickets without parseable createdAt", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({ id: "w-no-date", createdAt: "" }),
      work({ id: "w-valid", echipamentId: "e2", createdAt: "2026-05-01T08:00:00.000Z" }),
    ],
    baseCfg,
  )

  assert.deepEqual(winnerIds(winners), ["w-valid"])
})

// --- Cheie echipament (comportament actual) ---

test("clientId vs client name produce separate equipment keys", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-by-id",
        clientId: "c1",
        client: "Client SRL",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
      }),
      work({
        id: "w-by-name",
        clientId: "",
        client: "Client SRL",
        echipamentId: "e1",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-02T08:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  // Chei diferite: "c1|..." vs "|client srl|..." — ambele apar (comportament documentat)
  assert.equal(winners.length, 2)
})

test("echipamentCod and echipamentId match same equipment when other keys align", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      work({
        id: "w-by-id",
        echipamentId: "EQ-100",
        echipamentCod: "",
        echipament: "Compresor",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
      }),
      work({
        id: "w-by-cod",
        echipamentId: "",
        echipamentCod: "EQ-100",
        echipament: "Compresor",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-05T08:00:00.000Z",
      }),
    ],
    baseCfg,
  )

  // Ambele folosesc aceeași cheie echipament (echipamentId are prioritate pe primul, echipamentCod pe al doilea — ambele "eq-100")
  assert.deepEqual(winners, [])
})
