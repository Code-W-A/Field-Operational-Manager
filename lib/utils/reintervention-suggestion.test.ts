import test from "node:test"
import assert from "node:assert/strict"

import {
  SIMILAR_CAUSE_SCORE_THRESHOLD,
  filterRecentCompletedInterventions,
  getEquipmentLookupKeys,
} from "./reintervention-suggestion"

test("getEquipmentLookupKeys prefers equipment id, then code, then name", () => {
  assert.deepEqual(
    getEquipmentLookupKeys({
      id: "eq-1",
      cod: "COD-1",
      nume: "Compresor",
    }),
    [
      { field: "echipamentId", value: "eq-1" },
      { field: "echipamentCod", value: "COD-1" },
      { field: "echipament", value: "Compresor" },
    ],
  )
})

test("getEquipmentLookupKeys falls back to code and name when id is missing", () => {
  assert.deepEqual(
    getEquipmentLookupKeys({
      id: "",
      cod: "COD-2",
      nume: "Usa batanta",
    }),
    [
      { field: "echipamentCod", value: "COD-2" },
      { field: "echipament", value: "Usa batanta" },
    ],
  )
})

test("filterRecentCompletedInterventions includes only recent finalized intervention reports", () => {
  const now = new Date("2026-05-08T12:00:00.000Z")

  const result = filterRecentCompletedInterventions(
    [
      {
        id: "recent-status",
        nrLucrare: "INT-10",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        raportSnapshot: {
          dataGenerare: "2026-04-15T10:00:00.000Z",
          cauzaPrincipalaDefect: "Uzură",
        },
      },
      {
        id: "recent-final-status",
        numarRaport: "R-20",
        statusLucrare: "Semnează mai târziu",
        statusFinalizareInterventie: "FINALIZAT",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        timpPlecare: "2026-04-18T10:00:00.000Z",
        cauzaPrincipalaDefect: "Defect componentă",
      },
      {
        id: "active",
        statusLucrare: "In lucru",
        raportGenerat: false,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-04-20T10:00:00.000Z",
      },
      {
        id: "revision",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Revizie",
        dataInterventie: "2026-04-20T10:00:00.000Z",
      },
      {
        id: "old",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-01-01T10:00:00.000Z",
      },
      {
        id: "future",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-05-09T10:00:00.000Z",
      },
    ],
    { now },
  )

  assert.deepEqual(
    result.map((work) => work.id),
    ["recent-final-status", "recent-status"],
  )
  assert.equal(result[0].nrDisplay, "R-20")
  assert.equal(result[0].cauzaPrincipalaDefect, "Defect componentă")
  assert.equal(result[1].cauzaPrincipalaDefect, "Uzură")
})

test("filterRecentCompletedInterventions excludes current work id", () => {
  const now = new Date("2026-05-08T12:00:00.000Z")

  const result = filterRecentCompletedInterventions(
    [
      {
        id: "current",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-04-15T10:00:00.000Z",
      },
    ],
    { now, excludeWorkId: "current" },
  )

  assert.deepEqual(result, [])
})

test("filterRecentCompletedInterventions classifies same/similar/recent and sorts by priority", () => {
  const now = new Date("2026-05-08T12:00:00.000Z")

  const result = filterRecentCompletedInterventions(
    [
      {
        id: "recent-only",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-05-06T10:00:00.000Z",
        defectReclamat: "eroare pe senzor lateral",
      },
      {
        id: "similar-cause",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-05-07T10:00:00.000Z",
        cauzaPrincipalaDefectId: "alta-cauza",
        defectReclamat: "motor blocat la pornire",
      },
      {
        id: "same-cause",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-05-01T10:00:00.000Z",
        cauzaPrincipalaDefectId: "defect-componenta",
        defectReclamat: "vibrații la pornire",
      },
    ],
    {
      now,
      currentFailureCauseId: "defect-componenta",
      currentDefectText: "motor blocat la pornire",
    },
  )

  assert.deepEqual(
    result.map((work) => work.id),
    ["same-cause", "similar-cause", "recent-only"],
  )
  assert.equal(result[0].matchType, "same_cause")
  assert.equal(result[0].matchScore, 1)
  assert.equal(result[1].matchType, "similar_cause")
  assert.ok(result[1].matchScore >= SIMILAR_CAUSE_SCORE_THRESHOLD)
  assert.equal(result[2].matchType, "recent_only")
  assert.ok(result[2].matchScore < SIMILAR_CAUSE_SCORE_THRESHOLD)
})

test("filterRecentCompletedInterventions matches similar defect text with diacritics and punctuation normalization", () => {
  const now = new Date("2026-05-08T12:00:00.000Z")

  const result = filterRecentCompletedInterventions(
    [
      {
        id: "normalized-similar",
        statusLucrare: "Finalizat",
        raportGenerat: true,
        tipLucrare: "Intervenție",
        dataInterventie: "2026-05-07T10:00:00.000Z",
        defectReclamat: "Usa blocata la pornire",
      },
    ],
    {
      now,
      currentDefectText: "Ușă blocată!!! la pornire",
    },
  )

  assert.equal(result.length, 1)
  assert.equal(result[0].matchType, "similar_cause")
  assert.ok(result[0].matchScore >= SIMILAR_CAUSE_SCORE_THRESHOLD)
})
