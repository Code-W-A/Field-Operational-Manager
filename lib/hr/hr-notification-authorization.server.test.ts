import assert from "node:assert/strict"
import test from "node:test"
import {
  HrNotificationRequestError,
  authorizeHrNotification,
  parseHrNotificationPayload,
} from "./hr-notification-authorization.server"

function expectStatus(action: () => unknown, status: number) {
  assert.throws(action, (error) => error instanceof HrNotificationRequestError && error.status === status)
}

test("notification payload is strict and rejects identity or recipient injection", () => {
  assert.deepEqual(parseHrNotificationPayload({ requestId: "request_1-A", event: "created" }), {
    requestId: "request_1-A",
    event: "created",
  })
  for (const payload of [
    null,
    {},
    { requestId: "request/1", event: "created" },
    { requestId: "request_1", event: "unknown" },
    { requestId: "request_1", event: "created", role: "admin" },
    { requestId: "request_1", event: "created", uid: "admin" },
    { requestId: "request_1", event: "created", to: "victim@example.com" },
  ]) expectStatus(() => parseHrNotificationPayload(payload), 400)
})

test("created notification requires the pending request owner", () => {
  assert.doesNotThrow(() => authorizeHrNotification({
    actorUid: "tech-1",
    actorRole: "tehnician",
    event: "created",
    request: { requesterUid: "tech-1", status: "pending" },
  }))
  expectStatus(() => authorizeHrNotification({
    actorUid: "tech-2",
    actorRole: "tehnician",
    event: "created",
    request: { requesterUid: "tech-1", status: "pending" },
  }), 403)
  expectStatus(() => authorizeHrNotification({
    actorUid: "tech-1",
    actorRole: "tehnician",
    event: "created",
    request: { requesterUid: "tech-1", status: "approved" },
  }), 409)
})

test("status_changed permits admin or the assigned technician manager only", () => {
  for (const actor of [
    { actorUid: "admin", actorRole: "admin" },
    { actorUid: "manager", actorRole: "tehnician" },
  ]) assert.doesNotThrow(() => authorizeHrNotification({
    ...actor,
    event: "status_changed",
    request: { requesterUid: "requester", managerUid: "manager", status: "approved" },
  }))

  for (const actor of [
    { actorUid: "other", actorRole: "tehnician" },
    { actorUid: "dispatcher", actorRole: "dispecer" },
    { actorUid: "client", actorRole: "client" },
  ]) expectStatus(() => authorizeHrNotification({
    ...actor,
    event: "status_changed",
    request: { requesterUid: "requester", managerUid: "manager", status: "rejected" },
  }), 403)
})
