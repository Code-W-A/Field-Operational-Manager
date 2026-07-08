import fs from "node:fs/promises"
import { expect, test } from "@playwright/test"

test.describe("Condică sumar coloane", () => {
  test("afișează corect coloanele de sumar și exportă aceleași valori în CSV", async ({ page }) => {
    await page.goto("/e2e/condica-summary")
    await expect(page.getByTestId("condica-summary-title")).toBeVisible()

    await expect(page.getByTestId("summary-zile-lucrate")).toHaveText("6")
    await expect(page.getByTestId("summary-tichete-masa")).toHaveText("2")
    await expect(page.getByTestId("summary-ore-prezenta")).toHaveText("14:30")
    await expect(page.getByTestId("summary-banca-ore")).toHaveText("-9.5h")
    await expect(page.getByTestId("summary-traseu-client")).toHaveText("0.5")
    await expect(page.getByTestId("summary-zile-co")).toHaveText("1")
    await expect(page.getByTestId("summary-zile-del")).toHaveText("1")
    await expect(page.getByTestId("summary-ore-in")).toHaveText("1.5")

    const downloadPromise = page.waitForEvent("download")
    await page.getByTestId("condica-summary-export").click()
    const download = await downloadPromise
    const filePath = await download.path()
    if (!filePath) throw new Error("Download path missing")
    const csv = await fs.readFile(filePath, "utf8")

    expect(csv).toContain('"Zile lucrate","Tichete de masă","Ore prezență","Bancă de ore","Ore traseu la client","Zile CO","Zile DEL","Ore IN"')
    expect(csv).toContain('"6","2","14.5","-9.5h","0.5","1","1","1.5","14.5"')
  })
})
