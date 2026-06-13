import test from "node:test"
import assert from "node:assert/strict"

import {
  SUSPENDED_CONTRACT_MESSAGE,
  canCreateContractWork,
  isContractSuspended,
} from "@/lib/contracts/contract-status"

/**
 * Smoke: simulează fluxul complet de "Contract suspendat" pe care îl cere clientul:
 *   - Din meniul de editare se suspendă contractul
 *   - În selector (dropdown "Contract" la creare tichet) NU mai apar contractele suspendate
 *   - Form-ul de creare tichet "Intervenție în contract" refuză contractele suspendate
 *   - Persistența (echivalentul addLucrare) aruncă SUSPENDED_CONTRACT_MESSAGE
 *   - Cron-ul de generare automată revizii SARE peste contractele suspendate
 */

type SmokeContract = {
  id: string
  name: string
  number: string
  clientId: string
  status?: string
  recurrenceInterval?: number
  revisionSchedulePreview?: Array<{ scheduledIso: string; generateIso: string }>
}

const baseContracts: SmokeContract[] = [
  {
    id: "ctr-acme-abonament",
    name: "Abonament Acme",
    number: "ABO-2026-001",
    clientId: "client-acme",
    status: "active",
    recurrenceInterval: 3,
    revisionSchedulePreview: [
      { scheduledIso: "2026-04-15T00:00:00.000Z", generateIso: "2026-04-05T00:00:00.000Z" },
    ],
  },
  {
    id: "ctr-acme-cerere",
    name: "La cerere Acme",
    number: "LC-2026-002",
    clientId: "client-acme",
    status: "suspended",
    recurrenceInterval: 1,
    revisionSchedulePreview: [
      { scheduledIso: "2026-04-15T00:00:00.000Z", generateIso: "2026-04-05T00:00:00.000Z" },
    ],
  },
  {
    id: "ctr-beta-legacy",
    name: "Beta legacy fără status",
    number: "LEG-2026-003",
    clientId: "client-beta",
  },
]

// === Helper simulators (oglinda implementărilor reale) ===

// Oglindire pentru components/contract-select.tsx: filtrul vizual din dropdown
function filterSelectableContracts<T extends { status?: unknown }>(contracts: T[]): T[] {
  return contracts.filter((c) => !isContractSuspended(c))
}

// Oglindire pentru components/lucrare-form.tsx: validarea înainte de submit
function validateFormBeforeCreate(contract: SmokeContract): { ok: true } | { ok: false; message: string } {
  if (isContractSuspended(contract)) {
    return { ok: false, message: SUSPENDED_CONTRACT_MESSAGE }
  }
  return { ok: true }
}

// Oglindire pentru lib/firebase/firestore.ts addLucrare(): defense in depth la persistență
async function simulatePersistTicket(
  contract: SmokeContract,
  ticket: { client: string; tipLucrare: string },
): Promise<{ id: string }> {
  if (!canCreateContractWork(contract)) {
    throw new Error(SUSPENDED_CONTRACT_MESSAGE)
  }
  return { id: `tk-${contract.id}-${ticket.client}` }
}

// Oglindire pentru firebase-functions/src/index.ts: cron-ul de revizii automate
function simulateRevisionCronRun(contracts: SmokeContract[]): {
  generatedFor: string[]
  skippedFor: string[]
} {
  const generatedFor: string[] = []
  const skippedFor: string[] = []
  for (const contract of contracts) {
    if (isContractSuspended(contract)) {
      skippedFor.push(contract.id)
      continue
    }
    if (!contract.revisionSchedulePreview?.length) continue
    generatedFor.push(contract.id)
  }
  return { generatedFor, skippedFor }
}

// === Tests ===

test("smoke: după suspendare, contractul dispare din dropdown-ul de tichet", () => {
  const visible = filterSelectableContracts(baseContracts)

  assert.deepEqual(
    visible.map((c) => c.id),
    ["ctr-acme-abonament", "ctr-beta-legacy"],
    "Doar contractele active + legacy (fără status) trebuie să apară în selector",
  )
  assert.equal(
    visible.find((c) => c.id === "ctr-acme-cerere"),
    undefined,
    "Contractul suspendat NU trebuie afișat",
  )
})

