import { expect, test } from "@playwright/test"

import { resetPontajMutations, snapshotFirebaseState } from "../../fixtures/pontaj-minimal"

test.beforeEach(async () => resetPontajMutations())
test.afterEach(async () => resetPontajMutations())

test("tehnicianul este redirecționat din condică fără scrieri", async ({ page }) => {
  const before = await snapshotFirebaseState()

  await page.goto("/dashboard/resurse-umane/condica-prezenta?month=2026-07")
  await expect(page).toHaveURL(/\/dashboard\/lucrari(?:$|[/?#])/)
  await expect(page.getByRole("heading", { name: "Condică prezență" })).toHaveCount(0)

  const after = await snapshotFirebaseState()
  expect(after).toEqual(before)
})
