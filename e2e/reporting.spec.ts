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
            equipment: "Ușă (R72A123)",
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
          }, {
            id: "audit-revision", occurredAt: "2026-08-01T08:58:00.000Z", actorId: "user1", actorName: "Administrator", actorRole: "admin",
            module: "Tichete", action: "Actualizare tichet", outcome: "success", entityType: "Tichet", entityId: "work-1",
            entityLabel: "#00125", summary: "Actualizare tichet: #00125", source: "auditEvents", coverage: "complete",
            changes: [{
              field: "revisionEquipmentTimes.equipment-b", label: "Revizie – Pompă circulație (PC-02)",
              before: '{"startIso":"2026-08-01T08:00:00.000Z"}',
              after: '{"startIso":"2026-08-01T08:00:00.000Z","endIso":"2026-08-01T08:58:00.000Z","durationText":"0h 58m"}',
              presentation: {
                label: "Revizie – Pompă circulație (PC-02)", kind: "changed",
                summary: "Revizia a fost finalizată. Durata înregistrată este 0h 58m.",
                eventTitle: "A finalizat revizia pentru Pompă circulație (PC-02)",
                before: { text: "Revizie în desfășurare", empty: false, items: [{ label: "Începută la", value: "01.08.2026, 11:00:00" }] },
                after: { text: "Revizie finalizată", empty: false, items: [{ label: "Finalizată la", value: "01.08.2026, 11:58:00" }, { label: "Durată", value: "0h 58m" }] },
              },
            }],
            presentation: {
              title: "A finalizat revizia pentru Pompă circulație (PC-02)",
              description: "Revizia a fost finalizată. Durata înregistrată este 0h 58m.",
              actionLabel: "Actualizat", moduleLabel: "Tichete", entityLabel: "#00125",
              entityHref: "/dashboard/lucrari/work-1", changeCount: 1,
            },
          }],
          total: 2,
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

  test("export XLSX nefacturate folosește nume cu oră de emisie Bucharest", async ({ page }) => {
    const stamp = "2026-08-05_17-04-29"
    await page.route("**/api/reports/export**", async (route) => {
      const url = new URL(route.request().url())
      expect(url.searchParams.get("report")).toBe("uninvoiced")
      expect(url.searchParams.get("format")).toBe("xlsx")
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="tichete-nefacturate_${stamp}.xlsx"`,
        },
        body: Buffer.from("PK mock-xlsx"),
      })
    })

    await page.goto("/dashboard/rapoarte")
    await expect(page.getByText("#00125")).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "XLSX" }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`tichete-nefacturate_${stamp}.xlsx`)
  })

  test("generează activitatea utilizatorului și semnalează istoricul parțial", async ({ page }) => {
    await page.goto("/dashboard/rapoarte?tab=activity")
    await page.getByRole("combobox").click()
    await page.getByRole("option", { name: /Administrator/ }).click()
    await page.getByRole("button", { name: "Generează" }).click()

    await expect(page.getByText("A actualizat tichetul #00125", { exact: true })).toBeVisible()
    await expect(page.getByText("1 informație modificată")).toBeVisible()
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

  test("explică timpii reviziei fără ID-uri și obiecte tehnice", async ({ page }) => {
    await page.goto("/dashboard/rapoarte?tab=activity")
    await page.getByRole("combobox").click()
    await page.getByRole("option", { name: /Administrator/ }).click()
    await page.getByRole("button", { name: "Generează" }).click()

    await expect(page.getByText("A finalizat revizia pentru Pompă circulație (PC-02)", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: /Detalii: A finalizat revizia/ }).click()
    const details = page.getByRole("dialog")
    await expect(details.getByText("Revizie – Pompă circulație (PC-02)", { exact: true })).toBeVisible()
    await expect(details.getByText("Revizia a fost finalizată. Durata înregistrată este 0h 58m.", { exact: true }).first()).toBeVisible()
    await expect(details.getByText("Revizie în desfășurare", { exact: true })).toBeVisible()
    await expect(details.getByText("Revizie finalizată", { exact: true })).toBeVisible()
    await expect(details.getByText("0h 58m", { exact: true })).toBeVisible()
    await expect(details.getByText("equipment-b", { exact: true })).toHaveCount(0)
  })
})
