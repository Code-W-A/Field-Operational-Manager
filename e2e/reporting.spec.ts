import { expect, test } from "@playwright/test"

const generatedAt = "2026-08-01T09:00:00.000Z"

test.describe("Rapoarte operaționale", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/reports/users", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ users: [{ id: "user1", name: "Administrator", email: "admin@example.com", role: "admin" }] }),
      })
    })
    await page.route("**/api/reports/uninvoiced**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rows: [{
            id: "work-1", ticketNumber: "#00125", client: "Client test", location: "București", workType: "Intervenție",
            interventionDate: "01.08.2026", reportDate: generatedAt, technicians: ["Tehnician Test"], workStatus: "Finalizat",
            invoiceStatus: "Nefacturat", ageDays: 2, archived: false, href: "/dashboard/lucrari/work-1",
          }],
          total: 1,
          nextCursor: null,
          generatedAt,
          facets: { clients: [{ value: "Client test", label: "Client test" }], workTypes: [], workStatuses: [] },
        }),
      })
    })
    await page.route("**/api/reports/activity**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rows: [{
            id: "audit-1", occurredAt: generatedAt, actorId: "user1", actorName: "Administrator", actorRole: "admin",
            module: "Tichete", action: "Actualizare tichet", outcome: "success", entityType: "Tichet", entityId: "work-1",
            entityLabel: "#00125", summary: "Statusul tichetului a fost actualizat", changes: [{ field: "status", label: "Status", before: "Nou", after: "Finalizat" }],
            source: "auditEvents", coverage: "legacy_partial",
          }],
          total: 1,
          nextCursor: null,
          generatedAt,
          coverageStartAt: "2026-08-02T00:00:00.000Z",
          includesLegacyPartial: true,
        }),
      })
    })
  })

  test("afișează tichetele nefacturate și permite deschiderea tichetului", async ({ page }) => {
    await page.goto("/dashboard/rapoarte")
    await expect(page.getByText("#00125")).toBeVisible()
    await expect(page.getByText("Client test")).toBeVisible()
    await expect(page.getByText("2", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Deschide #00125" })).toHaveAttribute("href", "/dashboard/lucrari/work-1")
  })

  test("generează activitatea utilizatorului și semnalează istoricul parțial", async ({ page }) => {
    await page.goto("/dashboard/rapoarte?tab=activity")
    await page.getByRole("combobox").click()
    await page.getByRole("option", { name: /Administrator/ }).click()
    await page.getByRole("button", { name: "Generează" }).click()

    await expect(page.getByText("A actualizat tichetul #00125", { exact: true })).toBeVisible()
    await expect(page.getByText("1 câmp modificat")).toBeVisible()
    await expect(page.getByText(/pot fi incomplete/)).toBeVisible()
    await expect(page.getByText(/01\.08\.2026/).first()).toBeVisible()

    await page.getByRole("button", { name: /Detalii: A actualizat tichetul/ }).click()
    const details = page.getByRole("dialog")
    await expect(details.getByRole("heading", { name: "Modificări efectuate" })).toBeVisible()
    await expect(details.getByText("Înainte", { exact: true })).toBeVisible()
    await expect(details.getByText("După", { exact: true })).toBeVisible()
    await expect(details.getByText("Nou", { exact: true })).toBeVisible()
    await expect(details.getByText("Finalizat", { exact: true })).toBeVisible()
    await expect(details.getByRole("link", { name: /Deschide tichetul/ })).toHaveAttribute("href", "/dashboard/lucrari/work-1")

    await details.getByText("Date tehnice", { exact: true }).click()
    await expect(details.getByText("status", { exact: true })).toBeVisible()
  })

  test("comută între jurnalul cronologic și tabel și păstrează alegerea în URL", async ({ page }) => {
    await page.goto("/dashboard/rapoarte?tab=activity")
    await page.getByRole("combobox").click()
    await page.getByRole("option", { name: /Administrator/ }).click()
    await page.getByRole("button", { name: "Generează" }).click()

    await expect(page.getByTestId("activity-timeline")).toBeVisible()
    await page.getByRole("button", { name: "Tabel" }).click()
    await expect(page).toHaveURL(/activityView=table/)
    await expect(page.getByTestId("activity-table")).toBeVisible()
    await expect(page.getByText("A actualizat tichetul #00125", { exact: true })).toBeVisible()
  })
})
