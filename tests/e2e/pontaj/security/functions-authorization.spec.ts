import { expect, test } from "@playwright/test"
import { httpsCallable } from "firebase/functions"

import { createFirebaseWebClient, type E2ERole } from "../../fixtures/firebase-web-client"

async function invoke(role: E2ERole, data: unknown) {
  const client = await createFirebaseWebClient(role)
  try {
    return await httpsCallable(client.functions, "runGenerateScheduledWorks")(data)
  } finally {
    await client.dispose()
  }
}

async function expectFunctionCode(role: E2ERole, data: unknown, code: string) {
  await expect(invoke(role, data)).rejects.toMatchObject({ code })
}

test("runGenerateScheduledWorks requires server-side admin authorization", async () => {
  await expectFunctionCode("neautentificat", { contractId: "missing_contract" }, "functions/unauthenticated")
  for (const role of ["tehnician", "dispecer", "client", "rol-necunoscut", "fara-rol"] as const) {
    await expectFunctionCode(role, { contractId: "missing_contract" }, "functions/permission-denied")
  }
  const result = await invoke("admin", { contractId: "missing_contract" })
  expect(result.data).toEqual({ created: 0 })
})

test("runGenerateScheduledWorks rejects identity and role injection", async () => {
  await expectFunctionCode("admin", { contractId: "missing_contract", role: "admin" }, "functions/invalid-argument")
  await expectFunctionCode("admin", { contractId: "missing_contract", uid: "admin" }, "functions/invalid-argument")
  await expectFunctionCode("admin", { contractId: "bad/id" }, "functions/invalid-argument")
})