test("smoke: form-ul de creare tichet refuză suspended cu mesajul oficial", () => {
  const suspendedContract = baseContracts.find((c) => c.id === "ctr-acme-cerere")!
  const result = validateFormBeforeCreate(suspendedContract)

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.message, SUSPENDED_CONTRACT_MESSAGE)
    assert.match(result.message, /suspendat/i)
    assert.match(result.message, /Nu se pot emite tichete noi/)
  }
})

test("smoke: persistența aruncă SUSPENDED_CONTRACT_MESSAGE pentru contract suspendat", async () => {
  const suspendedContract = baseContracts.find((c) => c.id === "ctr-acme-cerere")!

  await assert.rejects(
    () => simulatePersistTicket(suspendedContract, { client: "Acme", tipLucrare: "Intervenție în contract" }),
    (err: Error) => err.message === SUSPENDED_CONTRACT_MESSAGE,
    "persistența trebuie să refuze contractele suspendate cu mesajul oficial",
  )
})

test("smoke: persistența permite contractele active sau legacy fără status", async () => {
  const active = baseContracts.find((c) => c.id === "ctr-acme-abonament")!
  const legacy = baseContracts.find((c) => c.id === "ctr-beta-legacy")!

  const activeResult = await simulatePersistTicket(active, { client: "Acme", tipLucrare: "Intervenție în contract" })
  const legacyResult = await simulatePersistTicket(legacy, { client: "Beta", tipLucrare: "Intervenție în contract" })

  assert.equal(activeResult.id, "tk-ctr-acme-abonament-Acme")
  assert.equal(legacyResult.id, "tk-ctr-beta-legacy-Beta")
})

test("smoke: cron-ul de generare revizii sare peste contractele suspendate", () => {
  const run = simulateRevisionCronRun(baseContracts)

  assert.deepEqual(run.generatedFor, ["ctr-acme-abonament"])
  assert.deepEqual(run.skippedFor, ["ctr-acme-cerere"])
})

test("smoke: reactivarea unui contract suspendat permite din nou crearea de tichete", async () => {
  const reactivated: SmokeContract = {
    ...baseContracts.find((c) => c.id === "ctr-acme-cerere")!,
    status: "active",
  }

  assert.equal(filterSelectableContracts([reactivated]).length, 1, "trebuie să reapară în dropdown")
  assert.equal(validateFormBeforeCreate(reactivated).ok, true, "form-ul trebuie să-l accepte")
  const persisted = await simulatePersistTicket(reactivated, {
    client: "Acme",
    tipLucrare: "Intervenție în contract",
  })
  assert.equal(persisted.id, "tk-ctr-acme-cerere-Acme")

  const run = simulateRevisionCronRun([reactivated])
  assert.deepEqual(run.generatedFor, ["ctr-acme-cerere"])
  assert.deepEqual(run.skippedFor, [])
})

test("smoke: dispatcher dezactivat (status = 'SUSPENDED' cu majuscule) este tratat tot ca suspendat", async () => {
  const upperSuspended: SmokeContract = {
    id: "ctr-uc",
    name: "Uppercase suspended",
    number: "UC-001",
    clientId: "client-uc",
    status: "SUSPENDED",
    revisionSchedulePreview: [{ scheduledIso: "2026-05-01T00:00:00Z", generateIso: "2026-04-21T00:00:00Z" }],
  }

  assert.equal(filterSelectableContracts([upperSuspended]).length, 0)
  assert.equal(validateFormBeforeCreate(upperSuspended).ok, false)
  await assert.rejects(() => simulatePersistTicket(upperSuspended, { client: "x", tipLucrare: "Intervenție în contract" }))
  assert.deepEqual(simulateRevisionCronRun([upperSuspended]).skippedFor, ["ctr-uc"])
})
