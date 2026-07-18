import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, MONTH_KEY, getCondicaTimesheet, resetCondicaFixture } from "./condica.helpers"
import { commitCondicaMutationForTest } from "./condica-fault-adapter"

test.describe("Condica atomic write boundary", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-017 eșecul înainte de commit nu persistă nicio zi, iar retry-ul scrie o singură dată", async () => {
    const ref = e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_${MONTH_KEY}`)
    const commit = async () => {
      await ref.set({
        employeeId: EMPLOYEE_ID,
        monthKey: MONTH_KEY,
        ownerRunId: "E2E_PONTAJ_STAGE5",
        updatedAt: FieldValue.serverTimestamp(),
        days: {
          "8": { code: "WORK", entries: [{ start: "08:00", end: "16:00" }] },
          "9": { code: "WORK", entries: [{ start: "08:00", end: "16:00" }] },
        },
      })
    }

    await expect(commitCondicaMutationForTest({ failAtOperation: 1, commit })).rejects.toThrow("Injected Condica atomic commit failure")
    expect(await getCondicaTimesheet()).toBeNull()

    await expect(commitCondicaMutationForTest({ failAtOperation: 2, commit })).rejects.toThrow("exactly one atomic Firestore operation")
    expect(await getCondicaTimesheet()).toBeNull()

    await commitCondicaMutationForTest({ commit })
    const retried = await getCondicaTimesheet() as any
    expect(Object.keys(retried.days).sort()).toEqual(["8", "9"])
    expect(retried.days["8"].entries).toHaveLength(1)
    expect(retried.days["9"].entries).toHaveLength(1)
  })

  test("CON-018 operația N de ștergere eșuează înainte de commit, păstrează celulele necerute și retry-ul converge", async () => {
    const ref = e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_${MONTH_KEY}`)
    await ref.set({
      employeeId: EMPLOYEE_ID,
      monthKey: MONTH_KEY,
      ownerRunId: "E2E_PONTAJ_STAGE5",
      days: {
        "7": { code: "WORK", hours: 6, entries: [{ start: "08:00", end: "14:00" }] },
        "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }] },
        "9": { code: "WORK", hours: 7, entries: [{ start: "08:00", end: "15:00" }] },
      },
    })
    const commit = async () => {
      await ref.update({
        "days.8": FieldValue.delete(),
        "days.9": FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    await expect(commitCondicaMutationForTest({ failAtOperation: 1, commit })).rejects.toThrow("Injected Condica atomic commit failure")
    const beforeRetry = await getCondicaTimesheet() as any
    expect(beforeRetry.days).toEqual({
      "7": { code: "WORK", hours: 6, entries: [{ start: "08:00", end: "14:00" }] },
      "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }] },
      "9": { code: "WORK", hours: 7, entries: [{ start: "08:00", end: "15:00" }] },
    })

    await commitCondicaMutationForTest({ commit })
    const afterRetry = await getCondicaTimesheet() as any
    expect(afterRetry.days).toEqual({
      "7": { code: "WORK", hours: 6, entries: [{ start: "08:00", end: "14:00" }] },
    })
    await commitCondicaMutationForTest({ commit })
    expect((await getCondicaTimesheet() as any).days).toEqual(afterRetry.days)
  })
})
