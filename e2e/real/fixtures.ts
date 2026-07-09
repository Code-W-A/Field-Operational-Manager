import { expect, test as base, type Locator, type Page, type TestInfo } from "@playwright/test"

type BrowserProblem = {
  source: "console" | "pageerror"
  message: string
}

function isIgnoredConsoleError(message: string) {
  return [
    "ResizeObserver loop completed",
    "ResizeObserver loop limit exceeded",
  ].some((needle) => message.includes(needle))
}

async function attachDiagnostics(testInfo: TestInfo, problems: BrowserProblem[]) {
  if (!problems.length) return
  await testInfo.attach("browser-problems.json", {
    body: JSON.stringify(problems, null, 2),
    contentType: "application/json",
  })
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use, testInfo) => {
    const problems: BrowserProblem[] = []

    page.on("console", (msg) => {
      if (msg.type() !== "error") return
      const text = msg.text()
      if (isIgnoredConsoleError(text)) return
      problems.push({ source: "console", message: text })
    })

    page.on("pageerror", (error) => {
      problems.push({ source: "pageerror", message: error.message })
    })

    await use(page)
    await attachDiagnostics(testInfo, problems)
    expect(problems, "Critical browser console/page errors").toEqual([])
  },
})

export { expect }

export async function expectAppShell(page: Page) {
  await expect(page.locator("body")).toBeVisible()
  await expect(page.getByText(/Autentificare/i)).toHaveCount(0)
}

export async function closeTopmostDialog(page: Page) {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
}

export function annotateBlocked(description: string) {
  test.info().annotations.push({ type: "blocked", description })
}

export async function closeDialogIfPresent(page: Page) {
  if (!(await page.getByRole("dialog").count())) return
  await closeTopmostDialog(page)
}

export async function clickIfVisible(locator: Locator) {
  if (!(await locator.count())) return false
  const first = locator.first()
  if (!(await first.isVisible())) return false
  await first.click()
  return true
}

export async function expectButtonDisabled(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name })
  await expect(button).toBeVisible()
  await expect(button).toBeDisabled()
}

export async function toggleCheckboxNearText(scope: Page | Locator, text: RegExp) {
  const labelText = scope.getByText(text).first()
  await expect(labelText).toBeVisible()
  const row = labelText.locator("xpath=ancestor::*[.//*[@role='checkbox']][1]")
  await expect(row).toBeVisible()
  const checkbox = row.getByRole("checkbox").first()
  await expect(checkbox).toBeVisible()
  await checkbox.click()
  return checkbox
}

export async function openLastComboboxOption(page: Page, optionName: RegExp) {
  const dialog = page.getByRole("dialog")
  const comboboxes = dialog.getByRole("combobox")
  const count = await comboboxes.count()
  if (count === 0) throw new Error("No combobox found in open dialog")
  await comboboxes.nth(count - 1).click()
  await page.getByRole("option", { name: optionName }).click()
}
