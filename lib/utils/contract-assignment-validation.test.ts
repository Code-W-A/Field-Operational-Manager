import test from "node:test"
import assert from "node:assert/strict"
import { resolveDuplicateContractAssignmentConflict } from "./contract-assignment-validation"

test("contract assignment: allows reassigning the same unassigned contract when excluded", () => {
  const result = resolveDuplicateContractAssignmentConflict({
    contractNumber: "17/10.10.2022",
    clientId: "client-1",
    excludeContractId: "contract-1",
    existingContract: {
      id: "contract-1",
      clientId: null,
    },
  })

  assert.deepEqual(result, { isValid: true })
})

test("contract assignment: blocks when another unassigned contract has the same number", () => {
  const result = resolveDuplicateContractAssignmentConflict({
    contractNumber: "17/10.10.2022",
    clientId: "client-1",
    excludeContractId: "contract-1",
    existingContract: {
      id: "contract-2",
      clientId: null,
    },
  })

  assert.equal(result.isValid, false)
  assert.match(
    String(result.error || ""),
    /care nu este asignat/i,
  )
})

test("contract assignment: blocks when same number is assigned to a different client", () => {
  const result = resolveDuplicateContractAssignmentConflict({
    contractNumber: "17/10.10.2022",
    clientId: "client-1",
    existingContract: {
      id: "contract-2",
      clientId: "client-2",
    },
    assignedClientName: "Client Existent",
  })

  assert.equal(result.isValid, false)
  assert.match(
    String(result.error || ""),
    /deja asignat clientului/i,
  )
})
