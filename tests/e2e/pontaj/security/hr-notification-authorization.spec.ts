import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test"

import { deleteCollection, e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { createFirebaseWebClient, type E2ERole } from "../../fixtures/firebase-web-client"
import {
  ADMIN_UID,
  DEPARTMENT_ID,
  EMPLOYEE_ID,
  RUN_ID,
  TECH_UID,
} from "../../fixtures/pontaj-minimal"

const endpoint = "http://127.0.0.1:3100/api/notifications/hr-request"

async function seedNotificationRequest(params: {
  id: string
  requesterUid?: string
  managerUid?: string
  status?: "pending" | "approved" | "rejected"
  editedAt?: number
}) {
  await e2eDb.collection("hrRequests").doc(params.id).set({
    employeeId: EMPLOYEE_ID,
    employeeName: `Tehnician ${RUN_ID}`,
    requesterUid: params.requesterUid ?? TECH_UID,
    managerUid: params.managerUid ?? ADMIN_UID,
    sectorId: DEPARTMENT_ID,
    kind: "CO",
    status: params.status ?? "pending",
    payload: { kind: "CO", startDate: "2026-07-20", endDate: "2026-07-20", reason: "E2E" },
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: params.editedAt ?? FieldValue.serverTimestamp(),
    ...(params.editedAt ? { editedAt: params.editedAt } : {}),
  })
}

async function tokenFor(role: E2ERole) {
  const client = await createFirebaseWebClient(role)
  try {
    return await client.auth.currentUser?.getIdToken() ?? ""
  } finally {
    await client.dispose()
  }
}

async function post(api: APIRequestContext, body: unknown, role?: E2ERole) {
  const token = role ? await tokenFor(role) : ""
  return api.post(endpoint, {
    data: body,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
}

async function dispatches() {
  return (await e2eDb.collection("hrNotificationDispatches").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

test.describe.serial("HR notification endpoint authorization", () => {
  let isolatedApi: APIRequestContext

  test.beforeAll(async () => {
    isolatedApi = await playwrightRequest.newContext({
      baseURL: "http://127.0.0.1:3100",
      storageState: { cookies: [], origins: [] },
    })
    expect((await isolatedApi.storageState()).cookies).toEqual([])
  })

  test.afterAll(async () => {
    await isolatedApi.dispose()
  })

  test.beforeEach(async () => {
    await Promise.all([
      deleteCollection("hrRequests"),
      deleteCollection("hrNotificationDispatches"),
      deleteCollection("emailEvents"),
    ])
    await seedNotificationRequest({ id: "notify_auth" })
  })

  test("requires Firebase verified authentication and allowed roles", async () => {
    expect((await isolatedApi.get(endpoint)).status()).toBe(405)
    expect((await post(isolatedApi, { requestId: "notify_auth", event: "created" })).status()).toBe(401)

    for (const role of ["client", "rol-necunoscut", "fara-rol"] as const) {
      const response = await post(isolatedApi, { requestId: "notify_auth", event: "created" }, role)
      expect(response.status(), role).toBe(403)
    }

    const dispatcher = await post(isolatedApi, { requestId: "notify_auth", event: "created" }, "dispecer")
    expect(dispatcher.status()).toBe(403)
    expect(await dispatches()).toEqual([])
    expect((await e2eDb.collection("emailEvents").get()).empty).toBe(true)
  })

  test("technician can notify only creation of own pending request", async () => {
    const own = await post(isolatedApi, { requestId: "notify_auth", event: "created" }, "tehnician")
    expect(own.status()).toBe(200)
    expect(await own.json()).toMatchObject({ ok: true, replayed: false, deliveryCount: 3 })

    await seedNotificationRequest({ id: "notify_other", requesterUid: ADMIN_UID })
    expect((await post(isolatedApi, { requestId: "notify_other", event: "created" }, "tehnician")).status()).toBe(403)

    await seedNotificationRequest({ id: "notify_decision", status: "approved" })
    expect((await post(isolatedApi, { requestId: "notify_decision", event: "status_changed" }, "tehnician")).status()).toBe(403)
  })

  test("admin can notify an approved or rejected decision", async () => {
    await seedNotificationRequest({ id: "notify_decision", status: "approved" })
    const response = await post(isolatedApi, { requestId: "notify_decision", event: "status_changed" }, "admin")
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, replayed: false, deliveryCount: 1 })

    await seedNotificationRequest({
      id: "notify_assigned_manager",
      requesterUid: ADMIN_UID,
      managerUid: TECH_UID,
      status: "rejected",
    })
    const assignedManager = await post(
      isolatedApi,
      { requestId: "notify_assigned_manager", event: "status_changed" },
      "tehnician",
    )
    expect(assignedManager.status()).toBe(200)
  })

  test("strict payload and state validation fail before dispatch writes", async () => {
    const invalidPayloads = [
      {},
      { requestId: "notify/auth", event: "created" },
      { requestId: "notify_auth", event: "unknown" },
      { requestId: "notify_auth", event: "created", role: "admin" },
      { requestId: "notify_auth", event: "created", uid: ADMIN_UID },
      { requestId: "notify_auth", event: "created", to: "outside@example.com" },
    ]
    for (const payload of invalidPayloads) {
      expect((await post(isolatedApi, payload, "admin")).status()).toBe(400)
    }
    expect((await post(isolatedApi, { requestId: "missing_request", event: "created" }, "admin")).status()).toBe(404)

    await seedNotificationRequest({ id: "notify_wrong_state", status: "approved" })
    expect((await post(isolatedApi, { requestId: "notify_wrong_state", event: "created" }, "admin")).status()).toBe(409)
    expect(await dispatches()).toEqual([])
  })

  test("replay and concurrent requests produce one completed dispatch", async () => {
    const first = await post(isolatedApi, { requestId: "notify_auth", event: "created" }, "tehnician")
    const replay = await post(isolatedApi, { requestId: "notify_auth", event: "created" }, "tehnician")
    expect(first.status()).toBe(200)
    expect(replay.status()).toBe(200)
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true, deliveryCount: 3 })

    await seedNotificationRequest({ id: "notify_concurrent" })
    const token = await tokenFor("tehnician")
    const responses = await Promise.all([
      isolatedApi.post(endpoint, { data: { requestId: "notify_concurrent", event: "created" }, headers: { authorization: `Bearer ${token}` } }),
      isolatedApi.post(endpoint, { data: { requestId: "notify_concurrent", event: "created" }, headers: { authorization: `Bearer ${token}` } }),
    ])
    expect(responses.map((response) => response.status()).every((status) => status === 200 || status === 409)).toBe(true)

    const markers = await dispatches()
    expect(markers).toHaveLength(2)
    const concurrent = markers.find((marker) => marker.id.startsWith("notify_concurrent__")) as Record<string, unknown>
    expect(concurrent).toMatchObject({ status: "completed", attempt: 1, deliveryCount: 3 })
    expect((await e2eDb.collection("emailEvents").get()).empty).toBe(true)
  })

  test("updated notification is allowed for admin on pending or approved, denied for requester technician, and distinct per edit", async () => {
    await seedNotificationRequest({ id: "notify_updated", status: "pending", editedAt: 1_720_000_000_001 })
    const pending = await post(isolatedApi, { requestId: "notify_updated", event: "updated" }, "admin")
    expect(pending.status()).toBe(200)
    expect(await pending.json()).toMatchObject({ ok: true, replayed: false, deliveryCount: 1 })

    expect((await post(isolatedApi, { requestId: "notify_updated", event: "updated" }, "tehnician")).status()).toBe(403)

    await e2eDb.collection("hrRequests").doc("notify_updated").update({
      editedAt: 1_720_000_000_002,
      payload: { kind: "CO", startDate: "2026-07-21", endDate: "2026-07-22", reason: "E2E edited" },
    })
    const second = await post(isolatedApi, { requestId: "notify_updated", event: "updated" }, "admin")
    expect(second.status()).toBe(200)
    expect(await second.json()).toMatchObject({ ok: true, replayed: false, deliveryCount: 1 })

    await seedNotificationRequest({ id: "notify_updated_approved", status: "approved", editedAt: 1_720_000_000_003 })
    const approved = await post(isolatedApi, { requestId: "notify_updated_approved", event: "updated" }, "admin")
    expect(approved.status()).toBe(200)
    expect(await approved.json()).toMatchObject({ ok: true, replayed: false, deliveryCount: 1 })

    const markers = await dispatches()
    const updatedMarkers = markers.filter((marker) => String(marker.id).includes("__updated__"))
    expect(updatedMarkers).toHaveLength(3)
    expect(updatedMarkers.map((marker) => marker.id).sort()).toEqual([
      "notify_updated__updated__1720000000001",
      "notify_updated__updated__1720000000002",
      "notify_updated_approved__updated__1720000000003",
    ].sort())
    expect(updatedMarkers.every((marker) => marker.status === "completed")).toBe(true)
  })
})
