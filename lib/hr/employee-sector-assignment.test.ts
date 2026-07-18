import assert from "node:assert/strict"
import test from "node:test"

import { normalizeEmployeeSectorAssignment } from "./employee-sector-assignment"

test("eliminarea unui sector elimina fizic si managerul sau", () => {
  assert.deepEqual(
    normalizeEmployeeSectorAssignment({
      sectorIds: ["A"],
      managerUidBySector: { A: "manager-a", B: "manager-b" },
    }),
    { sectorIds: ["A"], managerUidBySector: { A: "manager-a" } },
  )
})

test("eliminarea tuturor sectoarelor produce mapare vida", () => {
  assert.deepEqual(
    normalizeEmployeeSectorAssignment({ sectorIds: [], managerUidBySector: { A: "manager-a" } }),
    { sectorIds: [], managerUidBySector: {} },
  )
})

test("pastreaza managerul schimbat al unui sector selectat", () => {
  assert.deepEqual(
    normalizeEmployeeSectorAssignment({ sectorIds: ["A"], managerUidBySector: { A: "manager-nou" } }),
    { sectorIds: ["A"], managerUidBySector: { A: "manager-nou" } },
  )
})

test("elimina managerii lipsa si duplicatele de sectoare", () => {
  assert.deepEqual(
    normalizeEmployeeSectorAssignment({
      sectorIds: [" A ", "A", "B", ""],
      managerUidBySector: { A: "", B: " manager-b " },
    }),
    { sectorIds: ["A", "B"], managerUidBySector: { B: "manager-b" } },
  )
})

test("exclude un sector care nu mai exista in lista permisa", () => {
  assert.deepEqual(
    normalizeEmployeeSectorAssignment({
      sectorIds: ["A", "stale"],
      managerUidBySector: { A: "manager-a", stale: "manager-stale" },
      allowedSectorIds: ["A", "B"],
    }),
    { sectorIds: ["A"], managerUidBySector: { A: "manager-a" } },
  )
})
