import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import {
  departmentId,
  hrContext,
  hrSnapshot,
  makeEmployee,
  openEmployees,
  resetHrFixture,
  seedDepartment,
} from "./hr.helpers"
import { RUN_ID } from "../../fixtures/pontaj-minimal"

test.describe("HR-001 lista salariatilor", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("HR-001 cauta dupa nume, email si departament, sorteaza si pagina fara scrieri", async ({ browser }) => {
    const supportDepartment = departmentId("support")
    await seedDepartment(supportDepartment, { name: `${RUN_ID} Support` })
    const batch = e2eDb.batch()
    for (let index = 0; index < 25; index += 1) {
      const id = `emp_${RUN_ID.toLowerCase()}_list_${String(index).padStart(2, "0")}`
      const uid = `user_${RUN_ID.toLowerCase()}_list_${index}`
      batch.set(e2eDb.collection("users").doc(uid), {
        uid,
        email: `list.${index}.${RUN_ID.toLowerCase()}@e2e.invalid`,
        displayName: `List ${index} ${RUN_ID}`,
        role: "tehnician",
        ownerRunId: RUN_ID,
      })
      batch.set(e2eDb.collection("hrEmployees").doc(id), makeEmployee(id, {
        prenume: index === 7 ? "Omonim" : `Prenume${index}`,
        nume: index === 7 || index === 8 ? "Ionescu" : `Nume${String(index).padStart(2, "0")}`,
        userUid: uid,
        active: index % 2 === 0,
        sectorIds: index === 7 ? [supportDepartment] : [],
      }))
    }
    await batch.commit()
    const before = await hrSnapshot("hrEmployees")

    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await expect(page.getByText("1-20 din 26")).toBeVisible()

    const search = page.getByLabel("Caută în tabel")
    await search.fill("Ionescu")
    await expect(page.getByText("Omonim Ionescu").first()).toBeVisible()
    await search.fill(`list.7.${RUN_ID.toLowerCase()}@e2e.invalid`)
    await expect(page.getByText("Omonim Ionescu").first()).toBeVisible()
    await search.fill(`${RUN_ID} Support`)
    await expect(page.getByText("Omonim Ionescu").first()).toBeVisible()
    await search.fill("")

    const pageSize = page.getByLabel("Rânduri pe pagină")
    await pageSize.selectOption("10")
    await expect(page.getByText("1-10 din 26")).toBeVisible()
    await pageSize.selectOption("50")
    await expect(page.getByText("1-26 din 26")).toBeVisible()
    await pageSize.selectOption("100")
    await expect(page.getByText("1-26 din 26")).toBeVisible()
    await page.getByRole("columnheader", { name: /Nume/ }).click()
    await page.reload()
    await expect(page.getByLabel("Caută în tabel")).toBeVisible()

    expect(await hrSnapshot("hrEmployees")).toEqual(before)
    await context.close()
  })

  test("HR-001 empty state nu seed-uieste si nu scrie", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc(`emp_${RUN_ID.toLowerCase()}`).delete()
    const before = await hrSnapshot("hrEmployees")
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await expect(page.getByText("Nu există date disponibile.")).toBeVisible()
    expect(await hrSnapshot("hrEmployees")).toEqual(before)
    await context.close()
  })
})
